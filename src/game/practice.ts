// 🎯 조작 연습 화면 (2026-09-23, 사용자 "조작키가 늘었으니 연습 모드 — 선수 1명을 조작해서 특정 조작키를 특정 상황에서 성공할 때까지").
//
// 흐름 (2026-09-23 두 번째 요청 "AI 가 먼저 키를 누르며 성공하는 시범 → 가운데 설명을 읽고 Enter 로 시작"):
//   목록 → 🤖 시범 준비(성공하는 시드 찾기) → 🤖 시범(AI 가 누르는 키가 키캡·입력 키 상자에 켜진다) → 가운데 설명 창 → Enter → 내 차례
//   → 실패하면 이유를 보여 주고 같은 상황 처음부터 · 성공하면 한 번 더 / 다음 연습(시범부터) / 목록.
// 시범이 반드시 성공하는 까닭 — sim 이 결정론이라 화면 없이 먼저 돌려 성공한 시드를 같은 대본으로 다시 돌린다(`game/demos.ts`).
// 경기 세션(`session.ts`)과 달리 동전 던지기·중계 음성·관중·하프타임·온라인이 없다. 렌더러·입력·입력 키 표시는 같은 것을 쓴다.
// 기록(연습마다 가장 적은 시도 수)은 이 브라우저에만 남는다 (localStorage — 없어도 돈다).

import {
  EMPTY_INPUT, BTN_A, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_F, BTN_GK, BTN_PACE, BTN_Q, BTN_S, BTN_SPACE, BTN_W, BTN_Z, type Input,
} from '../core/input'
import { previewRestartKick, type KickPreview } from '../core/rules'
import { POWER_GREEN, POWER_TICKS, createState, kickStick, step } from '../core/sim'
import { TICK_MS, type GameState } from '../core/state'
import { clubSquad, squadClub, toSquadConfig, type Squad } from '../cards/squad'
import { CLUBS } from '../data/pool'
import { sfx } from '../audio/sfx'
import { KeyView } from '../render/keyview'
import { matchKits } from '../render3d/kits'
import { NAME_MODE_TEXT, Renderer3D, capturePose, type NameMode, type PrevPose } from '../render3d/renderer3d'
import type { Settings } from '../ui/settings'
import { demoInput, inputCodes, runDemo } from './demos'
import { DRILLS, DRILL_CATS, judge, startDrill, type Drill, type DrillCtx } from './drills'
import { LocalInput } from './localInput'
import { Ticker } from './ticker'

const STORE = 'klo26.practice.v1'
/** 결과를 보여 주는 시간 (ms) — 그동안 sim 은 멈추고 화면은 그대로 */
const FLASH_MS = 1300
/** 시도마다 시작 전 준비 시간 (ms) — 키를 잡을 틈 */
const READY_MS = 700
/** 시범에서 누른 키를 이만큼 켜 둔다 (ms) — 한 틱(16 ms)만 누른 톡은 눈에 안 보여서 */
const LIT_MS = 320
/** 시범 시드를 찾을 후보 — 연습 시드(1, 2, …)와 겹치지 않게 */
const DEMO_SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i)
/** 물리 키 → 입력 비트 (시범 때 입력 키 상자에 켜 둔 조합을 보여 준다) */
const LIT_BITS: [string, number][] = [
  ['KeyS', BTN_S], ['KeyW', BTN_W], ['KeyA', BTN_A], ['KeyD', BTN_D], ['KeyE', BTN_E], ['ShiftLeft', BTN_PACE], ['Space', BTN_SPACE],
  ['KeyC', BTN_C], ['KeyQ', BTN_Q], ['KeyZ', BTN_Z], ['KeyF', BTN_F], ['ControlLeft', BTN_CTRL], ['Backquote', BTN_GK],
]

type Mode = 'list' | 'search' | 'demo' | 'brief' | 'play' | 'success'

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

/** 키 글 한 토막 → 불을 켤 물리 키들 (시범 때 키캡이 켜진다) */
function tokenCodes(key: string): string[] {
  if (key.includes('방향키') || key === '앞' || key === '뒤') return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  if (key === 'Shift') return ['ShiftLeft', 'ShiftRight']
  if (key === 'Ctrl') return ['ControlLeft', 'ControlRight']
  if (key === '`') return ['Backquote']
  if (key === 'Space') return ['Space']
  if (/^[A-Z]$/.test(key)) return [`Key${key}`]
  return []
}

/** '`Z + D`' 같은 키 글을 키캡으로 — `+` 함께 · `→` 차례로. 키캡마다 불을 켤 물리 키를 붙인다 */
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
      return `<kbd data-k="${tokenCodes(key).join(' ')}">${key.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</kbd>${note}`
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
  private banner: HTMLElement
  private kits: ReturnType<typeof matchKits>

  private mode: Mode = 'list'
  private drill: Drill | null = null
  private state: GameState
  private prev: PrevPose
  private ctx: DrillCtx | null = null
  private lastInput: Input = EMPTY_INPUT
  private evSeen = 0
  private flashUntil = 0
  private readyUntil = 0
  private afterFlash: (() => void) | null = null
  private tries = 0
  private wins = 0
  private seed = 1
  private best = loadBest()
  private nameMode: NameMode = 0
  private toast = ''
  private toastUntil = 0
  // ---- 시범 ----
  /** 연습마다 찾아 둔 시범 시드 (−1 = 못 찾았다) */
  private demoSeeds = new Map<string, number>()
  private demoK = 0
  private demoMem: Record<string, number> = {}
  /** 시범에서 누른 키 → 꺼질 시각 */
  private lit = new Map<string, number>()
  private searchTimer = 0
  private searchToken = 0

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
          <div class="demo-banner" id="banner" hidden></div>
          <div class="drill-flash" id="flash" hidden></div>
          <div class="overlay" id="overlay" hidden><div class="box drill-box" id="overlay-box"></div></div>
        </div>
      </div>`
    const stage = host.querySelector('#stage') as HTMLElement
    this.overlay = host.querySelector('#overlay') as HTMLElement
    this.box = host.querySelector('#overlay-box') as HTMLElement
    this.card = host.querySelector('#card') as HTMLElement
    this.flash = host.querySelector('#flash') as HTMLElement
    this.banner = host.querySelector('#banner') as HTMLElement
    this.renderer = new Renderer3D(stage, { shadows: settings.shadows, resScale: settings.resScale, helpers: settings.helpers })
    // 연습은 입력 키 표시를 늘 켠다 — 지금 누른 키가 sim 에 어떻게 들어가는지 보는 게 연습의 절반이다
    this.keyView = new KeyView(stage)
    const myClub = squadClub(squad)
    const opp = CLUBS.find((c) => c.id !== myClub?.id) ?? CLUBS[0]
    this.kits = matchKits(myClub, opp)
    this.state = this.makeState(this.seed++)
    this.prev = capturePose(this.state)
    this.renderer.setMatch(this.state, this.kits.kits, this.kits.gkKits)
    this.snd.stopMusic()
    ;(host.querySelector('#btn-list') as HTMLButtonElement).onclick = () => this.showList()
    ;(host.querySelector('#btn-lobby') as HTMLButtonElement).onclick = () => this.exit()
    // Esc — 어디서든 목록, 목록이면 하던 연습으로 돌아가기
    this.input.onEscape = () => {
      if (this.mode === 'list') {
        if (this.canResume()) this.resume()
      } else this.showList()
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
  private makeState(seed: number): GameState {
    const myClub = squadClub(this.squad)
    const opp = CLUBS.find((c) => c.id !== myClub?.id) ?? CLUBS[0]
    const mine = toSquadConfig(this.squad, myClub?.name ?? '내 팀', myClub?.short ?? '내팀')
    const them = toSquadConfig(clubSquad(opp.id, '4-4-2'), opp.name, opp.short)
    return createState({ seed, halfSec: 36000, squads: [mine, them], human: [true, false], bots: [2, 2] })
  }

  // ---- 흐름 ----

  /** 연습 고르기 — 먼저 시범 */
  private select(d: Drill): void {
    this.drill = d
    this.tries = 0
    this.wins = 0
    this.ctx = null
    this.flash.hidden = true
    this.afterFlash = null
    this.drawCard()
    this.startDemo()
  }

  /**
   * 🤖 시범 — 성공하는 시드를 아직 모르면 화면 없이 하나씩 돌려 찾는다. 시드 하나(20~45 ms)마다 쉬어서
   * 느린 PC 에서도 화면이 굳지 않는다. 40개 안에서 못 찾으면 시범 없이 설명으로
   */
  private startDemo(): void {
    const d = this.drill
    if (!d) return
    this.afterFlash = null
    this.flash.hidden = true
    const known = this.demoSeeds.get(d.id)
    if (known !== undefined) {
      if (known >= 0) this.playDemo(known)
      else this.showBrief('이 스쿼드로는 AI 도 시범을 성공하지 못했습니다 — 설명을 보고 바로 해 보세요.')
      return
    }
    this.mode = 'search'
    this.overlay.hidden = true
    this.showBanner(`🤖 시범 준비 중… <small>AI 가 성공하는 장면을 찾고 있습니다 · Enter 건너뛰기</small>`, d)
    const token = ++this.searchToken
    let i = 0
    const tryNext = (): void => {
      if (this.disposed || token !== this.searchToken || this.drill !== d) return
      const seed = DEMO_SEEDS[i++]
      if (runDemo(d, this.makeState(seed))) {
        this.demoSeeds.set(d.id, seed)
        this.playDemo(seed)
      } else if (i < DEMO_SEEDS.length) this.searchTimer = window.setTimeout(tryNext, 0)
      else {
        this.demoSeeds.set(d.id, -1)
        this.showBrief('이 스쿼드로는 AI 도 시범을 성공하지 못했습니다 — 설명을 보고 바로 해 보세요.')
      }
    }
    this.searchTimer = window.setTimeout(tryNext, 30)
  }

  /** 찾은 시드를 같은 대본으로 화면에서 — 결정론이라 똑같이 성공한다 */
  private playDemo(seed: number): void {
    const d = this.drill!
    this.state = this.makeState(seed)
    this.ctx = startDrill(d, this.state)
    this.prev = capturePose(this.state)
    this.evSeen = this.state.events.length
    this.demoK = 0
    this.demoMem = {}
    this.lit.clear()
    this.acc = 0
    this.mode = 'demo'
    this.overlay.hidden = true
    this.flash.hidden = true
    this.readyUntil = performance.now() + READY_MS
    this.showBanner(`🤖 시범 — AI 가 누르는 키에 불이 켜집니다 <small>Enter 건너뛰기 · Esc 목록</small>`, d)
    this.input.sample() // 그동안 눌린 키를 버린다 — 시범 중 입력은 쓰지 않는다
  }

  /** 가운데 설명 창 — 읽고 Enter 로 시작 */
  private showBrief(note = ''): void {
    const d = this.drill!
    clearTimeout(this.searchTimer)
    this.searchToken++
    this.mode = 'brief'
    this.banner.hidden = true
    this.flash.hidden = true
    this.afterFlash = null
    const hasDemo = (this.demoSeeds.get(d.id) ?? -1) >= 0
    this.box.innerHTML = `
      <div class="brief-cat">${d.cat} · 🎯 조작 연습</div>
      <h2>${d.title}</h2>
      <p class="dk big">${keycaps(d.keys)}</p>
      <div class="brief-body">
        <p><b>성공</b> ${d.goal}</p>
        <p><b>요령</b> ${d.tip}</p>
        <p class="brief-limit">${d.limit}초 안에 — 실패하면 같은 상황이 처음부터 다시 나옵니다.</p>
        ${note ? `<p class="brief-note">${note}</p>` : ''}
      </div>
      <div class="row">
        <button class="btn main" id="br-go">시작 (Enter)</button>
        ${hasDemo ? '<button class="btn secondary" id="br-demo">시범 다시 (V)</button>' : ''}
        <button class="btn secondary" id="br-list">목록 (Esc)</button>
      </div>`
    ;(this.box.querySelector('#br-go') as HTMLButtonElement).onclick = () => this.attempt()
    const demoBtn = this.box.querySelector('#br-demo') as HTMLButtonElement | null
    if (demoBtn) demoBtn.onclick = () => this.startDemo()
    ;(this.box.querySelector('#br-list') as HTMLButtonElement).onclick = () => this.showList()
    this.overlay.hidden = false
  }

  /** 내 차례 — 같은 상황을 처음부터 (시드만 바뀐다) */
  private attempt(): void {
    const d = this.drill
    if (!d) return
    this.state = this.makeState(this.seed++)
    this.ctx = startDrill(d, this.state)
    this.prev = capturePose(this.state)
    this.evSeen = this.state.events.length
    this.tries++
    this.acc = 0
    this.mode = 'play'
    this.overlay.hidden = true
    this.banner.hidden = true
    this.flash.hidden = true
    this.afterFlash = null
    this.readyUntil = performance.now() + READY_MS
    this.input.sample() // Enter 등 앞서 눌린 edge 를 버린다
    this.drawCard()
  }

  /** 목록에서 돌아갈 곳이 있나 — 내 차례를 하던 중이었으면 */
  private canResume(): boolean {
    return this.drill !== null && this.tries > 0
  }

  /** 목록에서 돌아가기 — 같은 연습의 새 시도 (결과가 났든 아니든 처음부터 — 목록을 여는 사이 멈춘 장면을 이어 하지 않는다) */
  private resume(): void {
    this.overlay.hidden = true
    if (!this.drill) return
    this.attempt()
  }

  private demoDone(r: true | string): void {
    this.flash.hidden = false
    this.flash.className = r === true ? 'drill-flash ok' : 'drill-flash no'
    this.flash.textContent = r === true ? '🤖 시범 성공 — 이제 해 보세요' : '🤖 시범이 어긋났습니다 — 설명을 보고 해 보세요'
    this.mode = 'brief'
    this.afterFlash = () => this.showBrief()
    this.flashUntil = performance.now() + FLASH_MS
  }

  private result(r: true | string): void {
    const d = this.drill!
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
      this.mode = 'success'
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

  private showBanner(html: string, d: Drill): void {
    this.banner.innerHTML = `<div class="db-t">${html}</div><div class="dk big">${keycaps(d.keys)}</div>`
    this.banner.hidden = false
  }

  private showList(): void {
    clearTimeout(this.searchTimer)
    this.searchToken++
    this.mode = 'list'
    this.afterFlash = null
    this.flash.hidden = true
    this.banner.hidden = true
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
      <p>고르면 🤖 AI 가 먼저 시범을 보이고, 가운데 설명을 읽은 뒤 Enter 로 시작합니다. 성공할 때까지 같은 상황이 되풀이됩니다. 완료 ${done} / ${DRILLS.length}</p>
      <div class="drill-grid">${groups}</div>
      <div class="row"><button class="btn secondary" id="pl-lobby">로비로</button>${this.canResume() ? '<button class="btn main" id="pl-back">돌아가기 (Esc)</button>' : ''}</div>`
    this.box.querySelectorAll<HTMLButtonElement>('.drill-item').forEach((b) => {
      b.onclick = () => {
        const d = DRILLS.find((x) => x.id === b.dataset.id)
        if (d) this.select(d)
      }
    })
    ;(this.box.querySelector('#pl-lobby') as HTMLButtonElement).onclick = () => this.exit()
    const back = this.box.querySelector('#pl-back') as HTMLButtonElement | null
    if (back) back.onclick = () => this.resume()
    this.overlay.hidden = false
  }

  private showSuccess(): void {
    const d = this.drill!
    this.flash.hidden = true
    this.mode = 'success'
    this.box.innerHTML = `
      <h2>✅ 성공!</h2>
      <p><b>${d.title}</b> — ${this.tries}번째 시도에 해냈습니다. 최고 기록 ${this.best[d.id]}번.</p>
      <p class="dk big">${keycaps(d.keys)}</p>
      <div class="row">
        <button class="btn secondary" id="ok-again">한 번 더 (R)</button>
        <button class="btn main" id="ok-next">다음 연습 (Enter)</button>
        <button class="btn secondary" id="ok-list">목록 (Esc)</button>
      </div>`
    ;(this.box.querySelector('#ok-again') as HTMLButtonElement).onclick = () => this.attempt()
    ;(this.box.querySelector('#ok-next') as HTMLButtonElement).onclick = () => this.next()
    ;(this.box.querySelector('#ok-list') as HTMLButtonElement).onclick = () => this.showList()
    this.overlay.hidden = false
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
      <div class="dc-hint">R 처음부터 · V 시범 · Esc 목록 · - 이름 표시</div>`
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.mode === 'demo' || this.mode === 'search') {
        // 시범 건너뛰기
        e.preventDefault()
        this.showBrief()
      } else if (this.mode === 'brief' && !this.afterFlash) {
        e.preventDefault()
        this.attempt()
      } else if (this.mode === 'success' && !this.afterFlash) {
        e.preventDefault()
        this.next()
      }
      return
    }
    if (e.code === 'KeyV' && this.drill && (this.mode === 'brief' || this.mode === 'play' || this.mode === 'success')) {
      e.preventDefault()
      this.startDemo()
      return
    }
    if (e.code === 'KeyR' && this.drill && (this.mode === 'play' || this.mode === 'success')) {
      e.preventDefault()
      this.attempt()
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
    const live = (this.mode === 'play' || this.mode === 'demo') && this.drill !== null && this.ctx !== null && this.flash.hidden
    if (!live || now < this.readyUntil) {
      this.acc = 0
      return
    }
    const d = this.drill!
    const c = this.ctx!
    this.acc += dt * 1000
    let steps = 0
    while (this.acc >= TICK_MS && steps < 4 && this.flash.hidden) {
      let inp: Input
      if (this.mode === 'demo') {
        this.input.sample() // 사람 키는 버린다
        inp = demoInput(d, this.demoK++, this.state, c, this.demoMem)
        for (const code of inputCodes(inp)) this.lit.set(code, now + LIT_MS)
      } else inp = this.input.sample()
      this.lastInput = inp
      capturePose(this.state, this.prev)
      step(this.state, [inp, EMPTY_INPUT])
      const r = judge(d, this.state, c, inp)
      if (r !== null) {
        if (this.mode === 'demo') this.demoDone(r)
        else this.result(r)
      }
      this.acc -= TICK_MS
      steps++
    }
    if (this.acc > TICK_MS * 8) this.acc = TICK_MS * 8
    const ev = this.state.events
    this.renderer.onEvents(ev, this.evSeen)
    this.snd.onEvents(ev, this.evSeen)
    this.evSeen = ev.length
  }

  /** 시범에서 지금 켜 둘 키 — 물리 키 이름들과, 입력 키 상자에 넘길 입력(켜 둔 키를 모은 것) */
  private litNow(now: number): { codes: Set<string>; inp: Input } {
    const codes = new Set<string>()
    for (const [code, until] of this.lit) if (until > now) codes.add(code)
    let buttons = this.lastInput.buttons
    for (const [code, bit] of LIT_BITS) if (codes.has(code)) buttons |= bit
    return {
      codes,
      inp: {
        mx: codes.has('ArrowRight') ? 127 : codes.has('ArrowLeft') ? -127 : 0,
        my: codes.has('ArrowUp') ? 127 : codes.has('ArrowDown') ? -127 : 0,
        buttons,
        a: 0,
        b: 0,
      },
    }
  }

  private frame = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const st = this.state
    const tm = st.teams[0]
    const controlled = tm.controlled
    const moving = this.mode === 'play' || this.mode === 'demo'
    const alpha = moving ? Math.min(1, this.acc / TICK_MS) : 1
    const hold = Math.min(1, Math.max(tm.holdShoot / 36, tm.holdPass / 30))
    const gauge = tm.powerT >= 0
      ? { t: (st.tick - tm.powerT) / POWER_TICKS, green: [POWER_GREEN[0] / POWER_TICKS, POWER_GREEN[1] / POWER_TICKS] as [number, number], hit: tm.powerHit }
      : null
    this.renderer.draw(this.prev, st, alpha, dt, { humanTeam: 0, controlled, aim: this.previewAim(), hold, gauge })
    const p = controlled >= 0 ? st.players[controlled] : null
    const demo = this.mode === 'demo'
    const shown = demo ? this.litNow(now) : null
    this.keyView.update({
      down: shown ? shown.codes : this.input.pressed,
      input: shown ? shown.inp : this.lastInput,
      controlled,
      name: (demo ? '🤖 AI · ' : '') + (p ? `${p.spec.no} ${p.spec.name}` : '조작 없음'),
      hasBall: st.ball.owner >= 0 && st.players[st.ball.owner].team === 0,
    })
    // 시범 띠의 키캡 — AI 가 누른 키에 불
    if (!this.banner.hidden) {
      this.banner.querySelectorAll<HTMLElement>('kbd[data-k]').forEach((k) => {
        const on = shown !== null && (k.dataset.k ?? '').split(' ').some((code) => shown.codes.has(code))
        k.classList.toggle('on', on)
      })
    }
    // 남은 시간 · 세트피스 차는 순간까지 · 잠깐 뜨는 알림
    const t = this.card.querySelector('[data-t]') as HTMLElement | null
    if (t && this.drill && this.ctx) {
      const left = Math.max(0, this.drill.limit - (st.tick - this.ctx.start) / 60)
      let text = demo ? '🤖 시범 중' : this.mode === 'search' ? '시범 준비 중' : now < this.readyUntil ? '준비…' : `남은 ${left.toFixed(1)}초`
      if (st.phase === 'freekick' && st.restart && st.restart.team === 1) text += ` · 킥까지 ${Math.max(0, st.phaseT / 60).toFixed(1)}초`
      if (st.phase === 'penalty' && st.restart && st.restart.team === 1) text += ` · 킥까지 ${Math.max(0, st.phaseT / 60).toFixed(1)}초`
      if (now < this.toastUntil) text += ` · ${this.toast}`
      if (st.callText && st.tick - st.callTick < 90) text += ` · ${st.callText}`
      if (t.textContent !== text) t.textContent = text
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  /** 프리킥·PK 연습의 궤적 미리보기 — 경기 세션과 같은 계산 (시범 때도 보인다) */
  private previewAim(): KickPreview | null {
    const st = this.state
    const r = st.restart
    const team = st.teams[0]
    if (!r || r.team !== 0 || st.phase === 'play' || r.kicker !== team.controlled) return null
    const held = this.lastInput.buttons
    const kind = held & BTN_D ? 'D' : held & BTN_A ? 'A' : null
    if (!kind) return null
    const mods = { finesse: (held & BTN_Z) !== 0, panenka: st.phase === 'penalty' && (held & BTN_Q) !== 0, flair: st.phase !== 'penalty' && (held & BTN_C) !== 0 }
    const ks = kickStick(team, this.lastInput.mx, this.lastInput.my, st.tick)
    return previewRestartKick(st, 0, kind, ks.mx, ks.my, Math.min(1, team.holdShoot / 36), mods)
  }

  private onResize = (): void => this.renderer.resize()

  private exit(): void {
    this.dispose()
    this.onExit()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.searchTimer)
    this.ticker.stop()
    cancelAnimationFrame(this.raf)
    this.input.dispose()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    this.keyView.dispose()
    this.renderer.dispose()
  }
}
