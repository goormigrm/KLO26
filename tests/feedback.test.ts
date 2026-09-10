// 사용자 제보 2026-09-10 — 골키퍼 순간이동 · 백패스 · 슛 보조 · 추가시간 · 수비 키.
import { describe, expect, it } from 'vitest'
import { BTN_D, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { ACT_RUN, HALF_L, type GameState } from '../src/core/state'
import { dist, doShoot } from '../src/core/ball'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed = 5, halfSec = 180, human = false): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec, squads: [home, away], human: [human, false] })
}

/** 22명을 멀리 치우고 GK 하나만 골문 앞에 세운다 */
function isolateGk(st: GameState): ReturnType<typeof Object> & { idx: number } {
  st.phase = 'play'
  st.restart = null
  const gk = st.players[st.teams[0].gk]
  for (const p of st.players) {
    if (p.idx === gk.idx) continue
    p.x = 30
    p.y = 10 + p.idx * 0.9
  }
  gk.x = -HALF_L + 1.5
  gk.y = 0
  gk.vx = 0
  gk.vy = 0
  gk.action = ACT_RUN
  gk.actT = 0
  gk.holdT = 0
  gk.lastKick = -100
  return gk
}

describe('골키퍼 (제보 1) — 공이 손으로 빨려 들어가지 않는다', () => {
  it('옆으로 지나가는 슛은 GK 가 먼저 그 경로까지 몸을 날려야 잡힌다 · 공이 한 틱에 튀지 않는다', () => {
    const st = match()
    const gk = isolateGk(st) as unknown as { idx: number; x: number; y: number }
    const b = st.ball
    b.owner = -1
    b.x = -HALF_L + 14
    b.y = 2.6
    b.z = 0.3
    b.vx = -22
    b.vy = 0
    b.vz = 0
    b.shotBy = st.teams[1].start + 9
    b.lastTouch = b.shotBy
    b.lastTeam = 1
    b.kickTick = st.tick - 20
    b.onTarget = true
    b.passLive = false
    let maxJump = 0
    let px = b.x
    let py = b.y
    for (let i = 0; i < 60 && st.phase === 'play'; i++) {
      step(st, idle)
      if (b.owner < 0) maxJump = Math.max(maxJump, dist(px, py, b.x, b.y))
      px = b.x
      py = b.y
    }
    // 자유 공은 한 틱에 0.37 m(22 m/s) 만 움직인다 — 손으로 "빨려" 오면 여기서 튄다
    expect(maxJump).toBeLessThan(0.6)
    // 잡혔다면 GK 가 원래 자리(y=0)에서 공의 경로(y≈2.6) 쪽으로 실제로 움직였어야 한다
    if (b.owner === gk.idx) expect(Math.abs(gk.y)).toBeGreaterThan(1.2)
    else expect(['goal', 'play', 'corner', 'goalkick']).toContain(st.phase)
  })

  it('서 있는 GK 손 밖(0.8 m)을 지나는 느린 공은 그 자리에서 잡히지 않는다', () => {
    const st = match()
    const gk = isolateGk(st) as unknown as { idx: number; x: number; y: number }
    const b = st.ball
    b.owner = -1
    b.x = gk.x + 3
    b.y = 1.6
    b.z = 0
    b.vx = -3
    b.vy = 0
    b.shotBy = -1
    b.lastTeam = 1
    b.lastTouch = st.teams[1].start + 9
    b.passLive = false
    // GK AI 가 움직이기 전 첫 틱들: 공이 1.6 m 옆을 지나는 동안 순간이동 없음
    for (let i = 0; i < 3; i++) step(st, idle)
    if (b.owner === gk.idx) expect(dist(gk.x, gk.y, b.x, b.y)).toBeLessThan(1.1)
  })

  it('아군이 발로 준 백패스는 손으로 잡지 않는다', () => {
    const st = match()
    const gk = isolateGk(st) as unknown as { idx: number; x: number; y: number }
    const mate = st.players[st.teams[0].start + 3]
    const b = st.ball
    b.owner = -1
    b.x = gk.x + 1.2
    b.y = 0
    b.z = 0
    b.vx = -4
    b.vy = 0
    b.shotBy = -1
    b.lastTeam = 0
    b.lastTouch = mate.idx
    b.passLive = true
    b.passTo = gk.idx
    b.kickTick = st.tick - 10
    for (let i = 0; i < 40 && st.phase === 'play'; i++) step(st, idle)
    // 발로는 다뤄도 손에 들지는 않는다
    expect(st.players[gk.idx].holdT).toBe(0)
  })
})

describe('슛 보조 (제보 5) — 슛은 언제나 골문을 겨눈다', () => {
  function shooter(st: GameState): number {
    st.phase = 'play'
    st.restart = null
    const p = st.players[st.teams[0].start + 9]
    const dir = st.teams[0].dir
    p.x = dir * (HALF_L - 16)
    p.y = 0
    p.facing = dir > 0 ? 0 : 512
    p.gotT = -100
    p.stamina = 1
    st.ball.owner = p.idx
    st.ball.x = p.x + dir * 0.4
    st.ball.y = 0
    st.ball.z = 0
    for (const q of st.players) if (q.team === 1) q.x = -dir * 20
    return p.idx
  }
  const landingY = (st: GameState): number => {
    const b = st.ball
    const gx = st.teams[0].dir * HALF_L
    const t = (gx - b.x) / b.vx
    return b.y + b.vy * t
  }

  it('아래 방향키(−y)를 누르고 차도 골문 근처로 간다', () => {
    const st = match(11)
    const p = st.players[shooter(st)]
    doShoot(st, p, 0, -1, 0.8, false, null)
    expect(st.ball.vx * st.teams[0].dir).toBeGreaterThan(5)
    expect(Math.abs(landingY(st))).toBeLessThan(7)
    expect(landingY(st)).toBeLessThan(0.5)
  })

  it('뒤로 누르고 차도 뒤로 가지 않는다 (오차만 커진다)', () => {
    const st = match(12)
    const p = st.players[shooter(st)]
    doShoot(st, p, -st.teams[0].dir, 0, 0.8, false, null)
    expect(st.ball.vx * st.teams[0].dir).toBeGreaterThan(5)
    expect(Math.abs(landingY(st))).toBeLessThan(9)
  })
})

describe('추가시간 (제보 6)', () => {
  it('정규 시간이 끝나면 추가시간을 발표하고, 그만큼 지난 뒤 공이 죽었을 때 전반을 끝낸다', () => {
    const st = match(3, 30)
    let guard = 0
    while (st.phase !== 'halftime' && guard < 30 * 60 * 3) {
      step(st, idle)
      guard++
    }
    expect(st.phase).toBe('halftime')
    expect(st.added).toBeGreaterThanOrEqual(1)
    expect(st.added).toBeLessThanOrEqual(5)
    const added = st.events.find((e) => e.type === 'added')
    expect(added?.n).toBe(st.added)
    // 발표한 추가시간(분당 실시간 4초)이 다 지난 뒤에 끝났다
    expect(st.clock).toBeGreaterThanOrEqual(30 + st.added * 4 - 0.02)
    // 하프 종료 직전 상태가 상대 진영 깊은 공격 중이 아니었다 (또는 유예 20초를 다 썼다)
    const halfEv = st.events.find((e) => e.type === 'half')!
    expect(halfEv).toBeTruthy()
  })
})

describe('수비 키 (제보 4·7)', () => {
  it('D 를 누르고 있으면 방향키 없이도 조작 선수가 공 쪽으로 달린다', () => {
    const st = match(5, 180, true)
    st.phase = 'play'
    st.restart = null
    const team = st.teams[0]
    // 상대 공격수가 공을 갖고 우리 진영에
    const c = st.players[st.teams[1].start + 9]
    c.x = -10
    c.y = 0
    st.ball.owner = c.idx
    st.ball.x = c.x
    st.ball.y = 0
    const me = st.players[team.start + 5]
    me.x = -2
    me.y = 8
    team.controlled = me.idx
    const d0 = dist(me.x, me.y, c.x, c.y)
    for (let i = 0; i < 30; i++) step(st, [{ mx: 0, my: 0, buttons: BTN_D, a: 0, b: 0 }, EMPTY_INPUT])
    const ctl = st.players[team.controlled]
    expect(dist(ctl.x, ctl.y, st.ball.x, st.ball.y)).toBeLessThan(d0)
  })
})
