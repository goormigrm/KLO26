// 효과음·배경음 — **파일 없이 Web Audio 로 절차 생성한다** (DESIGN 7.3).
// 샘플·음원을 하나도 쓰지 않으므로 저작권 문제가 없다. 오실레이터 + 노이즈 + 필터뿐이다.
//
// sim 을 바꾸지 않는다: `SimEvent` 를 받아 소리만 낸다. 결정론과 무관하다.
// 브라우저 자동재생 정책 때문에 **첫 클릭·키 입력 전에는 소리가 나지 않는다** — 그 전 이벤트는 버린다.

import { HALF_L, type GameState, type SimEvent } from '../core/state'

const STORAGE_KEY = 'klo26.muted'
const MASTER = 0.75
/** 관중석 웅성거림 기본 크기 */
const CROWD_BASE = 0.055
/** 로비 배경음 크기 */
const MUSIC_LEVEL = 0.1

/** 소리 하나의 배치 — 피치 좌우 위치로 팬을 준다 (카메라가 사이드라인 고정이라 x 가 그대로 좌우다) */
interface Place {
  gain: number
  pan: number
}

function placeAt(x: number): Place {
  return { gain: 1, pan: Math.max(-0.85, Math.min(0.85, x / HALF_L)) }
}

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private mutedFlag: boolean
  private off: (() => void) | null = null

  // ---- 관중 (경기 배경음) ----
  private crowdSrc: AudioBufferSourceNode | null = null
  private crowdGain: GainNode | null = null
  private crowdFilter: BiquadFilterNode | null = null
  /** 0(조용) ~ 1(들끓음). 공이 골문에 가까울수록 올라간다 */
  private heat = 0

  // ---- 로비 배경음 ----
  private musicGain: GainNode | null = null
  private musicTimer = 0
  private musicStep = 0

  constructor() {
    let m = false
    try {
      m = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // 저장소가 없어도 소리는 난다
    }
    this.mutedFlag = m
    const unlock = (): void => {
      if (this.ensure() && this.ctx && this.ctx.state !== 'running') void this.ctx.resume()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    this.off = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }

  get muted(): boolean {
    return this.mutedFlag
  }

  setMuted(v: boolean): void {
    this.mutedFlag = v
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      // 무시
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0 : MASTER, this.ctx.currentTime, 0.03)
  }

  toggle(): boolean {
    this.setMuted(!this.mutedFlag)
    return this.mutedFlag
  }

  // ---------------------------------------------------------------- 오디오 그래프

  private ensure(): boolean {
    if (this.ctx) return true
    if (typeof AudioContext === 'undefined') return false
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = this.mutedFlag ? 0 : MASTER
    // 컴프레서 — 골 순간에 관중과 휘슬이 겹쳐도 찢어지지 않게
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 20
    comp.ratio.value = 6
    comp.attack.value = 0.004
    comp.release.value = 0.2
    master.connect(comp)
    comp.connect(ctx.destination)
    // 1초짜리 흰 노이즈 — 모든 잡음 계열이 이걸 돌려 쓴다
    const len = ctx.sampleRate
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.ctx = ctx
    this.master = master
    this.noise = buf
    return true
  }

  private ready(): boolean {
    return this.ensure() && this.ctx !== null && this.ctx.state === 'running' && !this.mutedFlag
  }

  /** 소리 하나가 지나갈 길 (게인 → 팬 → 마스터) */
  private bus(p: Place, gain = 1): { node: AudioNode; t0: number } {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.value = p.gain * gain
    const pan = ctx.createStereoPanner()
    pan.pan.value = p.pan
    g.connect(pan)
    pan.connect(this.master!)
    return { node: g, t0: ctx.currentTime }
  }

  /** 오실레이터 한 방 — f0 에서 f1 로 미끄러지며 사라진다 */
  private tone(dst: AudioNode, t0: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number, attack = 0.004): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t0)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g)
    g.connect(dst)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }

  /** 잡음 한 방 — 필터를 걸어 "퍽"·"쉭" 을 만든다 */
  private burst(dst: AudioNode, t0: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1): void {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = this.noise!
    s.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = type
    bp.Q.value = q
    bp.frequency.setValueAtTime(f0, t0)
    bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(bp)
    bp.connect(g)
    g.connect(dst)
    s.start(t0)
    s.stop(t0 + dur + 0.02)
  }

  // ---------------------------------------------------------------- 낱개 소리

  /** 공을 차는 소리 — 낮은 툭 + 짧은 스침. power 가 클수록 세게 */
  kick(x: number, power = 0.6): void {
    if (!this.ready()) return
    // 크기는 계측으로 맞췄다 — 세게 찬 슛이 휘슬의 2.6배라 너무 튀었다 (2026-09-09)
    const { node, t0 } = this.bus(placeAt(x), 0.5 + power * 0.5)
    this.tone(node, t0, 0.075, 'sine', 190 - power * 40, 60, 0.24, 0.002)
    this.burst(node, t0, 0.05 + power * 0.03, 'bandpass', 1400 + power * 900, 500, 0.13, 1.1)
  }

  /** 손으로 던지기 — 킥보다 훨씬 부드럽다 */
  throwIn(x: number): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus(placeAt(x), 0.9)
    this.burst(node, t0, 0.1, 'bandpass', 1100, 420, 0.5, 0.9)
    this.tone(node, t0, 0.06, 'sine', 150, 80, 0.2, 0.003)
  }

  /** 태클·몸싸움 */
  tackle(x: number): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus(placeAt(x), 0.65)
    this.burst(node, t0, 0.12, 'lowpass', 900, 200, 0.3, 0.8)
    this.tone(node, t0, 0.09, 'triangle', 120, 55, 0.25, 0.003)
  }

  /** 골키퍼 선방 — 장갑에 맞는 둔탁한 소리 + 관중 "우와" */
  save(x: number): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus(placeAt(x), 0.8)
    this.burst(node, t0, 0.1, 'lowpass', 1200, 300, 0.34, 0.7)
    this.crowdSwell(0.35, 0.9)
  }

  /** 골대 맞는 소리 — 금속 배음 몇 개 */
  post(x: number): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus(placeAt(x), 0.5)
    for (const [f, g] of [[520, 0.16], [1180, 0.1], [1990, 0.06]] as [number, number][]) {
      this.tone(node, t0, 0.55, 'sine', f, f * 0.92, g, 0.001)
    }
    this.crowdSwell(0.5, 1.2)
  }

  /**
   * 심판 휘슬 — 2.6~3.4 kHz 두 음이 맞물리고 빠르게 떨린다(트릴).
   * n 번 분다: 1 = 파울·킥오프, 3 = 하프·종료.
   */
  whistle(n = 1, strong = false): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    for (let i = 0; i < n; i++) {
      const { node, t0 } = this.bus({ gain: 1, pan: 0 }, strong ? 0.5 : 0.38)
      const at = t0 + i * (strong ? 0.34 : 0.22)
      const dur = strong && i === n - 1 ? 0.62 : 0.2
      // 떨림 — 저주파 오실레이터로 주파수를 흔든다
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 42
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 220
      lfo.connect(lfoGain)
      for (const f of [2680, 3320]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(f, at)
        lfoGain.connect(o.frequency)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, at)
        g.gain.exponentialRampToValueAtTime(0.22, at + 0.012)
        g.gain.setValueAtTime(0.22, at + dur - 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        o.connect(g)
        g.connect(node)
        o.start(at)
        o.stop(at + dur + 0.02)
      }
      lfo.start(at)
      lfo.stop(at + dur + 0.02)
      // 바람 새는 소리
      this.burst(node, at, dur, 'highpass', 3800, 3200, 0.05, 0.7)
    }
  }

  /** 골 — 관중이 터진다 */
  goal(): void {
    if (!this.ready()) return
    this.crowdSwell(1, 4.5)
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.5)
    // 함성 앞머리 — 넓은 잡음이 확 열렸다 닫힌다
    this.burst(node, t0, 2.4, 'bandpass', 700, 1500, 0.3, 0.5)
  }

  /** 경고·퇴장 — 짧은 알림음 (1 노랑 · 2 빨강) */
  card(kind: number): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.5)
    if (kind >= 2) {
      this.tone(node, t0, 0.18, 'square', 420, 300, 0.16)
      this.tone(node, t0 + 0.16, 0.26, 'square', 300, 200, 0.16)
    } else {
      this.tone(node, t0, 0.14, 'square', 640, 520, 0.13)
    }
  }

  /** 화면 조작음 */
  ui(kind: 'click' | 'ok' | 'no' = 'click'): void {
    if (!this.ready()) return
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.35)
    if (kind === 'ok') {
      this.tone(node, t0, 0.1, 'sine', 660, 880, 0.14)
      this.tone(node, t0 + 0.08, 0.14, 'sine', 990, 1180, 0.12)
    } else if (kind === 'no') {
      this.tone(node, t0, 0.16, 'sine', 300, 180, 0.14)
    } else {
      this.tone(node, t0, 0.05, 'sine', 880, 700, 0.09)
    }
  }

  // ---------------------------------------------------------------- 관중 (경기 배경음)

  /** 관중석을 켠다 — 필터 건 잡음이 계속 흐르고, 위험할수록 두꺼워진다 */
  startCrowd(): void {
    if (!this.ensure() || this.crowdSrc) return
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    lp.Q.value = 0.5
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 130
    const g = ctx.createGain()
    g.gain.value = CROWD_BASE
    src.connect(hp)
    hp.connect(lp)
    lp.connect(g)
    g.connect(this.master!)
    src.start()
    this.crowdSrc = src
    this.crowdGain = g
    this.crowdFilter = lp
  }

  stopCrowd(): void {
    if (!this.crowdSrc) return
    try {
      this.crowdSrc.stop()
    } catch {
      // 이미 멈췄다
    }
    this.crowdSrc.disconnect()
    this.crowdGain?.disconnect()
    this.crowdSrc = null
    this.crowdGain = null
    this.crowdFilter = null
    this.heat = 0
  }

  /** 잠깐 함성이 커진다 (선방·골대·골) */
  private crowdSwell(amount: number, seconds: number): void {
    if (!this.crowdGain || !this.ctx) return
    const t = this.ctx.currentTime
    const g = this.crowdGain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(CROWD_BASE + amount * 0.5, t + 0.12)
    g.setTargetAtTime(CROWD_BASE + this.heat * 0.14, t + 0.12, seconds * 0.4)
    if (this.crowdFilter) {
      const f = this.crowdFilter.frequency
      f.cancelScheduledValues(t)
      f.setValueAtTime(f.value, t)
      f.linearRampToValueAtTime(1900, t + 0.12)
      f.setTargetAtTime(700 + this.heat * 600, t + 0.12, seconds * 0.4)
    }
  }

  /**
   * 매 프레임 — 공이 어느 골문에 얼마나 가까운지로 관중의 열기를 정한다.
   * 소리만 보고 "위험하다"를 느낄 수 있어야 한다 (DESIGN 7.3).
   */
  update(st: GameState, dt: number): void {
    if (!this.ready() || !this.crowdGain || !this.ctx) return
    const b = st.ball
    const near = Math.max(0, 1 - Math.abs(Math.abs(b.x) - HALF_L) / 34)
    const live = st.phase === 'play' ? 1 : 0.55
    const target = Math.min(1, near * near * live)
    // 천천히 따라간다 — 관중은 갑자기 조용해지지 않는다
    this.heat += (target - this.heat) * Math.min(1, dt * 1.4)
    const t = this.ctx.currentTime
    this.crowdGain.gain.setTargetAtTime(CROWD_BASE + this.heat * 0.14, t, 0.4)
    this.crowdFilter?.frequency.setTargetAtTime(700 + this.heat * 600, t, 0.5)
  }

  // ---------------------------------------------------------------- 로비 배경음

  /**
   * 로비 배경음 — 느린 화음 패드 + 가벼운 아르페지오. 전부 오실레이터로 만든다.
   * 4마디를 돌면서 화음이 바뀐다. 경기 중에는 끄고 관중석만 남긴다.
   */
  startMusic(): void {
    if (!this.ensure() || this.musicGain) return
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.value = MUSIC_LEVEL
    g.connect(this.master!)
    this.musicGain = g
    this.musicStep = 0
    const tick = (): void => {
      if (!this.musicGain || !this.ctx) return
      if (this.ctx.state === 'running' && !this.mutedFlag) this.musicBar()
      this.musicTimer = window.setTimeout(tick, 3200)
    }
    tick()
  }

  stopMusic(): void {
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.musicTimer = 0
    if (this.musicGain && this.ctx) {
      const g = this.musicGain
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
      const dead = g
      setTimeout(() => dead.disconnect(), 1200)
    }
    this.musicGain = null
  }

  /** 화음 진행 4개 — 도리안풍으로 잔잔하게. 반음이 아니라 5도·9도만 써서 튀지 않는다 */
  private musicBar(): void {
    const ctx = this.ctx!
    const dst = this.musicGain!
    const t0 = ctx.currentTime + 0.02
    const roots = [146.83, 174.61, 196.0, 130.81] // D3 F3 G3 C3
    const root = roots[this.musicStep % roots.length]
    this.musicStep++
    // 패드 — 근음·5도·9도를 길게
    for (const [mul, gain] of [[1, 0.16], [1.5, 0.11], [2.25, 0.07]] as [number, number][]) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = root * mul
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.linearRampToValueAtTime(gain, t0 + 0.9)
      g.gain.setValueAtTime(gain, t0 + 2.0)
      g.gain.linearRampToValueAtTime(0.0001, t0 + 3.2)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      o.connect(lp)
      lp.connect(g)
      g.connect(dst)
      o.start(t0)
      o.stop(t0 + 3.3)
    }
    // 아르페지오 — 한 마디에 네 번, 위쪽 옥타브에서 짧게
    const steps = [2, 3, 4, 3]
    for (let i = 0; i < steps.length; i++) {
      const at = t0 + 0.4 + i * 0.62
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = root * steps[i]
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
      o.connect(g)
      g.connect(dst)
      o.start(at)
      o.stop(at + 0.55)
    }
  }

  // ---------------------------------------------------------------- 이벤트

  /** sim 이벤트 → 소리. `from` 부터 끝까지 본다 */
  onEvents(events: SimEvent[], from: number): void {
    if (!this.ready()) return
    for (let i = from; i < events.length; i++) {
      const e = events[i]
      switch (e.type) {
        case 'goal':
          this.whistle(1)
          this.goal()
          break
        case 'shot':
          this.kick(e.x, 0.95)
          break
        case 'save':
          this.save(e.x)
          break
        case 'post':
          this.post(e.x)
          break
        case 'tackle':
          this.tackle(e.x)
          break
        case 'foul':
          this.whistle(1)
          break
        case 'offside':
          this.whistle(1)
          break
        case 'card':
          this.card(e.n ?? 1)
          break
        case 'whistle':
          // 킥오프를 실제로 차는 순간 (kickoff 사건은 자리 잡기라 조용하다 — 2026-09-10)
          this.whistle(1)
          break
        case 'block':
          this.tackle(e.x)
          break
        case 'throwin':
          this.throwIn(e.x)
          break
        case 'half':
          this.whistle(2, true)
          break
        case 'end':
          this.whistle(3, true)
          break
        case 'sub':
          this.ui('click')
          break
        default:
          break
      }
    }
  }

  /** 패스·슛이 아닌 일반 킥 (리스타트 등) — 세션이 필요할 때 직접 부른다 */
  onKick(x: number, power = 0.6): void {
    this.kick(x, power)
  }

  dispose(): void {
    this.stopCrowd()
    this.stopMusic()
    this.off?.()
    this.off = null
    if (this.ctx) {
      const c = this.ctx
      this.ctx = null
      this.master = null
      void c.close().catch(() => {})
    }
  }
}

/** 페이지에 하나만 둔다 — AudioContext 를 여러 개 만들면 브라우저가 막는다 */
let shared: Sfx | null = null
export function sfx(): Sfx {
  if (!shared) {
    shared = new Sfx()
    // 개발 중에만 밖에서 만질 수 있게 (소리가 실제로 나는지 파형으로 재려면 필요하다). 배포 번들에는 안 들어간다
    if (import.meta.env?.DEV) (window as unknown as { __sfx?: Sfx }).__sfx = shared
  }
  return shared
}
