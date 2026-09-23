// 🎯 조작 연습 화면 (2026-09-23, 사용자 "조작키가 늘었으니 연습 모드 — 선수 1명을 조작해서 특정 조작키를 특정 상황에서 성공할 때까지").
//
// 연습 목록에서 하나를 고르면 그 상황만 세워 진짜 sim 을 돌린다(`game/drills.ts`). 실패하면 이유를 잠깐 보여 주고
// **같은 상황을 처음부터 다시** — 성공할 때까지. 성공하면 다시 / 다음 연습 / 목록.
// 경기 세션(`session.ts`)과 달리 동전 던지기·중계 음성·관중·하프타임·온라인이 없다. 렌더러·입력·입력 키 표시는 같은 것을 쓴다.
// 기록(연습마다 가장 적은 시도 수)은 이 브라우저에만 남는다 (localStorage — 없어도 돈다).

import { EMPTY_INPUT, BTN_A, BTN_C, BTN_D, BTN_Q, BTN_Z, type Input } from '../core/input'
import { previewRestartKick, type KickPreview } from '../core/rules'
import { POWER_GREEN, POWER_TICKS, createState, step } from '../core/sim'
import { TICK_MS, type GameState } from '../core/state'
import { clubSquad, squadClub, toSquadConfig, type Squad } from '../cards/squad'
import { CLUBS } from '../data/pool'
import { sfx } from '../audio/sfx'
import { KeyView } from '../render/keyview'
import { matchKits } from '../render3d/kits'
import { NAME_MODE_TEXT, Renderer3D, capturePose, type NameMode, type PrevPose } from '../render3d/renderer3d'
import type { Settings } from '../ui/settings'
import { DRILLS, DRILL_CATS, judge, startDrill, type Drill, type DrillCtx } from './drills'
import { LocalInput } from './localInput'
import { Ticker } from './ticker'

const STORE = 'klo26.practice.v1'
/** 결과를 보여 주는 시간 (ms) — 그동안 sim 은 멈추고 화면은 그대로 */
const FLASH_MS = 1300
/** 시도마다 시작 전 준비 시간 (ms) — 키를 잡을 틈 */
const READY_MS = 700

/** 연습마다 가장 적은 시도 수 */
function loadBest(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveBest(b: Record<string, number>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(b))
  } catch {
    // 저장이 막힌 브라우저 — 기록만 안 남는다
  }
}

/** '`Z + D`' 같은 키 글을 키캡으로 — `+` 함께 · `→` 차례로 */
function keycaps(keys: string): string {
  return keys
    .split(/(\s[+→]\s)/)
    .map((part) => {
      const t = part.trim()
      if (t === '+' || t === '→') return `<i>${t}</i>`
      // 괄호 설명은 키캡 밖으로
      const m = /^(.*?)(\s*\(.*\))?$/.exec(t)
      const key = (m?.[1] ?? t).trim()
      const note = m?.[2] ? `<small>${m[2].trim()}</small>` : ''
      return `<kbd>${key.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</kbd>${note}`
    })
    .join('')
}

export class PracticeSession {
  private renderer: Renderer3D
  private input = new LocalInput()
  private keyView: KeyView
  private ticker: Ticker
  private snd = sfx()
  private raf = 0
  private disposed = false
  private acc = 0
  private lastTick = performance.now()
  private last = performance.now()

  private overlay: HTMLElement
  private box: HTMLElement
  private card: HTMLElement
  private flash: HTMLElement
  private kits: ReturnType<typeof matchKits>

  private drill: Drill | null = null
  private state: GameState
  private prev: PrevPose
  private ctx: DrillCtx | null = null
  private lastInput: Input = EMPTY_INPUT
  private evSeen = 0
  /** 멈춤 — 목록·성공 창 · 결과 보여 주는 중 · 시작 준비 중 */
  private paused = true
  private flashUntil = 0
  private readyUntil = 0
  private afterFlash: (() => void) | null = null
  /** 이번 시도는 결과가 났다 — 목록에서 돌아와도 이어 하지 않고 새로 시작한다 */
  private finished = false
  private tries = 0
  private wins = 0
  private seed = 1
  private best = loadBest()
  private nameMode: NameMode = 0
  private toast = ''
  private toastUntil = 0

  constructor(
    host: HTMLElement,
    settings: Settings,
    private squad: Squad,
    private onExit: () => void,
  ) {
    host.innerHTML = `
      <div class="game-root practice">
        <div class="game-stage" id="stage"></div>
        <div class="game-ui">
          <div class="top-right"><button class="btn secondary" id="btn-list">연습 목록 (Esc)</button><button class="btn secondary" id="btn-lobby">로비로</button></div>
          <div class="drill-card" id="card" hidden></div>
          <div class="drill-flash" id="flash" hidden></div>
          <div class="overlay" id="overlay" hidden><div class="box drill-box" id="overlay-box"></div></div>
        </div>
      </div>`
    const stage = host.querySelector('#stage') as HTMLElement
    this.overlay = host.querySelector('#overlay') as HTMLElement
    this.box = host.querySelector('#overlay-box') as HTMLElement
    this.card = host.querySelector('#card') as HTMLElement
    this.flash = host.querySelector('#flash') as HTMLElement
    this.renderer = new Renderer3D(stage, { shadows: settings.shadows, resScale: settings.resScale, helpers: settings.helpers })
    // 연습은 입력 키 표시를 늘 켠다 — 지금 누른 키가 sim 에 어떻게 들어가는지 보는 게 연습의 절반이다
    this.keyView = new KeyView(stage)
    const myClub = squadClub(squad)
    const opp = CLUBS.find((c) => c.id !== myClub?.id) ?? CLUBS[0]
    this.kits = matchKits(myClub, opp)
    this.state = this.freshState()
    this.prev = capturePose(this.state)
    this.renderer.setMatch(this.state, this.kits.kits, this.kits.gkKits)
    this.snd.stopMusic()
    ;(host.querySelector('#btn-list') as HTMLButtonElement).onclick = () => this.showList()
    ;(host.querySelector('#btn-lobby') as HTMLButtonElement).onclick = () => this.exit()
    // Esc — 연습 중이면 목록, 성공 창이면 목록, 목록이면 하던 연습으로 돌아가기
    this.input.onEscape = () => {
      if (this.overlay.hidden || this.box.querySelector('#ok-next')) this.showList()
      else if (this.drill && this.ctx) this.hideOverlay()
    }
    this.input.onRenderKey = () => {
      this.nameMode = ((this.nameMode + 1) % 3) as NameMode
      this.renderer.setNameMode(this.nameMode)
      this.toast = NAME_MODE_TEXT[this.nameMode]
      this.toastUntil = performance.now() + 1500
    }
    this.input.attach()
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    this.showList()
  }

  /** 연습용 경기 — 내 스쿼드(홈) 대 다른 구단. 시간은 사실상 끝이 없다(하프타임이 오지 않게) */
  private freshState(): GameState {
    const myClub = squadClub(this.squad)
    const opp = CLUBS.find((c) => c.id !== myClub?.id) ?? CLUBS[0]
    const mine = toSquadConfig(this.squad, myClub?.name ?? '내 팀', myClub?.short ?? '내팀')
    const them = toSquadConfig(clubSquad(opp.id, '4-4-2'), opp.name, opp.short)
    return createState({ seed: this.seed++, halfSec: 36000, squads: [mine, them], human: [true, false], bots: [2, 2] })
  }

  // ---- 흐름 ----

  private select(d: Drill): void {
    this.drill = d
    this.tries = 0
    this.wins = 0
    this.hideOverlay()
    this.attempt()
  }

  /** 같은 상황을 처음부터 */
  private attempt(): void {
    const d = this.drill
    if (!d) return
    this.state = this.freshState()
    this.ctx = startDrill(d, this.state)
    this.prev = capturePose(this.state)
    this.evSeen = this.state.events.length
    this.tries++
    this.acc = 0
    this.finished = false
    this.paused = false
    this.readyUntil = performance.now() + READY_MS
    this.flash.hidden = true
    this.drawCard()
  }

  private result(r: true | string): void {
    const d = this.drill!
    this.paused = true
    this.finished = true
    this.flash.hidden = false
    if (r === true) {
      this.wins++
      const prevBest = this.best[d.id]
      if (!prevBest || this.tries < prevBest) {
        this.best[d.id] = this.tries
        saveBest(this.best)
      }
      this.flash.className = 'drill-flash ok'
      this.flash.textContent = `✅ 성공! — ${this.tries}번째 시도`
      this.snd.ui('ok')
      this.afterFlash = () => this.showSuccess()
    } else {
      this.flash.className = 'drill-flash no'
      this.flash.textContent = `✖ ${r} — 다시`
      this.snd.ui('no')
      this.afterFlash = () => this.attempt()
    }
    this.flashUntil = performance.now() + FLASH_MS
    this.drawCard()
  }

  private next(): void {
    const d = this.drill
    const i = d ? DRILLS.indexOf(d) : -1
    this.select(DRILLS[(i + 1) % DRILLS.length])
  }

  // ---- 창 ----

  private showList(): void {
    this.paused = true
    this.afterFlash = null
    this.flash.hidden = true
    const done = DRILLS.filter((d) => this.best[d.id]).length
    const groups = DRILL_CATS.map((cat) => {
      const items = DRILLS.filter((d) => d.cat === cat)
        .map((d) => {
          const b = this.best[d.id]
          return `<button class="drill-item${b ? ' done' : ''}" data-id="${d.id}">
            <b>${d.title}</b><span class="dk">${keycaps(d.keys)}</span>${b ? `<em>✓ ${b}번</em>` : ''}</button>`
        })
        .join('')
      return `<div class="drill-cat"><h4>${cat}</h4>${items}</div>`
    }).join('')
    this.box.innerHTML = `
      <h2>🎯 조작 연습</h2>
      <p>선수 한 명으로 키 하나씩 — 성공할 때까지 같은 상황이 처음부터 되풀이됩니다. 완료 ${done} / ${DRILLS.length}</p>
      <div class="drill-grid">${groups}</div>
      <div class="row"><button class="btn secondary" id="pl-lobby">로비로</button>${this.drill && this.ctx ? '<button class="btn main" id="pl-back">돌아가기 (Esc)</button>' : ''}</div>`
    this.box.querySelectorAll<HTMLButtonElement>('.drill-item').forEach((b) => {
      b.onclick = () => {
        const d = DRILLS.find((x) => x.id === b.dataset.id)
        if (d) this.select(d)
      }
    })
    ;(this.box.querySelector('#pl-lobby') as HTMLButtonElement).onclick = () => this.exit()
    const back = this.box.querySelector('#pl-back') as HTMLButtonElement | null
    if (back) back.onclick = () => this.hideOverlay()
    this.overlay.hidden = false
  }

  private showSuccess(): void {
    const d = this.drill!
    this.flash.hidden = true
    this.box.innerHTML = `
      <h2>✅ 성공!</h2>
      <p><b>${d.title}</b> — ${this.tries}번째 시도에 해냈습니다. 최고 기록 ${this.best[d.id]}번.</p>
      <p class="dk big">${keycaps(d.keys)}</p>
      <div class="row">
        <button class="btn secondary" id="ok-again">한 번 더 (R)</button>
        <button class="btn main" id="ok-next">다음 연습 (Enter)</button>
        <button class="btn secondary" id="ok-list">목록 (Esc)</button>
      </div>`
    ;(this.box.querySelector('#ok-again') as HTMLButtonElement).onclick = () => this.select(d)
    ;(this.box.querySelector('#ok-next') as HTMLButtonElement).onclick = () => this.next()
    ;(this.box.querySelector('#ok-list') as HTMLButtonElement).onclick = () => this.showList()
    this.overlay.hidden = false
  }

  private hideOverlay(): void {
    this.overlay.hidden = true
    if (!this.drill || !this.ctx) return
    // 결과가 난 시도는 이어 하지 않는다 — 같은 상황을 새로
    if (this.finished) this.attempt()
    else if (this.afterFlash === null && this.flash.hidden) this.paused = false
  }

  /** 왼쪽 위 연습 카드 — 키 · 성공 조건 · 요령 · 시도 */
  private drawCard(): void {
    const d = this.drill
    if (!d) {
      this.card.hidden = true
      return
    }
    this.card.hidden = false
    this.card.innerHTML = `
      <div class="dc-cat">${d.cat} · 🎯 조작 연습</div>
      <h3>${d.title}</h3>
      <div class="dk">${keycaps(d.keys)}</div>
      <p class="dc-goal"><b>성공</b> ${d.goal}</p>
      <p class="dc-tip">${d.tip}</p>
      <div class="dc-stat"><span>시도 ${this.tries}</span><span>성공 ${this.wins}</span><span data-t></span></div>
      <div class="dc-hint">R 처음부터 · Esc 목록 · - 이름 표시</div>`
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return
    const successOpen = !this.overlay.hidden && this.box.querySelector('#ok-next') !== null
    if (e.code === 'KeyR' && this.drill) {
      e.preventDefault()
      if (successOpen) this.select(this.drill)
      else if (this.overlay.hidden) {
        this.afterFlash = null
        this.attempt()
      }
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && successOpen) {
      e.preventDefault()
      this.next()
    }
  }

  // ---- 루프 ----

  private tick(): void {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min(0.25, (now - this.lastTick) / 1000)
    this.lastTick = now
    if (this.afterFlash && now >= this.flashUntil) {
      const f = this.afterFlash
      this.afterFlash = null
      f()
    }
    if (this.paused || !this.drill || !this.ctx || now < this.readyUntil) {
      this.acc = 0
      return
    }
    this.acc += dt * 1000
    let steps = 0
    while (this.acc >= TICK_MS && steps < 4 && !this.paused) {
      const inp = this.input.sample()
      this.lastInput = inp
      capturePose(this.state, this.prev)
      step(this.state, [inp, EMPTY_INPUT])
      const r = judge(this.drill, this.state, this.ctx, inp)
      if (r !== null) this.result(r)
      this.acc -= TICK_MS
      steps++
    }
    if (this.acc > TICK_MS * 8) this.acc = TICK_MS * 8
    const ev = this.state.events
    this.renderer.onEvents(ev, this.evSeen)
    this.snd.onEvents(ev, this.evSeen)
    this.evSeen = ev.length
  }

  private frame = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const st = this.state
    const tm = st.teams[0]
    const controlled = tm.controlled
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK_MS)
    const hold = Math.min(1, Math.max(tm.holdShoot / 36, tm.holdPass / 30))
    const gauge = tm.powerT >= 0
      ? { t: (st.tick - tm.powerT) / POWER_TICKS, green: [POWER_GREEN[0] / POWER_TICKS, POWER_GREEN[1] / POWER_TICKS] as [number, number], hit: tm.powerHit }
      : null
    this.renderer.draw(this.prev, st, alpha, dt, { humanTeam: 0, controlled, aim: this.previewAim(), hold, gauge })
    const p = controlled >= 0 ? st.players[controlled] : null
    this.keyView.update({
      down: this.input.pressed,
      input: this.lastInput,
      controlled,
      name: p ? `${p.spec.no} ${p.spec.name}` : '조작 없음',
      hasBall: st.ball.owner >= 0 && st.players[st.ball.owner].team === 0,
    })
    // 남은 시간 · 세트피스 차는 순간까지 · 잠깐 뜨는 알림
    const t = this.card.querySelector('[data-t]') as HTMLElement | null
    if (t && this.drill && this.ctx) {
      const left = Math.max(0, this.drill.limit - (st.tick - this.ctx.start) / 60)
      let text = now < this.readyUntil ? '준비…' : `남은 ${left.toFixed(1)}초`
      if (st.phase === 'freekick' && st.restart && st.restart.team === 1) text += ` · 킥까지 ${Math.max(0, st.phaseT / 60).toFixed(1)}초`
      if (st.phase === 'penalty' && st.restart && st.restart.team === 1) text += ` · 킥까지 ${Math.max(0, st.phaseT / 60).toFixed(1)}초`
      if (now < this.toastUntil) text += ` · ${this.toast}`
      if (st.callText && st.tick - st.callTick < 90) text += ` · ${st.callText}`
      if (t.textContent !== text) t.textContent = text
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  /** 프리킥·PK 연습의 궤적 미리보기 — 경기 세션과 같은 계산 */
  private previewAim(): KickPreview | null {
    const st = this.state
    const r = st.restart
    const team = st.teams[0]
    if (!r || r.team !== 0 || st.phase === 'play' || r.kicker !== team.controlled) return null
    const held = this.lastInput.buttons
    const kind = held & BTN_D ? 'D' : held & BTN_A ? 'A' : null
    if (!kind) return null
    const mods = { finesse: (held & BTN_Z) !== 0, panenka: st.phase === 'penalty' && (held & BTN_Q) !== 0, flair: st.phase !== 'penalty' && (held & BTN_C) !== 0 }
    return previewRestartKick(st, 0, kind, this.lastInput.mx, this.lastInput.my, Math.min(1, team.holdShoot / 36), mods)
  }

  private onResize = (): void => this.renderer.resize()

  private exit(): void {
    this.dispose()
    this.onExit()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ticker.stop()
    cancelAnimationFrame(this.raf)
    this.input.dispose()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    this.keyView.dispose()
    this.renderer.dispose()
  }
}
