// 2026-09-11 저녁 제보 (15차) — 패스 방향 · D 압박 · 골키퍼 다이브 뒤 일어나기.
import { describe, expect, it } from 'vitest'
import { BTN_D, BTN_S, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { pickPassTarget } from '../src/core/ball'
import { ACT_DIVE, ACT_FALLEN, ACT_RUN, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed: number, human = false): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 120, squads: [home, away], human: [human, false], bots: [2, 2] })
  if (human) step(st, [{ ...EMPTY_INPUT, buttons: BTN_S }, EMPTY_INPUT])
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

/** 22명을 멀리 치우고 몇 명만 세운다 */
function clearAll(st: GameState, keep: number[]): void {
  for (const p of st.players) {
    if (keep.includes(p.idx)) continue
    p.x = -45 + (p.idx % 11) * 0.6
    p.y = p.team === 0 ? -30 : 30
    p.vx = 0
    p.vy = 0
  }
}

describe('패스 — 방향키 쪽 가까운 선수', () => {
  it('정면 20 m 동료보다 방향키 쪽 8 m 동료를 고른다', () => {
    const st = match(51)
    const t = st.teams[0]
    const dir = t.dir
    const me = st.players[t.start + 6]
    const near = st.players[t.start + 7]
    const far = st.players[t.start + 9]
    clearAll(st, [me.idx, near.idx, far.idx])
    me.x = 0
    me.y = 0
    near.x = dir * 7
    near.y = 3 // 각도 약 23°
    far.x = dir * 20
    far.y = 0 // 정면
    st.ball.owner = me.idx
    st.ball.x = me.x
    st.ball.y = me.y
    expect(pickPassTarget(st, me, dir, 0, false)).toBe(near.idx)
  })

  it('방향키를 놓은 직후 뗀 S 패스는 마지막으로 눌렀던 방향으로 간다', () => {
    const st = match(52, true)
    const t = st.teams[0]
    const dir = t.dir
    const me = st.players[t.start + 6]
    const up = st.players[t.start + 7]
    const front = st.players[t.start + 9]
    clearAll(st, [me.idx, up.idx, front.idx])
    me.x = 0
    me.y = 0
    me.facing = dir > 0 ? 0 : 512 // 정면(골문 쪽)을 본다
    up.x = 0
    up.y = 12
    front.x = dir * 12
    front.y = 0
    st.ball.owner = me.idx
    st.ball.x = 0
    st.ball.y = 0
    t.controlled = me.idx
    me.gotT = st.tick - 60
    // ↑ 를 누른 채 S 홀드 10틱 → 방향키를 먼저 놓고 3틱 → S 를 뗀다
    for (let i = 0; i < 10; i++) step(st, [{ mx: 0, my: 127, buttons: BTN_S, a: 0, b: 0 }, EMPTY_INPUT])
    for (let i = 0; i < 3; i++) step(st, [{ mx: 0, my: 0, buttons: BTN_S, a: 0, b: 0 }, EMPTY_INPUT])
    step(st, [EMPTY_INPUT, EMPTY_INPUT])
    expect(st.ball.owner).toBe(-1)
    expect(st.ball.vy).toBeGreaterThan(Math.abs(st.ball.vx))
    expect(st.ball.passTo).toBe(up.idx)
  })
})

describe('수비 D — 공 소유자에게 달린다', () => {
  // 15차엔 "1초 안에 3 m" 로 두어 실패했다(skip). 원인은 세팅이 아니라 **가속**이었다 — 10차에 가속을 현실 수준
  // (5.5+3.0·acc)으로 낮춘 뒤라, 서 있다가 반대 방향키를 25% 섞은 채 8 m 를 1초에 못 간다(1초 뒤 4.4 m · 초속 6.1 m,
  // 2026-09-16 실측). 압박은 정상이므로 시간을 1.7초로 두고 켰다. 1초 시점엔 최소한 5 m 안까지는 와야 한다.
  it('방향키를 반대로 누르고 있어도 소유자에게 달려간다 (1초 뒤 5 m 안 · 1.7초 뒤 3 m 안)', () => {
    // 두 팀 다 사람 — 상대 조작 선수(공 소유자)는 입력이 없어 제자리에 선다
    const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
    const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
    const st = createState({ seed: 53, halfSec: 120, squads: [home, away], human: [true, true], bots: [2, 2] })
    let guard = 0
    while (st.phase !== 'play' && guard++ < 2000) step(st, [{ ...EMPTY_INPUT, buttons: BTN_S }, { ...EMPTY_INPUT, buttons: BTN_S }])
    expect(st.phase).toBe('play')
    // 킥오프에 쓴 S 가 "뗀 순간 패스"로 읽히지 않게 빈 입력으로 두 틱
    step(st, idle)
    step(st, idle)
    const t = st.teams[0]
    const dir = t.dir
    const me = st.players[t.start + 6]
    const opp = st.players[st.teams[1].start + 8]
    clearAll(st, [me.idx, opp.idx])
    opp.x = 0
    opp.y = 0
    opp.vx = 0
    opp.vy = 0
    me.x = -dir * 8
    me.y = 0
    me.vx = 0
    me.vy = 0
    me.stamina = 1
    st.ball.owner = opp.idx
    st.ball.x = 0
    st.ball.y = 0
    t.controlled = me.idx
    st.teams[1].controlled = opp.idx
    let minD = 99
    let dAt60 = 99
    for (let i = 0; i < 100; i++) {
      step(st, [{ mx: -dir * 127, my: 0, buttons: BTN_D, a: 0, b: 0 }, EMPTY_INPUT])
      const d = Math.hypot(me.x - opp.x, me.y - opp.y)
      minD = Math.min(minD, d)
      if (i === 59) dAt60 = d
    }
    expect(t.controlled).toBe(me.idx)
    expect(me.press).toBe(true)
    expect(dAt60).toBeLessThan(5)
    expect(minD).toBeLessThan(3)
  })
})

describe('골키퍼 — 다이브 뒤 일어난다', () => {
  it('다이브가 끝나면 0.5 초 동안 넘어져 있고 그 뒤 선다', () => {
    const st = match(54)
    const gk = st.players[st.teams[1].gk]
    clearAll(st, [gk.idx])
    st.ball.owner = -1
    st.ball.x = 0
    st.ball.y = 0
    st.ball.vx = 0
    st.ball.vy = 0
    gk.action = ACT_DIVE
    gk.actT = 2
    gk.holdT = 0
    gk.vx = 0
    gk.vy = 0
    step(st, idle)
    step(st, idle)
    expect(gk.action).toBe(ACT_FALLEN)
    expect(gk.actT).toBeGreaterThanOrEqual(28)
    for (let i = 0; i < 31; i++) step(st, idle)
    expect(gk.action).toBe(ACT_RUN)
  })

  it('공을 잡았으면 바로 일어난다', () => {
    const st = match(55)
    const gk = st.players[st.teams[1].gk]
    clearAll(st, [gk.idx])
    st.ball.owner = gk.idx
    gk.action = ACT_DIVE
    gk.actT = 2
    gk.holdT = 80
    step(st, idle)
    step(st, idle)
    expect(gk.action).toBe(ACT_RUN)
  })
})
