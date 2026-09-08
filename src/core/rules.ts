// 경기 규칙 — 시계·하프·킥오프·골·아웃(스로인·골킥·코너)·리스타트 (DESIGN 2장 · 4.9).
// 오프사이드·파울·카드·교체는 단계 4.

import { atan2A, clamp } from './fixedmath'
import { anchorOf, type Band } from './formation'
import { rand } from './rng'
import { dist, doPass, nearestOppDist } from './ball'
import { crossedGoalLine } from './physics'
import {
  ACT_RUN, BALL_R, DT, GOAL_TICKS, HALFTIME_TICKS, HALF_L, HALF_W, KICKOFF_TICKS, RESTART_TICKS,
  goalX, type GameState, type Phase,
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
}

/** 킥오프 — 22명을 자기 진영 자리로 옮기고 team 의 공격수가 센터에서 공을 든다 */
export function setupKickoff(st: GameState, team: number): void {
  st.phase = 'kickoff'
  st.phaseT = KICKOFF_TICKS
  st.kickoffTeam = team
  resetBall(st, 0, 0)
  for (const p of st.players) {
    const t = st.teams[p.team]
    anchorOf(p.slot, p.band as Band, t.dir, t.sliders, 0, 0, p.team === team, tmp)
    let x = tmp.x
    if (x * t.dir > -1) x = -t.dir * 1
    p.x = x
    p.y = tmp.y
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
    p.tx = p.x
    p.ty = p.y
  }
  // 킥커: team 의 FW 중 센터에 가장 가까운 선수
  let kicker = -1
  let kd = 999
  for (const p of st.players) {
    if (p.team !== team || p.sk.isGK) continue
    const d = dist(p.x, p.y, 0, 0) - (p.band === 'FW' ? 20 : 0)
    if (d < kd) {
      kd = d
      kicker = p.idx
    }
  }
  const k = st.players[kicker]
  const dir = st.teams[team].dir
  k.x = -dir * 0.6
  k.y = 0
  k.facing = dir > 0 ? 0 : 512
  st.ball.owner = kicker
  st.ball.lastTouch = kicker
  st.ball.lastTeam = team
  k.gotT = st.tick
  st.restart = { team, kicker, x: 0, y: 0 }
  st.events.push({ tick: st.tick, type: 'kickoff', team, player: kicker, x: 0, y: 0 })
}

/** 스로인·코너·골킥 — 킥커를 그 자리에 세우고 공을 준다 */
export function setupRestart(st: GameState, type: 'throwin' | 'corner' | 'goalkick', team: number, x: number, y: number): void {
  st.phase = type
  st.phaseT = RESTART_TICKS
  resetBall(st, x, y)
  let kicker = -1
  if (type === 'goalkick') kicker = st.teams[team].gk
  else {
    let kd = 999
    for (const p of st.players) {
      if (p.team !== team || p.sk.isGK) continue
      const d = dist(p.x, p.y, x, y)
      if (d < kd) {
        kd = d
        kicker = p.idx
      }
    }
  }
  const k = st.players[kicker]
  k.x = x
  k.y = y
  k.vx = 0
  k.vy = 0
  k.facing = atan2A(-y, -x)
  k.action = ACT_RUN
  k.actT = 0
  k.holdT = 0
  k.tackleT = 0
  k.tx = x
  k.ty = y
  st.ball.owner = kicker
  st.ball.lastTouch = kicker
  st.ball.lastTeam = team
  k.gotT = st.tick
  st.restart = { team, kicker, x, y }
  st.events.push({ tick: st.tick, type, team, player: kicker, x, y })
  if (type === 'corner') st.stats[team].corners++
}

/** 리스타트 킥 — AI 가 고른다 (사람 킥커도 v1 은 같은 선택). 끝나면 play 로 */
export function performRestartKick(st: GameState): void {
  const r = st.restart
  if (!r) return
  const k = st.players[r.kicker]
  const team = st.teams[r.team]
  const dir = team.dir
  const phase = st.phase
  st.restart = null
  st.phase = 'play'
  if (st.ball.owner !== r.kicker) return
  if (phase === 'kickoff') {
    let target = -1
    let td = 999
    for (const q of st.players) {
      if (q.team !== r.team || q.idx === k.idx || q.sk.isGK) continue
      const d = dist(k.x, k.y, q.x, q.y) + ((q.x - k.x) * dir > 0.5 ? 10 : 0)
      if (d < td) {
        td = d
        target = q.idx
      }
    }
    doPass(st, k, 'ground', target, -dir, 0, 0.2)
    return
  }
  if (phase === 'throwin') {
    let target = -1
    let ts = -99
    for (const q of st.players) {
      if (q.team !== r.team || q.idx === k.idx || q.sk.isGK) continue
      const d = dist(k.x, k.y, q.x, q.y)
      if (d > 22 || d < 2) continue
      const s = Math.min(8, nearestOppDist(st, q)) - d * 0.15
      if (s > ts) {
        ts = s
        target = q.idx
      }
    }
    doPass(st, k, 'ground', target, -Math.sign(k.x) || dir, -Math.sign(k.y), 0.1)
    st.ball.vz = 1.5
    return
  }
  if (phase === 'corner') {
    const gx = goalX(team)
    doPass(st, k, 'lob', -1, dir, 0, 1, { x: gx - dir * (8 + rand(st.rng) * 4), y: (rand(st.rng) - 0.5) * 10 })
    return
  }
  // 골킥
  let target = -1
  for (const q of st.players) {
    if (q.team !== r.team || q.sk.isGK) continue
    const d = dist(k.x, k.y, q.x, q.y)
    if (d > 30 || d < 5) continue
    if (nearestOppDist(st, q) > 8) {
      target = q.idx
      break
    }
  }
  if (target >= 0) doPass(st, k, 'ground', target, dir, 0, 0.3)
  else doPass(st, k, 'lob', -1, dir, 0, 1, { x: clamp(k.x + dir * 45, -HALF_L + 5, HALF_L - 5), y: (rand(st.rng) - 0.5) * 30 })
}

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
    if (st.phaseT <= 0) setupKickoff(st, st.kickoffTeam)
    return
  }
  if (ph === 'halftime') {
    if (st.phaseT <= 0) {
      switchSides(st)
      setupKickoff(st, 1 - st.firstKickoff)
    }
    return
  }
  // kickoff · throwin · corner · goalkick
  if (st.phaseT <= 0 && st.restart) {
    const human = st.teams[st.restart.team].human
    if (!human || st.phaseT < -300) performRestartKick(st)
  }
}

/** 골·아웃 판정 (play 중에만). st.prevBallX 는 sim 이 공을 옮기기 전에 적어 둔다 */
export function checkOut(st: GameState): void {
  const b = st.ball
  const g = crossedGoalLine(st.prevBallX, b)
  if (g !== 0) {
    const scoring = st.teams[0].dir === g ? 0 : 1
    st.teams[scoring].goals++
    const scorer = b.lastTouch >= 0 && st.players[b.lastTouch].team === scoring ? b.lastTouch : -1
    st.events.push({ tick: st.tick, type: 'goal', team: scoring, player: scorer, x: b.x, y: b.y })
    st.phase = 'goal'
    st.phaseT = GOAL_TICKS
    st.kickoffTeam = 1 - scoring
    st.restart = null
    b.owner = -1
    b.vx = 0
    b.vy = 0
    b.vz = 0
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
    setupRestart(st, 'throwin', team, clamp(b.x, -HALF_L + 1, HALF_L - 1), sy * (HALF_W + 0.3))
  }
}

/** 시계 — 하프타임·종료 밖에서는 늘 흐른다 (데드볼 포함) */
export function advanceClock(st: GameState): void {
  if (st.phase === 'halftime' || st.phase === 'end') return
  st.clock += DT
  if (st.clock < st.halfSec) return
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
