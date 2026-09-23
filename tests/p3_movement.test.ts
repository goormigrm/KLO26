// P3 엔진 움직임 (2026-09-15, 개발계획 2장) — 침투 러닝 · GK 다이브 2종 · 태클 넘어짐.
import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { gkCatch, offsideLineX, slideContest } from '../src/core/ball'
import { ACT_DIVE, ACT_FALLEN, ACT_RUN, ACT_SLIDE, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 120, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

function park(st: GameState, keep: number[]): void {
  for (const p of st.players) {
    if (keep.includes(p.idx)) continue
    p.x = -45 + (p.idx % 11) * 0.6
    p.y = p.team === 0 ? -30 : 30
    p.vx = 0
    p.vy = 0
  }
}

describe('침투 러닝 — 받을 선수가 패스 전에 뛴다', () => {
  it('앞이 빈 공격수는 소유자가 상대 진영에 있으면 오프사이드 라인 바로 뒤까지 사선으로 달린다', () => {
    // 소유자는 사람 팀 조작 선수(입력 없음 = 서 있다) — 봇이면 10틱 만에 패스해 버린다
    const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
    const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
    const st = createState({ seed: 61, halfSec: 120, squads: [home, away], human: [true, false], bots: [2, 2] })
    let guard = 0
    while (st.phase !== 'play' && guard++ < 2000) step(st, [{ ...EMPTY_INPUT, buttons: 1 }, EMPTY_INPUT])
    step(st, idle)
    step(st, idle)
    const t = st.teams[0]
    const dir = t.dir
    const owner = st.players[t.start + 6] // CM
    const fw = st.players.find((p) => p.team === 0 && p.band === 'FW')!
    const def1 = st.players[st.teams[1].start + 2]
    const def2 = st.players[st.teams[1].start + 3]
    const gk = st.players[st.teams[1].gk]
    park(st, [owner.idx, fw.idx, def1.idx, def2.idx, gk.idx])
    owner.x = dir * 10
    owner.y = 0
    owner.vx = dir * 4
    owner.vy = 0
    fw.x = dir * 18
    fw.y = -8
    fw.vx = 0
    fw.vy = 0
    // 수비 라인은 30 m — 공격수 앞 7 m 는 비어 있다
    def1.x = dir * 30
    def1.y = -12
    def2.x = dir * 30
    def2.y = 12
    gk.x = dir * (HALF_L - 1)
    gk.y = 0
    st.ball.owner = owner.idx
    st.ball.x = owner.x
    st.ball.y = owner.y
    t.controlled = owner.idx
    const x0 = fw.x * dir
    const tick0 = st.tick
    for (let i = 0; i < 90; i++) step(st, idle)
    // 앞으로 갔고, 라인은 넘지 않았다
    expect(st.ball.owner).toBe(owner.idx)
    expect(fw.x * dir).toBeGreaterThan(x0 + 3)
    // 수비 라인은 계속 움직인다 — 라인 근처(±1 m)까지만, 판정은 킥 순간 스냅샷이다
    expect(fw.x * dir).toBeLessThanOrEqual(offsideLineX(st, 0) * dir + 1.0)
    // 90틱 사이에 침투가 발동했다 (앞이 막히면 멈추는 게 설계라 마지막 틱까지 유지될 필요는 없다)
    expect(fw.runT).toBeGreaterThan(tick0)
  })
})

describe('골키퍼 다이브 2종', () => {
  function shotAt(st: GameState, z0: number, vz: number): GameState {
    const gk = st.players[st.teams[1].gk]
    const dir = st.teams[0].dir
    park(st, [gk.idx])
    gk.x = dir * (HALF_L - 1)
    gk.y = 0
    gk.vx = 0
    gk.vy = 0
    gk.action = ACT_RUN
    gk.actT = 0
    gk.holdT = 0
    const b = st.ball
    b.owner = -1
    b.x = dir * (HALF_L - 12)
    b.y = 0
    b.z = z0
    b.vx = dir * 26
    b.vy = 5.5 // 2.5 m 옆 코너 쪽
    b.vz = vz
    b.shotBy = st.teams[0].start + 9
    b.kickTick = st.tick - 30 // 반응 시간은 지났다
    b.onTarget = true
    // 공을 한 틱씩 옮기며 골키퍼가 날 때까지 (2026-09-23: 먼 공은 옆걸음으로 기다렸다 난다 — 아래 '날 때 기다리기')
    for (let k = 0; k < 30 && gk.action !== ACT_DIVE; k++) {
      gkCatch(st, gk)
      if (gk.action === ACT_DIVE) break
      b.x += b.vx / 60
      b.y += b.vy / 60
      b.vz -= 9.81 / 60
      b.z = Math.max(0, b.z + b.vz / 60)
    }
    return st
  }

  it('머리 높이로 오는 공에는 뛰어오르고(하이), 땅볼에는 낮게 눕는다(로우)', () => {
    const hi = shotAt(match(62), 1.2, 3.5)
    const gkH = hi.players[hi.teams[1].gk]
    expect(gkH.action).toBe(ACT_DIVE)
    expect(gkH.diveHigh).toBe(true)
    const lo = shotAt(match(63), 0.1, 0)
    const gkL = lo.players[lo.teams[1].gk]
    expect(gkL.action).toBe(ACT_DIVE)
    expect(gkL.diveHigh).toBe(false)
  })
})

describe('골키퍼 — 날 때 기다리기 (2026-09-23)', () => {
  it('먼 슛에는 바로 몸을 날리지 않고 경로 쪽으로 옆걸음 — 공이 오기 직전(0.5 초 안)에 난다', () => {
    const st = match(65)
    const gk = st.players[st.teams[1].gk]
    const dir = st.teams[0].dir
    park(st, [gk.idx, st.teams[0].start + 9])
    gk.x = dir * (HALF_L - 1)
    gk.y = 0
    gk.vx = 0
    gk.vy = 0
    gk.action = ACT_RUN
    const b = st.ball
    b.owner = -1
    b.x = dir * (HALF_L - 22)
    b.y = 0
    b.z = 0.3
    b.vx = dir * 24
    b.vy = 2.3 // 골라인에서 2.1 m 옆
    b.vz = 1
    b.shotBy = st.teams[0].start + 9
    b.lastTouch = st.teams[0].start + 9
    b.lastTeam = 0
    b.kickTick = st.tick
    b.onTarget = true
    let diveAt = -1
    let maxY = 0
    for (let k = 0; k < 70 && diveAt < 0; k++) {
      step(st, [EMPTY_INPUT, EMPTY_INPUT])
      maxY = Math.max(maxY, Math.abs(gk.y))
      if (gk.action === ACT_DIVE) diveAt = k
      if (st.phase !== 'play' || b.owner >= 0) break
    }
    // 반응 시간(≤ 0.35 초)이 지나자마자 날지 않았다 — 옆걸음으로 먼저 다가섰다
    expect(maxY).toBeGreaterThan(0.2)
    if (diveAt >= 0) {
      const left = Math.abs(dir * HALF_L - b.x) / 24
      expect(left).toBeLessThan(0.55)
    }
  })
})

describe('태클 넘어짐', () => {
  it('슬라이딩에 공을 걷어차이면 소유자는 넘어진다', () => {
    const st = match(64)
    const t = st.teams[0]
    const o = st.players[t.start + 7]
    const q = st.players[st.teams[1].start + 5]
    park(st, [o.idx, q.idx])
    o.x = 0
    o.y = 0
    o.action = ACT_RUN
    q.x = -0.4
    q.y = 0
    q.facing = 0 // +x 를 본다 — 발 앞 0.5 m 가 공
    q.action = ACT_SLIDE
    q.actT = 20
    q.lastKick = st.tick - 100
    st.ball.owner = o.idx
    st.ball.x = 0.1
    st.ball.y = 0
    st.ball.z = 0
    // 태클 성공 확률(0.45 + 0.4·tck)에 걸릴 때까지 시드를 바꿔 본다
    let fell = false
    for (let seed = 0; seed < 40 && !fell; seed++) {
      const s2 = match(64 + seed)
      const o2 = s2.players[s2.teams[0].start + 7]
      const q2 = s2.players[s2.teams[1].start + 5]
      park(s2, [o2.idx, q2.idx])
      o2.x = 0
      o2.y = 0
      o2.action = ACT_RUN
      q2.x = -0.4
      q2.y = 0
      q2.facing = 0
      q2.action = ACT_SLIDE
      q2.actT = 20
      q2.lastKick = s2.tick - 100
      s2.ball.owner = o2.idx
      s2.ball.x = 0.1
      s2.ball.y = 0
      s2.ball.z = 0
      slideContest(s2, q2)
      if (s2.ball.owner === -1 && s2.stats[1].tackles > 0) {
        expect(o2.action).toBe(ACT_FALLEN)
        fell = true
      }
    }
    expect(fell).toBe(true)
    void st
  })
})
