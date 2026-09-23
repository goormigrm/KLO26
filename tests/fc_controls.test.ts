// FC 온라인 조작 맞추기 (2026-09-23, 사용자 "FC 온라인에 비해 조작법이 부족한 부분을 모두 구현") — DESIGN 3.1a.
// 새 키 하나하나를 sim 에서 직접 눌러 본다. 봇은 이 경로를 안 타므로 봇 대 봇 결과는 determinism·match 테스트가 지킨다.

import { describe, expect, it } from 'vitest'
import {
  BTN_A, BTN_BAL_UP, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_F, BTN_GK, BTN_PACE, BTN_Q, BTN_S, BTN_SPACE, BTN_TAC2, BTN_TAC3, BTN_W, BTN_Z,
  EMPTY_INPUT, PRESET_SHIFT, type Input,
} from '../src/core/input'
import { POWER_TICKS, createState, step } from '../src/core/sim'
import { doShoot, gkCatch } from '../src/core/ball'
import { aiDecide } from '../src/core/ai'
import { performRestartKick, setupFreeKick, setupPenalty, setupRestart } from '../src/core/rules'
import { synthSquad } from '../src/core/synth'
import { ACT_DIVE, ACT_FALLEN, ACT_KICK, ACT_RUN, ACT_SLIDE, HALF_L, type GameState } from '../src/core/state'
import { BUILTIN_TACTICS } from '../src/core/tactics'

function inp(buttons: number, mx = 0, my = 0): Input {
  return { mx, my, buttons, a: 0, b: 0 }
}

/** 팀 0(또는 1)을 사람으로, play 상태 · 두 팀을 멀리 떨어뜨려 세운다 */
function playState(seed: number, humanTeam: 0 | 1 = 0): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [home, away], human: humanTeam === 0 ? [true, false] : [false, true] })
  st.phase = 'play'
  st.restart = null
  st.pending = null
  for (const p of st.players) {
    p.x = p.team === 0 ? -45 : 45
    p.y = (p.idx % 11) * 3 - 15
    p.vx = 0
    p.vy = 0
    p.facing = p.team === 0 ? 0 : 512
    p.action = ACT_RUN
    p.actT = 0
    p.press = false
  }
  st.players[0].x = -50
  st.players[0].y = 0
  st.players[11].x = 50
  st.players[11].y = 0
  return st
}

function give(st: GameState, idx: number): void {
  const p = st.players[idx]
  const b = st.ball
  b.owner = idx
  b.lastTouch = idx
  b.lastTeam = p.team
  b.x = p.x + 0.3
  b.y = p.y
  b.z = 0
  b.vx = p.vx
  b.vy = p.vy
  b.vz = 0
  b.passLive = false
  b.passTo = -1
  b.restartBy = -1
  p.gotT = st.tick - 100
}

/** 팀 t 에게 입력을 주고 한 틱 */
function tick(st: GameState, t: 0 | 1, i: Input): void {
  step(st, t === 0 ? [i, EMPTY_INPUT] : [EMPTY_INPUT, i])
}

/** 홈 ST(9)가 (x, 0)에서 +x 로 달리며 공을 가졌다 — 앞 12 m 에 동료(10) */
function carrier(seed: number, x = 0, speed = 6): GameState {
  const st = playState(seed)
  const p = st.players[9]
  p.x = x
  p.y = 0
  p.vx = speed
  p.facing = 0
  const mate = st.players[10]
  mate.x = x + 12
  mate.y = 2
  give(st, 9)
  st.teams[0].controlled = 9
  return st
}

describe('FC 온라인 조작 — 드리블', () => {
  it('전력질주(E) 중 Shift 톡 = 녹온: 공을 앞으로 차 놓고 받을 사람은 자신', () => {
    const st = carrier(1)
    tick(st, 0, inp(BTN_E, 127))
    tick(st, 0, inp(BTN_E | BTN_PACE, 127))
    const b = st.ball
    expect(b.owner).toBe(-1)
    expect(b.passKind).toBe('knock')
    expect(b.passTo).toBe(9)
    expect(b.vx).toBeGreaterThan(st.players[9].vx + 2)
  })

  it('E 두 번 = 퀵 녹온 · 세 번 = 슈퍼 녹온(더 길게)', () => {
    const st = carrier(2)
    tick(st, 0, inp(BTN_E, 127))
    tick(st, 0, inp(0, 127))
    tick(st, 0, inp(BTN_E, 127))
    expect(st.ball.passKind).toBe('knock')
    const v1 = st.ball.vx
    tick(st, 0, inp(0, 127))
    tick(st, 0, inp(BTN_E, 127))
    expect(st.ball.vx).toBeGreaterThan(v1 + 1.5)
  })

  it('Ctrl+방향키로 받으면 받으면서 그쪽으로 친다 (퍼스트 터치 녹온)', () => {
    let knocked = 0
    for (let seed = 1; seed <= 20; seed++) {
      const st = playState(seed)
      const p = st.players[9]
      p.x = 0
      p.y = 0
      p.facing = 512
      const b = st.ball
      b.owner = -1
      b.x = 3
      b.y = 0
      b.vx = -9
      b.vy = 0
      b.passTo = 9
      b.passLive = true
      b.lastTeam = 0
      b.lastTouch = 8
      st.teams[0].controlled = 9
      for (let k = 0; k < 30 && st.ball.passKind !== 'knock'; k++) tick(st, 0, inp(BTN_CTRL, 0, 127))
      if (st.ball.passKind === 'knock' && st.ball.vy > 1) knocked++
    }
    expect(knocked).toBeGreaterThanOrEqual(14)
  })

  it('Shift+Q 누른 채 방향키 앞 → 뒤 = 힐투볼롤: 공을 가진 채 돌아선다', () => {
    const st = carrier(3, 0, 2)
    tick(st, 0, inp(BTN_PACE | BTN_Q, 127))
    tick(st, 0, inp(BTN_PACE | BTN_Q, -127))
    const p = st.players[9]
    expect(st.ball.owner).toBe(9)
    expect(p.skillT).toBeGreaterThan(st.tick)
    expect(Math.cos((p.facing / 1024) * Math.PI * 2)).toBeLessThan(-0.5)
  })
})

describe('FC 온라인 조작 — 패스 · 슛', () => {
  it('S 두 번 = 딩크(발 위로 뜬다) · 두 번째 S 가 선수 변경으로 새지 않는다', () => {
    const st = carrier(4)
    tick(st, 0, inp(BTN_S, 127))
    tick(st, 0, inp(0, 127))
    const to = st.ball.passTo
    tick(st, 0, inp(BTN_S, 127))
    expect(st.ball.dink).toBe(true)
    expect(st.ball.vz).toBeGreaterThan(2)
    // 조작은 받을 선수에게 (패스가 날아가는 동안의 규칙) — S 로 가장 가까운 선수로 바뀌지 않았다
    expect(st.teams[0].controlled).toBe(to)
  })

  it('A 두 번 = 낮은 크로스 (예전엔 첫 A 에 공이 떠나 두 번째가 안 먹었다)', () => {
    const st = carrier(5, 30)
    tick(st, 0, inp(BTN_A, 127))
    expect(st.ball.passKind).toBe('lob')
    tick(st, 0, inp(0, 127))
    tick(st, 0, inp(BTN_A, 127))
    expect(st.ball.passKind).toBe('lowcross')
    expect(st.ball.vz).toBeLessThan(1)
  })

  it('Z+S 드라이브는 보통 땅볼보다 세다 · Q+W 로빙 스루는 뜬다 · C+S 플레어는 표시가 붙는다', () => {
    const a = carrier(6)
    tick(a, 0, inp(BTN_S, 127))
    tick(a, 0, inp(0, 127))
    const plain = Math.hypot(a.ball.vx, a.ball.vy)
    const b = carrier(6)
    tick(b, 0, inp(BTN_S | BTN_Z, 127))
    tick(b, 0, inp(BTN_Z, 127))
    expect(Math.hypot(b.ball.vx, b.ball.vy)).toBeGreaterThan(plain * 1.1)
    const c = carrier(7)
    tick(c, 0, inp(BTN_Q, 127))
    tick(c, 0, inp(BTN_Q | BTN_W, 127))
    expect(c.ball.passKind).toBe('lobthrough')
    expect(c.ball.vz).toBeGreaterThan(3)
    const d = carrier(8)
    tick(d, 0, inp(BTN_S | BTN_C, 127))
    tick(d, 0, inp(BTN_C, 127))
    expect(d.ball.trick).toBe(1)
  })

  it('Q+S 침투 패스 — 찬 선수가 앞 공간으로 달린다', () => {
    const st = carrier(9)
    tick(st, 0, inp(BTN_S | BTN_Q, 127))
    tick(st, 0, inp(BTN_Q, 127))
    const p = st.players[9]
    expect(p.goUntil).toBeGreaterThan(st.tick)
    const x0 = p.x
    for (let k = 0; k < 45; k++) tick(st, 0, inp(0))
    expect(p.x).toBeGreaterThan(x0 + 3)
  })

  it('D 두 번 = 드리븐(낮게) · Z+D 감아차기는 골문 가운데 쪽으로 휜다', () => {
    const st = carrier(10, 30)
    for (let k = 0; k < 10; k++) tick(st, 0, inp(BTN_D, 127))
    tick(st, 0, inp(0, 127))
    const vz0 = st.ball.vz
    tick(st, 0, inp(BTN_D, 127))
    expect(st.ball.vz).toBeLessThan(Math.max(0.6, vz0 * 0.7))
    const f = carrier(11, 34)
    f.players[9].y = 6
    f.ball.y = 6
    for (let k = 0; k < 10; k++) tick(f, 0, inp(BTN_D | BTN_Z, 127, 127))
    tick(f, 0, inp(BTN_Z, 127, 127))
    expect(f.ball.shotBy).toBe(9)
    // 위(+y) 구석을 겨눈 감아차기 — 아래(−y, 가운데 쪽)로 휜다 (dir +1 이면 curl < 0)
    expect(f.ball.curl).toBeLessThan(0)
  })

  it('F+D 파워 슛 — 뗀 뒤 준비 시간이 있고, 초록 구간에서 D 를 한 번 더 누르면 타이밍 맞음', () => {
    const st = carrier(12, 30, 2)
    for (let k = 0; k < 12; k++) tick(st, 0, inp(BTN_D | BTN_F, 127))
    tick(st, 0, inp(BTN_F, 127))
    const t0 = st.teams[0].powerT
    expect(t0).toBeGreaterThanOrEqual(0)
    expect(st.ball.owner).toBe(9)
    while (st.tick - t0 < 20) tick(st, 0, inp(0, 127))
    tick(st, 0, inp(BTN_D, 127))
    expect(st.teams[0].powerHit).toBe(1)
    while (st.tick - t0 <= POWER_TICKS) tick(st, 0, inp(BTN_D, 127))
    expect(st.ball.shotBy).toBe(9)
    expect(st.ball.shotQ).toBeGreaterThan(st.players[9].sk.fin + 0.05)
  })

  it('Z+C+D 페이크 슛 — 공은 그대로, 앞의 수비수는 발이 묶인다', () => {
    const st = carrier(13, 20, 1)
    const q = st.players[15]
    q.x = 23
    q.y = 0.5
    tick(st, 0, inp(BTN_Z | BTN_C, 127))
    tick(st, 0, inp(BTN_Z | BTN_C | BTN_D, 127))
    expect(st.ball.owner).toBe(9)
    expect(st.players[9].action).toBe(ACT_KICK)
    expect(q.bitT).toBeGreaterThan(st.tick)
    tick(st, 0, inp(BTN_Z | BTN_C, 127))
    expect(st.ball.owner).toBe(9) // 떼도 차지 않는다
  })
})

describe('FC 온라인 조작 — 수비', () => {
  /** 원정(사람)이 수비, 홈 ST(9)가 공을 가졌다. 원정 15 가 옆(side) 또는 뒤(back)에 붙는다 */
  function duel(seed: number, where: 'side' | 'back'): GameState {
    const st = playState(seed, 1)
    const o = st.players[9]
    o.x = 0
    o.y = 0
    o.vx = 4
    o.facing = 0
    give(st, 9)
    const q = st.players[15]
    q.x = where === 'side' ? 0.3 : -0.9
    q.y = where === 'side' ? 0.8 : 0
    q.facing = 0
    st.teams[1].controlled = 15
    return st
  }

  it('D 누른 순간 붙어 있으면 어깨 밀치기 — 옆에서는 뺏기도, 뒤에서면 파울', () => {
    let won = 0
    let sideFouls = 0
    let backFouls = 0
    for (let seed = 1; seed <= 60; seed++) {
      const a = duel(seed, 'side')
      tick(a, 1, inp(BTN_D))
      if (a.ball.owner === -1 && a.ball.lastTouch === 9) won++
      if (a.events.some((e) => e.type === 'foul')) sideFouls++
      const b = duel(seed, 'back')
      tick(b, 1, inp(BTN_D))
      if (b.events.some((e) => e.type === 'foul')) backFouls++
    }
    expect(won).toBeGreaterThan(8)
    expect(won).toBeLessThan(45)
    expect(sideFouls).toBeLessThan(8)
    expect(backFouls).toBe(60)
  })

  it('Space 홀드 = 당기고 버티기 — 붙어 있으면 결국 파울이 불린다', () => {
    let fouls = 0
    for (let seed = 1; seed <= 20; seed++) {
      const st = duel(seed, 'back')
      for (let k = 0; k < 120 && !st.events.some((e) => e.type === 'foul'); k++) {
        const o = st.players[9]
        const q = st.players[15]
        q.x = o.x - 0.8
        q.y = o.y
        tick(st, 1, inp(BTN_SPACE))
      }
      if (st.events.some((e) => e.type === 'foul')) fouls++
    }
    expect(fouls).toBeGreaterThanOrEqual(10)
  })

  it('슬라이딩 뒤 A 한 번 더 = 빨리 일어나기', () => {
    const run = (again: boolean): number => {
      const st = duel(14, 'side')
      const q = st.players[15]
      q.x = -6
      q.y = 3
      tick(st, 1, inp(BTN_A))
      expect(q.action).toBe(ACT_SLIDE)
      tick(st, 1, inp(0))
      if (again) tick(st, 1, inp(BTN_A))
      let k = 0
      while (q.action !== ACT_RUN && k < 80) {
        tick(st, 1, inp(0))
        k++
      }
      return k
    }
    expect(run(true)).toBeLessThan(run(false) - 8)
  })

  it('Shift+방향키 — 그쪽 동료로 바꾼다 · ` 를 누르고 있으면 골키퍼', () => {
    const st = playState(15)
    give(st, 20)
    const t = st.teams[0]
    const c = st.players[5]
    c.x = -20
    c.y = 0
    const up = st.players[6]
    up.x = -20
    up.y = 10
    t.controlled = 5
    tick(st, 0, inp(BTN_PACE, 0, 127))
    expect(t.controlled).toBe(6)
    tick(st, 0, inp(BTN_GK))
    expect(t.controlled).toBe(0)
    tick(st, 0, inp(0))
    expect(t.controlled).not.toBe(0)
  })
})

describe('FC 온라인 조작 — 골키퍼', () => {
  it('W 공 놓기 → 다시 못 줍는다 · 백패스로 받은 공도 못 줍는다 · 그 밖엔 Z 로 줍는다', () => {
    const st = playState(16)
    const gk = st.players[0]
    give(st, 0)
    gk.holdT = 100
    tick(st, 0, inp(BTN_W))
    expect(gk.holdT).toBe(0)
    expect(gk.dropped).toBe(true)
    tick(st, 0, inp(BTN_Z))
    expect(gk.holdT).toBe(0)
    expect(st.callText).toContain('내려놓은')

    const b = playState(17)
    give(b, 0)
    b.players[0].gotMate = true
    tick(b, 0, inp(BTN_Z))
    expect(b.players[0].holdT).toBe(0)

    const c = playState(18)
    give(c, 0)
    tick(c, 0, inp(BTN_Z))
    expect(c.players[0].holdT).toBeGreaterThan(140)
  })

  it('골키퍼는 박스 밖에서 손으로 못 잡는다', () => {
    const st = playState(19)
    const gk = st.players[0]
    const b = st.ball
    b.owner = -1
    b.vx = -3
    b.vy = 0
    b.z = 0.5
    b.lastTeam = 1
    b.lastTouch = 20
    b.kickTick = st.tick - 60
    gk.x = -30
    gk.y = 0
    b.x = -29.6
    b.y = 0
    gkCatch(st, gk)
    expect(b.owner).toBe(-1)
    gk.x = -45
    b.x = -44.6
    gkCatch(st, gk)
    expect(b.owner).toBe(0)
  })

  it('PK 골키퍼(사람) — D+방향키로 고른 쪽으로 차는 순간 몸을 날린다', () => {
    const st = playState(20, 1)
    setupPenalty(st, 0)
    // 화면 기준 ← (카메라가 홈 키커 뒤, 홈 dir +1) = 월드 +y
    tick(st, 1, inp(BTN_D, -127, 0))
    expect(st.teams[1].pkDive).toBe(true)
    performRestartKick(st, null)
    const gk = st.players[11]
    expect(gk.action).toBe(ACT_DIVE)
    expect(gk.vy).toBeGreaterThan(2)
  })

  it('PK Q+D 파넨카 — 느리게 띄운다', () => {
    const st = playState(21)
    setupPenalty(st, 0)
    const k = st.restart!.kicker
    st.teams[0].controlled = k
    for (let i = 0; i < 16; i++) tick(st, 0, inp(BTN_Q | BTN_D))
    tick(st, 0, inp(BTN_Q))
    expect(st.ball.shotBy).toBe(k)
    // 보통 PK 는 25 m/s 안팎 — 파넨카는 그 절반쯤으로 떠서 간다
    expect(Math.hypot(st.ball.vx, st.ball.vy)).toBeLessThan(16)
    expect(st.ball.vz).toBeGreaterThan(3)
  })
})

describe('FC 온라인 조작 — 세트피스 · 전술', () => {
  /** 홈 직접 프리킥 (골문 22.5 m 정면) · 원정 넷이 9.45 m 에 벽 */
  function fk(seed: number): GameState {
    const st = playState(seed, 1)
    setupFreeKick(st, 0, 30, 0)
    for (let i = 0; i < 4; i++) {
      const q = st.players[12 + i]
      q.x = 30 + 9.45
      q.y = (i - 1.5) * 0.65
    }
    return st
  }

  it('벽 — 낮게 찬 직접 프리킥은 벽에 맞고, 높게 감아(톱스핀) 차면 넘어간다', () => {
    let lowBlocked = 0
    let highBlocked = 0
    for (let seed = 1; seed <= 40; seed++) {
      const a = fk(seed)
      doShoot(a, a.players[a.restart!.kicker], 0, 0, 0.8, false, null, { lat: 0.05, lift: -1 }, { freekick: true })
      if (a.events.some((e) => e.type === 'block')) lowBlocked++
      const b = fk(seed)
      doShoot(b, b.players[b.restart!.kicker], 0, 0, 0.8, false, null, { lat: 0.05, lift: 0.9 }, { freekick: true })
      if (b.events.some((e) => e.type === 'block')) highBlocked++
    }
    expect(lowBlocked).toBeGreaterThanOrEqual(28)
    expect(highBlocked).toBeLessThanOrEqual(8)
  })

  it('벽 점프(W) — 가운데 높이 슛을 더 막는다', () => {
    let stand = 0
    let jump = 0
    for (let seed = 1; seed <= 40; seed++) {
      const a = fk(seed)
      doShoot(a, a.players[a.restart!.kicker], 0, 0, 0.8, false, null, { lat: 0.05, lift: 0.35 }, { freekick: true })
      if (a.events.some((e) => e.type === 'block')) stand++
      const b = fk(seed)
      tick(b, 1, inp(BTN_W))
      doShoot(b, b.players[b.restart!.kicker], 0, 0, 0.8, false, null, { lat: 0.05, lift: 0.35 }, { freekick: true })
      if (b.events.some((e) => e.type === 'block')) jump++
    }
    expect(jump).toBeGreaterThan(stand + 10)
  })

  it('Z 벽 전진 — 가까이 설 수 있고, 가끔 경고를 받는다', () => {
    let cards = 0
    for (let seed = 1; seed <= 30; seed++) {
      const st = fk(seed)
      tick(st, 1, inp(BTN_Z))
      // 걸리면 경고 + 프리킥을 그 자리에서 다시 (벽 전진도 처음부터), 안 걸리면 1 m 앞에 설 수 있다
      if (st.events.some((e) => e.type === 'card')) {
        cards++
        expect(st.teams[1].wallAdv).toBe(0)
      } else expect(st.teams[1].wallAdv).toBe(1)
    }
    expect(cards).toBeGreaterThan(2)
    expect(cards).toBeLessThan(20)
  })

  it('숫자 키 · [ ] · F1~F4 — 전술 · 공수 밸런스 · 순간 전술(시간이 지나면 풀린다)', () => {
    const st = playState(22)
    const t = st.teams[0]
    tick(st, 0, inp(4 << PRESET_SHIFT))
    expect(t.preset).toBe(3)
    expect(t.sliders.tempo).toBe(BUILTIN_TACTICS[0].s.tempo)
    tick(st, 0, inp(2 << PRESET_SHIFT))
    const m = t.sliders.mentality
    tick(st, 0, inp(BTN_BAL_UP))
    expect(t.balance).toBe(1)
    expect(t.sliders.mentality).toBe(Math.min(4, m + 1))
    tick(st, 0, inp(BTN_TAC2))
    expect(t.sliders.press).toBe(4)
    for (let k = 0; k < 601; k++) tick(st, 0, inp(0))
    expect(t.tac).toBe(0)
    expect(t.sliders.press).toBeLessThan(4)
  })

  it('코너킥 공격 F3 = 짧은 코너 — 한 명이 키커 옆으로 온다', () => {
    const st = playState(23)
    setupRestart(st, 'corner', 0, HALF_L, 34)
    tick(st, 0, inp(BTN_TAC3))
    expect(st.teams[0].cornerPlan).toBe(3)
    let near = 0
    for (const p of st.players) {
      if (p.team !== 0 || p.sk.isGK || p.idx === st.restart!.kicker) continue
      aiDecide(st, p)
      if (Math.hypot(p.tx - HALF_L, p.ty - 34) < 13) near++
    }
    expect(near).toBeGreaterThanOrEqual(1)
  })
})

// 넘어짐 상수가 바뀌면 빨리 일어나기 테스트도 같이 봐야 한다
void ACT_FALLEN
