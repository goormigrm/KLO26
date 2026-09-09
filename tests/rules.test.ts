// 축구 규칙 — 킥오프 위치 · 골키퍼 보호 · GK 롱킥 · 스로인(손) · 오프사이드 · 파울/카드 · PK · 교체.
// 사용자 지적(2026-09-09) 네 건이 여기서 지켜지는지 본다.

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import {
  ACT_SLIDE, BOX_L, CIRCLE_R, HALF_L, HALF_W, PEN_SPOT, THROW_SPEED_MAX, type GameState,
} from '../src/core/state'
import { setupPenalty, setupRestart, performRestartKick, applyPendingSubs, resolvePending } from '../src/core/rules'
import { dist, gkPunt, markOffside } from '../src/core/ball'

const idle: [typeof EMPTY_INPUT, typeof EMPTY_INPUT] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed = 5, halfSec = 180): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec, squads: [home, away] })
}

describe('킥오프 위치 (사용자 지적 1)', () => {
  it('전원이 자기 진영에 있고, 차지 않는 팀은 센터 서클 밖', () => {
    const st = match()
    const kicker = st.restart!.kicker
    for (const p of st.players) {
      const dir = st.teams[p.team].dir
      if (p.idx !== kicker) expect(p.x * dir).toBeLessThanOrEqual(0.01)
      if (p.team !== st.kickoffTeam) expect(dist(p.x, p.y, 0, 0)).toBeGreaterThanOrEqual(CIRCLE_R)
    }
  })

  it('킥오프를 기다리는 동안 걸어 들어가도 하프라인·서클 밖으로 밀려난다', () => {
    const st = match()
    const kicker = st.restart!.kicker
    // 상대 선수 하나를 억지로 센터에 갖다 놓는다
    const intruder = st.players.find((p) => p.team !== st.kickoffTeam && !p.sk.isGK)!
    intruder.x = 1
    intruder.y = 0.5
    step(st, idle)
    expect(st.phase).toBe('kickoff')
    expect(dist(intruder.x, intruder.y, 0, 0)).toBeGreaterThanOrEqual(CIRCLE_R)
    const dir = st.teams[intruder.team].dir
    expect(intruder.x * dir).toBeLessThanOrEqual(0.01)
    expect(kicker).toBeGreaterThanOrEqual(0)
  })
})

describe('골키퍼 보호 (사용자 지적 2)', () => {
  it('손에 든 공은 슬라이딩으로 못 뺏고 파울이 된다', () => {
    const st = match()
    st.phase = 'play'
    st.restart = null
    const gk = st.players[st.teams[0].gk]
    const att = st.players.find((p) => p.team === 1 && !p.sk.isGK)!
    gk.holdT = 60
    st.ball.owner = gk.idx
    st.ball.lastTouch = gk.idx
    st.ball.lastTeam = 0
    st.ball.x = gk.x
    st.ball.y = gk.y
    st.ball.z = 1
    att.x = gk.x + 0.6
    att.y = gk.y
    att.action = ACT_SLIDE
    att.actT = 20
    att.facing = 512
    step(st, idle)
    // 공은 여전히 홈 팀 것이고, 원정 팀이 파울해 홈 팀 프리킥이 됐다
    expect(st.phase).toBe('freekick')
    expect(st.restart!.team).toBe(0)
    expect(st.stats[1].fouls).toBe(1)
  })

  it('손에 든 공은 압박(태클)으로도 못 뺏는다 — 파울', () => {
    const st = match()
    st.phase = 'play'
    st.restart = null
    const gk = st.players[st.teams[0].gk]
    const att = st.players.find((p) => p.team === 1 && !p.sk.isGK)!
    gk.holdT = 60
    st.ball.owner = gk.idx
    st.ball.lastTeam = 0
    att.x = gk.x + 0.5
    att.y = gk.y
    att.press = true
    att.tackleT = 10
    step(st, idle)
    const phase: string = st.phase
    expect(st.ball.owner === gk.idx || phase === 'freekick').toBe(true)
    expect(st.stats[1].fouls).toBeGreaterThanOrEqual(1)
  })
})

describe('골키퍼 롱킥 (사용자 지적 3)', () => {
  it('펀트는 하프라인을 넘긴다 (45 m 이상)', () => {
    const st = match()
    st.phase = 'play'
    st.restart = null
    const gk = st.players[st.teams[0].gk]
    gk.x = -HALF_L + 5
    gk.y = 0
    gk.holdT = 1
    st.ball.owner = gk.idx
    st.ball.x = gk.x
    st.ball.y = gk.y
    const x0 = st.ball.x
    gkPunt(st, gk, 0)
    // 공이 멈추거나 아웃될 때까지 굴린다
    let guard = 0
    while (st.ball.owner < 0 && Math.abs(st.ball.x) < HALF_L && guard < 600) {
      step(st, idle)
      guard++
      if (st.phase !== 'play') break
    }
    expect(st.ball.x - x0).toBeGreaterThan(45)
  })
})

describe('스로인은 손으로 (사용자 지적 4)', () => {
  it('던진 공은 느리고 뜬다', () => {
    const st = match()
    setupRestart(st, 'throwin', 0, 10, HALF_W + 0.4)
    expect(st.restart!.hands).toBe(true)
    expect(st.players[st.restart!.kicker].throwing).toBe(true)
    performRestartKick(st)
    const sp = Math.hypot(st.ball.vx, st.ball.vy)
    expect(sp).toBeLessThanOrEqual(THROW_SPEED_MAX + 0.001)
    expect(st.ball.vz).toBeGreaterThan(0)
    expect(st.ball.fromThrow).toBe(true)
  })

  it('던진 공이 직접 골로 들어가도 골이 아니다 — 골킥', () => {
    const st = match()
    setupRestart(st, 'throwin', 0, 40, HALF_W + 0.4)
    performRestartKick(st)
    // 공을 억지로 골문 안으로 보낸다
    st.ball.x = HALF_L - 0.2
    st.ball.y = 0
    st.ball.z = 1
    st.ball.vx = 20
    st.ball.vy = 0
    st.ball.owner = -1
    st.prevBallX = st.ball.x
    st.phase = 'play'
    st.restart = null
    for (let i = 0; i < 6 && st.phase === 'play'; i++) step(st, idle)
    expect(st.teams[0].goals).toBe(0)
    expect(st.phase).toBe('goalkick')
  })

  it('던진 사람이 남보다 먼저 다시 만지면 상대 프리킥', () => {
    const st = match()
    setupRestart(st, 'throwin', 0, 0, HALF_W + 0.4)
    const kicker = st.restart!.kicker
    performRestartKick(st)
    expect(st.ball.restartBy).toBe(kicker)
    // 던진 사람을 공 위로 옮겨 다시 잡게 한다
    const k = st.players[kicker]
    k.lastKick = -100
    st.ball.z = 0
    st.ball.vx = 0
    st.ball.vy = 0
    k.x = st.ball.x
    k.y = st.ball.y
    for (let i = 0; i < 4 && st.phase === 'play'; i++) step(st, idle)
    expect(st.phase).toBe('freekick')
    expect(st.restart!.team).toBe(1)
  })
})

describe('오프사이드', () => {
  it('상대 진영에서 공보다 앞 · 뒤에서 두 번째 수비수보다 앞이면 표시된다', () => {
    const st = match()
    st.phase = 'play'
    st.restart = null
    const dir = st.teams[0].dir
    const kicker = st.players.find((p) => p.team === 0 && !p.sk.isGK)!
    kicker.x = 0
    kicker.y = 0
    st.ball.x = 0
    st.ball.y = 0
    // 원정 팀 전원을 자기 진영 깊이 (오프사이드 라인 = 30)
    for (const p of st.players) if (p.team === 1) p.x = dir * 30
    const mate = st.players.find((p) => p.team === 0 && p.idx !== kicker.idx && !p.sk.isGK)!
    mate.x = dir * 40
    const onside = st.players.find((p) => p.team === 0 && p.idx !== kicker.idx && p.idx !== mate.idx && !p.sk.isGK)!
    onside.x = dir * 20
    markOffside(st, kicker)
    expect(mate.offside).toBe(true)
    expect(onside.offside).toBe(false)
    expect(kicker.offside).toBe(false)
  })

  it('자기 진영에 있으면 오프사이드가 아니다', () => {
    const st = match()
    const dir = st.teams[0].dir
    const kicker = st.players.find((p) => p.team === 0 && !p.sk.isGK)!
    kicker.x = -dir * 10
    st.ball.x = kicker.x
    for (const p of st.players) if (p.team === 1) p.x = dir * 40
    const mate = st.players.find((p) => p.team === 0 && p.idx !== kicker.idx && !p.sk.isGK)!
    mate.x = -dir * 2
    markOffside(st, kicker)
    expect(mate.offside).toBe(false)
  })

  it('스로인에는 오프사이드가 없다', () => {
    const st = match()
    const dir = st.teams[0].dir
    for (const p of st.players) if (p.team === 1) p.x = dir * 10
    for (const p of st.players) if (p.team === 0 && !p.sk.isGK) p.x = dir * 40
    setupRestart(st, 'throwin', 0, 0, HALF_W + 0.4)
    performRestartKick(st)
    expect(st.players.every((p) => !p.offside)).toBe(true)
  })
})

describe('파울 · 카드 · PK', () => {
  it('박스 안 파울은 PK 가 된다', () => {
    const st = match()
    const dir = st.teams[1].dir
    const spotX = dir * (HALF_L - PEN_SPOT)
    st.pending = { kind: 'foul', team: 1, by: st.teams[0].start + 2, x: -dir * (HALF_L - 8), y: 3, card: 0, penalty: true }
    resolvePending(st)
    expect(st.phase).toBe('penalty')
    expect(st.ball.x).toBeCloseTo(spotX, 5)
    expect(st.ball.y).toBeCloseTo(0, 5)
  })

  it('PK 는 킥커와 두 GK 말고 전원이 박스·아크 밖', () => {
    const st = match()
    setupPenalty(st, 0)
    const r = st.restart!
    const dir = st.teams[0].dir
    const oppGk = st.teams[1].gk
    for (const p of st.players) {
      if (p.idx === r.kicker || p.idx === oppGk) continue
      expect(dist(p.x, p.y, r.x, r.y)).toBeGreaterThanOrEqual(CIRCLE_R)
      const inBox = Math.abs(p.x - dir * HALF_L) < BOX_L && Math.abs(p.y) < 20.16
      expect(inBox).toBe(false)
    }
    expect(Math.abs(st.players[oppGk].x)).toBeGreaterThan(HALF_L - 1)
  })

  it('경고 두 번이면 퇴장이고, 퇴장 선수는 피치 밖으로 나간다', () => {
    const st = match()
    const off = st.players[st.teams[0].start + 3]
    off.yellow = 1
    st.pending = { kind: 'foul', team: 1, by: off.idx, x: 0, y: 0, card: 1, penalty: false }
    resolvePending(st)
    expect(off.sentOff).toBe(true)
    expect(Math.abs(off.y)).toBeGreaterThan(HALF_W)
    expect(st.stats[0].reds).toBe(1)
  })

  it('퇴장 선수는 오프사이드 라인·조작 대상에서 빠진다', () => {
    const st = match()
    const off = st.players[st.teams[0].start + 3]
    off.sentOff = true
    off.x = 0
    off.y = HALF_W + 3
    st.phase = 'play'
    st.restart = null
    const before = { x: off.x, y: off.y }
    for (let i = 0; i < 30; i++) step(st, idle)
    expect(off.x).toBe(before.x)
    expect(off.y).toBe(before.y)
  })
})

describe('교체', () => {
  it('데드볼에서 벤치 선수가 들어오고 남은 횟수가 준다', () => {
    const st = match()
    const team = st.teams[0]
    expect(team.bench.length).toBe(7)
    const inSpec = team.bench[0]
    team.pendingSub = { out: 5, in: 0 }
    applyPendingSubs(st)
    const p = st.players[team.start + 5]
    expect(p.spec.id).toBe(inSpec.id)
    expect(p.subbedIn).toBe(true)
    expect(team.subsLeft).toBe(2)
    expect(team.bench.length).toBe(6)
  })

  it('아무 데드볼에서나 들어간다 — 스로인에서도 (골·하프타임만이 아니다)', () => {
    const st = match()
    const team = st.teams[0]
    const before = st.players[team.start + 7].spec.id
    team.pendingSub = { out: 7, in: 1 }
    setupRestart(st, 'throwin', 1, 0, HALF_W + 0.4)
    expect(st.players[team.start + 7].spec.id).not.toBe(before)
    expect(team.subsLeft).toBe(2)
  })

  it('교체 횟수를 다 쓰면 더 못 바꾼다', () => {
    const st = match()
    const team = st.teams[0]
    team.subsLeft = 0
    const before = st.players[team.start + 5].spec.id
    team.pendingSub = { out: 5, in: 0 }
    applyPendingSubs(st)
    expect(st.players[team.start + 5].spec.id).toBe(before)
  })
})
