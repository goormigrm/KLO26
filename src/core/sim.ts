// 시뮬레이션 본체 — createState / step / hashState / snapshot (DESIGN 4장).
// step 은 두 팀의 Input 을 받아 한 틱을 진행한다. 렌더·DOM·시간 함수를 모른다.

import { atan2A, clamp, cosA, len, sinA, angleDiff } from './fixedmath'
import { FORMATIONS } from './formation'
import { makeRng } from './rng'
import { skillsOf } from './skills'
import { PRESET_COUNT, TAC_TICKS, applyTeamTactics, defaultPresets, normalizeSliders, roleTraits } from './tactics'
import { aiDecide, ballOwnerTeam, nearestToBall, updateAnchors } from './ai'
import { interceptPoint, gkPunt } from './ball'
import {
  TAP_A, TAP_D, TAP_KNOCK, TAP_S, TAP_TICKS, TAP_W,
  attachBall, contestBall, cutbackTarget, doClear, doPass, doShoot, encroachFoul, fakeShot, followTap, gkCatch, gkDistribute, inOwnBox,
  knockOn, pickPassTarget, shoulderBarge, slideContest, tryControl,
  type PassKind,
} from './ball'
import {
  BTN_A, BTN_BAL_DOWN, BTN_BAL_UP, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_F, BTN_GK, BTN_PACE, BTN_Q, BTN_S, BTN_SKIP, BTN_SPACE, BTN_SUB,
  BTN_TACS, BTN_W, BTN_Z, SUB_CLEAR, presetPick,
  type Input,
} from './input'
import { drainStamina, moveBall, movePlayer, resolveCollisions } from './physics'
import { rand } from './rng'
import { advanceClock, checkOut, performRestartKick, resolvePending, restartStick, setupKickoff, tickPhase, type RestartAim } from './rules'
import {
  ACT_DIVE, ACT_FALLEN, ACT_HEAD, ACT_KICK, ACT_RUN, ACT_SLIDE, BENCH_SIZE, DECIDE_TICKS, DEFAULT_HALF_SEC, DEFAULT_SLIDERS, DT,
  MAX_SUBS, MAX_SUB_WINDOWS, PLAYER_R, emptyStats,
  type GameState, type MatchConfig, type Player, type PlayerSpec, type Sliders, type SquadConfig, type Team,
} from './state'

function copySliders(s: Partial<Sliders>): Sliders {
  return normalizeSliders(s)
}

function mkPlayer(idx: number, team: number, spec: PlayerSpec, slot: string, band: string, role: number): Player {
  return {
    idx, team, spec, slot, band, role, rt: roleTraits(band, slot, role),
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, stamina: 1,
    action: ACT_RUN, actT: 0,
    sk: skillsOf(spec, slot, band as never),
    ax: 0, ay: 0, tx: 0, ty: 0,
    sprint: false, press: false, lastKick: -100, holdT: 0, yellow: 0, sentOff: false,
    dribX: 0, dribY: 0, gotT: -100, tackleT: 0, clearNext: false,
    offside: false, throwing: false, subbedIn: false, runT: -1000, diveHigh: false, markOf: -1, markT: -1000,
    goUntil: -1000, skillT: -1000, bitT: -1000, pull: false, slid: false, quickUp: false, gotMate: false, dropped: false, callT: -1000,
  }
}

function mkTeam(t: number, sq: SquadConfig, human: boolean, bot: number): Team {
  const presets: [Sliders, Sliders, Sliders] = sq.presets
    ? [copySliders(sq.presets[0]), copySliders(sq.presets[1]), copySliders(sq.presets[2])]
    : [defaultPresets()[0], copySliders(sq.sliders ?? DEFAULT_SLIDERS), defaultPresets()[2]]
  return {
    name: sq.name, short: sq.short, human, bot: (human ? 0 : bot) as Team['bot'],
    dir: t === 0 ? 1 : -1, formation: sq.formation,
    sliders: copySliders(presets[1]), presets, preset: 1,
    controlled: -1, goals: 0, prevButtons: 0, holdShoot: 0, holdPass: 0,
    inX: 0, inY: 0, aimX: 0, aimY: 0, aimT: -1000, sprint: false, slow: false, jockey: false, assist: false, skipCele: false,
    start: t * 11, gk: t * 11,
    bench: sq.players.slice(11, 11 + BENCH_SIZE).map((s) => s),
    subsLeft: MAX_SUBS,
    subWindows: MAX_SUB_WINDOWS,
    pendingSubs: [],
    gkRush: -1,
    balance: 0, tac: 0, tacUntil: -1, cornerPlan: 0, prevMx: 0, prevMy: 0, touchK: false, gkManual: false,
    tapKind: 0, tapTick: -1000, tapBy: -1, tapD: 0, eTaps: 0, eTick: -1000, rollT: -1000,
    powerT: -1, powerHit: 0, powerDx: 0, powerDy: 0, powerPow: 0, powerZ: false, fakeT: -1000, fakeHold: false,
    pkDive: false, pkDiveY: 0, pkDiveHigh: false, pkAntT: -1000,
    wallJumpT: -1000, wallShift: 0, wallAdv: 0, fkCharge: false, pushUntil: -1, kickMx: 0, kickMy: 0, kickT: -1000,
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
    players.push(mkPlayer(t * 11, t, sq.players[0], 'GK', 'GK', 0))
    for (let i = 0; i < 10; i++) {
      const [band, slot] = shape[i]
      const role = sq.roles?.[i + 1] ?? 0
      players.push(mkPlayer(t * 11 + 1 + i, t, sq.players[i + 1], slot, band, Number.isInteger(role) && role >= 0 && role <= 3 ? role : 0))
    }
  }
  const st: GameState = {
    tick: 0, half: 1, clock: 0, halfSec: cfg.halfSec ?? DEFAULT_HALF_SEC,
    phase: 'kickoff', phaseT: 0, restart: null, kickoffTeam: 0, firstKickoff: 0, prevBallX: 0, goalScorer: -1, goalTeam: -1,
    players,
    ball: {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, lastTouch: -1, lastTeam: -1, kickTick: -100,
      shotBy: -1, shotQ: 0, passTo: -1, onTarget: false, fromThrow: false, restartBy: -1, passLive: false, passKind: '',
      curl: 0, dip: 0, trick: 0, dink: false,
    },
    teams,
    rng: makeRng(cfg.seed),
    botRng: makeRng((cfg.seed ^ 0x9e3779b9) >>> 0),
    events: [],
    stats: [emptyStats(), emptyStats()],
    done: false,
    pending: null,
    callText: '',
    callTick: -1000,
    stoppage: 0,
    added: -1,
  }
  setupKickoff(st, 0)
  st.firstKickoff = 0
  return st
}

/** 받을 선수의 요격 지점 (할당을 피하려 재사용) */
const RECV_TMP = { x: 0, y: 0 }

/** 세트피스 킥에서 방향키를 뗀 뒤에도 이만큼(틱) 그 방향을 기억한다 — 0.33 초 */
export const KICK_AIM_TICKS = 20

/**
 * 세트피스 킥커의 방향키 — 지금 누른 것이 없으면 **0.33 초 안에 마지막으로 누른 것** (2026-09-23 사용자 제보
 * "PK·프리킥이 누른 방향과 다르게 날아간다"). D 와 방향키를 같이 떼면 두 키가 한 프레임(16 ms)에 떨어져, 떼는 틱의
 * 방향키가 (0,0)이 되어 PK 는 아무 구석으로, 프리킥은 골키퍼가 비운 구석으로 갔다. 궤적 미리보기(렌더)도 같은 값을 쓴다
 */
export function kickStick(team: Team, mx: number, my: number, tick: number): { mx: number; my: number } {
  if (mx !== 0 || my !== 0) return { mx, my }
  if (tick - team.kickT <= KICK_AIM_TICKS) return { mx: team.kickMx, my: team.kickMy }
  return { mx: 0, my: 0 }
}

/** 파워 슛(F+D) 준비 시간과 타이밍 게이지의 초록 구간 (틱) — 렌더가 같은 값으로 게이지를 그린다 */
export const POWER_TICKS = 30
export const POWER_GREEN: readonly [number, number] = [19, 24]

/** 방향키 쪽 동료 — 수비에서 Shift+방향키로 선수 바꾸기 (FC 온라인 "선수 바꾸기(수동)"). 60° 안에서 가까운 사람 */
function pickByDirection(st: GameState, t: number, cur: number, dx: number, dy: number): number {
  const c = st.players[cur]
  const l = len(dx, dy)
  if (l === 0) return cur
  const ux = dx / l
  const uy = dy / l
  let best = cur
  let bestS = -99
  for (const q of st.players) {
    if (q.team !== t || q.idx === cur || q.sk.isGK || q.sentOff) continue
    const ddx = q.x - c.x
    const ddy = q.y - c.y
    const d = len(ddx, ddy)
    if (d < 0.5) continue
    const cos = (ddx * ux + ddy * uy) / d
    if (cos < 0.5) continue
    const s = cos - d * 0.012
    if (s > bestS) {
      bestS = s
      best = q.idx
    }
  }
  return best
}

/** 프리킥 벽 — 공과 골문 사이 6~11.5 m 에 선 우리 필드 선수 */
function wallMembers(st: GameState, t: number): Player[] {
  const b = st.ball
  const out: Player[] = []
  for (const q of st.players) {
    if (q.team !== t || q.sk.isGK || q.sentOff) continue
    const d = len(q.x - b.x, q.y - b.y)
    if (d >= 6 && d <= 11.5) out.push(q)
  }
  return out
}

function setTap(team: Team, kind: number, tick: number, by: number, d = 0): void {
  team.tapKind = kind
  team.tapTick = tick
  team.tapBy = by
  team.tapD = d
}

/**
 * 사람 입력을 팀 상태·행동으로 옮긴다 (DESIGN 3.1 — 같은 키가 공수에서 뜻이 바뀐다 · 3.1a FC 온라인 조작, 2026-09-23).
 * 봇 팀은 여기를 안 탄다 — 새 조작(녹온·딩크·페이크·밀치기·당기기·벽·PK 골키퍼…)은 사람에게만 있고 봇 대 봇 결과는 그대로다
 */
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
  const stickOn = inp.mx !== 0 || inp.my !== 0
  const stickNew = stickOn && (inp.mx !== team.prevMx || inp.my !== team.prevMy)
  team.prevMx = inp.mx
  team.prevMy = inp.my
  team.inX = inp.mx / 127
  team.inY = inp.my / 127
  team.sprint = (held & BTN_E) !== 0
  // 페이스 컨트롤(Shift)은 전력질주가 아닐 때만 — 달리면서 Shift 를 톡 치면 녹온이다
  team.slow = hasBall && (held & BTN_PACE) !== 0 && (held & BTN_E) === 0
  team.jockey = !hasBall && (held & BTN_C) !== 0
  team.assist = !hasBall && (held & BTN_Q) !== 0
  team.touchK = (held & BTN_CTRL) !== 0
  if (edge & BTN_E) {
    team.eTaps = st.tick - team.eTick <= 14 ? team.eTaps + 1 : 1
    team.eTick = st.tick
  }

  // 교체 명령 — 아무 때나 넣고 다음 데드볼에 적용 (DESIGN 2장). 한 틱에 한 명, SUB_CLEAR 면 전부 지운다
  if (held & BTN_SUB) {
    if (inp.a === SUB_CLEAR) team.pendingSubs = []
    else if (
      inp.a <= 10 && inp.b < team.bench.length &&
      team.subWindows > 0 && team.pendingSubs.length < team.subsLeft &&
      !team.pendingSubs.some((o) => o.out === inp.a || o.in === inp.b)
    ) team.pendingSubs.push({ out: inp.a, in: inp.b })
  }

  // 전술 — 숫자 1~0 전술 고르기 · [ ] 공수 밸런스 · F1~F4 순간 전술(코너킥 공격이면 세트피스 작전)
  let retac = false
  const pick = presetPick(held)
  if (pick >= 0 && pick < PRESET_COUNT && pick !== team.preset) {
    team.preset = pick
    retac = true
  }
  if ((edge & BTN_BAL_UP) && team.balance < 2) {
    team.balance++
    retac = true
  }
  if ((edge & BTN_BAL_DOWN) && team.balance > -2) {
    team.balance--
    retac = true
  }
  for (let k = 0; k < 4; k++) {
    if (!(edge & BTN_TACS[k])) continue
    if (st.phase === 'corner' && st.restart && st.restart.team === t) team.cornerPlan = team.cornerPlan === k + 1 ? 0 : k + 1
    else {
      team.tac = k + 1
      team.tacUntil = st.tick + TAC_TICKS[k + 1]
      retac = true
    }
  }
  if (team.tac > 0 && st.tick >= team.tacUntil) {
    team.tac = 0
    retac = true
  }
  if (retac) applyTeamTactics(team, st.tick)
  // Enter — 세레모니 건너뛰기. 봇은 늘 동의한 것으로 친다 (rules.tickPhase 가 본다)
  if ((edge & BTN_SKIP) && st.phase === 'goal') team.skipCele = true

  // ---- 조작 선수 ----
  // 내가 찬 패스가 날아가는 동안은 **받으라고 보낸 선수**가 조작 선수다 (2026-09-11 제보:
  // 공에 가장 가까운 선수로 넘어가면서 누르고 있던 방향키 때문에 공과 상관없는 쪽으로 뛰었다)
  const myPassLive =
    b.passLive && b.lastTeam === t && b.passTo >= 0 && st.players[b.passTo].team === t && !st.players[b.passTo].sentOff
  const gk = st.players[team.gk]
  // PK 를 막는 쪽이면 골키퍼를 조작한다 · 수비 중 ` 를 누르고 있으면 골키퍼 직접 조작 ("키컨")
  const pkKeeper = st.phase === 'penalty' && st.restart !== null && st.restart.team !== t && !gk.sentOff
  team.gkManual = !hasBall && (held & BTN_GK) !== 0 && !gk.sentOff
  if (hasBall) team.controlled = b.owner
  else if (pkKeeper || team.gkManual) team.controlled = team.gk
  else if (myPassLive && team.controlled === b.lastTouch) {
    // 찬 선수에 머물러 있던 조작을 받을 선수로 **한 번** 넘긴다. 그 뒤 S 로 다른 선수를 잡으면 존중한다
    team.controlled = b.passTo
  } else {
    const cur = team.controlled
    const valid = cur >= 0 && st.players[cur].team === t && !st.players[cur].sk.isGK && !st.players[cur].sentOff
    if (!valid) team.controlled = nearestToBall(st, t, -1)
    // S 는 선수 변경 — 단, 방금 낸 땅볼 패스에 S 를 한 번 더(딩크) 누른 것이면 바꾸지 않는다
    else if ((edge & BTN_S) && !(team.tapKind === TAP_S && st.tick - team.tapTick <= TAP_TICKS)) team.controlled = nearestToBall(st, t, cur)
    // Shift+방향키 — 그쪽 동료로 바꾼다 (Shift 를 누른 순간 또는 누른 채 방향키를 새로 넣을 때)
    else if ((held & BTN_PACE) && stickOn && ((edge & BTN_PACE) || stickNew)) team.controlled = pickByDirection(st, t, cur, team.inX, team.inY)
  }

  const c = team.controlled >= 0 ? st.players[team.controlled] : null
  if (!c) {
    team.prevButtons = held
    return
  }

  // ---- 상대 세트피스를 막는 쪽 (FC 온라인 "프리킥 수비" · "페널티 킥 골키퍼") ----
  if (st.phase !== 'play' && st.restart && st.restart.team !== t) {
    if (st.phase === 'freekick') {
      const attDir = st.teams[st.restart.team].dir
      // W 벽 점프 — 누른 뒤 4~40틱 동안 공중(ball.ts wallBlock). 벽 선수는 점프 동작을 한다
      if (edge & BTN_W) {
        team.wallJumpT = st.tick
        for (const q of wallMembers(st, t)) {
          if (q.action !== ACT_RUN) continue
          q.action = ACT_HEAD
          q.actT = 24
        }
      }
      // C · E 벽 좌우 (화면 기준 — 카메라가 키커 뒤라 화면 왼쪽 = 월드 +공격 방향·y) · D 뛰쳐나가기 · Z 벽 전진
      if (edge & BTN_C) team.wallShift = clamp(team.wallShift + attDir * 0.5, -2.5, 2.5)
      if (edge & BTN_E) team.wallShift = clamp(team.wallShift - attDir * 0.5, -2.5, 2.5)
      if (edge & BTN_D) team.fkCharge = true
      if ((edge & BTN_Z) && team.wallAdv < 2) {
        team.wallAdv += 1
        // 주심에게 걸릴 수 있다 — 경고, 프리킥은 다시 (FC 온라인: "잘못하면 옐로카드")
        const wall = wallMembers(st, t)
        if (wall.length > 0 && rand(st.rng) < 0.3) encroachFoul(st, wall[0])
      }
    } else if (st.phase === 'penalty' && c.idx === team.gk) {
      // 화면 기준 방향키 — 카메라가 키커 뒤다. ← → 가 골라인 위 좌우
      const s = restartStick(st, st.restart.team, inp.mx, inp.my)
      team.inX = 0
      team.inY = s.lat
      if ((edge & (BTN_D | BTN_PACE | BTN_CTRL)) && stickOn) {
        // 다이빙 방향을 고른다 — 차는 순간 그쪽으로 (rules.keeperDive). ↑ 를 섞으면 높게
        team.pkDive = true
        team.pkDiveY = clamp(s.lat, -1, 1)
        team.pkDiveHigh = s.lift > 0.3
      } else if ((edge & (BTN_W | BTN_A | BTN_S | BTN_D)) && !stickOn) team.pkAntT = st.tick // 방해 동작
    }
  }

  // ---- 리스타트 킥커: 킥 키를 누르면 방향키 쪽으로 (스로인은 손, 골킥의 D 는 길게 — rules 가 가른다) ----
  if (st.phase !== 'play' && st.restart && st.restart.team === t && st.restart.kicker === c.idx) {
    // PK 키커 움직이기 (Shift+방향키) — 공 뒤 1.5~3.2 m 안에서 도움닫기 자리를 바꾼다
    if (st.phase === 'penalty' && (held & BTN_PACE)) {
      const dir = team.dir
      const nx = c.x + team.inX * 0.04
      const ny = c.y + team.inY * 0.04
      const d = len(nx - b.x, ny - b.y)
      if ((nx - b.x) * dir < -0.8 && d > 1.5 && d < 3.2) {
        c.x = nx
        c.y = ny
        c.facing = atan2A(b.y - c.y, b.x - c.x)
      }
      team.prevButtons = held
      return
    }
    // 키커 뒤 시점(직접 프리킥·PK)이면 방향키를 **화면 기준**으로 읽는다 — ↑ 골문 쪽 · → 화면 오른쪽 (2026-09-11).
    // 방향키를 D 와 같이 떼도 방향이 남는다 (`kickStick`)
    if (inp.mx !== 0 || inp.my !== 0) {
      team.kickMx = inp.mx
      team.kickMy = inp.my
      team.kickT = st.tick
    }
    const ks = kickStick(team, inp.mx, inp.my, st.tick)
    const stick = restartStick(st, t, ks.mx, ks.my)
    team.inX = stick.dx
    team.inY = stick.dy
    // D(슛·펀트)와 A(롱볼)는 **홀드**로 힘을 모아 떼는 순간 찬다. S·W 는 누르는 순간 (2026-09-11: A 도 홀드)
    if (held & (BTN_D | BTN_A)) team.holdShoot++
    const fire = edge & (BTN_S | BTN_W)
    const dRelease = (prev & BTN_D) && !(held & BTN_D)
    const aRelease = (prev & BTN_A) && !(held & BTN_A)
    if (fire || dRelease || aRelease) {
      const kind: RestartAim['kind'] = dRelease ? 'D' : aRelease ? 'A' : edge & BTN_W ? 'W' : 'S'
      const aim: RestartAim = { kind, dx: stick.dx, dy: stick.dy, power: clamp(team.holdShoot / 36, 0, 1) }
      if (stick.screen) {
        aim.lat = stick.lat
        aim.lift = stick.lift
      }
      // 조합키 — Z 감아차기 · C 플레어(프리킥) · Q 파넨카 · PK 도움닫기 C 걸어가며 / E 달려가며
      const m = held | prev
      if (m & BTN_Z) aim.finesse = true
      if (st.phase === 'penalty') {
        if (m & BTN_Q) aim.panenka = true
        aim.approach = m & BTN_C ? -1 : m & BTN_E ? 1 : 0
      } else if (m & BTN_C) aim.flair = true
      const wasFk = st.phase === 'freekick' && kind === 'D'
      performRestartKick(st, aim)
      // 직접 프리킥 슛도 D 를 한 번 더 누르면 낮게 깔린다 (벽이 뛰면 그 밑으로)
      if (wasFk && b.owner < 0 && b.shotBy === c.idx) setTap(team, TAP_D, st.tick, c.idx)
      team.holdShoot = 0
    }
    team.prevButtons = held
    return
  }
  // 방향키를 놓은 직후(0.25 초 안)에 떼는 패스·슛은 **마지막으로 눌렀던 방향**으로 간다 — S/D 를 떼는 순간 손가락이
  // 방향키를 먼저 놓으면 (0,0) 이 되어 바라보는 방향으로 엉뚱하게 갔다 (사용자 제보 2026-09-11)
  if (team.inX !== 0 || team.inY !== 0) {
    team.aimX = team.inX
    team.aimY = team.inY
    team.aimT = st.tick
  }
  const recent = st.tick - team.aimT < 15
  const dx = team.inX !== 0 || team.inY !== 0 ? team.inX : recent ? team.aimX : 0
  const dy = team.inX !== 0 || team.inY !== 0 ? team.inY : recent ? team.aimY : 0

  // ---- 파워 슛 준비 중 (F+D 를 뗀 뒤 0.5 초) — 머리 위 게이지의 초록 구간에서 D 를 한 번 더 ----
  if (team.powerT >= 0) {
    const el = st.tick - team.powerT
    if (b.owner !== c.idx || st.phase !== 'play') team.powerT = -1 // 준비 중에 뺏겼다
    else {
      if ((edge & BTN_D) && team.powerHit === 0) team.powerHit = el >= POWER_GREEN[0] && el <= POWER_GREEN[1] ? 1 : 2
      if (el >= POWER_TICKS) {
        doShoot(st, c, team.powerDx, team.powerDy, team.powerPow, false, null, undefined, { finesse: team.powerZ, power: team.powerHit || 3 })
        team.powerT = -1
        setTap(team, 0, st.tick, c.idx)
      }
      team.prevButtons = held
      return
    }
  }

  // ---- 방금 찬 공에 같은 키 한 번 더 (S+S 딩크 · W+W 딩크 스루 · A+A 낮은 크로스 · D+D 드리븐 · E 세 번 슈퍼 녹온) ----
  if (team.tapKind > 0) {
    if (st.tick - team.tapTick > TAP_TICKS) team.tapKind = 0
    else {
      const key = team.tapKind === TAP_S ? BTN_S : team.tapKind === TAP_W ? BTN_W : team.tapKind === TAP_A ? BTN_A : team.tapKind === TAP_D ? BTN_D : BTN_E
      const go = team.tapKind === TAP_KNOCK ? (edge & BTN_E) !== 0 && team.eTaps >= 3 : (edge & key) !== 0
      if (go) {
        followTap(st, st.players[team.tapBy], team.tapKind, team.tapD)
        team.tapKind = 0
        team.prevButtons = held
        return
      }
    }
  }

  // ---- 골키퍼가 공을 가졌다 (2026-09-15 제보 — "잡은 뒤 가만히 있다 뺏긴다" · "D 를 누르면 상대 골대까지 찬다") ----
  // 손에 들었든(holdT) 발에 있든(백패스·트래핑) 골키퍼 전용 (FC 온라인 골키퍼 키, 2026-09-23 보강):
  //  D 펀트(드롭킥) · A 손 던지기(롱볼) · Z+A 드라이브 킥 · S 짧은 패스 · Z+S 드라이브 스로 · W 공 놓기 · Z 공 줍기 · E 팀 전진 · C 선수 부르기.
  // 방향키도 아무 키도 0.75 초 넘게 없으면 AI 가 알아서 배급한다
  if (hasBall && b.owner === c.idx && c.sk.isGK && st.phase === 'play') {
    const gkDx = dx !== 0 || dy !== 0 ? dx : team.dir
    const z = (held & BTN_Z) !== 0
    if (edge & BTN_D) gkPunt(st, c, dy * 30)
    else if (edge & BTN_A) doPass(st, c, 'lob', -1, gkDx, dy, 1, undefined, z ? { driven: true } : undefined)
    else if (edge & BTN_S) doPass(st, c, 'ground', pickPassTarget(st, c, gkDx, dy, false), gkDx, dy, z ? 0.8 : 0.3, undefined, z ? { driven: true } : undefined)
    else if ((edge & BTN_W) && c.holdT > 0) {
      // 공 놓기 — 발로 몰고 나간다. 남이 만지기 전에는 다시 손으로 못 잡는다
      c.holdT = 0
      c.dropped = true
      team.aimT = st.tick
    } else if ((edge & BTN_Z) && c.holdT === 0) {
      // 공 줍기 — 자기 박스 안 · 아군이 발로 준 공(백패스)·스로인이 아니고 · 내려놓은 공이 아니어야
      if (inOwnBox(c, team.dir) && !c.gotMate && !c.dropped) {
        c.holdT = 150
        c.vx *= 0.3
        c.vy *= 0.3
      } else {
        st.callText = !inOwnBox(c, team.dir) ? '박스 밖에서는 손을 못 씁니다' : c.dropped ? '내려놓은 공은 다시 못 잡습니다' : '백패스 — 손으로 못 잡습니다'
        st.callTick = st.tick
      }
    } else if (edge & BTN_E) team.pushUntil = st.tick + 300
    else if (edge & BTN_C) {
      // 선수 부르기 — 방향키 쪽(없으면 가장 가까운) 동료가 받으러 온다
      const q = stickOn ? pickByDirection(st, t, c.idx, dx, dy) : nearestToBall(st, t, -1)
      if (q >= 0 && q !== c.idx) st.players[q].callT = st.tick + 150
    } else if (c.holdT === 0 && st.tick - c.gotT > 30 && st.tick - team.aimT > 45) gkDistribute(st, c)
    team.holdPass = 0
    team.holdShoot = 0
    team.prevButtons = held
    return
  }

  if (hasBall && b.owner === c.idx && c.holdT === 0 && st.phase === 'play') {
    const m = held | prev
    // 녹온 — 전력질주(E) 중 Shift 톡 · E 두 번(퀵 녹온, 세 번째 E 는 위 "한 번 더"가 슈퍼 녹온으로 늘린다)
    if (((edge & BTN_PACE) && (held & BTN_E)) || ((edge & BTN_E) && team.eTaps === 2)) {
      knockOn(st, c, dx, dy, edge & BTN_PACE ? 3.5 : 5)
      setTap(team, TAP_KNOCK, st.tick, c.idx)
      team.holdPass = 0
      team.holdShoot = 0
      team.prevButtons = held
      return
    }
    // 힐투볼롤 — Shift+Q 를 누른 채 방향키를 앞으로 밀었다가 뒤로 (0.33 초 안). 공을 발바닥으로 끌며 돌아선다
    if ((held & BTN_PACE) && (held & BTN_Q)) {
      const l = len(team.inX, team.inY)
      if (l > 0) {
        const dot = (team.inX * cosA(c.facing) + team.inY * sinA(c.facing)) / l
        if (dot > 0.6) team.rollT = st.tick
        else if (dot < -0.6 && st.tick - team.rollT <= 20 && st.tick - c.skillT > 20) {
          c.facing = (c.facing + 512) & 1023
          c.vx *= -0.2
          c.vy *= -0.2
          c.skillT = st.tick + 18
          team.rollT = -1000
        }
      }
      team.prevButtons = held
      return
    }
    // S — 땅볼 패스(홀드 = 세기). Z+S 드라이브(박스 근처면 컷백) · C+S 플레어 · Q+S 침투 패스(찬 사람이 앞으로 뛴다)
    if (held & BTN_S) team.holdPass++
    else if (prev & BTN_S) {
      let target = pickPassTarget(st, c, dx, dy, false)
      if (m & BTN_Z) {
        const cb = cutbackTarget(st, c)
        if (cb >= 0) target = cb
      }
      const d = target >= 0 ? len(st.players[target].x - c.x, st.players[target].y - c.y) : 12
      doPass(st, c, 'ground', target, dx, dy, clamp(team.holdPass / 30, 0, 1), undefined, { driven: (m & BTN_Z) !== 0, flair: (m & BTN_C) !== 0 })
      if (m & BTN_Q) c.goUntil = st.tick + 120
      setTap(team, TAP_S, st.tick, c.idx, d)
      team.holdPass = 0
    }
    // W — 스루. Z+W 드라이브 · Q+W 로빙 스루 · Z+Q+W 낮게 깔리는 로빙 스루
    if ((edge & BTN_W) && b.owner === c.idx) {
      const q = (held & BTN_Q) !== 0
      const z = (held & BTN_Z) !== 0
      doPass(st, c, 'through', pickPassTarget(st, c, dx, dy, true), dx, dy, 0.5, undefined, { lofted: q, low: q && z, driven: z && !q })
      setTap(team, TAP_W, st.tick, c.idx)
    }
    // A — 로빙·크로스. Q+A 높게 · Z+A 낮고 빠르게 · C+A 플레어 · A+A 낮은 크로스(위 "한 번 더")
    if ((edge & BTN_A) && b.owner === c.idx) {
      const kind: PassKind = held & BTN_Q ? 'highcross' : 'lob'
      const target = pickPassTarget(st, c, dx, dy, false)
      const d = target >= 0 ? len(st.players[target].x - c.x, st.players[target].y - c.y) : 15
      doPass(st, c, kind, target, dx, dy, 0.5, undefined, { driven: (held & BTN_Z) !== 0, flair: (held & BTN_C) !== 0 })
      setTap(team, TAP_A, st.tick, c.idx, d)
    }
    // D — 슛(홀드 = 파워). Q+D 칩 · Z+D 감아차기 · C+D 플레어 · Z+C+D 페이크 · F+D 파워 슛 · D+D 드리븐(위 "한 번 더")
    if (held & BTN_D) {
      team.holdShoot++
      if ((edge & BTN_D) && (held & BTN_Z) && (held & BTN_C) && b.owner === c.idx) {
        fakeShot(st, c)
        team.fakeHold = true
      }
    } else if ((prev & BTN_D) && b.owner === c.idx) {
      if (team.fakeHold) team.fakeHold = false
      else {
        const power = clamp(team.holdShoot / 36, 0.15, 1)
        if (m & BTN_F) {
          team.powerT = st.tick
          team.powerHit = 0
          team.powerDx = dx
          team.powerDy = dy
          team.powerPow = power
          team.powerZ = (m & BTN_Z) !== 0
        } else {
          doShoot(st, c, dx, dy, power, (m & BTN_Q) !== 0, null, undefined, { finesse: (m & BTN_Z) !== 0, flair: (m & BTN_C) !== 0 })
          setTap(team, TAP_D, st.tick, c.idx)
        }
      }
      team.holdShoot = 0
    }
  } else {
    team.holdPass = 0
    team.holdShoot = 0
    team.fakeHold = false
    // 수비 키 (2026-09-10 개정 — "태클·압박이 공 잡은 선수를 향해 동작하게" · 2026-09-23 FC 온라인 보강):
    //  D 홀드 = 압박: 선수가 **공을 향해 스스로 달린다**(step 에서), 방향키는 옆으로 조금 튼다 · D 누른 순간 붙어 있으면 어깨 밀치기
    //  Space = 스탠딩 태클: 공 쪽으로 짧게 돌진하며 12틱 동안 뺏을 확률 ×3 · 누르고 있으면 당기고 버티기
    //  A = 슬라이딩: 방향키가 없으면 **공 쪽으로** 눕는다 · 슬라이딩 뒤 A 한 번 더 = 빨리 일어나기
    //  W = 골키퍼 돌진: 1.5초 동안 우리 GK 가 볼 소유자에게 나간다
    //  C 홀드 = 견제: 느리게 마주 보고, 들이받는 드리블을 잘 뺏는다 (contestBall) · C+E 달리며 견제 · C+방향키(상대 쪽) 붙어서 다투기
    const owner = b.owner >= 0 ? st.players[b.owner] : null
    const opp = owner !== null && owner.team !== t ? owner : null
    c.press = (held & BTN_D) !== 0
    // 잡고 있던 선수에서 조작이 넘어가면 손을 놓는다
    for (let k = team.start; k < team.start + 11; k++) st.players[k].pull = false
    c.pull = (held & BTN_SPACE) !== 0 && opp !== null
    if ((edge & BTN_A) && c.slid && (c.action === ACT_SLIDE || c.action === ACT_FALLEN)) {
      if (c.action === ACT_FALLEN) c.actT = Math.min(c.actT, 3)
      else c.quickUp = true
    } else if ((edge & BTN_A) && c.action === ACT_RUN) {
      c.action = ACT_SLIDE
      c.actT = 30
      c.slid = true
      // 방향키를 **지금** 누르고 있으면 그쪽, 아니면 공 쪽 — 움직이는 공은 미끄러져 닿을 때의 자리로 앞질러 겨눈다.
      // (2026-09-23 조작 연습 시범에서 드러남: 대각선으로 몰고 오는 공의 "지금 자리"로 누우면 공은 비켜 가고 발이 사람에 걸렸다.
      //  또 방향키를 뗀 지 0.25 초 안이면 패스용 기억 방향으로 누웠다 — 슬라이딩은 지금 누른 키만 본다)
      if (team.inX !== 0 || team.inY !== 0) c.facing = atan2A(team.inY, team.inX)
      else {
        const t = clamp(len(b.x - c.x, b.y - c.y) / (1.3 * c.sk.vmax), 0, 0.5)
        c.facing = atan2A(b.y + b.vy * t - c.y, b.x + b.vx * t - c.x)
      }
    }
    if (edge & BTN_SPACE) c.tackleT = 12
    if (edge & BTN_W) team.gkRush = st.tick + 90
    if ((edge & BTN_D) && b.owner < 0 && c.x * team.dir < -20) c.clearNext = true
    if (opp && st.phase === 'play' && c.action === ACT_RUN && opp.holdT === 0) {
      const d = len(opp.x - c.x, opp.y - c.y)
      if ((edge & BTN_D) && d < 1.3 && !c.sk.isGK) shoulderBarge(st, c, opp)
      // C+방향키(공 가진 상대 쪽) — 견제하다 붙어서 다툰다 (견제 보너스 ×1.5 가 붙은 도전)
      if (team.jockey && d < 2 && d > 0 && stickOn) {
        const l = len(team.inX, team.inY)
        if (((opp.x - c.x) * team.inX + (opp.y - c.y) * team.inY) / (d * l) > 0.7) c.press = true
      }
    }
  }
  team.prevButtons = held
}

/** 유니폼을 잡혔나 — Space 를 누르고 있는 상대가 옆·뒤 1.15 m 안 */
function pulledNow(st: GameState, o: Player): boolean {
  for (const q of st.players) {
    if (!q.pull || q.team === o.team || q.sentOff) continue
    if (len(q.x - o.x, q.y - o.y) < 1.15) return true
  }
  return false
}

/** 한 틱 */
export function step(st: GameState, inputs: [Input, Input]): void {
  if (st.done) return
  tickPhase(st)
  handleInput(st, 0, inputs[0])
  handleInput(st, 1, inputs[1])
  updateAnchors(st)
  const b = st.ball
  // 체력 배율 — 하프 길이에 맞춰 종료 무렵 바닥나게 (하프 180 초 → 0.5)
  const staK = 90 / st.halfSec

  // 1) 결정 — AI 선수(사람 조작 선수 제외)가 목표를 정한다. **두 팀이 거울처럼 같아야** 한다 (2026-09-16, HANDOVER 0-e —
  //    같은 스쿼드 대칭 2,000판에서 팀 0 승률 47%·골 −0.14. 진영(dir)·킥오프 팀을 바꿔도 그대로였고 팀 번호에만 붙어 있었다).
  //    세 가지를 지킨다 (`tools/asymprobe.ts` 로 2,000판씩 잰 결과 셋 다 있어야 50.5%·골 ±0.01 이 된다):
  //    ① 결정은 이동보다 **먼저**, 22명 전원이 이 틱이 시작될 때의 자리를 본다 — 예전엔 이동 루프 안에서 정해서 팀 1(11~21번)이
  //       늘 팀 0 의 이 틱 이동을 본 뒤 정했다(한 틱 앞선 정보).
  //    ② 순서는 **공을 가진 팀부터**(없으면 팀 0) — 소유자가 여기서 공을 차면 같은 틱에 정하는 **상대 팀**이 그것을 본다. 팀 0 이
  //       늘 먼저면 팀 1 의 패스만 한 틱 늦게 들키고 팀 0 의 패스는 바로 들킨다.
  //    ③ 결정 주기(15틱)는 **자리 번호**(idx % 11)로 어긋나게 — 팀 번호(idx)로 어긋나면 마주 보는 두 선수(팀 0 의 k 번과 팀 1 의 k 번)의
  //       반응 시차가 팀마다 달라진다(11 ≢ 0 mod 15).
  //    순회는 여전히 결정론(4.12-5)이고 난수 순서도 상태에서만 정해진다.
  const first = ballOwnerTeam(st) === 1 ? 1 : 0
  for (let k = 0; k < st.players.length; k++) {
    const p = st.players[k < 11 ? first * 11 + k : (1 - first) * 11 + (k - 11)]
    if (p.sentOff || (st.tick + (p.idx % 11)) % DECIDE_TICKS !== 0) continue
    // 슬라이딩·넘어짐·다이브 중엔 정하지 않는다 (이동 루프가 그 상태를 먼저 처리하던 것과 같다)
    if (p.action === ACT_SLIDE || p.action === ACT_FALLEN || p.action === ACT_DIVE) continue
    const team = st.teams[p.team]
    const ctl = team.human && team.controlled === p.idx && st.phase !== 'goal'
    const isKicker = st.restart !== null && st.restart.kicker === p.idx
    if (ctl && !isKicker) continue
    aiDecide(st, p)
  }

  // 2) 이동 — 정해 둔 목표(p.tx/ty)나 사람 입력으로 한 틱 움직인다
  for (const p of st.players) {
    if (p.sentOff) continue
    const team = st.teams[p.team]
    // 세레모니 중엔 사람 선수도 AI 처럼 모인다 (방향키로 끌고 다니면 그림이 깨진다)
    const ctl = team.human && team.controlled === p.idx && st.phase !== 'goal'
    if (p.action === ACT_SLIDE) {
      p.vx = cosA(p.facing) * p.sk.vmax * 1.3
      p.vy = sinA(p.facing) * p.sk.vmax * 1.3
      p.x += p.vx * DT
      p.y += p.vy * DT
      if (--p.actT <= 0) {
        // 슬라이딩 뒤 넘어져 있는 시간 — A 를 한 번 더 눌렀으면 빨리 일어난다 (FC 온라인 · 2026-09-23)
        p.action = ACT_FALLEN
        p.actT = p.quickUp ? 3 : 15
        p.quickUp = false
      }
      continue
    }
    if (p.action === ACT_FALLEN || p.action === ACT_DIVE) {
      // 다이브는 앞 12틱은 날아가고(속도 유지) 그 뒤에 미끄러진다 — 골키퍼가 공 경로까지 실제로 가야 잡는다
      const flying = p.action === ACT_DIVE && p.actT > 12
      if (!flying) {
        p.vx *= 0.8
        p.vy *= 0.8
      }
      p.x += p.vx * DT
      p.y += p.vy * DT
      if (--p.actT <= 0) {
        // 다이브가 끝나면 **일어나는 시간**(0.5 초)이 든다 — 공을 잡았으면 바로 일어난다.
        // 예전엔 곧바로 다시 몸을 날릴 수 있어 좌우 순간이동처럼 보였다 (사용자 제보 2026-09-11)
        if (p.action === ACT_DIVE && p.holdT === 0) {
          p.action = ACT_FALLEN
          p.actT = 30
        } else {
          p.action = ACT_RUN
          p.slid = false
        }
      }
      continue
    }
    if ((p.action === ACT_KICK || p.action === ACT_HEAD) && --p.actT <= 0) p.action = ACT_RUN
    if (p.tackleT > 0) p.tackleT--

    let dvx: number
    let dvy: number
    let sprint: boolean
    let speedK = 1
    const isKicker = st.restart !== null && st.restart.kicker === p.idx
    let faceBall = false
    if (ctl && !isKicker) {
      dvx = team.inX * p.sk.vmax
      dvy = team.inY * p.sk.vmax
      sprint = team.sprint
      if (team.slow && b.owner === p.idx) speedK *= 0.45
      if (b.owner < 0 && b.passLive && b.passTo === p.idx && b.lastTeam === p.team) {
        // 나에게 오는 패스 — 잡기 전까지는 공 쪽으로 스스로 달린다. 방향키는 35% 만 섞여 살짝 트는 정도.
        // 상대가 먼저 길을 막으면 tryControl 이 그쪽에 준다 (가로채기는 그대로 산다)
        interceptPoint(st, p, RECV_TMP)
        const ddx = RECV_TMP.x - p.x
        const ddy = RECV_TMP.y - p.y
        const d = len(ddx, ddy)
        if (d > 0.3) {
          dvx = (ddx / d) * p.sk.vmax + dvx * 0.35
          dvy = (ddy / d) * p.sk.vmax + dvy * 0.35
          sprint = sprint || d > 5
        }
      } else if (b.owner !== p.idx && (p.press || p.tackleT > 0)) {
        // 압박(D)·태클(Space): 공을 향해 스스로 달린다 — 소유자가 있으면 **그 선수의 0.35 초 뒤 자리**, 자유 공이면 공의 0.25 초 뒤.
        // 방향키는 25% 만 섞는다(예전 45% 는 반대로 누르면 거의 안 갔다) · 압박 중엔 저절로 전력질주다 — 체력은 든다 (제보 2026-09-11)
        let tx: number
        let ty: number
        if (b.owner >= 0) {
          const o = st.players[b.owner]
          tx = o.x + o.vx * 0.35
          ty = o.y + o.vy * 0.35
        } else {
          tx = b.x + b.vx * 0.25
          ty = b.y + b.vy * 0.25
        }
        const ddx = tx - p.x
        const ddy = ty - p.y
        const d = len(ddx, ddy)
        if (d > 0.05) {
          const k = p.tackleT > 0 ? 1.15 : 1.0
          dvx = (ddx / d) * p.sk.vmax * k + dvx * 0.25
          dvy = (ddy / d) * p.sk.vmax * k + dvy * 0.25
          if (d > 2) sprint = true
        }
      }
      if (team.jockey && b.owner !== p.idx) {
        // C+E 달리며 견제 — 마주 본 채 거의 제 속도로 (FC 온라인 · 2026-09-23)
        speedK *= team.sprint ? 0.92 : 0.7
        faceBall = true
      }
      // 파워 슛 준비(F+D) 중엔 디딤발을 딛느라 느리다
      if (team.powerT >= 0 && b.owner === p.idx) speedK *= 0.35
    } else {
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
    if (b.owner === p.idx) {
      speedK *= 0.8 + 0.15 * p.sk.drib
      // 공을 몰고 뛰는 속도는 **상한**이 있다 (드리블 6.6~7.5 m/s) — 실제 축구에서도 공을 갖고는
      // 아무리 빨라도 전력 질주 속도가 안 나온다. 속도는 공 없는 침투·복귀에서 값을 한다 (2026-09-11)
      const cap = 6.4 + 0.9 * p.sk.drib
      if (p.sk.vmax * speedK > cap) speedK = cap / p.sk.vmax
    }
    // 체력 — 절반 아래로 떨어지면 그만큼 느려진다 (0 이면 78%). 빠른 선수도 뛰기만 하면 지친다 (2026-09-11)
    if (p.stamina < 0.5) speedK *= 0.78 + 0.44 * p.stamina
    if (p.action === ACT_KICK) speedK *= 0.5
    if (p.action === ACT_HEAD) speedK *= 0.3 // 점프 중
    if (p.holdT > 0) speedK *= 0.3
    // 사람 조작 동작 (2026-09-23 — 봇만 있는 경기에서는 셋 다 일어나지 않는다):
    //  페이크 슛에 속은 선수는 발이 묶이고 · 유니폼을 잡힌 소유자는 느려지고 · 잡은 쪽도 조금 느리다
    if (p.bitT > st.tick) speedK *= 0.2
    if (p.pull) speedK *= 0.92
    if (b.owner === p.idx && pulledNow(st, p)) speedK *= 0.85
    movePlayer(p, dvx, dvy, speedK)
    // 공을 본다 (2026-09-15 제보 "골키퍼가 공 쪽을 안 본다"): 거의 서 있는 선수는 공 쪽으로 몸을 돌리고,
    // 골키퍼는 움직이면서도 늘 공을 본다. 공을 가진 선수·킥 중·리스타트 킥커는 제외(찰 방향을 본다)
    if (b.owner !== p.idx && p.action === ACT_RUN && !isKicker && (p.sk.isGK || len(p.vx, p.vy) < 0.9)) {
      const want = atan2A(b.y - p.y, b.x - p.x)
      const dfa = angleDiff(want, p.facing)
      const maxT = p.sk.isGK ? p.sk.turn : p.sk.turn * 0.9
      p.facing = (p.facing + clamp(dfa, -maxT, maxT)) & 1023
    }
    // 견제 — 공(소유자)을 마주 본다
    if (faceBall) p.facing = atan2A(b.y - p.y, b.x - p.x)
    drainStamina(p, sprint && speedK > 1, staK)
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
      // play 에서만 — 하프타임·세트피스 대기 중에 골키퍼가 든 공에 압박 선수가 붙어 있으면 GK 차징 파울이 틱마다 '통계만' 올랐다 (재검증 2026-09-15: 한 판 94회)
      if (st.phase === 'play') contestBall(st, o)
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
  mix(b.restartBy); mix(b.fromThrow ? 1 : 0); mix(q(b.curl)); mix(q(b.dip))
  for (const p of st.players) {
    mix(q(p.x)); mix(q(p.y)); mix(q(p.vx)); mix(q(p.vy)); mix(p.facing); mix(q(p.stamina)); mix(p.action); mix(p.actT); mix(p.holdT)
    mix(p.yellow); mix(p.sentOff ? 1 : 0); mix(p.offside ? 1 : 0); mix(p.spec.id)
  }
  for (const t of st.teams) {
    mix(t.subsLeft)
    mix(t.subWindows)
    mix(t.pendingSubs.length)
    mix(t.gkRush)
    mix(t.preset)
    mix(t.balance)
    mix(t.tac)
    mix(t.powerT)
  }
  mix(q(st.stoppage))
  mix(st.added)
  mix(st.rng.s)
  mix(st.botRng.s)
  return h >>> 0
}

/** 깊은 복사 — 리싱크 스냅샷 */
export function snapshot(st: GameState): GameState {
  return JSON.parse(JSON.stringify(st)) as GameState
}

/** 경기 시계 표시용 분 (0~90). 추가시간은 45·90 에서 멈추고 `addedMinute` 가 따로 센다 */
export function matchMinute(st: GameState): number {
  const perHalf = 45
  const m = Math.min(perHalf, (st.clock / st.halfSec) * perHalf)
  return st.half === 1 ? m : perHalf + m
}

/** 추가시간에 들어갔으면 몇 분째인가 (1~), 아니면 0 */
export function addedMinute(st: GameState): number {
  if (st.clock < st.halfSec) return 0
  return Math.floor(((st.clock - st.halfSec) / st.halfSec) * 45) + 1
}
