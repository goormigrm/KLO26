// 대기실 (DESIGN 6.3 · 7.2 🚪) — 방장/게스트가 만나 스쿼드를 주고받고 준비하면 방장이 시작한다.
//
// 절차:
//   1. 둘 다 들어오면 서로 `hello`(닉네임 · 준비 · 스쿼드 코드)를 보낸다.
//   2. **받는 쪽이 상대 스쿼드 코드를 직접 검사한다** — 규칙 위반이면 시작하지 않는다 (DESIGN 5.8).
//   3. 둘 다 준비되면 방장이 `start`(시드 · 지연 · 시간)를 보내고 동시에 경기를 연다.
// 시드는 두 스쿼드 코드와 방 코드로 만든다 — 누구도 고를 수 없다 (DESIGN 4.11).

import { checkSquad, computeCap, type Squad } from '../cards/squad'
import { decodeSquad, encodeSquad } from '../cards/squadcode'
import type { NetConfig } from '../game/session'
import { Lockstep } from '../net/lockstep'
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
    const me: 0 | 1 = this.opts.role === 'host' ? 0 : 1
    const squads: [Squad, Squad] = me === 0 ? [mySquad, chk.squad] : [chk.squad, mySquad]
    const names: [string, string] = me === 0 ? [this.me.name, this.other!.name] : [this.other!.name, this.me.name]
    void members
    const lockstep = new Lockstep(this.link, delay, me, this.otherId)
    this.onStart({ link: this.link, lockstep, me, peerId: this.otherId, squads, names }, halfSec, seed)
  }

  private draw(): void {
    if (this.disposed || this.started) return
    const chk = this.other ? this.checkOther() : null
    const bothReady = this.me.ready && this.other?.ready
    this.root.innerHTML = `
      <div class="wait-box">
        <div class="season">방 ${this.opts.code} · ${this.opts.role === 'host' ? '방장 (홈)' : '게스트 (원정)'}</div>
        <h1>대기실</h1>
        <div class="wait-cols">
          <div class="side">
            <div class="sub-h">나</div>
            <b>${this.me.name}</b>
            <small>${this.opts.squad.formation} · 코드 ${this.me.squadCode.length}자</small>
            <div class="rd ${this.me.ready ? 'on' : ''}">${this.me.ready ? '준비 완료' : '준비 안 됨'}</div>
          </div>
          <div class="side">
            <div class="sub-h">상대</div>
            ${
              this.other
                ? `<b>${this.other.name}</b>
                   <small>${chk?.ok ? `${chk.squad!.formation} · 규칙 통과` : (chk?.why ?? '')}</small>
                   <div class="rd ${this.other.ready ? 'on' : ''}">${this.other.ready ? '준비 완료' : '준비 안 됨'}</div>`
                : '<b class="dimtext">기다리는 중…</b><small>상대가 이 방에 들어오면 보입니다</small>'
            }
          </div>
        </div>
        <p class="hintline">왕복 ${this.link.rtt} ms · 지연 ${delayForRtt(this.link.rtt)}틱 · 전후반 ${Math.round(this.opts.halfSec / 60)}분</p>
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
