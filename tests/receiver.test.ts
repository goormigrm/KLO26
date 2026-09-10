// 사용자 제보 2026-09-11 — "패스한 뒤 받을 선수가 공과 상관없는 방향으로 뛴다".
//
// 원인 두 가지였다: ① 공이 뜨면 조작이 **공에 가장 가까운 선수**로 넘어가서 받으라고 보낸 선수가 아닐 수
// 있었고, ② 누르고 있던 방향키가 그 선수를 그대로 끌고 갔다. 이제 내 패스가 살아 있는 동안은
// 조작이 **받을 선수**로 가고, 그 선수는 잡을 때까지 요격 지점으로 스스로 달린다(방향키는 35% 만 섞인다).
// 상대가 먼저 길을 막으면 여전히 뺏긴다 (tryControl 은 그대로).

import { describe, expect, it } from 'vitest'
import { BTN_S, EMPTY_INPUT, soloInputs, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'

function playing(meTeam: 0 | 1, seed = 21): GameState {
  const a = synthSquad(31, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const b = synthSquad(32, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [a, b], human: meTeam === 0 ? [true, false] : [false, true] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, [EMPTY_INPUT, EMPTY_INPUT])
  return st
}

/**
 * 내 팀 필드 선수 하나를 "받을 선수"로 정하고, 공을 그 선수 쪽으로 굴러가는 자유 공으로 만든다.
 * 그 다음 방향키를 **공 반대쪽**으로 꽉 누른 채 몇 틱 굴려 본다.
 */
function setupPass(st: GameState, meTeam: 0 | 1): { recv: number; x0: number; y0: number } {
  const team = st.teams[meTeam]
  const recv = st.players.find((p) => p.team === meTeam && p.idx !== team.gk && !p.sentOff)!.idx
  const r = st.players[recv]
  const b = st.ball
  // 받을 선수 8 m 앞에서 그쪽으로 굴러오는 공
  b.owner = -1
  b.x = r.x - 8
  b.y = r.y
  b.z = 0
  b.vx = 9
  b.vy = 0
  b.vz = 0
  b.passLive = true
  b.passTo = recv
  b.lastTeam = meTeam
  b.lastTouch = st.players.find((p) => p.team === meTeam && p.idx !== recv)!.idx
  b.kickTick = st.tick
  b.shotBy = -1
  // 조작은 방금 찬 선수에 머물러 있다 (패스 직후 상태)
  team.controlled = b.lastTouch
  return { recv, x0: r.x, y0: r.y }
}

describe('패스 받을 선수는 공을 잡을 때까지 딴 데로 뛰지 않는다', () => {
  for (const meTeam of [0, 1] as const) {
    it(`조작이 받을 선수로 넘어가고, 방향키를 반대로 눌러도 공 쪽으로 간다 (내가 ${meTeam === 0 ? '홈' : '원정'})`, () => {
      const st = playing(meTeam)
      const { recv, x0 } = setupPass(st, meTeam)
      const b = st.ball
      const d0 = Math.hypot(b.x - x0, b.y - st.players[recv].y)
      // 공은 -x 쪽에 있다 → 방향키를 +x(공 반대)로 꽉 누른다
      const away: Input = { mx: 127, my: 0, buttons: 0, a: 0, b: 0 }
      let gotIt = false
      for (let i = 0; i < 40; i++) {
        step(st, soloInputs(meTeam, away))
        if (st.ball.owner === recv) {
          gotIt = true
          break
        }
        // 공이 살아 있는 동안 조작 선수는 받을 선수여야 한다
        if (st.ball.passLive && st.ball.owner < 0) expect(st.teams[meTeam].controlled).toBe(recv)
      }
      const r = st.players[recv]
      const d1 = Math.hypot(st.ball.x - r.x, st.ball.y - r.y)
      // 잡았거나, 적어도 공에서 멀어지지 않았다 (예전엔 방향키 쪽으로 도망갔다)
      expect(gotIt || d1 < d0).toBe(true)
      // 반대 방향(+x)으로 8 m 이상 도망가지 않았다
      expect(r.x - x0).toBeLessThan(4)
    })
  }

  it('S(선수 바꾸기)를 누르면 받을 선수 고정이 풀리고, 다음 틱에 다시 끌려오지 않는다', () => {
    const meTeam = 0
    const st = playing(meTeam)
    const { recv } = setupPass(st, meTeam)
    step(st, soloInputs(meTeam, EMPTY_INPUT))
    expect(st.teams[meTeam].controlled).toBe(recv)
    const press: Input = { mx: 0, my: 0, buttons: BTN_S, a: 0, b: 0 }
    step(st, soloInputs(meTeam, press))
    if (st.ball.owner < 0 && st.ball.passLive) {
      const other = st.teams[meTeam].controlled
      expect(other).not.toBe(recv)
      // 키를 뗀 다음 틱 — 예전 조건(`!(edge & BTN_S)`)이면 여기서 받을 선수로 되돌아갔다
      step(st, soloInputs(meTeam, EMPTY_INPUT))
      if (st.ball.owner < 0 && st.ball.passLive) expect(st.teams[meTeam].controlled).toBe(other)
    }
  })
})
