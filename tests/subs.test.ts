// 교체 — 기회 3번에 최대 5명 (사용자 요청 2026-09-11). 한 중단에 여러 명이 한꺼번에 들어가고 그때 기회를 하나 쓴다.
// 하프타임 교체는 기회를 안 쓴다. 명령은 Input(BTN_SUB, a·b)으로만 들어가고 다음 데드볼에 적용된다.
import { describe, expect, it } from 'vitest'
import { BTN_SUB, EMPTY_INPUT, SUB_CLEAR, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { applyPendingSubs, setupRestart } from '../src/core/rules'
import { HALF_W, MAX_SUBS, MAX_SUB_WINDOWS, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(human = false): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed: 5, halfSec: 60, squads: [home, away], human: [human, false], bots: [2, 2] })
}

const sub = (a: number, b: number): Input => ({ mx: 0, my: 0, buttons: BTN_SUB, a, b })

describe('교체 — 기회 3번 · 최대 5명', () => {
  it('상수 — 인원 5 · 기회 3', () => {
    expect(MAX_SUBS).toBe(5)
    expect(MAX_SUB_WINDOWS).toBe(3)
  })

  it('한 중단에 두 명이 함께 들어가고 기회는 하나만 쓴다', () => {
    const st = match()
    const team = st.teams[0]
    const a = team.bench[0].id
    const b = team.bench[3].id
    team.pendingSubs = [{ out: 5, in: 0 }, { out: 8, in: 3 }]
    applyPendingSubs(st)
    expect(st.players[team.start + 5].spec.id).toBe(a)
    expect(st.players[team.start + 8].spec.id).toBe(b)
    expect(team.subsLeft).toBe(3)
    expect(team.subWindows).toBe(2)
    expect(team.bench.length).toBe(5)
    expect(team.pendingSubs).toEqual([])
  })

  it('기회 3번을 다 쓰면 인원이 남아도 더 못 바꾼다', () => {
    const st = match()
    const team = st.teams[0]
    for (let i = 0; i < 3; i++) {
      team.pendingSubs = [{ out: i, in: 0 }]
      applyPendingSubs(st)
    }
    expect(team.subsLeft).toBe(2)
    expect(team.subWindows).toBe(0)
    const before = st.players[team.start + 9].spec.id
    team.pendingSubs = [{ out: 9, in: 0 }]
    applyPendingSubs(st)
    expect(st.players[team.start + 9].spec.id).toBe(before)
    expect(team.subsLeft).toBe(2)
  })

  it('한 번에 여섯 명을 넣어도 인원 상한 5 를 넘지 않는다', () => {
    const st = match()
    const team = st.teams[0]
    team.pendingSubs = [0, 1, 2, 3, 4, 5].map((i) => ({ out: i + 1, in: i }))
    applyPendingSubs(st)
    expect(team.subsLeft).toBe(0)
    expect(team.subWindows).toBe(2)
    expect(team.bench.length).toBe(2)
  })

  it('하프타임 교체는 기회를 안 쓴다', () => {
    const st = match()
    const team = st.teams[0]
    st.phase = 'halftime'
    st.phaseT = 1
    st.restart = null
    team.pendingSubs = [{ out: 4, in: 0 }]
    step(st, idle)
    expect(team.subsLeft).toBe(4)
    expect(team.subWindows).toBe(3)
    expect(st.half).toBe(2)
  })

  it('입력으로 넣는다 — 한 틱에 한 명, SUB_CLEAR 로 전부 지운다, 데드볼 전엔 안 바뀐다', () => {
    const st = match(true)
    while (st.phase !== 'play') step(st, idle)
    const team = st.teams[0]
    const before5 = st.players[team.start + 5].spec.id
    step(st, [sub(5, 0), EMPTY_INPUT])
    step(st, [sub(6, 1), EMPTY_INPUT])
    // 같은 선수·같은 후보를 두 번 넣지 않는다
    step(st, [sub(5, 2), EMPTY_INPUT])
    step(st, [sub(7, 1), EMPTY_INPUT])
    expect(team.pendingSubs).toEqual([{ out: 5, in: 0 }, { out: 6, in: 1 }])
    expect(st.players[team.start + 5].spec.id).toBe(before5)
    step(st, [sub(SUB_CLEAR, 0), EMPTY_INPUT])
    expect(team.pendingSubs).toEqual([])
    step(st, [sub(5, 0), EMPTY_INPUT])
    const inId = team.bench[0].id
    setupRestart(st, 'goalkick', 1, HALF_W, 0)
    expect(st.players[team.start + 5].spec.id).toBe(inId)
    expect(team.subsLeft).toBe(4)
    expect(team.subWindows).toBe(2)
  })

  it('인원 상한을 넘는 명령은 받지 않는다', () => {
    const st = match(true)
    while (st.phase !== 'play') step(st, idle)
    const team = st.teams[0]
    team.subsLeft = 1
    step(st, [sub(5, 0), EMPTY_INPUT])
    step(st, [sub(6, 1), EMPTY_INPUT])
    expect(team.pendingSubs).toEqual([{ out: 5, in: 0 }])
  })
})
