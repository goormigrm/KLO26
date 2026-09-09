// 시뮬레이션 본체 — createState / step / hashState / snapshot (DESIGN 4장).
// step 은 두 팀의 Input 을 받아 한 틱을 진행한다. 렌더·DOM·시간 함수를 모른다.

import { atan2A, clamp, cosA, len, sinA } from './fixedmath'
import { FORMATIONS } from './formation'
import { makeRng } from './rng'
import { skillsOf } from './skills'
import { aiDecide, ballOwnerTeam, nearestToBall, updateAnchors } from './ai'
import {
  attachBall, contestBall, doClear, doPass, doShoot, gkCatch, gkDistribute, pickPassTarget, slideContest, tryControl,
  type PassKind,
} from './ball'
import {
  BTN_A, BTN_C, BTN_D, BTN_E, BTN_PACE, BTN_PRESET_NEXT, BTN_PRESET_PREV, BTN_Q, BTN_S, BTN_SPACE, BTN_SUB, BTN_W,
  type Input,
} from './input'
import { drainStamina, moveBall, movePlayer, resolveCollisions } from './physics'
import { advanceClock, checkOut, performRestartKick, resolvePending, setupKickoff, tickPhase, type RestartAim } from './rules'
import {
  ACT_DIVE, ACT_FALLEN, ACT_KICK, ACT_RUN, ACT_SLIDE, BENCH_SIZE, DECIDE_TICKS, DEFAULT_HALF_SEC, DEFAULT_SLIDERS, DT,
  MAX_SUBS, PLAYER_R, emptyStats,
  type GameState, type MatchConfig, type Player, type PlayerSpec, type Sliders, type SquadConfig, type Team,
} from './state'

function copySliders(s: Sliders): Sliders {
  return { line: s.line, press: s.press, width: s.width, mentality: s.mentality }
}

function mkPlayer(idx: number, team: number, spec: PlayerSpec, slot: string, band: string): Player {
  return {
    idx, team, spec, slot, band,
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, stamina: 1,
    action: ACT_RUN, actT: 0,
    sk: skillsOf(spec, slot, band as never),
    ax: 0, ay: 0, tx: 0, ty: 0,
    sprint: false, press: false, lastKick: -100, holdT: 0, yellow: 0, sentOff: false,
    dribX: 0, dribY: 0, gotT: -100, tackleT: 0, clearNext: false,
    offside: false, throwing: false, subbedIn: false,
  }
}

function mkTeam(t: number, sq: SquadConfig, human: boolean, bot: number): Team {
  const presets: [Sliders, Sliders, Sliders] = sq.presets
    ? [copySliders(sq.presets[0]), copySliders(sq.presets[1]), copySliders(sq.presets[2])]
    : [{ line: 1, press: 1, width: 2, mentality: 1 }, copySliders(sq.sliders ?? DEFAULT_SLIDERS), { line: 3, press: 3, width: 3, mentality: 3 }]
  return {
    name: sq.name, short: sq.short, human, bot: (human ? 0 : bot) as Team['bot'],
    dir: t === 0 ? 1 : -1, formation: sq.formation,
    sliders: copySliders(presets[1]), presets, preset: 1,
    controlled: -1, goals: 0, prevButtons: 0, holdShoot: 0, holdPass: 0, lastA: -1000,
    inX: 0, inY: 0, sprint: false, slow: false, jockey: false, assist: false,
    start: t * 11, gk: t * 11,
    bench: sq.players.slice(11, 11 + BENCH_SIZE).map((s) => s),
    subsLeft: MAX_SUBS,
    pendingSub: null,
  }
}

export function createState(cfg: MatchConfig): GameState {
  const players: Player[] = []
  const teams = [] as unknown as [Team, Team]
  for (let t = 0; t < 2; t++) {
    const sq = cfg.squads[t]
    const shape = FORMATIONS[sq.formation]
    if (!shape) throw new Error(`포메이션 없음: ${sq.formation}`)
    if (sq.players.length < 11) throw new Error(`선수가 11명이 안 된다: ${sq.name}`)
    const human = cfg.human?.[t] ?? false
    teams[t] = mkTeam(t, sq, human, cfg.bots?.[t] ?? 2)
    players.push(mkPlayer(t * 11, t, sq.players[0], 'GK', 'GK'))
    for (let i = 0; i < 10; i++) {
      const [band, slot] = shape[i]
      players.push(mkPlayer(t * 11 + 1 + i, t, sq.players[i + 1], slot, band))
    }
  }
  const st: GameState = {
    tick: 0, half: 1, clock: 0, halfSec: cfg.halfSec ?? DEFAULT_HALF_SEC,
    phase: 'kickoff', phaseT: 0, restart: null, kickoffTeam: 0, firstKickoff: 0, prevBallX: 0,
    players,
    ball: {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, lastTouch: -1, lastTeam: -1, kickTick: -100,
      shotBy: -1, passTo: -1, onTarget: false, fromThrow: false, restartBy: -1, passLive: false,
    },
    teams,
    rng: makeRng(cfg.seed),
    botRng: makeRng((cfg.seed ^ 0x9e3779b9) >>> 0),
    events: [],
    stats: [emptyStats(), emptyStats()],
    done: false,
    pending: null,
    callText: '',
  }
  setupKickoff(st, 0)
  st.firstKickoff = 0
  return st
}

function setPreset(team: Team, i: number): void {
  team.preset = i
  team.sliders = copySliders(team.presets[i])
}

/** 사람 입력을 팀 상태·행동으로 옮긴다 (DESIGN 3.1 — 같은 키가 공수에서 뜻이 바뀐다) */
function handleInput(st: GameState, t: number, inp: Input): void {
  const team = st.teams[t]
  if (!team.human) {
    team.controlled = -1
    return
  }
  const held = inp.buttons
  const prev = team.prevButtons
  const edge = held & ~prev
  const b = st.ball
  const hasBall = ballOwnerTeam(st) === t
  team.inX = inp.mx / 127
  team.inY = inp.my / 127
  team.sprint = (held & BTN_E) !== 0
  team.slow = hasBall && (held & BTN_PACE) !== 0
  team.jockey = !hasBall && (held & BTN_C) !== 0
  team.assist = !hasBall && (held & BTN_Q) !== 0

  // 교체 명령 — 아무 때나 넣고 다음 데드볼에 적용 (DESIGN 2장)
  if (edge & BTN_SUB) team.pendingSub = { out: inp.a, in: inp.b }

  if (hasBall) team.controlled = b.owner
  else {
    const cur = team.controlled
    const valid = cur >= 0 && st.players[cur].team === t && !st.players[cur].sk.isGK && !st.players[cur].sentOff
    if (!valid) team.controlled = nearestToBall(st, t, -1)
    else if (edge & BTN_S) team.controlled = nearestToBall(st, t, cur)
  }
  if (edge & BTN_PRESET_NEXT) setPreset(team, (team.preset + 1) % 3)
  if (edge & BTN_PRESET_PREV) setPreset(team, (team.preset + 2) % 3)

  const c = team.controlled >= 0 ? st.players[team.controlled] : null
  if (!c) {
    team.prevButtons = held
    return
  }
  // 리스타트 킥커: 킥 키를 누르면 방향키 쪽으로 (스로인은 손, 골킥의 D 는 길게 — rules 가 가른다)
  if (st.phase !== 'play' && st.restart && st.restart.team === t && st.restart.kicker === c.idx) {
    if (held & BTN_D) team.holdShoot++
    const fire = edge & (BTN_S | BTN_W | BTN_A)
    const dRelease = (prev & BTN_D) && !(held & BTN_D)
    if (fire || dRelease) {
      const kind: RestartAim['kind'] = dRelease ? 'D' : edge & BTN_W ? 'W' : edge & BTN_A ? 'A' : 'S'
      performRestartKick(st, { kind, dx: team.inX, dy: team.inY, power: clamp(team.holdShoot / 36, 0, 1) })
      team.holdShoot = 0
    }
    team.prevButtons = held
    return
  }
  const dx = team.inX
  const dy = team.inY
  if (hasBall && b.owner === c.idx && c.holdT === 0 && st.phase === 'play') {
    if (held & BTN_S) team.holdPass++
    else if (prev & BTN_S) {
      doPass(st, c, 'ground', pickPassTarget(st, c, dx, dy, false), dx, dy, clamp(team.holdPass / 30, 0, 1))
      team.holdPass = 0
    }
    if ((edge & BTN_W) && b.owner === c.idx) doPass(st, c, 'through', pickPassTarget(st, c, dx, dy, true), dx, dy, 0.5)
    if ((edge & BTN_A) && b.owner === c.idx) {
      let kind: PassKind = 'lob'
      if (held & BTN_Q) kind = 'highcross'
      else if (st.tick - team.lastA < 15) kind = 'lowcross'
      team.lastA = st.tick
      doPass(st, c, kind, pickPassTarget(st, c, dx, dy, false), dx, dy, 0.5)
    }
    if (held & BTN_D) team.holdShoot++
    else if ((prev & BTN_D) && b.owner === c.idx) {
      const chip = ((held | prev) & BTN_Q) !== 0
      doShoot(st, c, dx, dy, clamp(team.holdShoot / 36, 0.15, 1), chip, null)
      team.holdShoot = 0
    }
  } else {
    team.holdPass = 0
    team.holdShoot = 0
    c.press = (held & BTN_D) !== 0
    if ((edge & BTN_A) && c.action === ACT_RUN) {
      c.action = ACT_SLIDE
      c.actT = 30
      if (dx !== 0 || dy !== 0) c.facing = atan2A(dy, dx)
    }
    if (edge & BTN_SPACE) c.tackleT = 12
    if ((edge & BTN_D) && b.owner < 0 && c.x * team.dir < -20) c.clearNext = true
  }
  team.prevButtons = held
}

/** 한 틱 */
export function step(st: GameState, inputs: [Input, Input]): void {
  if (st.done) return
  tickPhase(st)
  handleInput(st, 0, inputs[0])
  handleInput(st, 1, inputs[1])
  updateAnchors(st)
  const b = st.ball

  for (const p of st.players) {
    if (p.sentOff) continue
    const team = st.teams[p.team]
    const ctl = team.human && team.controlled === p.idx
    if (p.action === ACT_SLIDE) {
      p.vx = cosA(p.facing) * p.sk.vmax * 1.3
      p.vy = sinA(p.facing) * p.sk.vmax * 1.3
      p.x += p.vx * DT
      p.y += p.vy * DT
      if (--p.actT <= 0) {
        p.action = ACT_FALLEN
        p.actT = 15
      }
      continue
    }
    if (p.action === ACT_FALLEN || p.action === ACT_DIVE) {
      p.vx *= 0.8
      p.vy *= 0.8
      p.x += p.vx * DT
      p.y += p.vy * DT
      if (--p.actT <= 0) p.action = ACT_RUN
      continue
    }
    if (p.action === ACT_KICK && --p.actT <= 0) p.action = ACT_RUN
    if (p.tackleT > 0) p.tackleT--

    let dvx: number
    let dvy: number
    let sprint: boolean
    let speedK = 1
    const isKicker = st.restart !== null && st.restart.kicker === p.idx
    if (ctl && !isKicker) {
      dvx = team.inX * p.sk.vmax
      dvy = team.inY * p.sk.vmax
      sprint = team.sprint
      if (team.slow && b.owner === p.idx) speedK *= 0.45
      if (team.jockey) speedK *= 0.7
    } else {
      if ((st.tick + p.idx) % DECIDE_TICKS === 0) aiDecide(st, p)
      const ddx = p.tx - p.x
      const ddy = p.ty - p.y
      const d = len(ddx, ddy)
      if (d < 0.3 || isKicker) {
        dvx = 0
        dvy = 0
      } else {
        const sp = Math.min(p.sk.vmax, d * 3)
        dvx = (ddx / d) * sp
        dvy = (ddy / d) * sp
      }
      sprint = p.sprint
    }
    if (sprint && p.stamina > 0.05) speedK *= 1.12
    if (b.owner === p.idx) speedK *= 0.8 + 0.15 * p.sk.drib
    if (p.stamina < 0.3) speedK *= 0.85
    if (p.action === ACT_KICK) speedK *= 0.5
    if (p.holdT > 0) speedK *= 0.3
    movePlayer(p, dvx, dvy, speedK)
    drainStamina(p, sprint && speedK > 1)
  }

  st.prevBallX = b.x
  if (b.owner >= 0) {
    const o = st.players[b.owner]
    if (o.holdT > 0) {
      o.holdT--
      if (o.holdT === 0 && st.phase === 'play') gkDistribute(st, o)
    }
    if (b.owner === o.idx) {
      attachBall(st, o)
      if (st.phase === 'play' || o.holdT > 0) contestBall(st, o)
    }
    if (o.clearNext && b.owner === o.idx && o.holdT === 0) {
      o.clearNext = false
      doClear(st, o)
    }
  } else {
    // 골대를 맞으면 이벤트로 남긴다 (소리·연출. 결정론에는 영향이 없다 — 물리는 그대로다)
    if (moveBall(b)) st.events.push({ tick: st.tick, type: 'post', team: b.lastTeam, player: b.lastTouch, x: b.x, y: b.y })
    gkCatch(st, st.players[st.teams[0].gk])
    gkCatch(st, st.players[st.teams[1].gk])
    if (b.owner < 0) tryControl(st)
    if (b.owner >= 0) {
      const o = st.players[b.owner]
      if (o.clearNext) {
        o.clearNext = false
        doClear(st, o)
      }
    }
  }
  for (const p of st.players) if (p.action === ACT_SLIDE) slideContest(st, p)
  resolveCollisions(st.players, PLAYER_R)
  if (st.phase === 'play') checkOut(st)
  // 반칙은 한 틱에 하나만, 흐름이 끝난 뒤 세트피스로 (ball.ts 가 rules.ts 를 import 하지 않게)
  if (st.pending) resolvePending(st)
  advanceClock(st)
  const ot = ballOwnerTeam(st)
  if (ot >= 0) st.stats[ot].poss++
  st.tick++
}

const PHASE_CODE: Record<string, number> = {
  kickoff: 1, play: 2, goal: 3, throwin: 4, goalkick: 5, corner: 6, halftime: 7, end: 8, freekick: 9, penalty: 10,
}

/** 상태 해시 (FNV-1a). 위치·속도는 mm 단위로 양자화 */
export function hashState(st: GameState): number {
  let h = 0x811c9dc5
  const mix = (v: number): void => {
    const x = v | 0
    h ^= x & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (x >>> 8) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (x >>> 16) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (x >>> 24) & 0xff
    h = Math.imul(h, 0x01000193)
  }
  const q = (f: number): number => Math.round(f * 1000)
  mix(st.tick)
  mix(PHASE_CODE[st.phase] ?? 0)
  mix(st.teams[0].goals)
  mix(st.teams[1].goals)
  mix(q(st.clock))
  const b = st.ball
  mix(q(b.x)); mix(q(b.y)); mix(q(b.z)); mix(q(b.vx)); mix(q(b.vy)); mix(q(b.vz)); mix(b.owner)
  mix(b.restartBy); mix(b.fromThrow ? 1 : 0)
  for (const p of st.players) {
    mix(q(p.x)); mix(q(p.y)); mix(q(p.vx)); mix(q(p.vy)); mix(p.facing); mix(q(p.stamina)); mix(p.action); mix(p.actT); mix(p.holdT)
    mix(p.yellow); mix(p.sentOff ? 1 : 0); mix(p.offside ? 1 : 0); mix(p.spec.id)
  }
  for (const t of st.teams) mix(t.subsLeft)
  mix(st.rng.s)
  mix(st.botRng.s)
  return h >>> 0
}

/** 깊은 복사 — 리싱크 스냅샷 */
export function snapshot(st: GameState): GameState {
  return JSON.parse(JSON.stringify(st)) as GameState
}

/** 경기 시계 표시용 분 (0~90) */
export function matchMinute(st: GameState): number {
  const perHalf = 45
  const m = (st.clock / st.halfSec) * perHalf
  return st.half === 1 ? m : perHalf + m
}
