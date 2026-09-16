// 효과음·배경음 — **파일 없이 Web Audio 로 절차 생성한다** (DESIGN 7.3).
// 샘플·음원을 하나도 쓰지 않으므로 저작권 문제가 없다. 오실레이터 + 노이즈 + 필터뿐이다.
//
// sim 을 바꾸지 않는다: `SimEvent` 를 받아 소리만 낸다. 결정론과 무관하다.
// 브라우저 자동재생 정책 때문에 **첫 클릭·키 입력 전에는 소리가 나지 않는다** — 그 전 이벤트는 버린다.

import { HALF_L, type GameState, type SimEvent } from '../core/state'

const STORAGE_KEY = 'klo26.muted'
const MASTER = 0.75
/**
 * 관중석 웅성거림 기본 크기. 2026-09-16 (사용자 요청 "경기 중에는 배경음을 빼고 관중 환호로 박진감을")
 * 경기 배경음악을 뺀 자리를 관중이 채우므로 0.055 → 0.085 로 올렸다.
 */
const CROWD_BASE = 0.085
/** 열기(heat)가 최고일 때 웅성거림에 더해지는 크기 */
const CROWD_HEAT = 0.2
/** 로비 배경음 크기 (경기 중에는 음악을 틀지 않는다) */
const MUSIC_LEVEL = 0.1

/** 소리 하나의 배치 — 피치 좌우 위치로 팬을 준다 (카메라가 사이드라인 고정이라 x 가 그대로 좌우다) */
interface Place {
  gain: number
  pan: number
}

function placeAt(x: number): Place {
  return { gain: 1, pan: Math.max(-0.85, Math.min(0.85, x / HALF_L)) }
}

export type MusicTrack = 'lobby' | 'match'

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
  /**
   * 함성 층 (2026-09-16) — 낮은 웅성거림 위에 얹는 **사람 목소리 대역**(500~1600 Hz).
   * 웅성거림은 늘 깔려 있고, 이 층은 열기에 제곱으로 반응해서 위험할수록 "와—" 하고 올라온다.
   */
  private voiceSrc: AudioBufferSourceNode | null = null
  private voiceGain: GainNode | null = null
  private voiceFilter: BiquadFilterNode | null = null
  /** 관중이 숨 쉬는 느린 흔들림 (LFO) — 없으면 잡음이 죽은 소리로 들린다 */
  private breatheOsc: OscillatorNode | null = null
  /** 0(조용) ~ 1(들끓음). 공이 골문에 가까울수록 올라간다 */
  private heat = 0
  /** 다음 관중 반응(박수·휘파람·탄식) 시각 */
  private ambNext = 0
  /** 다음 응원가(북·박수) 시각 — 열기가 높으면 더 자주 */
  private chantNext = 0

  // ---- 배경음악 (락 시퀀서 — 2026-09-15: 로비/대기실 앤섬 · 경기 드라이빙, 전부 오실레이터·노이즈) ----
  private musicGain: GainNode | null = null
  private musicTimer = 0
  private musicStep = 0
  private musicTrack: MusicTrack = 'lobby'
  /** 다음 16분음표를 놓을 AudioContext 시각 */
  private musicNext = 0
  private distCurve: Float32Array<ArrayBuffer> | null = null
  /** 관중 응원 리듬(북·박수) 끝나는 시각 */
  private chantUntil = 0
  private chantTimer = 0

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

    // 함성 층 — 목소리 대역만 통과시킨 두 번째 잡음. 평소엔 거의 0, 위험하면 올라온다 (2026-09-16)
    const vs = ctx.createBufferSource()
    vs.buffer = this.noise!
    vs.loop = true
    vs.playbackRate.value = 0.83 // 같은 잡음이라도 속도를 달리 하면 두 층이 겹쳐 들리지 않는다
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 620
    bp.Q.value = 0.8
    const vg = ctx.createGain()
    vg.gain.value = 0.0001
    vs.connect(bp)
    bp.connect(vg)
    vg.connect(this.master!)
    vs.start()
    this.voiceSrc = vs
    this.voiceGain = vg
    this.voiceFilter = bp

    // 숨쉬기 — 아주 느린 사인파를 웅성거림 크기에 더한다 (설정값 위에 얹히는 신호)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.09
    const lg = ctx.createGain()
    lg.gain.value = 0.016
    lfo.connect(lg)
    lg.connect(g.gain)
    lfo.start()
    this.breatheOsc = lfo

    this.ambNext = 0
    this.chantNext = 0
  }

  stopCrowd(): void {
    if (!this.crowdSrc) return
    const stop = (n: AudioScheduledSourceNode | null): void => {
      if (!n) return
      try {
        n.stop()
      } catch {
        // 이미 멈췄다
      }
      n.disconnect()
    }
    stop(this.crowdSrc)
    stop(this.voiceSrc)
    stop(this.breatheOsc)
    this.crowdGain?.disconnect()
    this.voiceGain?.disconnect()
    this.crowdSrc = null
    this.crowdGain = null
    this.crowdFilter = null
    this.voiceSrc = null
    this.voiceGain = null
    this.voiceFilter = null
    this.breatheOsc = null
    this.heat = 0
  }

  /** 잠깐 함성이 커진다 (선방·골대·골) — 웅성거림과 함성 층을 함께 올린다 */
  private crowdSwell(amount: number, seconds: number): void {
    if (!this.crowdGain || !this.ctx) return
    const t = this.ctx.currentTime
    const g = this.crowdGain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(CROWD_BASE + amount * 0.6, t + 0.12)
    g.setTargetAtTime(CROWD_BASE + this.heat * CROWD_HEAT, t + 0.12, seconds * 0.4)
    if (this.crowdFilter) {
      const f = this.crowdFilter.frequency
      f.cancelScheduledValues(t)
      f.setValueAtTime(f.value, t)
      f.linearRampToValueAtTime(1900, t + 0.12)
      f.setTargetAtTime(700 + this.heat * 600, t + 0.12, seconds * 0.4)
    }
    // 함성 층 — 목소리가 확 올라왔다 천천히 가라앉는다 (2026-09-16)
    if (this.voiceGain) {
      const vg = this.voiceGain.gain
      vg.cancelScheduledValues(t)
      vg.setValueAtTime(Math.max(0.0001, vg.value), t)
      vg.linearRampToValueAtTime(0.04 + amount * 0.3, t + 0.15)
      vg.setTargetAtTime(this.voiceTarget(), t + 0.15, seconds * 0.45)
    }
    if (this.voiceFilter) {
      const f = this.voiceFilter.frequency
      f.cancelScheduledValues(t)
      f.setValueAtTime(f.value, t)
      f.linearRampToValueAtTime(1150, t + 0.15)
      f.setTargetAtTime(620 + this.heat * 420, t + 0.15, seconds * 0.45)
    }
  }

  /** 지금 열기에서 함성 층이 있어야 할 크기 — 제곱이라 평소엔 거의 안 들리고 위험할 때만 올라온다 */
  private voiceTarget(): number {
    return 0.0001 + this.heat * this.heat * 0.085
  }

  /**
   * 흩어지는 박수 — 한 사람씩 어긋나게 친다 (0.5 초 안에 n 번). `strength` 가 클수록 많고 세다.
   * 2026-09-16: 경기 중 배경음악을 빼면서 그 자리를 관중이 채우게 넣었다.
   */
  private scatterClap(strength: number): void {
    if (!this.ctx || !this.crowdGain || !this.noise) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + 0.02
    const n = Math.round(4 + strength * 10)
    for (let i = 0; i < n; i++) {
      const at = t0 + Math.random() * (0.45 + strength * 0.3)
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1300 + Math.random() * 1800
      f.Q.value = 1.4
      const g = ctx.createGain()
      const peak = (0.05 + Math.random() * 0.07) * (0.6 + strength * 0.6)
      g.gain.setValueAtTime(peak, at)
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.07)
      src.connect(f)
      f.connect(g)
      g.connect(this.crowdGain)
      src.start(at)
      src.stop(at + 0.12)
    }
  }

  /** 관중석 휘파람 — 높은 사인에 살짝 떨림. 경기가 늘어질 때 드문드문 (2026-09-16) */
  private standWhistle(): void {
    if (!this.ctx || !this.crowdGain) return
    const ctx = this.ctx
    const at = ctx.currentTime + 0.05
    const dur = 0.35 + Math.random() * 0.3
    const base = 2100 + Math.random() * 700
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(base * 0.94, at)
    o.frequency.linearRampToValueAtTime(base, at + dur * 0.4)
    o.frequency.linearRampToValueAtTime(base * 0.9, at + dur)
    // 떨림 — 사람이 부는 소리는 일정하지 않다
    const vib = ctx.createOscillator()
    vib.type = 'sine'
    vib.frequency.value = 5.5
    const vg = ctx.createGain()
    vg.gain.value = 22
    vib.connect(vg)
    vg.connect(o.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g)
    g.connect(this.crowdGain)
    o.start(at)
    vib.start(at)
    o.stop(at + dur + 0.05)
    vib.stop(at + dur + 0.05)
  }

  /** "우—" 하고 올라왔다 잦아드는 탄성 — 공이 골문 앞으로 갈 때 (2026-09-16) */
  private ooh(strength: number): void {
    if (!this.ctx || !this.crowdGain || !this.noise) return
    const ctx = this.ctx
    const at = ctx.currentTime + 0.02
    const dur = 0.9 + Math.random() * 0.7
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.playbackRate.value = 0.7 + Math.random() * 0.3
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(420, at)
    f.frequency.linearRampToValueAtTime(760 + strength * 300, at + dur * 0.45)
    f.frequency.linearRampToValueAtTime(380, at + dur)
    f.Q.value = 1.1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.03 + strength * 0.1, at + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.crowdGain)
    src.start(at)
    src.stop(at + dur + 0.05)
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
    this.crowdGain.gain.setTargetAtTime(CROWD_BASE + this.heat * CROWD_HEAT, t, 0.4)
    this.crowdFilter?.frequency.setTargetAtTime(700 + this.heat * 600, t, 0.5)
    this.voiceGain?.gain.setTargetAtTime(this.voiceTarget(), t, 0.35)
    this.voiceFilter?.frequency.setTargetAtTime(620 + this.heat * 420, t, 0.5)

    // 경기 중 관중은 가만히 있지 않는다 — 박수·휘파람·탄성이 드문드문, 그리고 응원가가 돌아온다.
    // 2026-09-16 사용자 요청 "경기 중에는 배경음을 빼고 관중 환호로 박진감을" — 음악이 하던 몫을 여기서 한다.
    if (st.phase !== 'play' && st.phase !== 'goal') return
    if (this.ambNext === 0) {
      this.ambNext = t + 2
      this.chantNext = t + 12
    }
    if (t >= this.ambNext) {
      const hot = this.heat
      // 열기가 높을수록 자주 반응한다 (2.5~6초 vs 4~13초)
      this.ambNext = t + 2.5 + Math.random() * (hot > 0.45 ? 3.5 : 9)
      const r = Math.random()
      if (hot > 0.4 && r < 0.55) this.ooh(hot)
      else if (r < 0.8) this.scatterClap(0.3 + hot)
      else this.standWhistle()
    }
    if (t >= this.chantNext) {
      // 응원가 — 평소 30~48초, 몰아칠 때는 16~34초마다
      this.chantNext = t + (this.heat > 0.55 ? 16 : 30) + Math.random() * 18
      this.chant(3.5 + Math.random() * 2.5)
    }
  }

  // ---------------------------------------------------------------- 배경음악 — 락 (코드 생성)

  /**
   * 배경음악을 튼다 (2026-09-15 — 사용자 요청 "신나는 락"). 두 곡:
   * - `lobby`(로비·대기실) 126 BPM 앤섬 — 오픈 파워코드 E–C–G–D, 4/4 킥·스네어, 리드 아르페지오.
   * - `match`(경기) 150 BPM 드라이빙 — 팜뮤트 8분 파워코드 E–G–A–C, 더블 킥, 4마디마다 펜타토닉 리프. 관중보다 작게.
   * 16분음표 스케줄러가 0.25 초 앞을 미리 놓는다. 외부 파일 없음 — 오실레이터 + 웨이브셰이퍼 디스토션 + 노이즈 드럼.
   */
  startMusic(track: MusicTrack = 'lobby'): void {
    if (!this.ensure()) return
    if (this.musicGain && this.musicTrack === track) return
    this.stopMusic()
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.setTargetAtTime(track === 'match' ? MUSIC_LEVEL * 0.55 : MUSIC_LEVEL, ctx.currentTime, 0.6)
    g.connect(this.master!)
    this.musicGain = g
    this.musicTrack = track
    this.musicStep = 0
    this.musicNext = ctx.currentTime + 0.1
    const tick = (): void => {
      if (!this.musicGain || !this.ctx) return
      if (this.ctx.state === 'running' && !this.mutedFlag) this.musicSchedule()
      else this.musicNext = this.ctx.currentTime + 0.1
      this.musicTimer = window.setTimeout(tick, 60)
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

  private musicSchedule(): void {
    const ctx = this.ctx!
    const bpm = this.musicTrack === 'match' ? 150 : 126
    const step = 60 / bpm / 4
    while (this.musicNext < ctx.currentTime + 0.25) {
      this.musicStepPlay(this.musicStep, this.musicNext, step)
      this.musicStep++
      this.musicNext += step
    }
  }

  private distortion(): WaveShaperNode {
    const ctx = this.ctx!
    if (!this.distCurve) {
      const n = 1024
      const c = new Float32Array(n)
      const k = 38
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1
        c[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
      }
      this.distCurve = c
    }
    const ws = ctx.createWaveShaper()
    ws.curve = this.distCurve
    ws.oversample = '2x'
    return ws
  }

  /** 드럼 한 타 — 킥(사인 스윕) · 스네어(노이즈 + 톤) · 하이햇(짧은 노이즈) · 크래시(긴 노이즈) */
  private drum(t: number, kind: 'kick' | 'snare' | 'hat' | 'crash' | 'tom', vol = 1): void {
    const ctx = this.ctx!
    const dst = this.musicGain!
    if (kind === 'kick' || kind === 'tom') {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f0 = kind === 'kick' ? 150 : 110
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 44 : 70, t + 0.12)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.9 * vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'kick' ? 0.16 : 0.22))
      o.connect(g)
      g.connect(dst)
      o.start(t)
      o.stop(t + 0.25)
      return
    }
    if (!this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    if (kind === 'snare') {
      f.type = 'bandpass'
      f.frequency.value = 1900
      f.Q.value = 0.7
      g.gain.setValueAtTime(0.55 * vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      const tone = ctx.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(200, t)
      tone.frequency.exponentialRampToValueAtTime(120, t + 0.08)
      const tg = ctx.createGain()
      tg.gain.setValueAtTime(0.35 * vol, t)
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
      tone.connect(tg)
      tg.connect(dst)
      tone.start(t)
      tone.stop(t + 0.1)
    } else if (kind === 'hat') {
      f.type = 'highpass'
      f.frequency.value = 7000
      g.gain.setValueAtTime(0.22 * vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    } else {
      f.type = 'highpass'
      f.frequency.value = 4500
      g.gain.setValueAtTime(0.3 * vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
    }
    src.connect(f)
    f.connect(g)
    g.connect(dst)
    src.start(t)
    src.stop(t + 0.9)
  }

  /** 베이스 — 사각파 + 로우패스 */
  private bassNote(t: number, freq: number, dur: number, vol = 1): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.26 * vol, t + 0.01)
    g.gain.setValueAtTime(0.26 * vol, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.musicGain!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** 파워코드 기타 — 톱니파 근음·5도·옥타브 → 디스토션 → 로우패스. `mute` 면 팜뮤트(짧고 둔탁) */
  private powerChord(t: number, freq: number, dur: number, mute: boolean, vol = 1): void {
    const ctx = this.ctx!
    const ws = this.distortion()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = mute ? 900 : 2600
    const g = ctx.createGain()
    const peak = (mute ? 0.2 : 0.17) * vol
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
    if (mute) g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.11))
    else {
      g.gain.setValueAtTime(peak, t + dur * 0.6)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    }
    for (const [mul, v] of [[1, 1], [1.5, 0.8], [2, 0.45]] as [number, number][]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq * mul
      o.detune.value = (mul - 1) * 4
      const og = ctx.createGain()
      og.gain.value = v
      o.connect(og)
      og.connect(ws)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    ws.connect(lp)
    lp.connect(g)
    g.connect(this.musicGain!)
  }

  /** 리드 — 펜타토닉 한 음 (톱니파 + 약한 디스토션) */
  private leadNote(t: number, freq: number, dur: number, vol = 1): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const ws = this.distortion()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3200
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(ws)
    ws.connect(lp)
    lp.connect(g)
    g.connect(this.musicGain!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** 16분음표 하나 — 트랙별 패턴 */
  private musicStepPlay(i: number, t: number, step: number): void {
    const s16 = i % 16
    const bar = Math.floor(i / 16)
    const E2 = 82.41
    const G2 = 98.0
    const A2 = 110.0
    const C3 = 130.81
    const C2 = 65.41
    const D2 = 73.42
    if (this.musicTrack === 'match') {
      // ---- 경기: 드라이빙 락 ----
      const prog = [E2, E2, G2, A2, E2, E2, C3, A2]
      const root = prog[bar % prog.length]
      // 드럼 — 킥 1·3 + 더블(&), 스네어 2·4, 하이햇 8분, 4마디마다 크래시
      if (s16 === 0 || s16 === 8 || s16 === 6 || s16 === 14) this.drum(t, 'kick')
      if (s16 === 4 || s16 === 12) this.drum(t, 'snare')
      if (s16 % 2 === 0) this.drum(t, 'hat', s16 % 4 === 0 ? 1 : 0.6)
      if (s16 === 0 && bar % 4 === 0) this.drum(t, 'crash')
      if (bar % 8 === 7 && s16 >= 12) this.drum(t, 'tom', 0.8) // 필인
      // 베이스 8분
      if (s16 % 2 === 0) this.bassNote(t, s16 >= 12 ? root * 2 : root, step * 1.8)
      // 기타 — 팜뮤트 8분, 마디 첫 박은 오픈
      if (s16 === 0) this.powerChord(t, root, step * 3.5, false)
      else if (s16 % 2 === 0) this.powerChord(t, root, step * 1.6, true)
      // 리드 리프 — 8마디 중 4·8번째 마디
      if (bar % 4 === 3) {
        const riff = [E2 * 4, G2 * 4, A2 * 4, G2 * 4, E2 * 4, D2 * 8, E2 * 4, G2 * 4, A2 * 4, C3 * 4, A2 * 4, G2 * 4, E2 * 4, G2 * 4, E2 * 4, D2 * 8]
        if (s16 % 2 === 0 || bar % 8 === 7) this.leadNote(t, riff[s16], step * 1.9)
      }
      return
    }
    // ---- 로비·대기실: 앤섬 락 ----
    const prog = [E2, C2, G2, D2]
    const root = prog[Math.floor(bar / 2) % prog.length]
    if (s16 === 0 || s16 === 8 || s16 === 10) this.drum(t, 'kick')
    if (s16 === 4 || s16 === 12) this.drum(t, 'snare', 0.9)
    if (s16 % 2 === 0) this.drum(t, 'hat', s16 % 4 === 0 ? 0.9 : 0.5)
    if (s16 === 0 && bar % 8 === 0) this.drum(t, 'crash', 0.8)
    if (s16 % 4 === 0) this.bassNote(t, s16 === 12 ? root * 1.5 : root, step * 3.6, 0.9)
    // 오픈 파워코드 — 마디 첫 박 길게, 3.5 박에 짧게
    if (s16 === 0) this.powerChord(t, root, step * 12, false, 0.9)
    else if (s16 === 14) this.powerChord(t, root, step * 2, false, 0.6)
    // 리드 아르페지오 — 짝수 마디 위쪽 옥타브
    if (bar % 2 === 1 && s16 % 4 === 2) {
      const arp = [root * 4, root * 6, root * 8, root * 6]
      this.leadNote(t, arp[(s16 >> 2) % 4], step * 3, 0.8)
    }
  }

  // ---------------------------------------------------------------- 관중 응원 (북·박수 리듬)

  /** 골·킥오프 뒤 몇 초 동안 북과 박수 — "짝짝 짝짝짝" (2026-09-15) */
  chant(seconds: number): void {
    if (!this.ready() || !this.ctx || !this.crowdGain || !this.noise) return
    const ctx = this.ctx
    const until = ctx.currentTime + seconds
    if (until <= this.chantUntil) return
    const fresh = this.chantUntil < ctx.currentTime
    this.chantUntil = until
    if (!fresh) return
    const beat = 0.42
    let t = ctx.currentTime + 0.1
    const pattern = [1, 1, 0, 1, 1, 1, 0, 0]
    const play = (): void => {
      if (!this.ctx || !this.crowdGain || !this.noise) return
      while (t < this.ctx.currentTime + 0.5 && t < this.chantUntil) {
        for (let k = 0; k < pattern.length; k++) {
          const at = t + k * beat * 0.5
          if (!pattern[k]) continue
          // 박수 — 짧은 노이즈 여러 겹
          for (let j = 0; j < 3; j++) {
            const src = ctx.createBufferSource()
            src.buffer = this.noise
            const f = ctx.createBiquadFilter()
            f.type = 'bandpass'
            f.frequency.value = 1500 + j * 600
            f.Q.value = 1.2
            const g = ctx.createGain()
            g.gain.setValueAtTime(0.16, at + j * 0.012)
            g.gain.exponentialRampToValueAtTime(0.001, at + 0.09 + j * 0.012)
            src.connect(f)
            f.connect(g)
            g.connect(this.crowdGain)
            src.start(at + j * 0.012)
            src.stop(at + 0.15)
          }
          // 북 — 1·5 박
          if (k === 0 || k === 3) {
            const o = ctx.createOscillator()
            o.type = 'sine'
            o.frequency.setValueAtTime(95, at)
            o.frequency.exponentialRampToValueAtTime(55, at + 0.2)
            const g = ctx.createGain()
            g.gain.setValueAtTime(0.5, at)
            g.gain.exponentialRampToValueAtTime(0.001, at + 0.3)
            o.connect(g)
            g.connect(this.crowdGain)
            o.start(at)
            o.stop(at + 0.32)
          }
        }
        t += beat * 4
      }
      if (t < this.chantUntil) this.chantTimer = window.setTimeout(play, 200)
    }
    play()
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
          this.chant(6) // 골 뒤 북·박수 응원 (2026-09-15)
          break
        case 'shot':
          this.kick(e.x, 0.95)
          this.crowdSwell(0.35, 0.9) // 슛 순간 "우—" (2026-09-15)
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
          this.crowdSwell(0.3, 1.6)
          this.chant(3)
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
          this.crowdSwell(0.8, 3.5)
          this.chant(5)
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
    if (this.chantTimer) clearTimeout(this.chantTimer)
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
