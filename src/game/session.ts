// 혼자 하기 세션 (DESIGN 6.7) — 사람(홈) vs 봇(원정). 락스텝 없이 같은 sim 을 돈다.
// 틱은 Worker 타이머(60Hz), 그리기는 requestAnimationFrame. 렌더는 prev/curr 보간만 하고 sim 을 바꾸지 않는다.

import { EMPTY_INPUT } from '../core/input'
import { createState, step } from '../core/sim'
import { synthSquad } from '../core/synth'
import { TICK_MS, type Difficulty, type GameState } from '../core/state'
import { Hud } from '../render/hud'
import { Renderer3D, capturePose, type PrevPose } from '../render3d/renderer3d'
import type { Kit } from '../render3d/player3d'
import type { Settings } from '../ui/settings'
import { LocalInput } from './localInput'
import { Ticker } from './ticker'

export interface SoloConfig {
  difficulty: Difficulty
  halfSec: number
  formation: string
  oppFormation: string
  seed: number
  settings: Settings
}

/** 합성 스쿼드 시절의 임시 킷 — 실제 구단 색은 단계 1 데이터가 오면 (DESIGN 7.1 유니폼) */
const KITS: [Kit, Kit] = [
  { shirt: 0xd62839, sleeve: 0xf4f4f4, shorts: 0x1c1c24, socks: 0xd62839, number: 0xffffff },
  { shirt: 0x2b62d9, sleeve: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0x2b62d9, number: 0xffffff },
]
const GK_KITS: [Kit, Kit] = [
  { shirt: 0xe0c341, sleeve: 0x2a2a2a, shorts: 0x2a2a2a, socks: 0xe0c341, number: 0x1a1a1a },
  { shirt: 0x39c7b9, sleeve: 0x1e2a2a, shorts: 0x1e2a2a, socks: 0x39c7b9, number: 0x0e1a1a },
]
const RADAR_COLORS: [string, string] = ['#e0475a', '#4f86ff']

export class Session {
  private state: GameState
  private prev: PrevPose
  private renderer: Renderer3D
  private hud: Hud
  private input = new LocalInput()
  private ticker: Ticker
  private acc = 0
  private lastTick = performance.now()
  private last = performance.now()
  private raf = 0
  private paused = false
  private disposed = false
  private message = ''
  private evSeen = 0
  private overlay: HTMLElement
  private fpsEl: HTMLElement
  private frames = 0
  private fpsT = 0
  private keysShown: boolean

  constructor(
    host: HTMLElement,
    private cfg: SoloConfig,
    private onExit: () => void,
  ) {
    this.state = this.newState(cfg.seed)
    this.prev = capturePose(this.state)
    this.keysShown = cfg.settings.keysHint

    host.innerHTML = `
      <div class="game-root">
        <div class="game-stage" id="stage"></div>
        <div class="game-ui">
          <div class="top-right"><span class="fps" id="fps"></span><button class="btn secondary" id="btn-menu">메뉴 (Esc)</button></div>
          <div class="overlay" id="overlay" hidden><div class="box" id="overlay-box"></div></div>
        </div>
      </div>`
    const stage = host.querySelector('#stage') as HTMLElement
    this.overlay = host.querySelector('#overlay') as HTMLElement
    this.fpsEl = host.querySelector('#fps') as HTMLElement
    this.renderer = new Renderer3D(stage, { shadows: cfg.settings.shadows, resScale: cfg.settings.resScale })
    this.renderer.setMatch(this.state, KITS, GK_KITS)
    this.hud = new Hud(stage, RADAR_COLORS, this.keysShown)
    ;(host.querySelector('#btn-menu') as HTMLButtonElement).onclick = () => this.toggleMenu()

    this.input.onEscape = () => this.toggleMenu()
    this.input.attach()
    window.addEventListener('resize', this.onResize)
    // Ctrl+W(페이스 컨트롤 + 스루 패스)가 크롬에서는 탭을 닫는다 — 막을 수 없으니 한 번 묻는다
    window.addEventListener('beforeunload', this.onUnload)
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    // 디버그·스크린샷 훅 (bedorage-duck __bd 와 같은 용도). 평소 코드는 이걸 쓰지 않는다
    ;(window as unknown as { __klo?: unknown }).__klo = {
      state: () => this.state,
      tick: () => this.state.tick,
      info: () => this.renderer.info,
    }
  }

  private newState(seed: number): GameState {
    const c = this.cfg
    const home = synthSquad(11, { name: '홈', short: '홈', formation: c.formation, quality: 66 })
    const away = synthSquad(22, { name: '원정', short: '원정', formation: c.oppFormation, quality: 66 })
    return createState({ seed, halfSec: c.halfSec, squads: [home, away], human: [true, false], bots: [2, c.difficulty] })
  }

  private onResize = (): void => this.renderer.resize()
  private onUnload = (e: BeforeUnloadEvent): void => {
    if (this.state.done) return
    e.preventDefault()
  }

  private tick(): void {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min(0.25, (now - this.lastTick) / 1000)
    this.lastTick = now
    if (this.paused || this.state.done) return
    this.acc += dt * 1000
    let steps = 0
    // 탭이 뒤로 갔다 오면 밀린 틱을 몰아서 처리하되 한 번에 4틱까지
    while (this.acc >= TICK_MS && steps < 4) {
      capturePose(this.state, this.prev)
      const inp = this.input.sample()
      step(this.state, [inp, EMPTY_INPUT])
      this.acc -= TICK_MS
      steps++
    }
    if (this.acc > TICK_MS * 8) this.acc = TICK_MS * 8
    const ev = this.state.events
    for (; this.evSeen < ev.length; this.evSeen++) {
      if (ev[this.evSeen].type === 'end') this.showResult()
    }
  }

  private frame = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.frames++
    this.fpsT += dt
    if (this.fpsT >= 1) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} fps`
      this.frames = 0
      this.fpsT = 0
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK_MS)
    const controlled = this.state.teams[0].controlled
    this.renderer.draw(this.prev, this.state, alpha, dt, { humanTeam: 0, controlled })
    this.hud.update(this.state, { humanTeam: 0, controlled, message: this.message })
    this.raf = requestAnimationFrame(this.frame)
  }

  // ---- 메뉴 · 결과 ----

  private toggleMenu(): void {
    if (this.state.done) return
    if (this.paused) this.hideOverlay()
    else this.showMenu()
  }

  private showMenu(): void {
    this.paused = true
    this.message = '일시정지'
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.innerHTML = `
      <h2>일시정지</h2>
      <p>혼자 하기 — 봇 ${['', '쉬움', '보통', '어려움'][this.cfg.difficulty]} · 전후반 ${Math.round(this.cfg.halfSec / 60)}분</p>
      <div class="row">
        <button class="btn main" id="ov-resume">계속 (Esc)</button>
        <button class="btn secondary" id="ov-keys">${this.keysShown ? '조작 안내 끄기' : '조작 안내 켜기'}</button>
        <button class="btn secondary" id="ov-quit">로비로</button>
      </div>`
    this.overlay.hidden = false
    ;(box.querySelector('#ov-resume') as HTMLButtonElement).onclick = () => this.hideOverlay()
    ;(box.querySelector('#ov-keys') as HTMLButtonElement).onclick = () => {
      this.keysShown = !this.keysShown
      this.hud.setKeysShown(this.keysShown)
      this.showMenu()
    }
    ;(box.querySelector('#ov-quit') as HTMLButtonElement).onclick = () => this.exit()
  }

  private hideOverlay(): void {
    this.paused = false
    this.message = ''
    this.overlay.hidden = true
    this.lastTick = performance.now()
    this.acc = 0
  }

  private showResult(): void {
    const st = this.state
    const [h, a] = st.teams
    const S = st.stats
    const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')
    const possT = S[0].poss + S[1].poss
    const row = (label: string, v0: string, v1: string): string => `<tr><td>${v0}</td><th>${label}</th><td>${v1}</td></tr>`
    const scorers = st.events
      .filter((e) => e.type === 'goal')
      .map((e) => `${st.teams[e.team].short} ${e.player >= 0 ? st.players[e.player].spec.name : '(자책)'} ${Math.max(1, Math.round((e.tick / 60 / st.halfSec) * 45))}'`)
      .join(' · ')
    const verdict = h.goals > a.goals ? '승리!' : h.goals < a.goals ? '패배' : '무승부'
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.innerHTML = `
      <h2>${h.short} ${h.goals} : ${a.goals} ${a.short}</h2>
      <p><b>${verdict}</b>${scorers ? ` · ${scorers}` : ''}</p>
      <table class="stats">
        ${row('슛', String(S[0].shots), String(S[1].shots))}
        ${row('유효 슛', String(S[0].onTarget), String(S[1].onTarget))}
        ${row('점유율', pct(S[0].poss, possT), pct(S[1].poss, possT))}
        ${row('패스 성공', `${S[0].passOk}/${S[0].passes} (${pct(S[0].passOk, S[0].passes)})`, `${S[1].passOk}/${S[1].passes} (${pct(S[1].passOk, S[1].passes)})`)}
        ${row('태클', String(S[0].tackles), String(S[1].tackles))}
        ${row('코너킥', String(S[0].corners), String(S[1].corners))}
        ${row('선방', String(S[0].saves), String(S[1].saves))}
      </table>
      <div class="row">
        <button class="btn main" id="ov-again">다시 하기</button>
        <button class="btn secondary" id="ov-quit">로비로</button>
      </div>`
    this.overlay.hidden = false
    ;(box.querySelector('#ov-again') as HTMLButtonElement).onclick = () => this.restart()
    ;(box.querySelector('#ov-quit') as HTMLButtonElement).onclick = () => this.exit()
  }

  private restart(): void {
    const seed = (Math.random() * 0x7fffffff) >>> 0
    this.state = this.newState(seed)
    this.prev = capturePose(this.state)
    this.evSeen = 0
    this.renderer.setMatch(this.state, KITS, GK_KITS)
    this.hideOverlay()
  }

  private exit(): void {
    this.dispose()
    this.onExit()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ticker.stop()
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('beforeunload', this.onUnload)
    this.input.dispose()
    this.hud.dispose()
    this.renderer.dispose()
  }
}
