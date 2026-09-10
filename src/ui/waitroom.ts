// 대기실 (DESIGN 6.3 · 7.2 🚪) — 방장/게스트가 만나 스쿼드를 주고받고 준비하면 방장이 시작한다.
//
// 절차:
//   1. 둘 다 들어오면 서로 `hello`(닉네임 · 준비 · 스쿼드 코드)를 보낸다.
//   2. **받는 쪽이 상대 스쿼드 코드를 직접 검사한다** — 규칙 위반이면 시작하지 않는다 (DESIGN 5.8).
//   3. 둘 다 준비되면 방장이 `start`(시드 · 지연 · 시간)를 보내고 동시에 경기를 연다.
// 시드는 두 스쿼드 코드와 방 코드로 만든다 — 누구도 고를 수 없다 (DESIGN 4.11).

import { START_SIZE, cardOvr, checkSquad, computeCap, squadClub, type Squad } from '../cards/squad'
import { ovrStars } from '../cards/cards'
import { cardById } from '../data/pool'
import { starHtml } from './stars'
import { decodeSquad, encodeSquad } from '../cards/squadcode'
import type { NetConfig } from '../game/session'
import { Lockstep } from '../net/lockstep'
import { tossHostHome } from '../game/toss'
import { delayForRtt, matchSeed, openRoom, type CtlMessage, type Member, type RoomLink } from '../net/room'

const CAP = computeCap().cap

export interface WaitOptions {
  code: string
  role: 'host' | 'guest'
  name: string
  squad: Squad
  halfSec: number
  offside: boolean
  /** 방장: 로비에 방 정보를 계속 알린다 */
  announce?: (count: number, state: 'open' | 'full' | 'playing' | 'closed') => void
}

export class WaitRoom {
  private link: RoomLink
  private root: HTMLElement
  private me: Member
  private other: Member | null = null
  private otherId = ''
  private msg = ''
  private started = false
  private timer: number
  private disposed = false

  constructor(
    host: HTMLElement,
    private opts: WaitOptions,
    private onStart: (net: NetConfig, halfSec: number, seed: number) => void,
    private onLeave: () => void,
  ) {
    this.me = { id: '', name: opts.name, ready: false, squadCode: encodeSquad(opts.squad) }
    host.innerHTML = '<div class="wait"></div>'
    this.root = host.querySelector('.wait') as HTMLElement
    this.link = openRoom(opts.code, opts.role)
    this.me.id = this.link.selfId

    this.link.onPeerJoin((id) => {
      if (this.otherId && this.otherId !== id) {
        // 정원 2 — 세 번째는 돌려보낸다
        this.link.sendCtl({ t: 'full' }, id)
        return
      }
      this.otherId = id
      this.sendHello()
      this.draw()
    })
    this.link.onPeerLeave((id) => {
      if (id !== this.otherId) return
      this.otherId = ''
      this.other = null
      this.msg = '상대가 나갔습니다.'
      this.draw()
    })
    this.link.onCtl((m, from) => this.onCtl(m, from))
    // RTT 표시를 위해 주기적으로 다시 그린다
    this.timer = window.setInterval(() => {
      if (!this.started) this.draw()
      this.opts.announce?.(this.otherId ? 2 : 1, this.otherId ? 'full' : 'open')
    }, 1000)
    this.draw()
  }

  private sendHello(): void {
    this.link.sendCtl({ t: 'hello', name: this.me.name, ready: this.me.ready, squadCode: this.me.squadCode })
  }

  private onCtl(m: CtlMessage, from: string): void {
    if (m.t === 'full') {
      this.msg = '방이 가득 찼습니다.'
      this.draw()
      setTimeout(() => this.leave(), 1200)
      return
    }
    if (from !== this.otherId && this.otherId) return
    if (m.t === 'hello') {
      this.otherId = from
      this.other = { id: from, name: m.name, ready: m.ready, squadCode: m.squadCode }
      // 내 정보를 아직 못 받았을 수 있으니 한 번 더
      this.sendHello()
      this.draw()
      if (this.opts.role === 'host') this.maybeStart()
    } else if (m.t === 'start' && this.opts.role === 'guest') {
      this.begin(m.seed, m.delay, m.halfSec, m.members)
    }
  }

  /** 상대 스쿼드를 **내가 다시 검사한다** (DESIGN 5.8) */
  private checkOther(): { ok: boolean; why: string; squad?: Squad } {
    if (!this.other) return { ok: false, why: '상대를 기다리는 중' }
    const res = decodeSquad(this.other.squadCode)
    if (!res.ok) return { ok: false, why: `상대 스쿼드 코드 오류 — ${res.message}` }
    const c = checkSquad(res.squad, CAP)
    if (!c.ok) return { ok: false, why: `상대 스쿼드가 규칙 위반입니다 — ${c.errors[0]}` }
    return { ok: true, why: '', squad: res.squad }
  }

  private maybeStart(): void {
    if (this.started || this.opts.role !== 'host') return
    if (!this.other || !this.me.ready || !this.other.ready) return
    const chk = this.checkOther()
    if (!chk.ok) {
      this.msg = chk.why
      this.draw()
      return
    }
    const delay = delayForRtt(this.link.rtt)
    const seed = matchSeed(this.me.squadCode, this.other.squadCode, this.opts.code)
    const members: Member[] = [this.me, this.other]
    this.link.sendCtl({ t: 'start', seed, delay, halfSec: this.opts.halfSec, offside: this.opts.offside, members }, this.otherId)
    this.begin(seed, delay, this.opts.halfSec, members)
  }

  private begin(seed: number, delay: number, halfSec: number, members: Member[]): void {
    if (this.started) return
    const chk = this.checkOther()
    const mySquad = this.opts.squad
    if (!chk.ok || !chk.squad) {
      this.msg = chk.why
      this.draw()
      return
    }
    this.started = true
    clearInterval(this.timer)
    this.opts.announce?.(2, 'playing')
    // 홈/원정은 **동전 던지기** — 시드에서 유도하므로 두 브라우저가 같은 결과를 얻는다 (2026-09-11)
    const hostHome = tossHostHome(seed)
    const me: 0 | 1 = (this.opts.role === 'host') === hostHome ? 0 : 1
    const squads: [Squad, Squad] = me === 0 ? [mySquad, chk.squad] : [chk.squad, mySquad]
    const names: [string, string] = me === 0 ? [this.me.name, this.other!.name] : [this.other!.name, this.me.name]
    void members
    const lockstep = new Lockstep(this.link, delay, me, this.otherId)
    this.onStart({ link: this.link, lockstep, me, peerId: this.otherId, squads, names }, halfSec, seed)
  }

  /** 한쪽 패널 — 구단 색 띠 · 포메이션 · 선발 평균 OVR · 급여 · 팀컬러 · 강화 (사용자 요청 2026-09-10) */
  private sideHtml(label: string, name: string, sq: Squad | null, ready: boolean, note: string): string {
    if (!sq) {
      return `<div class="side"><div class="sub-h">${label}</div><b class="dimtext">${name}</b><small>${note}</small></div>`
    }
    const club = squadClub(sq)
    const chk = checkSquad(sq, CAP)
    const xi = sq.ids.slice(0, START_SIZE).map((id, i) => {
      const c = cardById(id)
      return c ? cardOvr(c, (sq.enh[i] ?? 0) + chk.color.bonus) : 0
    })
    const avg = xi.reduce((a, b) => a + b, 0) / Math.max(1, xi.length)
    const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0')
    return `<div class="side club" style="--c:${club ? hex(club.col) : '#2c3644'}">
      <span class="cbar"></span>
      <div class="sub-h">${label}</div>
      <b>${name}</b>
      <div class="cl">${club?.name ?? '혼합 스쿼드'}</div>
      <div class="facts">
        <span>${sq.formation}</span><span>선발 ${starHtml(ovrStars(avg), true)}</span><span>급여 <b>${chk.salary}</b>/${CAP}</span>
        <span>팀컬러 ${chk.color.bonus ? `<b>+${chk.color.bonus}</b>` : '없음'}</span><span>강화 ${chk.enhTotal}/24</span>
      </div>
      ${note ? `<small>${note}</small>` : ''}
      <div class="rd ${ready ? 'on' : ''}">${ready ? '✓ 준비 완료' : '준비 안 됨'}</div>
    </div>`
  }

  private draw(): void {
    if (this.disposed || this.started) return
    const chk = this.other ? this.checkOther() : null
    const bothReady = this.me.ready && this.other?.ready
    const mine = this.sideHtml(this.opts.role === 'host' ? '나 · 홈 (방장)' : '나 · 원정', this.me.name, this.opts.squad, this.me.ready, '')
    const theirs = this.other
      ? this.sideHtml(this.opts.role === 'host' ? '상대 · 원정' : '상대 · 홈 (방장)', this.other.name, chk?.ok ? chk.squad! : null, this.other.ready, chk?.ok ? '규칙 통과' : (chk?.why ?? ''))
      : this.sideHtml('상대', '기다리는 중…', null, false, '상대가 이 방에 들어오면 보입니다')
    this.root.innerHTML = `
      <div class="wait-box">
        <div class="season">방 ${this.opts.code} · ${this.opts.role === 'host' ? '방장 (홈)' : '게스트 (원정)'}</div>
        <h1>대기실</h1>
        <div class="wait-cols">${mine}${theirs}</div>
        <p class="hintline">왕복 ${this.link.rtt} ms · 지연 ${delayForRtt(this.link.rtt)}틱 · 전후반 ${Math.round(this.opts.halfSec / 60)}분</p>
        <p class="hintline">🪙 홈·원정은 시작할 때 <b>동전 던지기</b>로 정합니다 — 방장이라고 홈이 아닙니다.</p>
        ${this.msg ? `<div class="errs"><span>${this.msg}</span></div>` : ''}
        <div class="row">
          <button class="btn main" id="w-ready">${this.me.ready ? '준비 취소' : '준비'}</button>
          ${this.opts.role === 'host' ? `<button class="btn" id="w-start"${bothReady && chk?.ok ? '' : ' disabled'}>시작</button>` : ''}
          <button class="btn secondary" id="w-leave">나가기</button>
        </div>
        <p class="hintline dim">서버가 없어 두 브라우저가 직접 붙습니다. 안 붙으면 한쪽을 폰 핫스팟에 물려 보세요 (TURN 은 쓰지 않습니다).</p>
      </div>`
    ;(this.root.querySelector('#w-ready') as HTMLButtonElement).onclick = () => {
      this.me.ready = !this.me.ready
      this.sendHello()
      this.draw()
      if (this.opts.role === 'host') this.maybeStart()
    }
    const startBtn = this.root.querySelector('#w-start') as HTMLButtonElement | null
    if (startBtn) startBtn.onclick = () => this.maybeStart()
    ;(this.root.querySelector('#w-leave') as HTMLButtonElement).onclick = () => this.leave()
  }

  private leave(): void {
    this.link.sendCtl({ t: 'leave' })
    this.opts.announce?.(0, 'closed')
    setTimeout(() => this.link.leave(), 120)
    this.dispose()
    this.onLeave()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearInterval(this.timer)
    this.root.remove()
  }
}
