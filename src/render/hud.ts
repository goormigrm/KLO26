// HUD — DOM 오버레이 (DESIGN 7.1 "HUD 는 DOM 오버레이"). 전광판 · 단계 배너 · 조작 선수 카드 · 파워 게이지 · 레이더 · 키 힌트.
// 매 프레임 갱신하되 바뀐 글자만 쓴다. sim 을 바꾸지 않는다.

import { kickerView } from '../core/rules'
import { addedMinute, matchMinute } from '../core/sim'
import { goalX, type GameState } from '../core/state'
import { Radar } from './radar'

/** callText 를 이만큼(틱) 띄운다 — 킥오프·추가시간 알림 */
const CALL_TICKS = 150

export interface HudView {
  /** 리플레이 재생 중 — 골 문구가 바뀐다 */
  replay?: boolean
  humanTeam: number
  controlled: number
  /** 세션이 띄우는 한 줄 (일시정지 등). 비어 있으면 단계 문구 */
  message: string
}

import { BALANCE_NAMES, CORNER_PLANS, TAC_NAMES, presetName } from '../core/tactics'

/** '#rrggbb' 가 밝은 색인가 (글씨 색을 뒤집는 기준) */
function isLight(css: string): boolean {
  const t = css.replace('#', '')
  const v = parseInt(t, 16)
  if (!Number.isFinite(v)) return false
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

export class Hud {
  readonly root: HTMLElement
  private radar: Radar
  private el: Record<string, HTMLElement> = {}
  private cache: Record<string, string> = {}
  private colors: [string, string]

  constructor(parent: HTMLElement, colors: [string, string], keysShown: boolean) {
    this.colors = colors
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="sb">
        <span class="half" data-k="half">전반</span>
        <span class="tn home" data-k="home"></span>
        <span class="sc" data-k="score">0 : 0</span>
        <span class="tn away" data-k="away"></span>
        <span class="clk" data-k="clock">0'</span>
      </div>
      <div class="banner" data-k="banner" hidden></div>
      <div class="me">
        <div class="nm" data-k="name"></div>
        <div class="bar sta"><i data-k="sta"></i></div>
        <div class="bar pow" data-k="powbar" hidden><i data-k="pow"></i></div>
        <div class="pre" data-k="preset"></div>
      </div>
      <div class="subs" data-k="subs"></div>
      <div class="keys" data-k="keys">
        <b>방향키</b> 이동 · <b>E</b> 전력질주 · <b>S</b> 패스 / 선수 변경 · <b>W</b> 스루 / GK 돌진 · <b>A</b> 로빙 / 슬라이딩 · <b>D</b> 슛(홀드) / 압박 · <b>Space</b> 태클(홀드 당기기) · <b>C</b> 견제 · <b>Q</b> 팀 압박<br>
        조합 <b>Z</b> 드라이브·감아차기 · <b>Q</b> 띄우기·칩·침투 · <b>C</b> 플레어 · <b>F+D</b> 파워 슛 · 같은 키 두 번 = 딩크·낮은 크로스·드리븐 · <b>Shift</b>(달리며 톡) 녹온 · <b>Ctrl</b> 퍼스트 터치 · <b>\`</b> 골키퍼 ·
        <b>1~0</b> 전술 · <b>[ ]</b> 공수 밸런스 · <b>F1~F4</b> 순간 전술 · <b>-</b> 이름 · <b>Enter</b> 채팅 · <b>Esc</b> 메뉴·교체
      </div>`
    parent.appendChild(this.root)
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e))
    this.radar = new Radar(this.root)
    this.setColors(colors)
    this.setKeysShown(keysShown)
  }

  /** 전광판 팀 칸 색 — 다시 하기로 홈/원정이 바뀌면 다시 부른다 (2026-09-11 코인토스) */
  setColors(colors: [string, string]): void {
    this.colors = colors
    // 배경이 밝으면 글씨를 어둡게 — 원정이 흰 유니폼이면 흰 글씨가 묻힌다 (2026-09-09)
    for (const [el, c] of [[this.el.home, colors[0]], [this.el.away, colors[1]]] as [HTMLElement, string][]) {
      el.style.background = c
      el.style.color = isLight(c) ? '#15181d' : '#ffffff'
      el.style.textShadow = isLight(c) ? 'none' : '0 1px 2px rgba(0,0,0,.5)'
    }
  }

  setKeysShown(b: boolean): void {
    this.el.keys.hidden = !b
  }

  private set(k: string, v: string): void {
    if (this.cache[k] === v) return
    this.cache[k] = v
    this.el[k].textContent = v
  }

  /** 리플레이 재생 중 (phaseText 가 본다) */
  private replaying = false
  private bannerText = ''
  private bannerAt = 0

  update(st: GameState, v: HudView): void {
    this.replaying = v.replay === true
    const [h, a] = st.teams
    this.set('home', h.short)
    this.set('away', a.short)
    this.set('score', `${h.goals} : ${a.goals}`)
    // 추가시간은 45'+2 · 90'+3 처럼 (사용자 요청 2026-09-10)
    const am = addedMinute(st)
    const base = Math.floor(matchMinute(st))
    this.set('clock', am > 0 && st.added >= 0 ? `${st.half === 1 ? 45 : 90}'+${Math.min(am, Math.max(st.added, am))}` : `${base}'`)
    this.set('half', st.half === 1 ? '전반' : '후반')

    // 단계 배너 — 세션 문구 > 방금 난 판정/킥오프 문구(2.5초) > 단계 문구
    let banner = v.message
    if (!banner && st.callText && st.tick - st.callTick < CALL_TICKS && st.phase === 'play') banner = st.callText
    if (!banner) banner = this.phaseText(st, v.humanTeam)
    const bn = this.el.banner
    if (banner) {
      this.set('banner', banner)
      bn.hidden = false
      const big = st.phase === 'goal' || st.phase === 'end' || st.phase === 'halftime' || (st.phase === 'play' && banner === st.callText && st.callText.includes('킥오프'))
      bn.classList.toggle('big', big)
      // 같은 문구가 2.5 초 넘게 떠 있으면 작게 접는다 — 세트피스 안내가 화면을 계속 가리지 않게 (2026-09-15)
      if (banner !== this.bannerText) {
        this.bannerText = banner
        this.bannerAt = performance.now()
      }
      bn.classList.toggle('small', !big && performance.now() - this.bannerAt > 2500)
    } else {
      bn.hidden = true
      this.bannerText = ''
    }

    // 조작 선수
    const me = this.el.name.parentElement!
    if (v.controlled >= 0) {
      const p = st.players[v.controlled]
      me.hidden = false
      this.set('name', `${p.spec.no} ${p.spec.name}`)
      const sta = Math.round(p.stamina * 100)
      const staEl = this.el.sta
      staEl.style.width = `${sta}%`
      staEl.style.background = sta < 30 ? '#f85149' : sta < 55 ? '#e3b341' : '#3fb950'
      const team = st.teams[v.humanTeam]
      // 파워 바는 2026-09-15 부터 조작 선수 **발밑**(렌더러) — HUD 의 바는 안 쓴다
      void team
      // "전술 균형" 만 있으면 무슨 글자인지 모른다(사용자 지적 2026-09-11) — 바꾸는 키까지 적는다.
      // 2026-09-23: 1~0 전술 · [ ] 공수 밸런스 · F1~F4 순간 전술(남은 초)
      const tac = team.tac > 0 && team.tacUntil > st.tick ? ` · ${TAC_NAMES[team.tac]} ${Math.ceil((team.tacUntil - st.tick) / 60)}초` : ''
      this.set('preset', `전술 ${presetName(team.preset)} (1~0) · ${BALANCE_NAMES[team.balance + 2]} ([ ])${tac}`)
    } else me.hidden = true

    // 교체·카드 요약
    const myTeam = st.teams[v.humanTeam]
    const cards = st.players.filter((p) => p.team === v.humanTeam && (p.yellow > 0 || p.sentOff)).length
    const pend = myTeam.pendingSubs.length
    this.set('subs', `교체 ${myTeam.subsLeft}명 · 기회 ${myTeam.subWindows}번${pend ? ` · 대기 ${pend}명` : ''}${cards ? ` · 카드 ${cards}` : ''}`)

    this.radar.draw(st, this.colors, v.controlled)
  }

  private phaseText(st: GameState, humanTeam: number): string {
    const r = st.restart
    const mine = r !== null && r.team === humanTeam
    const who = (t: number): string => st.teams[t].short
    switch (st.phase) {
      case 'kickoff': {
        const when = st.clock < 0.5 ? (st.half === 1 ? '전반 ' : '후반 ') : ''
        return mine ? `${when}킥오프 — 방향키로 받을 선수를 고르고 S (아군에게 짧게)` : `${when}${who(st.kickoffTeam)} 킥오프`
      }
      case 'goal': {
        const t = st.goalTeam
        const head = t >= 0 ? `⚽ 골! ${who(t)}` : '⚽ 골!'
        if (this.replaying) return `🔁 리플레이 — Enter 로 건너뛰기`
        const me = st.teams[humanTeam]
        const opp = st.teams[1 - humanTeam]
        // 온라인: 양쪽이 다 눌러야 넘어간다 — 누가 눌렀는지 보여 준다
        if (opp.human) {
          if (me.skipCele && !opp.skipCele) return `${head} · 상대가 세레모니를 보는 중…`
          if (!me.skipCele && opp.skipCele) return `${head} · 상대가 건너뛰기를 눌렀습니다 — Enter 로 넘어가기`
        }
        return `${head} · 세레모니 — Enter 로 건너뛰기`
      }
      case 'throwin':
        return mine ? '스로인 — 방향키 + S / A' : `${who(r!.team)} 스로인`
      case 'corner': {
        const plan = st.teams[humanTeam].cornerPlan
        return mine
          ? `코너킥 — 방향키 + A(크로스) / S · 작전 F1~F4: ${CORNER_PLANS[plan]}`
          : `${who(r!.team)} 코너킥`
      }
      case 'goalkick':
        return mine ? '골킥 — 방향키 + S 짧게 / A 홀드 롱볼 / D 홀드 펀트' : `${who(r!.team)} 골킥`
      case 'freekick': {
        const call = st.callText ? `${st.callText} — ` : ''
        const dG = Math.round(Math.hypot(r!.x - goalX(st.teams[r!.team]), r!.y))
        if (mine && kickerView(st)) return `${call}직접 프리킥 · 골문 ${dG} m — ← → 코너 · ↑ ↓ 높이 · D 홀드 힘(Z 감아 · C 플레어 · 찬 뒤 D 낮게) / A 롱볼 / S 짧게`
        if (!mine && kickerView(st)) {
          const me = st.teams[humanTeam]
          const adv = me.wallAdv > 0 ? ` · 전진 ${me.wallAdv} m` : ''
          return `${call}${who(r!.team)} 직접 프리킥 · ${dG} m — 벽: W 점프 · C/E 좌우 · Z 전진(경고 위험)${adv} · D 뛰쳐나가기`
        }
        return mine
          ? `${call}프리킥 · 골문 ${dG} m — 방향키 + S 짧게 / A 홀드 롱볼 / D 홀드 슛`
          : `${call}${who(r!.team)} 프리킥 · 골문 ${dG} m`
      }
      case 'penalty': {
        if (mine) return '⚽ 페널티킥 — ← → 코너 · ↑ ↓ 높이 · D 홀드 힘 · Z 감아 · Q 파넨카 · C 걸어가며 · E 달려가며 · Shift+방향키 자리'
        const me = st.teams[humanTeam]
        if (me.human) {
          const pick = me.pkDive ? (Math.abs(me.pkDiveY) < 0.34 ? ' · 가운데 대기' : me.pkDiveY * st.teams[r!.team].dir < 0 ? ' · 오른쪽으로 다이빙' : ' · 왼쪽으로 다이빙') : ''
          return `🧤 ${who(r!.team)} 페널티킥 — ← → 골라인 이동 · D(또는 Shift·Ctrl)+방향키 다이빙 방향 · W/A/S/D 방해 동작${pick}`
        }
        return `${who(r!.team)} 페널티킥`
      }
      case 'halftime':
        return '전반 종료 — 하프타임'
      case 'end':
        return '경기 종료'
      default:
        return ''
    }
  }

  dispose(): void {
    this.radar.dispose()
    this.root.remove()
  }
}
