// 경기 규칙 — 시계·하프·킥오프·골·아웃(스로인·골킥·코너)·프리킥·PK·카드·교체 (DESIGN 2장 · 4.9).
//
// 세트피스 위치 규칙(2026-09-09 사용자 지적)을 여기서 강제한다:
//  · 킥오프 — 전원 자기 진영, 상대는 센터 서클(9.15 m) 밖
//  · 프리킥·코너 — 상대는 9.15 m 밖 · 스로인 — 2 m 밖 · 골킥 — 상대는 박스 밖
//  · PK — 킥커와 두 GK 말고는 박스 밖 + 스팟에서 9.15 m 밖 + 공보다 뒤
// 위치를 매 틱 밀어내므로 사람이 조작해도 규칙을 어길 수 없다.

import { atan2A, clamp, len } from './fixedmath'
import { anchorOf, type Band } from './formation'
import { rand } from './rng'
import { clearOffside, dist, doPass, doShoot, doThrow, gkPunt, nearestOppDist, pickPassTarget } from './ball'
import { crossedGoalLine } from './physics'
import { skillsOf } from './skills'
import {
  ACT_RUN, BALL_R, BOX_HALF_W, BOX_L, CIRCLE_R, DT, FOUL_TICKS, GOAL_TICKS, HALFTIME_TICKS, HALF_L, HALF_W,
  KICKOFF_TICKS, PENALTY_TICKS, PEN_SPOT, RESTART_TICKS, THROWIN_CLEAR,
  goalX, ownGoalX, type GameState, type PendingCall, type Phase, type Player, type Team,
} from './state'

const tmp = { x: 0, y: 0 }

function resetBall(st: GameState, x: number, y: number): void {
  const b = st.ball
  b.x = x
  b.y = y
  b.z = 0
  b.vx = 0
  b.vy = 0
  b.vz = 0
  b.owner = -1
  b.passTo = -1
  b.shotBy = -1
  b.onTarget = false
  b.fromThrow = false
  b.restartBy = -1
  b.passLive = false
}

/** 킥커를 그 자리에 세우고 공을 준다 */
function placeKicker(st: GameState, kicker: number, x: number, y: number, faceX: number, faceY: number): void {
  const k = st.players[kicker]
  k.x = x
  k.y = y
  k.vx = 0
  k.vy = 0
  k.facing = atan2A(faceY - y, faceX - x)
  k.action = ACT_RUN
  k.actT = 0
  k.holdT = 0
  k.tackleT = 0
  k.press = false
  k.clearNext = false
  k.tx = x
  k.ty = y
  st.ball.owner = kicker
  st.ball.lastTouch = kicker
  st.ball.lastTeam = k.team
  k.gotT = st.tick
}

/** 팀에서 (x,y) 에 가장 가까운 필드 선수 (동률은 idx) */
function nearestField(st: GameState, teamIdx: number, x: number, y: number): number {
  let best = -1
  let bd = 9999
  for (const p of st.players) {
    if (p.team !== teamIdx || p.sk.isGK || p.sentOff) continue
    const d = dist(p.x, p.y, x, y)
    if (d < bd) {
      bd = d
      best = p.idx
    }
  }
  // 전원 퇴장이라는 건 없지만, GK 밖에 안 남으면 GK 가 찬다
  return best >= 0 ? best : st.teams[teamIdx].gk
}

/** 킥오프 — 22명을 자기 진영 자리로 옮기고 team 의 공격수가 센터에서 공을 든다 */
export function setupKickoff(st: GameState, team: number): void {
  st.phase = 'kickoff'
  st.phaseT = KICKOFF_TICKS
  st.kickoffTeam = team
  resetBall(st, 0, 0)
  clearOffside(st)
  for (const p of st.players) {
    const t = st.teams[p.team]
    anchorOf(p.slot, p.band as Band, t.dir, t.sliders, 0, 0, p.team === team, tmp)
    let x = tmp.x
    // 자기 진영 안 (하프라인을 넘지 않는다)
    if (x * t.dir > -1) x = -t.dir * 1
    p.x = x
    p.y = tmp.y
    // 공을 차지 않는 팀은 센터 서클 밖 (사용자 지적 1)
    if (p.team !== team) pushOutOfCircle(p, 0, 0, CIRCLE_R + 0.3)
    p.vx = 0
    p.vy = 0
    p.facing = t.dir > 0 ? 0 : 512
    p.action = ACT_RUN
    p.actT = 0
    p.holdT = 0
    p.tackleT = 0
    p.press = false
    p.sprint = false
    p.clearNext = false
    p.throwing = false
    p.tx = p.x
    p.ty = p.y
  }
  // 킥커: team 의 FW 중 센터에 가장 가까운 선수. 나머지 아군도 서클 밖
  let kicker = -1
  let kd = 999
  for (const p of st.players) {
    if (p.team !== team || p.sk.isGK || p.sentOff) continue
    const d = dist(p.x, p.y, 0, 0) - (p.band === 'FW' ? 20 : 0)
    if (d < kd) {
      kd = d
      kicker = p.idx
    }
  }
  for (const p of st.players) {
    if (p.team !== team || p.idx === kicker) continue
    pushOutOfCircle(p, 0, 0, CIRCLE_R + 0.3)
    p.tx = p.x
    p.ty = p.y
  }
  const dir = st.teams[team].dir
  placeKicker(st, kicker, -dir * 0.6, 0, dir * 10, 0)
  st.restart = { team, kicker, x: 0, y: 0, hands: false, noOffside: false }
  st.events.push({ tick: st.tick, type: 'kickoff', team, player: kicker, x: 0, y: 0 })
}

/** 원 밖으로 밀어낸다 (자기 진영은 유지) */
function pushOutOfCircle(p: Player, cx: number, cy: number, r: number): void {
  const dx = p.x - cx
  const dy = p.y - cy
  const d = len(dx, dy)
  if (d >= r) return
  if (d < 0.001) {
    p.x = cx - r
    return
  }
  p.x = clamp(cx + (dx / d) * r, -HALF_L + 1, HALF_L - 1)
  p.y = clamp(cy + (dy / d) * r, -HALF_W + 1, HALF_W - 1)
}

/** 스로인·코너·골킥 — 킥커를 그 자리에 세우고 공을 준다 */
export function setupRestart(st: GameState, type: 'throwin' | 'corner' | 'goalkick', team: number, x: number, y: number): void {
  // 넣어 둔 교체는 **아무 데드볼에서나** 들어간다 (DESIGN 2장). 골·하프타임만 보다가 놓쳤다 (2026-09-09)
  applyPendingSubs(st)
  st.phase = type
  st.phaseT = RESTART_TICKS
  resetBall(st, x, y)
  clearOffside(st)
  let kicker: number
  if (type === 'goalkick') kicker = st.teams[team].gk
  else kicker = nearestField(st, team, x, y)
  placeKicker(st, kicker, x, y, 0, 0)
  if (type === 'throwin') {
    st.players[kicker].throwing = true
    // 던지는 사람은 라인 밖에 선다
    st.players[kicker].y = y
  }
  st.restart = { team, kicker, x, y, hands: type === 'throwin', noOffside: true }
  st.events.push({ tick: st.tick, type, team, player: kicker, x, y })
  if (type === 'corner') st.stats[team].corners++
}

/** 프리킥 — 반칙 자리에서. 자기 진영 깊은 곳이면 GK 가 찬다 */
export function setupFreeKick(st: GameState, team: number, x: number, y: number): void {
  applyPendingSubs(st)
  st.phase = 'freekick'
  st.phaseT = FOUL_TICKS
  const px = clamp(x, -HALF_L + 2, HALF_L - 2)
  const py = clamp(y, -HALF_W + 1.5, HALF_W - 1.5)
  resetBall(st, px, py)
  clearOffside(st)
  const dir = st.teams[team].dir
  const deep = px * dir < -30
  const kicker = deep ? st.teams[team].gk : nearestField(st, team, px, py)
  placeKicker(st, kicker, px - dir * 1.2, py, goalX(st.teams[team]), 0)
  st.restart = { team, kicker, x: px, y: py, hands: false, noOffside: false }
  st.events.push({ tick: st.tick, type: 'freekick', team, player: kicker, x: px, y: py })
}

/** PK — 킥커는 페널티 스팟, 상대 GK 는 골라인, 나머지는 박스·아크 밖 */
export function setupPenalty(st: GameState, team: number): void {
  st.phase = 'penalty'
  st.phaseT = PENALTY_TICKS
  const t = st.teams[team]
  const dir = t.dir
  const spotX = dir * (HALF_L - PEN_SPOT)
  resetBall(st, spotX, 0)
  clearOffside(st)
  // 킥커: pen 이 가장 높은 필드 선수
  let kicker = -1
  let bestPen = -1
  for (const p of st.players) {
    if (p.team !== team || p.sk.isGK || p.sentOff) continue
    if (p.sk.pen > bestPen) {
      bestPen = p.sk.pen
      kicker = p.idx
    }
  }
  if (kicker < 0) kicker = t.gk
  const oppGkIdx = st.teams[1 - team].gk
  for (const p of st.players) {
    if (p.idx === kicker) continue
    if (p.idx === oppGkIdx && !p.sentOff) {
      // 골라인 위 가운데
      p.x = dir * (HALF_L - 0.35)
      p.y = 0
      p.facing = dir > 0 ? 0 : 512
    } else {
      // 박스 밖 · 스팟에서 9.15 m 밖 · 공보다 뒤
      if (Math.abs(p.x - dir * HALF_L) < BOX_L + 1 && Math.abs(p.y) < BOX_HALF_W) {
        p.x = dir * (HALF_L - BOX_L - 1.5)
      }
      if ((p.x - spotX) * dir > 0) p.x = spotX - dir * 1.5
      pushOutOfCircle(p, spotX, 0, CIRCLE_R + 0.5)
    }
    p.vx = 0
    p.vy = 0
    p.action = ACT_RUN
    p.actT = 0
    p.holdT = 0
    p.tackleT = 0
    p.press = false
    p.throwing = false
    p.tx = p.x
    p.ty = p.y
  }
  placeKicker(st, kicker, spotX - dir * 2.2, 0, dir * HALF_L, 0)
  st.restart = { team, kicker, x: spotX, y: 0, hands: false, noOffside: true }
  st.events.push({ tick: st.tick, type: 'penalty', team, player: kicker, x: spotX, y: 0 })
}

// ---------------------------------------------------------------- 반칙 처리

const CALL_TEXT: Record<PendingCall['kind'], string> = {
  offside: '오프사이드',
  foul: '파울',
  gkcharge: '골키퍼 차징 — 파울',
  twice: '두 번 터치 — 상대 프리킥',
}

/** ball.ts 가 적어 둔 반칙을 세트피스로 바꾼다. sim 이 틱 끝에서 부른다 */
export function resolvePending(st: GameState): void {
  const c = st.pending
  st.pending = null
  if (!c || st.phase === 'end' || st.phase === 'halftime') return
  const offender = c.by >= 0 ? st.players[c.by] : null
  let text = CALL_TEXT[c.kind]
  if (c.kind !== 'offside' && c.kind !== 'twice' && offender) {
    st.events.push({ tick: st.tick, type: 'foul', team: 1 - c.team, player: offender.idx, x: c.x, y: c.y })
    if (c.card > 0) {
      let card = c.card
      if (card === 1) {
        offender.yellow++
        if (offender.yellow >= 2) card = 2
      }
      if (card === 2) {
        offender.sentOff = true
        st.stats[offender.team].reds++
        // 피치 밖으로 (터치라인 뒤)
        offender.x = clamp(offender.x, -HALF_L + 2, HALF_L - 2)
        offender.y = (offender.y >= 0 ? 1 : -1) * (HALF_W + 3)
        offender.vx = 0
        offender.vy = 0
        offender.press = false
        text = `퇴장! ${offender.spec.name}`
      } else {
        st.stats[offender.team].yellows++
        text = `경고 ${offender.spec.name}`
      }
      st.events.push({ tick: st.tick, type: 'card', team: offender.team, player: offender.idx, x: c.x, y: c.y, n: card })
    }
  } else if (c.kind === 'offside') {
    st.events.push({ tick: st.tick, type: 'offside', team: 1 - c.team, player: c.by, x: c.x, y: c.y })
  }
  st.callText = text
  if (c.penalty) setupPenalty(st, c.team)
  else setupFreeKick(st, c.team, c.x, c.y)
}

// ---------------------------------------------------------------- 세트피스 위치 강제

/** 재개를 기다리는 동안 상대(그리고 킥오프에서는 아군도)를 규정 거리 밖으로 민다. 매 틱 */
export function enforceRestartPositions(st: GameState): void {
  const r = st.restart
  if (!r) return
  const b = st.ball
  const ph = st.phase
  if (ph === 'kickoff') {
    for (const p of st.players) {
      const dir = st.teams[p.team].dir
      if (p.idx !== r.kicker && p.x * dir > -0.4) {
        p.x = -dir * 0.4
        if (p.vx * dir > 0) p.vx = 0
      }
      if (p.idx !== r.kicker) pushOutOfCircle(p, 0, 0, CIRCLE_R + 0.2)
    }
    return
  }
  if (ph === 'penalty') {
    const dir = st.teams[r.team].dir
    const oppGkIdx = st.teams[1 - r.team].gk
    for (const p of st.players) {
      if (p.idx === r.kicker || p.idx === oppGkIdx) continue
      if ((p.x - r.x) * dir > -0.3) {
        p.x = r.x - dir * 0.3
        if (p.vx * dir > 0) p.vx = 0
      }
      pushOutOfCircle(p, r.x, r.y, CIRCLE_R + 0.2)
      if (Math.abs(p.x - dir * HALF_L) < BOX_L && Math.abs(p.y) < BOX_HALF_W) p.x = dir * (HALF_L - BOX_L - 0.5)
    }
    return
  }
  const clear = ph === 'throwin' ? THROWIN_CLEAR : CIRCLE_R
  for (const p of st.players) {
    if (p.team === r.team || p.sentOff) continue
    if (ph === 'goalkick') {
      // 상대는 박스 밖
      const def = st.teams[r.team]
      if (Math.abs(p.x - ownGoalX(def)) < BOX_L && Math.abs(p.y) < BOX_HALF_W) {
        p.x = ownGoalX(def) + def.dir * (BOX_L + 0.4)
      }
      continue
    }
    const d = dist(p.x, p.y, b.x, b.y)
    if (d < clear) pushOutOfCircle(p, b.x, b.y, clear)
  }
}

// ---------------------------------------------------------------- 재개 킥

/** 사람 킥커의 리스타트 킥 — 누른 키와 방향키 (DESIGN 3.1 세트피스) */
export interface RestartAim {
  /** S 그라운드 · W 스루 · A 로빙/크로스 · D 슛(또는 길게) */
  kind: 'S' | 'W' | 'A' | 'D'
  dx: number
  dy: number
  /** D 홀드 파워 0~1 (PK 높이 · 슛 파워) */
  power: number
}

/**
 * 리스타트 킥. aim 이 있고 방향키가 눌려 있으면 사람이 고른 대로, 아니면 AI 가 고른다.
 * 스로인은 **손으로 던진다**(킥 금지). 골킥에서 D 는 슛이 아니라 **길게 차기**다.
 */
export function performRestartKick(st: GameState, aim: RestartAim | null = null): void {
  const r = st.restart
  if (!r) return
  const k = st.players[r.kicker]
  const team = st.teams[r.team]
  const dir = team.dir
  const phase = st.phase
  st.restart = null
  st.phase = 'play'
  k.throwing = false
  if (st.ball.owner !== r.kicker) return

  // ---- 스로인: 손 (사용자 지적 4) ----
  if (phase === 'throwin') {
    let target = -1
    if (aim && (aim.dx !== 0 || aim.dy !== 0)) {
      target = pickPassTarget(st, k, aim.dx, aim.dy, false)
      doThrow(st, k, target, aim.dx, aim.dy, aim.kind === 'A' ? 1 : 0.45)
    } else {
      let ts = -99
      for (const q of st.players) {
        if (q.team !== r.team || q.idx === k.idx || q.sk.isGK || q.sentOff) continue
        const d = dist(k.x, k.y, q.x, q.y)
        if (d > 22 || d < 2) continue
        const s = Math.min(8, nearestOppDist(st, q)) - d * 0.15
        if (s > ts) {
          ts = s
          target = q.idx
        }
      }
      doThrow(st, k, target, -Math.sign(k.x) || dir, -Math.sign(k.y), 0.4)
    }
    clearOffside(st)
    return
  }

  // ---- PK ----
  if (phase === 'penalty') {
    const side = aim && aim.dx !== 0 ? Math.sign(aim.dy || 0) || (rand(st.rng) < 0.5 ? -1 : 1) : rand(st.rng) < 0.5 ? -1 : 1
    const power = aim ? clamp(0.55 + aim.power * 0.45, 0.55, 1) : 0.75 + rand(st.rng) * 0.2
    const aimSide = aim && (aim.dx !== 0 || aim.dy !== 0) ? clamp(aim.dy, -1, 1) || side : side
    doShoot(st, k, 0, 0, power, false, aimSide)
    st.ball.restartBy = k.idx
    clearOffside(st)
    return
  }

  const noOff = r.noOffside
  // ---- 사람이 고른 킥 ----
  if (aim && (aim.dx !== 0 || aim.dy !== 0)) {
    const { dx, dy } = aim
    if (aim.kind === 'D') {
      if (phase === 'goalkick') gkPunt(st, k, dy * 30)
      else if (phase === 'freekick') doShoot(st, k, dx, dy, clamp(0.6 + aim.power * 0.4, 0.6, 1), false, null)
      else doPass(st, k, 'lob', -1, dx, dy, 1)
    } else if (aim.kind === 'W') doPass(st, k, 'through', pickPassTarget(st, k, dx, dy, true), dx, dy, 0.5)
    else if (aim.kind === 'A') doPass(st, k, phase === 'corner' ? 'highcross' : 'lob', pickPassTarget(st, k, dx, dy, false), dx, dy, 0.6)
    else doPass(st, k, 'ground', pickPassTarget(st, k, dx, dy, false), dx, dy, 0.3)
    st.ball.restartBy = k.idx
    if (noOff) clearOffside(st)
    return
  }

  // ---- AI ----
  if (phase === 'kickoff') {
    let target = -1
    let td = 999
    for (const q of st.players) {
      if (q.team !== r.team || q.idx === k.idx || q.sk.isGK || q.sentOff) continue
      const d = dist(k.x, k.y, q.x, q.y) + ((q.x - k.x) * dir > 0.5 ? 10 : 0)
      if (d < td) {
        td = d
        target = q.idx
      }
    }
    doPass(st, k, 'ground', target, -dir, 0, 0.2)
  } else if (phase === 'corner') {
    const gx = goalX(team)
    doPass(st, k, 'highcross', -1, dir, 0, 1, { x: gx - dir * (8 + rand(st.rng) * 4), y: (rand(st.rng) - 0.5) * 10 })
  } else if (phase === 'freekick') {
    const gx = goalX(team)
    const dG = dist(k.x, k.y, gx, 0)
    if (dG < 28 && Math.abs(k.y) < 22) {
      doShoot(st, k, 0, 0, 0.85, false, rand(st.rng) < 0.5 ? -1 : 1)
    } else {
      let target = -1
      let ts = -99
      for (const q of st.players) {
        if (q.team !== r.team || q.idx === k.idx || q.sentOff) continue
        const d = dist(k.x, k.y, q.x, q.y)
        if (d > 40 || d < 4) continue
        const s = Math.min(8, nearestOppDist(st, q)) + ((q.x - k.x) * dir) * 0.15
        if (s > ts) {
          ts = s
          target = q.idx
        }
      }
      if (target >= 0) doPass(st, k, 'ground', target, dir, 0, 0.35)
      else doPass(st, k, 'lob', -1, dir, 0, 1, { x: clamp(k.x + dir * 38, -HALF_L + 5, HALF_L - 5), y: (rand(st.rng) - 0.5) * 24 })
    }
  } else {
    // 골킥 — 열린 수비수에게 짧게, 없으면 길게 (사용자 지적 3)
    let target = -1
    for (const q of st.players) {
      if (q.team !== r.team || q.sk.isGK || q.sentOff) continue
      const d = dist(k.x, k.y, q.x, q.y)
      if (d > 30 || d < 5) continue
      if (nearestOppDist(st, q) > 8) {
        target = q.idx
        break
      }
    }
    if (target >= 0) doPass(st, k, 'ground', target, dir, 0, 0.3)
    else gkPunt(st, k, (rand(st.rng) - 0.5) * 34)
  }
  st.ball.restartBy = k.idx
  if (noOff) clearOffside(st)
}

// ---------------------------------------------------------------- 교체

/** 넣어 둔 교체 명령을 적용한다 (데드볼에서만). 등번호가 바뀌므로 렌더가 리그를 다시 만든다 */
export function applyPendingSubs(st: GameState): void {
  for (let t = 0; t < 2; t++) {
    const team = st.teams[t]
    const s = team.pendingSub
    if (!s) continue
    team.pendingSub = null
    if (team.subsLeft <= 0) continue
    if (s.in < 0 || s.in >= team.bench.length) continue
    const idx = team.start + s.out
    if (s.out < 0 || s.out > 10) continue
    const p = st.players[idx]
    if (p.sentOff) continue
    const spec = team.bench[s.in]
    if (!spec) continue
    // 등번호 슬롯은 그대로 두고 "누가 입고 뛰는가"만 바꾼다
    team.bench.splice(s.in, 1)
    p.spec = spec
    p.sk = skillsOf(spec, p.slot, p.band as Band)
    p.stamina = 1
    p.yellow = 0
    p.subbedIn = true
    p.action = ACT_RUN
    p.actT = 0
    p.holdT = 0
    p.tackleT = 0
    team.subsLeft--
    st.events.push({ tick: st.tick, type: 'sub', team: t, player: idx, x: p.x, y: p.y, n: s.in })
  }
}

// ---------------------------------------------------------------- 하프 · 시계

function switchSides(st: GameState): void {
  for (const t of st.teams) t.dir = t.dir > 0 ? -1 : 1
  for (const p of st.players) {
    p.x = -p.x
    p.y = -p.y
    p.vx = -p.vx
    p.vy = -p.vy
    p.facing = (p.facing + 512) & 1023
  }
  st.half = 2
  st.clock = 0
}

/** 단계 타이머 — 골 세리머니 · 하프타임 · 리스타트 대기 */
export function tickPhase(st: GameState): void {
  const ph: Phase = st.phase
  if (ph === 'play' || ph === 'end') return
  st.phaseT--
  if (ph === 'goal') {
    if (st.phaseT <= 0) {
      applyPendingSubs(st)
      setupKickoff(st, st.kickoffTeam)
    }
    return
  }
  if (ph === 'halftime') {
    if (st.phaseT <= 0) {
      applyPendingSubs(st)
      switchSides(st)
      setupKickoff(st, 1 - st.firstKickoff)
    }
    return
  }
  // kickoff · throwin · corner · goalkick · freekick · penalty
  if (st.restart) {
    enforceRestartPositions(st)
    if (st.phaseT <= 0) {
      const human = st.teams[st.restart.team].human
      if (!human || st.phaseT < -300) performRestartKick(st)
    }
  }
}

/** 골·아웃 판정 (play 중에만). st.prevBallX 는 sim 이 공을 옮기기 전에 적어 둔다 */
export function checkOut(st: GameState): void {
  const b = st.ball
  const g = crossedGoalLine(st.prevBallX, b)
  if (g !== 0) {
    const scoring = st.teams[0].dir === g ? 0 : 1
    const conceding = 1 - scoring
    // 스로인이 직접 들어가면 골이 아니다 — 상대 골킥 (또는 자기 골대면 코너)
    if (b.fromThrow) {
      const s = b.x > 0 ? 1 : -1
      const sy = b.y >= 0 ? 1 : -1
      st.callText = '스로인은 직접 골이 안 된다'
      setupRestart(st, 'goalkick', conceding, s * (HALF_L - 5.5), sy * 9)
      return
    }
    st.teams[scoring].goals++
    const scorer = b.lastTouch >= 0 && st.players[b.lastTouch].team === scoring ? b.lastTouch : -1
    st.events.push({ tick: st.tick, type: 'goal', team: scoring, player: scorer, x: b.x, y: b.y })
    st.phase = 'goal'
    st.phaseT = GOAL_TICKS
    st.kickoffTeam = conceding
    st.restart = null
    st.callText = ''
    clearOffside(st)
    b.owner = -1
    b.vx = 0
    b.vy = 0
    b.vz = 0
    b.fromThrow = false
    return
  }
  if (Math.abs(b.x) > HALF_L + BALL_R) {
    const s = b.x > 0 ? 1 : -1
    const sy = b.y >= 0 ? 1 : -1
    const defending = st.teams[0].dir === -s ? 0 : 1
    if (b.lastTeam === defending) setupRestart(st, 'corner', 1 - defending, s * (HALF_L - 0.3), sy * (HALF_W - 0.3))
    else setupRestart(st, 'goalkick', defending, s * (HALF_L - 5.5), sy * 9)
    return
  }
  if (Math.abs(b.y) > HALF_W + BALL_R) {
    const sy = b.y > 0 ? 1 : -1
    const team = b.lastTeam >= 0 ? 1 - b.lastTeam : 0
    setupRestart(st, 'throwin', team, clamp(b.x, -HALF_L + 1, HALF_L - 1), sy * (HALF_W + 0.4))
  }
}

/** 시계 — 하프타임·종료 밖에서는 늘 흐른다 (데드볼 포함) */
export function advanceClock(st: GameState): void {
  if (st.phase === 'halftime' || st.phase === 'end') return
  st.clock += DT
  if (st.clock < st.halfSec) return
  // 세트피스를 기다리는 중이면 그것이 끝나고 끊는다 (PK 는 반드시 찬다)
  if (st.phase === 'penalty' || st.phase === 'freekick') return
  if (st.half === 1) {
    st.phase = 'halftime'
    st.phaseT = HALFTIME_TICKS
    st.restart = null
    st.ball.owner = -1
    st.events.push({ tick: st.tick, type: 'half', team: -1, player: -1, x: 0, y: 0 })
  } else {
    st.phase = 'end'
    st.done = true
    st.restart = null
    st.ball.owner = -1
    st.events.push({ tick: st.tick, type: 'end', team: -1, player: -1, x: 0, y: 0 })
  }
}

export { ownGoalX as ruleOwnGoalX, type Team }
