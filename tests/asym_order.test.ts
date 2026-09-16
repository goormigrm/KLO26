// 2026-09-16 — 같은 스쿼드 대칭 계측에서 홈(팀 0)이 계속 졌다 (HANDOVER 0-e: 180판 41%, 2,000판 47.1% · 골 −0.14).
//
// 원인은 좌표도 킥오프도 아니었다(진영·킥오프 팀을 바꿔도 팀 1 이 이겼다). `step` 의 **팀 번호에 붙은 순서**가 셋 있었다:
//  ① 결정을 이동 루프 안에서 해서 팀 1(11~21번)이 팀 0 의 이 틱 이동을 본 뒤 정했다(한 틱 앞선 정보)
//  ② 팀 0 이 늘 먼저 정해서, 팀 0 소유자가 찬 공은 같은 틱의 팀 1 결정에 보이고 그 반대는 안 보였다
//  ③ 결정 주기(15틱)를 idx 로 어긋나게 해서 마주 보는 두 선수(팀 0 의 k 번 · 팀 1 의 k 번)의 반응 시차가 팀마다 달랐다
// 고침: 결정(공 가진 팀부터 · 자리 번호로 주기) → 이동 두 단계. 셋 다 넣어야 2,000판 50.5%·골 ±0.01 이 됐다 (`tools/asymprobe.ts`).
// 이 테스트는 세 성질을 구조적으로 지킨다 — 통계(2,000판)는 유닛 테스트로 못 잡는다.

import { describe, expect, it, vi } from 'vitest'
import { EMPTY_INPUT } from '../src/core/input'
import { DECIDE_TICKS, type GameState, type Player } from '../src/core/state'

/** aiDecide 가 불릴 때마다 호출된다 — 테스트가 갈아 끼운다 */
let onDecide: ((st: GameState, p: Player) => void) | null = null

vi.mock('../src/core/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/core/ai')>()
  return {
    ...mod,
    aiDecide: (st: GameState, p: Player): void => {
      onDecide?.(st, p)
      mod.aiDecide(st, p)
    },
  }
})

// vi.mock 은 호이스팅되므로 sim 은 갈아 끼운 ai 를 본다
const { createState, step } = await import('../src/core/sim')
const { synthSquad } = await import('../src/core/synth')

function playState(seed: number): GameState {
  const sq = synthSquad(11, { name: '같음', short: '같음', formation: '4-3-3', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [sq, { ...sq, name: '같음2', short: '같2' }] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 3000) step(st, [EMPTY_INPUT, EMPTY_INPUT])
  expect(st.phase).toBe('play')
  return st
}

describe('AI 결정 순서 — 두 팀이 거울처럼 같다', () => {
  it('① play 중 어느 선수가 결정하든, 그 순간 22명 전원이 이 틱 시작 자리에 있다', () => {
    const st = playState(7000)
    const snap = new Float64Array(44)
    const decisions = [0, 0]
    let moved = 0
    let watching = false
    onDecide = (s, p) => {
      if (!watching) return
      decisions[p.team]++
      for (let i = 0; i < s.players.length; i++) {
        const q = s.players[i]
        if (q.x !== snap[i * 2] || q.y !== snap[i * 2 + 1]) moved++
      }
    }
    for (let t = 0; t < 600; t++) {
      // 데드볼(스로인·프리킥 대기)에서는 rules 가 결정 앞에서 선수를 밀어낸다 — play 틱만 본다
      watching = st.phase === 'play'
      for (let i = 0; i < st.players.length; i++) {
        snap[i * 2] = st.players[i].x
        snap[i * 2 + 1] = st.players[i].y
      }
      step(st, [EMPTY_INPUT, EMPTY_INPUT])
    }
    onDecide = null
    // 600틱 · 22명 · 15틱마다 → 팀마다 수백 번 결정한다
    expect(decisions[0]).toBeGreaterThan(200)
    expect(decisions[1]).toBeGreaterThan(200)
    // 옛 코드(이동 루프 안에서 결정)면 팀 1 이 결정할 때마다 팀 0 열 명이 이미 옮겨져 있어 수천 번 어긋난다
    expect(moved).toBe(0)
  })

  it('② 한 틱 안에서는 공을 가진 팀이 먼저 결정한다 (없으면 팀 0)', () => {
    const st = playState(7002)
    let violations = 0
    let ownerFirstTicks = [0, 0]
    let tickSeen = -1
    let firstTeam = -1
    let switched = false
    onDecide = (s, p) => {
      if (s.tick !== tickSeen) {
        // 이 틱의 첫 결정 — 아직 아무도 공을 안 찼으니 소유 팀이 곧 "먼저 정해야 할 팀"
        tickSeen = s.tick
        const o = s.ball.owner
        firstTeam = o >= 0 && s.players[o].team === 1 ? 1 : 0
        switched = false
        ownerFirstTicks[firstTeam]++
        if (p.team !== firstTeam) violations++
        return
      }
      if (p.team !== firstTeam) switched = true
      else if (switched) violations++ // 다른 팀으로 넘어간 뒤 다시 첫 팀이 나오면 안 된다
    }
    for (let t = 0; t < 1800; t++) step(st, [EMPTY_INPUT, EMPTY_INPUT])
    onDecide = null
    expect(violations).toBe(0)
    // 양쪽 다 공을 가져 봤다 (팀 1 이 먼저 정한 틱이 실제로 있었다)
    expect(ownerFirstTicks[0]).toBeGreaterThan(50)
    expect(ownerFirstTicks[1]).toBeGreaterThan(50)
  })

  it('③ 결정 주기는 자리 번호(idx % 11)로 — 두 팀의 같은 자리가 같은 틱에 정한다', () => {
    const st = playState(7003)
    let bad = 0
    let n = 0
    onDecide = (s, p) => {
      n++
      if ((s.tick + (p.idx % 11)) % DECIDE_TICKS !== 0) bad++
    }
    for (let t = 0; t < 600; t++) step(st, [EMPTY_INPUT, EMPTY_INPUT])
    onDecide = null
    expect(n).toBeGreaterThan(400)
    expect(bad).toBe(0)
  })

  it('같은 시드 두 번 → 같은 결과 (두 단계로 나눠도 결정론은 그대로)', () => {
    const a = playState(7001)
    const b = playState(7001)
    for (let t = 0; t < 1200; t++) {
      step(a, [EMPTY_INPUT, EMPTY_INPUT])
      step(b, [EMPTY_INPUT, EMPTY_INPUT])
    }
    for (let i = 0; i < a.players.length; i++) {
      expect(a.players[i].x).toBe(b.players[i].x)
      expect(a.players[i].y).toBe(b.players[i].y)
    }
    expect(a.ball.x).toBe(b.ball.x)
    expect(a.rng.s).toBe(b.rng.s)
  })
})
