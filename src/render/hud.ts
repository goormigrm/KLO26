// HUD — DOM 오버레이 (DESIGN 7.1 "HUD 는 DOM 오버레이"). 전광판 · 단계 배너 · 조작 선수 카드 · 파워 게이지 · 레이더 · 키 힌트.
// 매 프레임 갱신하되 바뀐 글자만 쓴다. sim 을 바꾸지 않는다.

import { addedMinute, matchMinute } from '../core/sim'
import type { GameState } from '../core/state'
import { Radar } from './radar'

/** callText 를 이만큼(틱) 띄운다 — 킥오프·추가시간 알림 */
const CALL_TICKS = 150

export interface HudView {
  humanTeam: number
  controlled: number
  /** 세션이 띄우는 한 줄 (일시정지 등). 비어 있으면 단계 문구 */
  message: string
}

const PRESET_NAMES = ['수비', '균형', '공격']

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
        <b>방향키</b> 이동 · <b>E</b> 전력질주 · <b>S</b> 패스 / 선수 변경 · <b>W</b> 스루 / GK 돌진 · <b>A</b> 로빙 / 슬라이딩 · <b>D</b> 슛(홀드) / 압박(자동 추격) ·
        <b>Space</b> 태클 · <b>C</b> 견제 · <b>Q</b> 팀 압박 · <b>Q+D</b> 칩슛 · <b>Q+A</b> 하이 크로스 · <b>Shift</b> 페이스 컨트롤 · <b>[ ]</b> 전술 · <b>Esc</b> 메뉴·교체
      </div>`
    parent.appendChild(this.root)
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e))
    this.radar = new Radar(this.root)
    // 배경이 밝으면 글씨를 어둡게 — 원정이 흰 유니폼으로 갈아입으면 흰 글씨가 묻힌다 (2026-09-09)
    for (const [el, c] of [[this.el.home, colors[0]], [this.el.away, colors[1]]] as [HTMLElement, string][]) {
      el.style.background = c
      el.style.color = isLight(c) ? '#15181d' : '#ffffff'
      el.style.textShadow = isLight(c) ? 'none' : '0 1px 2px rgba(0,0,0,.5)'
    }
    this.setKeysShown(keysShown)
  }

  setKeysShown(b: boolean): void {
    this.el.keys.hidden = !b
  }

  private set(k: string, v: string): void {
    if (this.cache[k] === v) return
    this.cache[k] = v
    this.el[k].textContent = v
  }

  update(st: GameState, v: HudView): void {
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
      bn.classList.toggle('big', st.phase === 'goal' || st.phase === 'end' || st.phase === 'halftime' || (st.phase === 'play' && banner === st.callText && st.callText.includes('킥오프')))
    } else bn.hidden = true

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
      const hold = Math.max(team.holdShoot / 36, team.holdPass / 30)
      const pow = Math.min(1, hold)
      this.el.powbar.hidden = hold <= 0
      this.el.pow.style.width = `${Math.round(pow * 100)}%`
      this.set('preset', `전술 ${PRESET_NAMES[team.preset] ?? ''}`)
    } else me.hidden = true

    // 교체·카드 요약
    const myTeam = st.teams[v.humanTeam]
    const cards = st.players.filter((p) => p.team === v.humanTeam && (p.yellow > 0 || p.sentOff)).length
    this.set('subs', `교체 ${myTeam.subsLeft}/3${myTeam.pendingSub ? ' (대기)' : ''}${cards ? ` · 카드 ${cards}` : ''}`)

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
        const last = st.events.length ? st.events[st.events.length - 1] : null
        const t = last && last.type === 'goal' ? last.team : -1
        return t >= 0 ? `⚽ 골! ${who(t)}` : '⚽ 골!'
      }
      case 'throwin':
        return mine ? '스로인 — 방향키 + S / A' : `${who(r!.team)} 스로인`
      case 'corner':
        return mine ? '코너킥 — 방향키 + A(크로스) / S' : `${who(r!.team)} 코너킥`
      case 'goalkick':
        return mine ? '골킥 — 방향키 + S / A / D' : `${who(r!.team)} 골킥`
      case 'freekick': {
        const call = st.callText ? `${st.callText} — ` : ''
        return mine ? `${call}프리킥 — 방향키 + S / A / D(홀드=슛)` : `${call}${who(r!.team)} 프리킥`
      }
      case 'penalty':
        return mine ? '⚽ 페널티킥 — 방향키(코너) + D 홀드(파워)' : `${who(r!.team)} 페널티킥`
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
