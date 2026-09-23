// 크로스 (32차 2026-09-23 — 재검증 WARN "크로스 때 박스가 빈다").
//
// - 우리 크로스가 날아가는 동안 박스로 뛰던 선수는 **계속 들어간다** — 예전엔 공이 뜨는 순간 자유 공이 되어 모두 자리로 돌아갔다.
// - 깊은 사이드에서 압박이 없고 박스 안 동료가 2명 미만인데 뛰어드는 동료가 있으면, 크로서는 공을 지키며 바이라인 쪽으로 간다(1.2 초까지).

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { aiDecide, updateAnchors } from '../src/core/ai'
import { doPass } from '../src/core/ball'
import { synthSquad } from '../src/core/synth'
import { HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function playState(): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed: 9, halfSec: 180, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  st.phase = 'play'
  st.restart = null
  // 원정은 자기 박스 근처(깊은 수비 라인 12 m), 홈은 하프라인 근처
  const dir = st.teams[0].dir
  for (const p of st.players) {
    p.vx = 0
    p.vy = 0
    if (p.team === 1) {
      p.x = dir * (HALF_L - 12 - (p.idx % 3) * 4)
      p.y = ((p.idx % 11) - 5) * 3
    } else {
      p.x = dir * -5
      p.y = ((p.idx % 11) - 5) * 4
    }
  }
  st.players[st.teams[1].gk].x = dir * (HALF_L - 1)
  st.players[st.teams[1].gk].y = 0
  return st
}

describe('크로스', () => {
  it('우리 하이 크로스가 날아가는 동안 박스 역할 선수는 박스 자리로 계속 뛴다', () => {
    const st = playState()
    const dir = st.teams[0].dir
    const gx = dir * HALF_L
    // 4-3-3 RW(10)가 깊은 오른쪽에서 ST(9)에게 하이 크로스
    const w = st.players[10]
    w.x = dir * 38
    w.y = -22
    st.ball.owner = w.idx
    st.ball.x = w.x
    st.ball.y = w.y
    const st9 = st.players[9]
    st9.x = dir * 34
    st9.y = -4
    doPass(st, w, 'highcross', 9, 0, 0, 0.6)
    expect(st.ball.passKind).toBe('highcross')
    // 떨어질 곳 근처에 LW(8) — 요격하러 가는 둘은 LW·ST 다. 중앙 MF(6)는 골문 28 m 에서 셋째라 박스로 간다
    st.players[8].x = dir * 33
    st.players[8].y = 2
    const cm = st.players[6]
    cm.x = dir * (HALF_L - 28)
    cm.y = 6
    step(st, idle)
    updateAnchors(st)
    aiDecide(st, cm)
    expect(Math.abs(cm.tx - gx)).toBeLessThan(16)
    expect(Math.abs(cm.ty)).toBeLessThan(12)
    expect(cm.runT).toBe(st.tick)
  })

  it('압박 없는 깊은 사이드 크로서는 박스로 뛰어드는 동료를 기다리며 바이라인 쪽으로 간다', () => {
    const st = playState()
    const dir = st.teams[0].dir
    const w = st.players[10]
    w.x = dir * 38
    w.y = -22
    w.gotT = st.tick - 10
    st.ball.owner = w.idx
    st.ball.x = w.x
    st.ball.y = w.y
    // 원정 수비는 박스 안(크로서에서 멀다 — 압박 없음)
    for (const p of st.players) if (p.team === 1 && !p.sk.isGK) {
      p.x = dir * (HALF_L - 8 - (p.idx % 3) * 2)
      p.y = ((p.idx % 11) - 5) * 1.5
    }
    // ST 는 박스로 뛰어드는 중(아직 박스 밖 · 방금 침투)
    const s9 = st.players[9]
    s9.x = dir * 28
    s9.y = -3
    s9.vx = dir * 6
    s9.runT = st.tick
    updateAnchors(st)
    aiDecide(st, w)
    expect(st.ball.owner).toBe(w.idx) // 차지 않았다
    expect((w.tx - w.x) * dir).toBeGreaterThan(1) // 바이라인 쪽으로
    expect(w.crossT).toBe(st.tick)
  })
})
