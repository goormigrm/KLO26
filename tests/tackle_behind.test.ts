// 뒤에서 오는 태클 (사용자 제보 2026-09-15 저녁: "공격수와 골키퍼 1:1 에서 뒤에서 온 수비수가 태클로 뺏는 장면이 잦다 — 규칙에 안 맞는다").
//
// - 소유자가 달리는데 등 뒤에서 도전하면: 뺏을 확률 ×0.25, 파울이 잦고, 파울이면 최소 경고.
// - 명백한 득점 기회(소유자와 골문 사이에 수비수 없음 · 35 m 안)면 퇴장.
// - 정면 도전은 예전 그대로(뺏는 쪽이 많다).
// - 봇 수비수는 뒤에서 쫓을 때 덤비지 않고(press=false) 골사이드로 앞지르려 한다. contestBall 도 봇의 뒤 도전은 건너뛴다 —
//   뒤에서 덤비는 것은 사람이 조작하는 선수뿐이고, 그 대가(파울·경고·퇴장)를 치른다.

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { aiDecide, updateAnchors } from '../src/core/ai'
import { contestBall, slideContest } from '../src/core/ball'
import { synthSquad } from '../src/core/synth'
import { ACT_RUN, ACT_SLIDE, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function playState(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  st.phase = 'play'
  st.restart = null
  st.pending = null
  for (const p of st.players) {
    p.x = p.team === 0 ? -45 : 45
    p.y = (p.idx % 11) * 4 - 20
    p.vx = 0
    p.vy = 0
    p.press = false
    p.tackleT = 0
    p.action = ACT_RUN
    p.actT = 0
    p.yellow = 0
  }
  return st
}

/**
 * 홈 ST(9)가 상대 골문 22 m 앞에서 골문 쪽으로 6 m/s 로 달린다. 원정 수비수(15)가 `where` 에서 압박한다.
 * 도전을 최대 90틱 굴려 결과를 돌려준다: 'steal' · 'foul'(+card) · 'none'
 */
function contest(seed: number, where: 'back' | 'front', dogso: boolean, slide = false): { out: string; card: number } {
  const st = playState(seed)
  const dir = st.teams[0].dir
  const gx = dir * HALF_L
  const o = st.players[9]
  const q = st.players[15]
  o.x = gx - dir * 22
  o.y = 0
  o.vx = dir * 6
  o.vy = 0
  o.facing = dir > 0 ? 0 : 512
  st.ball.owner = o.idx
  st.ball.x = o.x + dir * 0.4
  st.ball.y = 0
  st.ball.z = 0
  // 다른 원정 필드 선수 — 명백한 기회면 전부 소유자 뒤(골문과 소유자 사이에 아무도 없다), 아니면 골문 앞에 둘
  for (const p of st.players) {
    if (p.team !== 1 || p.sk.isGK || p.idx === 15) continue
    p.x = o.x - dir * 12
  }
  if (!dogso) {
    st.players[13].x = gx - dir * 12
    st.players[13].y = 2
    st.players[14].x = gx - dir * 10
    st.players[14].y = -3
  }
  q.x = where === 'back' ? o.x - dir * 0.9 : o.x + dir * 0.9
  q.y = 0.2
  q.vx = dir * 6.5
  q.vy = 0
  q.press = true
  // 뒤에서 덤비는 건 **사람이 조작하는 선수만** 한다 (봇은 뒤에서 도전하지 않는다) — 원정을 사람 팀으로, q 를 조작 선수로
  st.teams[1].human = true
  st.teams[1].controlled = q.idx
  if (slide) {
    q.action = ACT_SLIDE
    q.actT = 20
    q.facing = dir > 0 ? 0 : 512
  }
  for (let t = 0; t < 90; t++) {
    if (slide) slideContest(st, q)
    else contestBall(st, o)
    if (st.pending) return { out: st.pending.kind, card: st.pending.card }
    if (st.ball.owner !== o.idx) return { out: 'steal', card: 0 }
    // 둘이 같이 달린다 — 공도 소유자 발 앞
    o.x += o.vx / 60
    q.x += q.vx / 60
    st.ball.x = o.x + dir * 0.4
  }
  return { out: 'none', card: 0 }
}

function tally(where: 'back' | 'front', dogso: boolean, slide = false, n = 120): { steal: number; foul: number; none: number; yellow: number; red: number } {
  const r = { steal: 0, foul: 0, none: 0, yellow: 0, red: 0 }
  for (let i = 0; i < n; i++) {
    const c = contest(500 + i, where, dogso, slide)
    if (c.out === 'steal') r.steal++
    else if (c.out === 'foul') {
      r.foul++
      if (c.card === 1) r.yellow++
      if (c.card === 2) r.red++
    } else r.none++
  }
  return r
}

describe('뒤에서 오는 태클', () => {
  it('뒤에서 달려드는 압박은 파울이 뺏기보다 훨씬 많고, 파울이면 경고 이상이다', () => {
    const back = tally('back', false)
    expect(back.foul).toBeGreaterThan(back.steal * 3)
    expect(back.yellow + back.red).toBeGreaterThanOrEqual(Math.floor(back.foul * 0.9))
  })

  it('명백한 득점 기회를 뒤에서 끊으면 퇴장이다', () => {
    const back = tally('back', true)
    expect(back.foul).toBeGreaterThan(0)
    expect(back.red).toBeGreaterThanOrEqual(Math.floor(back.foul * 0.9))
  })

  it('정면(옆에서 앞서 들어간) 도전은 뺏는 쪽이 파울보다 많다', () => {
    const front = tally('front', false)
    expect(front.steal).toBeGreaterThan(front.foul)
    // 정면은 카드가 드물다
    expect(front.red).toBe(0)
  })

  it('뒤에서 미끄러지는 슬라이딩도 파울·경고가 대부분이고, 기회 저지면 퇴장', () => {
    const back = tally('back', false, true)
    expect(back.foul).toBeGreaterThan(back.steal * 2)
    expect(back.yellow + back.red).toBeGreaterThanOrEqual(Math.floor(back.foul * 0.9))
    const dogso = tally('back', true, true)
    expect(dogso.red).toBeGreaterThanOrEqual(Math.floor(dogso.foul * 0.9))
  })

  it('봇 수비수는 뒤에서 쫓을 때 덤비지 않고(press=false) 소유자 앞·골사이드로 달린다', () => {
    const st = playState(7)
    const dir = st.teams[0].dir
    const gx = dir * HALF_L
    const o = st.players[9]
    o.x = gx - dir * 30
    o.y = 3
    o.vx = dir * 6
    o.vy = 0
    o.facing = dir > 0 ? 0 : 512
    st.ball.owner = o.idx
    st.ball.x = o.x
    st.ball.y = o.y
    const q = st.players[15]
    q.x = o.x - dir * 3
    q.y = 3
    q.vx = dir * 6
    // 다른 원정 선수는 멀리 (q 가 rank 0)
    updateAnchors(st)
    aiDecide(st, q)
    expect(q.press).toBe(false)
    expect(q.tx * dir).toBeGreaterThan(o.x * dir + 2)
    // 옆·앞에 있으면 예전처럼 붙는다
    q.x = o.x + dir * 1.5
    aiDecide(st, q)
    expect(q.press).toBe(true)
  })
})
