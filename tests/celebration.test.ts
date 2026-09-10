// 골 세레모니 · 건너뛰기 (사용자 요청 2026-09-11).
//
// - 골 뒤 세레모니가 GOAL_TICKS(9 초) 동안 이어진다. 넣은 팀은 득점자에게 모이고, 먹은 팀은 공을 건드리지 않는다.
// - Enter(BTN_SKIP) 를 누르면 건너뛴다. 혼자 하기는 나 하나로 충분(봇은 늘 동의).
// - 온라인(둘 다 사람)은 **양쪽이 다** 눌러야 넘어간다 — 한쪽만 누르면 그대로 본다.
// 리플레이는 렌더 전용이라 여기서 다루지 않는다 (시뮬 결과에 영향이 없어야 한다 — 결정론).

import { describe, expect, it } from 'vitest'
import { BTN_SKIP, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { GOAL_SKIP_TICKS, GOAL_TICKS, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const SKIP: Input = { mx: 0, my: 0, buttons: BTN_SKIP, a: 0, b: 0 }

function match(human: [boolean, boolean], seed = 41): GameState {
  const a = synthSquad(51, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const b = synthSquad(52, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [a, b], human })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

/** 홈(팀 0)이 넣는 골을 억지로 만든다 — 공을 상대 골라인 바로 앞에서 골문 안쪽으로 굴린다 */
function forceGoal(st: GameState): void {
  const t = st.teams[0]
  const shooter = st.players.find((p) => p.team === 0 && p.idx !== t.gk)!
  const b = st.ball
  b.owner = -1
  b.x = t.dir * (HALF_L - 0.6)
  b.y = 0
  b.z = 0.4
  b.vx = t.dir * 16
  b.vy = 0
  b.vz = 0
  b.lastTouch = shooter.idx
  b.lastTeam = 0
  b.shotBy = shooter.idx
  b.passLive = false
  b.fromThrow = false
  let guard = 0
  while (st.phase !== 'goal' && guard++ < 60) step(st, idle)
  expect(st.phase).toBe('goal')
}

/** 골 단계가 끝날 때까지 몇 틱 걸리나 */
function ticksUntilKickoff(st: GameState, inputs: () => [Input, Input], max = GOAL_TICKS + 60): number {
  let n = 0
  while (st.phase === 'goal' && n < max) {
    step(st, inputs())
    n++
  }
  return n
}

describe('골 세레모니', () => {
  it('골 뒤 세레모니가 9 초 이어지고, 넣은 팀이 득점자에게 모인다', () => {
    const st = match([true, false])
    forceGoal(st)
    expect(st.goalTeam).toBe(0)
    expect(st.phaseT).toBe(GOAL_TICKS)
    const scorer = st.players[st.goalScorer]
    const mates = st.players.filter((p) => p.team === 0 && p.idx !== st.goalScorer && p.idx !== st.teams[0].gk)
    const d0 = mates.reduce((t, p) => t + Math.hypot(p.x - scorer.x, p.y - scorer.y), 0) / mates.length
    for (let i = 0; i < 240; i++) step(st, idle)
    expect(st.phase).toBe('goal')
    const d1 = mates.reduce((t, p) => t + Math.hypot(p.x - scorer.x, p.y - scorer.y), 0) / mates.length
    expect(d1).toBeLessThan(d0 * 0.6)
    // 먹은 팀은 골망 속 공을 건드리지 않는다
    expect(st.ball.owner).toBe(-1)
    // 끝까지 두면 킥오프로 넘어간다
    const n = ticksUntilKickoff(st, () => idle)
    expect(n).toBeLessThanOrEqual(GOAL_TICKS - 240 + 2)
    expect(st.phase).toBe('kickoff')
  })

  it('혼자 하기 — Enter 한 번이면 꼬리(GOAL_SKIP_TICKS)만 남기고 넘어간다', () => {
    const st = match([true, false])
    forceGoal(st)
    for (let i = 0; i < 30; i++) step(st, idle)
    const n = ticksUntilKickoff(st, () => [SKIP, EMPTY_INPUT])
    expect(n).toBeLessThanOrEqual(GOAL_SKIP_TICKS + 2)
    expect(st.phase).toBe('kickoff')
  })

  it('온라인 — 한쪽만 누르면 그대로 보고, 양쪽이 다 누르면 넘어간다', () => {
    const st = match([true, true])
    forceGoal(st)
    // 홈만 누른다 (한 번 edge, 그 뒤 놓음) — 120 틱 뒤에도 세레모니
    step(st, [SKIP, EMPTY_INPUT])
    for (let i = 0; i < 120; i++) step(st, idle)
    expect(st.phase).toBe('goal')
    expect(st.teams[0].skipCele).toBe(true)
    expect(st.teams[1].skipCele).toBe(false)
    // 원정도 누른다 → 꼬리만 남기고 킥오프
    step(st, [EMPTY_INPUT, SKIP])
    const n = ticksUntilKickoff(st, () => idle)
    expect(n).toBeLessThanOrEqual(GOAL_SKIP_TICKS + 2)
    expect(st.phase).toBe('kickoff')
  })

  it('세레모니 동안 사람의 방향키는 무시된다 — 그림이 깨지지 않게', () => {
    const st = match([true, false])
    forceGoal(st)
    const me = st.teams[0]
    const before = st.players[me.controlled >= 0 ? me.controlled : st.players.find((p) => p.team === 0)!.idx]
    const x0 = before.x
    const push: Input = { mx: -127, my: 0, buttons: 0, a: 0, b: 0 }
    for (let i = 0; i < 60; i++) step(st, [push, EMPTY_INPUT])
    // 방향키(−x)로 8 m 넘게 끌려가지 않았다 (세레모니 이동은 AI 가 정한다)
    expect(x0 - before.x).toBeLessThan(8)
  })
})
