// 세트피스 롱볼 (사용자 제보 2026-09-11 — "프리킥·골킥이 롱볼이 안 되고 땅볼 패스만 된다").
//
// A 를 **홀드**해서 떼면 방향키 쪽 먼 지점으로 로빙이 간다 (18 ~ 50 m). 예전엔 A 가 누르는 순간
// 가까운 동료에게 짧은 로빙만 갔다. 골킥 D 홀드는 펀트(55 m+), 프리킥 D 홀드는 슛 — 그대로.

import { describe, expect, it } from 'vitest'
import { BTN_A, BTN_D, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { setupFreeKick, setupPenalty, setupRestart } from '../src/core/rules'
import { HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function humanMatch(seed = 61): GameState {
  const a = synthSquad(71, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const b = synthSquad(72, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [a, b], human: [true, false] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

/** 홈(팀 0)의 리스타트를 만든다. 공이 멈추고 킥커가 공을 잡을 때까지 굴린다 */
function restart(st: GameState, kind: 'freekick' | 'goalkick', x: number, y: number): void {
  if (kind === 'freekick') setupFreeKick(st, 0, x, y)
  else setupRestart(st, kind, 0, x, y)
  let guard = 0
  while (guard++ < 600 && !(st.restart && st.ball.owner === st.restart.kicker)) step(st, idle)
  expect(st.restart).not.toBeNull()
  expect(st.ball.owner).toBe(st.restart!.kicker)
}

/** 방향키 +x(상대 골문 쪽) 로 키를 hold 틱 누른 뒤 떼고, 공이 멈출 때까지 최고 높이·이동 거리를 잰다 */
function kick(st: GameState, btn: number, hold: number): { dist: number; maxZ: number } {
  const dir = st.teams[0].dir
  const x0 = st.ball.x
  const y0 = st.ball.y
  const held: Input = { mx: 127 * dir, my: 0, buttons: btn, a: 0, b: 0 }
  const rel: Input = { mx: 127 * dir, my: 0, buttons: 0, a: 0, b: 0 }
  for (let i = 0; i < hold; i++) step(st, [held, EMPTY_INPUT])
  step(st, [rel, EMPTY_INPUT])
  expect(st.phase).toBe('play')
  let maxZ = 0
  let far = 0
  for (let i = 0; i < 240; i++) {
    step(st, idle)
    maxZ = Math.max(maxZ, st.ball.z)
    far = Math.max(far, Math.hypot(st.ball.x - x0, st.ball.y - y0))
    if (st.ball.owner >= 0 && i > 20) break
    if (st.phase !== 'play') break
  }
  return { dist: far, maxZ }
}

describe('세트피스 롱볼 (A 홀드)', () => {
  it('프리킥 — A 를 꽉 홀드하면 30 m 넘게 공중으로 날아간다', () => {
    const st = humanMatch()
    const dir = st.teams[0].dir
    restart(st, 'freekick', -dir * 20, 4)
    const r = kick(st, BTN_A, 40)
    expect(r.maxZ).toBeGreaterThan(1.5)
    expect(r.dist).toBeGreaterThan(30)
  })

  it('프리킥 — A 를 툭 누르면 짧은 로빙 (20 m 안팎)', () => {
    const st = humanMatch()
    const dir = st.teams[0].dir
    restart(st, 'freekick', -dir * 20, 4)
    const r = kick(st, BTN_A, 2)
    expect(r.maxZ).toBeGreaterThan(0.8)
    expect(r.dist).toBeLessThan(30)
  })

  it('골킥 — A 홀드 롱볼이 30 m 를 넘고, D 홀드 펀트는 그보다 멀다', () => {
    const st = humanMatch()
    const dir = st.teams[0].dir
    restart(st, 'goalkick', -dir * (HALF_L - 5.5), 9)
    const lob = kick(st, BTN_A, 40)
    expect(lob.maxZ).toBeGreaterThan(1.5)
    expect(lob.dist).toBeGreaterThan(30)

    const st2 = humanMatch(62)
    const dir2 = st2.teams[0].dir
    restart(st2, 'goalkick', -dir2 * (HALF_L - 5.5), 9)
    const punt = kick(st2, BTN_D, 40)
    expect(punt.dist).toBeGreaterThan(lob.dist * 0.9)
  })
})

describe('페널티킥 골키퍼 자리', () => {
  it('킥을 기다리는 동안 골키퍼는 골라인 가운데를 지킨다 (앞으로 걸어 나오지 않는다)', () => {
    const st = humanMatch(63)
    setupPenalty(st, 0)
    const gk = st.players[st.teams[1].gk]
    const lineX = st.teams[0].dir * (HALF_L - 0.35)
    for (let i = 0; i < 240; i++) {
      step(st, idle)
      if (st.phase !== 'penalty') break
      expect(Math.abs(gk.x - lineX)).toBeLessThan(0.8)
      expect(Math.abs(gk.y)).toBeLessThan(0.6)
    }
    expect(st.phase).toBe('penalty')
  })
})
