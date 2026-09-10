// 경기 세션 — 혼자 하기(사람 vs 봇)와 온라인 대전을 함께 굴린다 (DESIGN 6.7).
// **홈/원정은 경기마다 동전 던지기로 정한다** (`toss.ts`, 2026-09-11) — 방장·사람이라고 홈이 아니다.
// 틱은 Worker 타이머(60Hz), 그리기는 requestAnimationFrame. 렌더는 prev/curr 보간만 하고 sim 을 바꾸지 않는다.

import { BTN_SUB, EMPTY_INPUT, type Input } from '../core/input'
import { createState, hashState, snapshot, step } from '../core/sim'
import { synthSquad } from '../core/synth'
import { clubSquad, squadClub, toSquadConfig, type Squad } from '../cards/squad'
import { CLUBS } from '../data/pool'
import { matchKits } from '../render3d/kits'
import { MAX_SUBS, TICK_MS, type Difficulty, type GameState } from '../core/state'
import type { Lockstep } from '../net/lockstep'
import type { RoomLink } from '../net/room'
import { sfx } from '../audio/sfx'
import { Hud } from '../render/hud'
import { KeyView } from '../render/keyview'
import { Renderer3D, capturePose, type PrevPose } from '../render3d/renderer3d'
import type { Kit } from '../render3d/player3d'
import { bindSettingsPanel, settingsPanelHtml, type Settings } from '../ui/settings'
import { LocalInput } from './localInput'
import { Ticker } from './ticker'
import { tossHostHome } from './toss'

export interface SoloConfig {
  difficulty: Difficulty
  halfSec: number
  formation: string
  oppFormation: string
  seed: number
  settings: Settings
  /** 혼자 하기 상대 구단 (없으면 시드로 고른다) */
  oppClub?: number
  /** 사람이 짠 스쿼드. 없으면 합성 스쿼드로 (테스트·초기 상태) */
  squad?: Squad
  /** 온라인 대전이면 여기에 (DESIGN 6). 없으면 혼자 하기 */
  net?: NetConfig
  /** 테스트 모드 (사용자 요청 2026-09-09) — 배포에서는 켜지 않는다 */
  test?: TestConfig
}

/** 테스트 모드 설정 — 배포에서는 로비에 나오지 않는다 (`?test=1` 로만 연다) */
export interface TestConfig {
  /** 두 팀 다 봇 — 사람은 보기만 한다 */
  spectate: boolean
  /** 키 입력 표시 */
  keyView: boolean
  /** 원정 봇 난이도 (관전에서 양쪽 세기를 다르게 볼 때) */
  awayDifficulty?: Difficulty
}

/** 온라인 대전 설정 — 대기실이 만들어 넘긴다 */
export interface NetConfig {
  link: RoomLink
  lockstep: Lockstep
  /** 내 팀 (0 = 홈 · 1 = 원정) — 대기실이 **동전 던지기**로 정한다 (방장이 늘 홈이 아니다) */
  me: 0 | 1
  peerId: string
  /** 두 팀의 스쿼드 (이미 검사를 통과한 것) */
  squads: [Squad, Squad]
  names: [string, string]
}

// 유니폼은 구단 색에서 만든다 (src/render3d/kits.ts). 경기마다 정해진다

/** 전광판에 들어갈 짧은 이름 */
function short(name: string): string {
  const t = name.trim()
  return t.length <= 4 ? t || '팀' : t.slice(0, 4)
}

export class Session {
  private kits: [Kit, Kit] = [
    { shirt: 0xd62839, sleeve: 0xf4f4f4, shorts: 0x1c1c24, socks: 0xd62839, number: 0xffffff },
    { shirt: 0x2b62d9, sleeve: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0x2b62d9, number: 0xffffff },
  ]
  private gkKits: [Kit, Kit] = [
    { shirt: 0xe0c341, sleeve: 0x2a2a2a, shorts: 0x2a2a2a, socks: 0xe0c341, number: 0x1a1a1a },
    { shirt: 0x39c7b9, sleeve: 0x1e2a2a, shorts: 0x1e2a2a, socks: 0x39c7b9, number: 0x0e1a1a },
  ]
  private radarColors: [string, string] = ['#e0475a', '#4f86ff']
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
  /** ⚙ 설정을 Esc 메뉴에서 열었나 (닫을 때 메뉴로 돌아간다) */
  private settingsFromMenu = false
  /** 다음 틱에 실어 보낼 교체 명령 (Esc 메뉴에서 고른다) */
  private subOrder: { out: number; in: number } | null = null
  /** 키 표시용 — 마지막으로 sim 에 보낸 입력 */
  private lastInput: Input = { mx: 0, my: 0, buttons: 0, a: 0, b: 0 }
  /** 온라인: 상대 입력을 기다리기 시작한 시각 (−1 = 안 기다림) */
  private stallSince = -1
  /** 리싱크 횟수 · 끊김 횟수 — 결과 화면에 보여 준다 (DESIGN 4.13) */
  private stalls = 0
  private resyncs = 0
  private snd = sfx()
  /** 내 팀 (0 = 홈 · 1 = 원정). **동전 던지기로 정해진다** — 방장이라고 홈이 아니다 (2026-09-11) */
  private meTeam: 0 | 1 = 0
  /** 코인토스 연출 중 — Esc 메뉴를 막는다 */
  private tossing = false
  private tossTimers: number[] = []
  private keyView: KeyView | null = null
  private sndSeen = 0
  private hashes = new Map<number, number>()
  private peerLeft = false

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
          <div class="top-right"><span class="fps" id="fps"></span><button class="btn secondary" id="btn-lobby">로비로</button><button class="btn secondary" id="btn-settings">⚙ 설정</button><button class="btn secondary" id="btn-menu">메뉴 (Esc)</button></div>
          <div class="overlay" id="overlay" hidden><div class="box" id="overlay-box"></div></div>
        </div>
      </div>`
    const stage = host.querySelector('#stage') as HTMLElement
    this.overlay = host.querySelector('#overlay') as HTMLElement
    this.fpsEl = host.querySelector('#fps') as HTMLElement
    this.renderer = new Renderer3D(stage, { shadows: cfg.settings.shadows, resScale: cfg.settings.resScale })
    this.renderer.setMatch(this.state, this.kits, this.gkKits)
    this.hud = new Hud(stage, this.radarColors, this.keysShown)
    if (cfg.test?.keyView) this.keyView = new KeyView(stage)
    // 상단에 **로비로 · 설정 · 메뉴**를 나눠 둔다 (bedorage-duck 방식 — 사용자 요청 2026-09-11)
    ;(host.querySelector('#btn-menu') as HTMLButtonElement).onclick = () => this.toggleMenu()
    ;(host.querySelector('#btn-settings') as HTMLButtonElement).onclick = () => this.showSettings()
    ;(host.querySelector('#btn-lobby') as HTMLButtonElement).onclick = () => this.confirmQuit()
    // 로비 배경음을 끄고 관중석을 켠다
    this.snd.stopMusic()
    this.snd.startCrowd()

    this.input.onEscape = () => this.toggleMenu()
    this.input.attach()
    window.addEventListener('resize', this.onResize)
    // Ctrl+W(페이스 컨트롤 + 스루 패스)가 크롬에서는 탭을 닫는다 — 막을 수 없으니 한 번 묻는다
    window.addEventListener('beforeunload', this.onUnload)
    if (cfg.net) this.attachNet(cfg.net)
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    this.showToss()
    // 디버그·스크린샷 훅 (bedorage-duck __bd 와 같은 용도). 평소 코드는 이걸 쓰지 않는다
    ;(window as unknown as { __klo?: unknown }).__klo = {
      state: () => this.state,
      tick: () => this.state.tick,
      info: () => this.renderer.info,
      // 두 브라우저가 같은 경기를 보고 있는지 대조할 때 쓴다 (60틱마다 쌓인다)
      hashes: () => [...this.hashes.entries()],
      snd: () => this.snd,
      net: () =>
        this.cfg.net
          ? { me: this.cfg.net.me, delay: this.cfg.net.lockstep.delay, rtt: this.cfg.net.link.rtt, stalls: this.stalls, resyncs: this.resyncs }
          : null,
    }
  }

  private newState(seed: number): GameState {
    const c = this.cfg
    if (c.net) {
      // 대기실이 이미 동전 던지기로 홈/원정 순서를 정해 넘겼다 (waitroom.begin)
      const [a, b] = c.net.squads
      const home = toSquadConfig(a, c.net.names[0], short(c.net.names[0]))
      const away = toSquadConfig(b, c.net.names[1], short(c.net.names[1]))
      this.applyKits(squadClub(a), squadClub(b))
      this.meTeam = c.net.me
      return createState({ seed, halfSec: c.halfSec, squads: [home, away], human: [true, true] })
    }
    const mySquad = c.squad
    // 혼자 하기 상대는 **실제 구단** 하나다 (자기 선수만 쓰니 팀컬러 +4 가 붙는다).
    // 내 스쿼드의 주력 구단과 겹치면 다음 구단으로 민다.
    const myClub = mySquad ? squadClub(mySquad) : undefined
    let oppIdx = c.oppClub ?? (seed % CLUBS.length)
    if (myClub && CLUBS[oppIdx] && CLUBS[oppIdx].id === myClub.id) oppIdx = (oppIdx + 1) % CLUBS.length
    const oppClub = CLUBS[oppIdx] ?? CLUBS[0]
    const mine = mySquad
      ? toSquadConfig(mySquad, myClub?.name ?? '내 팀', myClub?.short ?? '내팀')
      : synthSquad(11, { name: '내 팀', short: '내팀', formation: c.formation, quality: 66 })
    const opp = toSquadConfig(clubSquad(oppClub.id, c.oppFormation), oppClub.name, oppClub.short)
    // 🪙 동전 던지기 — 혼자 하기도 홈이 고정이 아니다 (2026-09-11)
    const iAmHome = tossHostHome(seed)
    this.meTeam = iAmHome ? 0 : 1
    this.applyKits(iAmHome ? myClub : oppClub, iAmHome ? oppClub : myClub)
    // 테스트 관전 — 두 팀 다 봇 (사용자는 보기만 한다)
    const spectate = c.test?.spectate === true
    const oppDiff = c.difficulty
    return createState({
      seed,
      halfSec: c.halfSec,
      squads: iAmHome ? [mine, opp] : [opp, mine],
      human: spectate ? [false, false] : iAmHome ? [true, false] : [false, true],
      bots: spectate
        ? [c.difficulty, c.test?.awayDifficulty ?? c.difficulty]
        : iAmHome
          ? [2, oppDiff]
          : [oppDiff, 2],
    })
  }

  /** 구단 색 → 유니폼·레이더 색 (DESIGN 7.1). 색이 가까우면 원정이 흰 상의로 */
  private applyKits(home: ReturnType<typeof squadClub>, away: ReturnType<typeof squadClub>): void {
    const k = matchKits(home, away)
    this.kits = k.kits
    this.gkKits = k.gkKits
    this.radarColors = k.css
  }

  /** 온라인 대전 배선 — 해시 대조 · 리싱크 · 상대 이탈 (DESIGN 6.5 · 6.6) */
  private attachNet(net: NetConfig): void {
    net.link.onPeerJoin((id) => {
      if (id === net.peerId) net.lockstep.resendTo(id)
    })
    net.link.onPeerLeave((id) => {
      if (id !== net.peerId || this.peerLeft) return
      this.peerLeft = true
      net.lockstep.dropOther()
      this.endByLeave()
    })
    net.link.onCtl((m, from) => {
      if (from !== net.peerId) return
      if (m.t === 'leave') {
        if (this.peerLeft) return
        this.peerLeft = true
        net.lockstep.dropOther()
        this.endByLeave()
      } else if (m.t === 'hash' && net.me === 0) {
        const mine = this.hashes.get(m.tick)
        if (mine === undefined || mine === m.h) return
        // 어긋났다 — 방장이 지금 판을 통째로 보낸다
        this.resyncs++
        net.link.sendCtl({ t: 'resync', tick: this.state.tick, state: snapshot(this.state) }, net.peerId)
      } else if (m.t === 'resync' && net.me === 1) {
        this.resyncs++
        this.state = m.state as GameState
        this.prev = capturePose(this.state)
        this.evSeen = this.state.events.length
        this.hashes.clear()
        net.lockstep.dropBefore(this.state.tick)
        this.renderer.setMatch(this.state, this.kits, this.gkKits)
      }
    })
  }

  /** 상대가 나갔다 — 그 시점 스코어로 끝낸다 (DESIGN 2장 "몰수승은 없다") */
  private endByLeave(): void {
    if (this.state.done) return
    this.state.done = true
    this.state.phase = 'end'
    this.message = ''
    this.showResult('상대가 나갔습니다 — 이 시점 스코어로 종료')
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
    const net = this.cfg.net
    // 탭이 뒤로 갔다 오면 밀린 틱을 몰아서 처리하되 한 번에 4틱까지
    while (this.acc >= TICK_MS && steps < 4) {
      const t = this.state.tick
      const inp: Input = this.input.sample()
      if (this.subOrder) {
        inp.buttons |= BTN_SUB
        inp.a = this.subOrder.out
        inp.b = this.subOrder.in
        this.subOrder = null
      }
      this.lastInput = inp
      let inputs: [Input, Input]
      if (net) {
        net.lockstep.pushLocal(t, inp)
        if (!net.lockstep.hasAll(t)) {
          // 상대 입력이 아직 없다 — 두 브라우저가 같은 경기를 보려면 여기서 멈춰야 한다
          if (this.stallSince < 0) this.stallSince = now
          break
        }
        if (this.stallSince >= 0) {
          if (now - this.stallSince > 400) this.stalls++
          this.stallSince = -1
        }
        inputs = net.lockstep.get(t)
      } else {
        inputs = [inp, EMPTY_INPUT]
      }
      capturePose(this.state, this.prev)
      step(this.state, inputs)
      if (net) {
        // 60틱마다 해시 — 게스트가 방장에게 보내고, 다르면 방장이 스냅샷을 보낸다 (DESIGN 4.13)
        if (this.state.tick % 60 === 0) {
          const h = hashState(this.state)
          this.hashes.set(this.state.tick, h)
          if (this.hashes.size > 12) this.hashes.delete(Math.min(...this.hashes.keys()))
          if (net.me === 1) net.link.sendCtl({ t: 'hash', tick: this.state.tick, h }, net.peerId)
          net.lockstep.prune(this.state.tick)
        }
      }
      this.acc -= TICK_MS
      steps++
    }
    if (this.acc > TICK_MS * 8) this.acc = TICK_MS * 8
    const ev = this.state.events
    this.renderer.onEvents(ev, this.evSeen)
    this.snd.onEvents(ev, this.sndSeen)
    this.sndSeen = ev.length
    for (; this.evSeen < ev.length; this.evSeen++) {
      const e = ev[this.evSeen]
      if (e.type === 'end') this.showResult()
      else if (e.type === 'sub') this.renderer.rebuildRig(this.state, e.player)
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
    const me = this.meTeam
    const controlled = this.state.teams[me].controlled
    let message = this.message
    if (this.cfg.net && this.stallSince >= 0 && now - this.stallSince > 400) {
      message = `상대 입력 대기 중… (${this.cfg.net.link.rtt} ms)`
    }
    this.renderer.draw(this.prev, this.state, alpha, dt, { humanTeam: me, controlled })
    this.hud.update(this.state, { humanTeam: me, controlled, message })
    this.snd.update(this.state, dt)
    if (this.keyView) {
      const p = controlled >= 0 ? this.state.players[controlled] : null
      this.keyView.update({
        down: this.input.pressed,
        input: this.lastInput,
        controlled,
        name: p ? `${p.spec.no} ${p.spec.name}` : '',
        hasBall: this.state.ball.owner >= 0 && this.state.players[this.state.ball.owner].team === me,
      })
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  // ---- 메뉴 · 결과 ----

  /**
   * 🪙 코인토스 연출 — 이번 경기 홈이 어디인지 보여 준다. **렌더 전용**이라 sim·결정론과 무관하다.
   * 온라인에서는 멈추지 않는다(멈추면 락스텝 때문에 상대도 멈춘다) — 양쪽이 같은 시각에 같은 결과를 본다.
   */
  private showToss(): void {
    const st = this.state
    const iAmHome = this.meTeam === 0
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.remove('wide')
    box.innerHTML = `
      <div class="toss">
        <div class="coin spin"><span class="face h">HOME</span><span class="face a">AWAY</span></div>
        <h2 id="toss-t">동전 던지기</h2>
        <p class="hintline" id="toss-p">홈과 원정을 정합니다</p>
      </div>`
    this.overlay.hidden = false
    this.tossing = true
    // 혼자 하기만 멈춘다 (봇이 1초 뒤 킥오프를 차 버리므로)
    if (!this.cfg.net) this.paused = true
    const coin = box.querySelector('.coin') as HTMLElement
    const t1 = window.setTimeout(() => {
      coin.classList.remove('spin')
      coin.classList.add(iAmHome ? 'res-h' : 'res-a')
      const t = box.querySelector('#toss-t')
      const p = box.querySelector('#toss-p')
      if (t) t.innerHTML = `🏠 홈 <b>${st.teams[0].name}</b>`
      if (p) {
        p.innerHTML = iAmHome
          ? '당신이 <b>홈</b>입니다 — 관중석이 우리 색으로 물듭니다'
          : `당신은 <b>원정</b>입니다 — 흰 유니폼으로 뜁니다 (상대 ${st.teams[0].short})`
      }
      this.snd.ui('ok')
    }, 1500)
    const t2 = window.setTimeout(() => {
      this.tossing = false
      this.hideOverlay()
    }, 3100)
    this.tossTimers = [t1, t2]
  }

  private clearTossTimers(): void {
    for (const t of this.tossTimers) clearTimeout(t)
    this.tossTimers = []
    this.tossing = false
  }

  /** Esc — 창이 떠 있으면 닫고, 없으면 메뉴를 연다. 온라인은 멈추지 않으므로 `paused` 로 판단하면 안 된다 */
  private toggleMenu(): void {
    if (this.state.done || this.tossing) return
    if (!this.overlay.hidden) this.hideOverlay()
    else this.showMenu()
  }

  /**
   * Esc 메뉴 — **행동만** 둔다 (계속 · 교체 · 나가기). 소리·그림자 같은 설정은 ⚙ 설정 창으로 모았다
   * (bedorage-duck 방식 — 사용자 요청 2026-09-11).
   */
  private showMenu(): void {
    // 온라인 대전은 멈출 수 없다 — 내가 멈추면 상대도 락스텝에 걸려 함께 멈춘다
    this.paused = !this.cfg.net
    this.message = this.cfg.net ? '' : '일시정지'
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.remove('wide')
    box.innerHTML = `
      <h2>${this.cfg.net ? '메뉴' : '일시정지'}</h2>
      <p>${this.cfg.net ? `온라인 대전 · 방 ${this.cfg.net.link.code} · ${this.cfg.net.link.rtt} ms` : `혼자 하기 — 봇 ${['', '쉬움', '보통', '어려움'][this.cfg.difficulty]}`} · 전후반 ${Math.round(this.cfg.halfSec / 60)}분${this.cfg.net ? ' · 멈추지 않습니다' : ''}</p>
      <div class="row">
        <button class="btn main" id="ov-resume">계속 (Esc)</button>
        <button class="btn secondary" id="ov-sub">🔁 교체 (${this.state.teams[this.meTeam].subsLeft}/${MAX_SUBS})</button>
        <button class="btn secondary" id="ov-settings">⚙ 설정</button>
        <button class="btn secondary" id="ov-quit">로비로</button>
      </div>`
    this.overlay.hidden = false
    ;(box.querySelector('#ov-resume') as HTMLButtonElement).onclick = () => this.hideOverlay()
    ;(box.querySelector('#ov-sub') as HTMLButtonElement).onclick = () => this.showSubs()
    ;(box.querySelector('#ov-settings') as HTMLButtonElement).onclick = () => this.showSettings(true)
    ;(box.querySelector('#ov-quit') as HTMLButtonElement).onclick = () => this.confirmQuit()
  }

  /**
   * ⚙ 설정 창 — **로비와 같은 패널**을 쓴다 (`ui/settings.ts`). 바꾸면 바로 화면에 적용되고 브라우저에 저장된다.
   * 전부 내 화면 설정이라 상대에게 보내지 않는다.
   */
  private showSettings(fromMenu = false): void {
    if (this.tossing) return
    this.settingsFromMenu = fromMenu
    const s = this.cfg.settings
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.remove('wide')
    const draw = (): void => {
      box.innerHTML = `
        <h2>⚙ 설정</h2>
        <p class="hintline">내 화면에만 적용됩니다${this.cfg.net ? ' — 상대에게 보내지 않습니다' : ''}. 브라우저에 저장됩니다.</p>
        <div id="set-host">${settingsPanelHtml(s, this.snd.muted)}</div>
        <div class="row"><button class="btn main" id="ov-close">닫기</button></div>`
      const hostEl = box.querySelector('#set-host')
      if (hostEl) {
        bindSettingsPanel(hostEl, s, {
          setMuted: (m) => this.snd.setMuted(m),
          setShadows: (on) => this.renderer.setShadows(on),
          setResScale: (v) => this.renderer.setResScale(v),
          setKeysHint: (on) => {
            this.keysShown = on
            this.hud.setKeysShown(on)
          },
          rerender: draw,
        })
      }
      ;(box.querySelector('#ov-close') as HTMLButtonElement).onclick = () => {
        if (this.settingsFromMenu) this.showMenu()
        else this.hideOverlay()
      }
    }
    // 혼자 하기만 멈춘다 (온라인은 락스텝 때문에 멈출 수 없다)
    if (!this.cfg.net) {
      this.paused = true
      this.message = '설정'
    }
    this.overlay.hidden = false
    draw()
  }

  /** 로비로 — 경기가 끝나기 전이면 한 번 묻는다 */
  private confirmQuit(): void {
    if (this.tossing) return
    if (this.state.done) {
      this.exit()
      return
    }
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.remove('wide')
    box.innerHTML = `
      <h2>로비로 나갈까요?</h2>
      <p>${
        this.cfg.net
          ? '이 경기는 여기서 끝납니다. 상대 화면에서도 그 시점 스코어로 종료됩니다.'
          : '지금 하던 경기는 사라집니다.'
      }</p>
      <div class="row">
        <button class="btn main" id="ov-stay">계속하기</button>
        <button class="btn secondary" id="ov-go">나가기</button>
      </div>`
    if (!this.cfg.net) this.paused = true
    this.overlay.hidden = false
    ;(box.querySelector('#ov-stay') as HTMLButtonElement).onclick = () => this.hideOverlay()
    ;(box.querySelector('#ov-go') as HTMLButtonElement).onclick = () => this.exit()
  }

  /** 교체 화면 — 나갈 선수와 들어올 선수를 고른다. 명령은 다음 데드볼에 적용된다 (DESIGN 2장) */
  private showSubs(): void {
    const st = this.state
    const team = st.teams[this.meTeam]
    let out = -1
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    const draw = (): void => {
      const onPitch = st.players
        .slice(team.start, team.start + 11)
        .map((p, i) => {
          const tag = p.sentOff ? ' 🟥' : p.yellow ? ' 🟨' : ''
          const sta = Math.round(p.stamina * 100)
          const cls = i === out ? 'pick on' : 'pick'
          const dis = p.sentOff ? ' disabled' : ''
          return `<button class="${cls}" data-out="${i}"${dis}><b>${p.spec.no} ${p.spec.name}</b><small>${p.slot} · 체력 ${sta}%${tag}</small></button>`
        })
        .join('')
      const bench = team.bench
        .map((b, i) => `<button class="pick" data-in="${i}"${out < 0 ? ' disabled' : ''}><b>${b.no} ${b.name}</b><small>${b.pos}</small></button>`)
        .join('')
      box.classList.add('wide')
      box.innerHTML = `
        <h2>교체</h2>
        <p>남은 교체 <b>${team.subsLeft}</b> / ${MAX_SUBS} · ${out < 0 ? '나갈 선수를 고르세요' : '들어올 선수를 고르세요'}</p>
        <div class="sub-cols">
          <div><div class="sub-h">뛰는 선수</div><div class="sub-grid">${onPitch}</div></div>
          <div><div class="sub-h">벤치</div><div class="sub-grid">${bench || '<small>없음</small>'}</div></div>
        </div>
        <div class="row"><button class="btn secondary" id="ov-back">돌아가기</button></div>`
      box.querySelectorAll<HTMLButtonElement>('[data-out]').forEach((b) => {
        b.onclick = () => {
          out = Number(b.dataset.out)
          draw()
        }
      })
      box.querySelectorAll<HTMLButtonElement>('[data-in]').forEach((b) => {
        b.onclick = () => {
          if (out < 0) return
          this.subOrder = { out, in: Number(b.dataset.in) }
          this.hideOverlay()
        }
      })
      ;(box.querySelector('#ov-back') as HTMLButtonElement).onclick = () => this.showMenu()
    }
    draw()
  }

  private hideOverlay(): void {
    ;(this.overlay.querySelector('#overlay-box') as HTMLElement).classList.remove('wide')
    this.settingsFromMenu = false
    this.paused = false
    this.message = ''
    this.overlay.hidden = true
    this.lastTick = performance.now()
    this.acc = 0
  }

  private showResult(reason = ''): void {
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
    const meTeam = this.meTeam
    const my = st.teams[meTeam].goals
    const opp = st.teams[1 - meTeam].goals
    const verdict = my > opp ? '승리!' : my < opp ? '패배' : '무승부'
    const netLine = this.cfg.net
      ? `<p class="hintline">지연 ${this.cfg.net.lockstep.delay}틱 · 끊김 ${this.stalls}회 · 리싱크 ${this.resyncs}회${this.resyncs > 2 ? ' ⚠ 동기화 문제' : ''}</p>`
      : ''
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.innerHTML = `
      <h2>${h.short} ${h.goals} : ${a.goals} ${a.short}</h2>
      <p><b>${verdict}</b>${reason ? ` · ${reason}` : ''}${scorers ? ` · ${scorers}` : ''}</p>
      ${netLine}
      <table class="stats">
        ${row('슛', String(S[0].shots), String(S[1].shots))}
        ${row('유효 슛', String(S[0].onTarget), String(S[1].onTarget))}
        ${row('점유율', pct(S[0].poss, possT), pct(S[1].poss, possT))}
        ${row('패스 성공', `${S[0].passOk}/${S[0].passes} (${pct(S[0].passOk, S[0].passes)})`, `${S[1].passOk}/${S[1].passes} (${pct(S[1].passOk, S[1].passes)})`)}
        ${row('태클', String(S[0].tackles), String(S[1].tackles))}
        ${row('코너킥', String(S[0].corners), String(S[1].corners))}
        ${row('선방', String(S[0].saves), String(S[1].saves))}
        ${row('파울', String(S[0].fouls), String(S[1].fouls))}
        ${row('경고 · 퇴장', `${S[0].yellows} · ${S[0].reds}`, `${S[1].yellows} · ${S[1].reds}`)}
        ${row('오프사이드', String(S[0].offsides), String(S[1].offsides))}
      </table>
      <div class="row">
        ${this.cfg.net ? '' : '<button class="btn main" id="ov-again">다시 하기</button>'}
        <button class="btn secondary" id="ov-quit">로비로</button>
      </div>`
    this.overlay.hidden = false
    const again = box.querySelector('#ov-again') as HTMLButtonElement | null
    if (again) again.onclick = () => this.restart()
    ;(box.querySelector('#ov-quit') as HTMLButtonElement).onclick = () => this.exit()
  }

  private restart(): void {
    const seed = (Math.random() * 0x7fffffff) >>> 0
    this.clearTossTimers()
    this.state = this.newState(seed)
    this.prev = capturePose(this.state)
    this.evSeen = 0
    this.sndSeen = this.state.events.length
    this.renderer.setMatch(this.state, this.kits, this.gkKits)
    this.hud.setColors(this.radarColors)
    this.hideOverlay()
    // 다시 하기도 동전을 새로 던진다 — 홈이 바뀔 수 있다
    this.showToss()
  }

  private exit(): void {
    if (this.cfg.net && !this.peerLeft) this.cfg.net.link.sendCtl({ t: 'leave' }, this.cfg.net.peerId)
    this.dispose()
    this.onExit()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearTossTimers()
    this.ticker.stop()
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('beforeunload', this.onUnload)
    this.input.dispose()
    this.keyView?.dispose()
    this.hud.dispose()
    this.renderer.dispose()
    this.snd.stopCrowd()
    if (this.cfg.net) {
      if (!this.peerLeft) this.cfg.net.link.sendCtl({ t: 'leave' }, this.cfg.net.peerId)
      setTimeout(() => this.cfg.net?.link.leave(), 120)
    }
  }
}
