// 사용자 제보 2026-09-11 — "혼자 하기에서 내가 원정이 걸리니까 선수가 움직이지 않았어".
//
// 동전 던지기(2026-09-11)로 사람이 원정(팀 1)을 맡을 수 있게 됐는데, 세션은 입력을 늘
// 0번 칸에 넣고 있었다. 그래서 봇이 내 키를 받고 **내 선수는 한 발짝도 움직이지 않았다**
// (실측 0.00 m — sim 은 사람 팀의 조작 선수를 AI 로 움직이지 않으므로 완전히 얼어붙는다).

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, soloInputs, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'

const RIGHT: Input = { mx: 127, my: 0, buttons: 0, a: 0, b: 0 }

/** 사람이 `meTeam` 을 맡는 혼자 하기 판 */
function match(meTeam: 0 | 1, seed = 11): GameState {
  const a = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const b = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({
    seed,
    halfSec: 180,
    squads: [a, b],
    human: meTeam === 0 ? [true, false] : [false, true],
  })
}

/**
 * 킥오프 연출이 끝나 실제로 공이 구르기 시작한 뒤, 조작 선수를 60틱(1초) 한 방향으로 민다.
 * 킥오프 중에는 선수가 제자리를 지키므로 `phase === 'play'` 를 기다려야 한다.
 */
function pushDistance(meTeam: 0 | 1, feed: (i: Input) => [Input, Input], seed = 11): number {
  const st = match(meTeam, seed)
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, [EMPTY_INPUT, EMPTY_INPUT])
  expect(st.phase).toBe('play')
  const idx = st.teams[meTeam].controlled
  const p = st.players[idx]
  const x0 = p.x
  const y0 = p.y
  for (let i = 0; i < 60; i++) step(st, feed(RIGHT))
  const q = st.players[idx]
  return Math.hypot(q.x - x0, q.y - y0)
}

describe('원정으로 걸려도 내 선수가 움직인다', () => {
  it('soloInputs 는 내 입력을 내 팀 칸에 넣는다', () => {
    expect(soloInputs(0, RIGHT)).toEqual([RIGHT, EMPTY_INPUT])
    expect(soloInputs(1, RIGHT)).toEqual([EMPTY_INPUT, RIGHT])
  })

  it('홈일 때도 원정일 때도 조작 선수가 실제로 이동한다', () => {
    for (const seed of [11, 12, 13]) {
      expect(pushDistance(0, (i) => soloInputs(0, i), seed)).toBeGreaterThan(1)
      expect(pushDistance(1, (i) => soloInputs(1, i), seed)).toBeGreaterThan(1)
    }
  })

  it('입력을 0번 칸에 고정하면 원정 사람의 선수는 얼어붙는다 — 이게 제보된 버그', () => {
    // 예전 코드가 하던 짓. 사람 팀의 조작 선수는 AI 가 대신 움직이지 않으므로 0 m 다.
    const frozen = pushDistance(1, (i) => [i, EMPTY_INPUT])
    expect(frozen).toBeLessThan(0.5)
    expect(pushDistance(1, (i) => soloInputs(1, i))).toBeGreaterThan(frozen + 1)
  })
})
