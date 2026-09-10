// 사람 킥커의 리스타트 킥 — 방향키 쪽으로 찬다 (DESIGN 3.1 세트피스). 결정론도 같이 본다.
import { describe, expect, it } from 'vitest'
import { BTN_D, BTN_S, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, hashState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { KICKOFF_TICKS, type GameState } from '../src/core/state'

function humanMatch(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec: 60, squads: [home, away], human: [true, false], bots: [2, 2] })
}

function run(st: GameState, seq: Input[]): void {
  for (const i of seq) step(st, [i, EMPTY_INPUT])
}

describe('리스타트 킥 (사람)', () => {
  it('킥오프 — 방향키 없이 S 를 누르면 AI 선택으로 차고 play 가 된다', () => {
    const st = humanMatch(7)
    expect(st.phase).toBe('kickoff')
    const kicker = st.restart!.kicker
    run(st, [{ ...EMPTY_INPUT, buttons: BTN_S }])
    expect(st.phase).toBe('play')
    expect(st.restart).toBeNull()
    expect(st.ball.owner).not.toBe(kicker)
  })

  it('킥오프 — 방향키 ←(−x) + S 면 공이 −x 로 간다', () => {
    const st = humanMatch(7)
    run(st, [{ mx: -127, my: 0, buttons: BTN_S, a: 0, b: 0 }])
    expect(st.phase).toBe('play')
    expect(st.ball.vx).toBeLessThan(0)
  })

  it('킥오프 — D 를 홀드해도 상대 진영으로 길게 차지 않는다 · 아군에게 짧은 패스 (사용자 결정 2026-09-10)', () => {
    const st = humanMatch(7)
    // 20틱 홀드
    run(st, new Array(20).fill(0).map(() => ({ mx: 127, my: 0, buttons: BTN_D, a: 0, b: 0 })))
    expect(st.phase).toBe('kickoff')
    // 놓는다
    run(st, [{ mx: 127, my: 0, buttons: 0, a: 0, b: 0 }])
    expect(st.phase).toBe('play')
    expect(st.stats[0].shots).toBe(0)
    // 받을 사람은 자기 진영 아군이고, 공은 땅볼 패스 속도다
    expect(st.ball.passTo).toBeGreaterThanOrEqual(0)
    expect(st.players[st.ball.passTo].x * st.teams[0].dir).toBeLessThanOrEqual(0.5)
    expect(Math.hypot(st.ball.vx, st.ball.vy)).toBeLessThan(19)
    expect(st.events.some((e) => e.type === 'whistle')).toBe(true)
  })

  it('사람 킥커는 기다려 준다 — 키를 안 누르면 phaseT 가 −300 이 될 때까지 kickoff 로 남는다', () => {
    const st = humanMatch(7)
    for (let i = 0; i < KICKOFF_TICKS + 200; i++) step(st, [EMPTY_INPUT, EMPTY_INPUT])
    expect(st.phase).toBe('kickoff')
    for (let i = 0; i < 200; i++) step(st, [EMPTY_INPUT, EMPTY_INPUT])
    expect(st.phase).toBe('play')
  })

  it('같은 입력이면 같은 해시 (사람 입력도 결정론 안)', () => {
    const seq: Input[] = []
    for (let i = 0; i < 900; i++) {
      const mx = i % 90 < 45 ? 127 : -127
      const my = i % 60 < 30 ? 127 : 0
      const buttons = i % 120 === 5 ? BTN_S : i % 120 === 70 ? BTN_D : i % 7 === 0 ? BTN_D : 0
      seq.push({ mx, my, buttons, a: 0, b: 0 })
    }
    const a = humanMatch(99)
    const b = humanMatch(99)
    run(a, seq)
    run(b, seq)
    expect(hashState(a)).toBe(hashState(b))
    expect(a.tick).toBe(900)
  })
})
