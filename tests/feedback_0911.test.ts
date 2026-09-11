// 2026-09-11 오후 제보 — 골키퍼 선방 · 체력 · 스로인 궤적 · 프리킥 오프사이드.
import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { doShoot, doThrow, offsideLineX } from '../src/core/ball'
import { kickerView, previewRestartKick, setupFreeKick } from '../src/core/rules'
import { BTN_D, BTN_S } from '../src/core/input'
import { snapshot } from '../src/core/sim'
import { ACT_RUN, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed = 3, halfSec = 60): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

describe('체력 — 경기 길이에 맞게 닳는다', () => {
  it('하프타임에 아직 절반쯤 남고, 종료 때 체력 낮은 선수가 높은 선수보다 더 지쳐 있다', () => {
    const st = match(11, 60)
    let halfAvg = -1
    while (!st.done) {
      step(st, idle)
      if (halfAvg < 0 && st.phase === 'halftime') {
        const f = st.players.filter((p) => !p.sk.isGK)
        halfAvg = f.reduce((a, p) => a + p.stamina, 0) / f.length
      }
    }
    expect(halfAvg).toBeGreaterThan(0.35)
    const lo = st.players.filter((p) => !p.sk.isGK && p.sk.sta < 0.55)
    const hi = st.players.filter((p) => !p.sk.isGK && p.sk.sta > 0.7)
    const avg = (a: typeof lo): number => a.reduce((s, p) => s + p.stamina, 0) / Math.max(1, a.length)
    expect(avg(hi)).toBeGreaterThan(avg(lo))
    // 종료 때 전원이 바닥은 아니다
    expect(avg(hi)).toBeGreaterThan(0.1)
  })
})

describe('스로인 — 받을 선수 발 근처에 떨어진다', () => {
  it('목표 선수에게 닿을 때 공이 머리 위로 지나가지 않는다', () => {
    const st = match(21)
    const t = st.teams[0]
    const thrower = st.players[t.start + 3]
    const target = st.players[t.start + 6]
    // 던지는 사람은 터치라인, 받을 사람은 10 m 안쪽에 세운다
    thrower.x = 0
    thrower.y = 34.4
    target.x = 3
    target.y = 25
    target.vx = 0
    target.vy = 0
    for (const p of st.players) {
      if (p.idx === thrower.idx || p.idx === target.idx) continue
      p.x = -40 + p.idx * 0.5
      p.y = -20
    }
    st.ball.owner = thrower.idx
    st.ball.x = thrower.x
    st.ball.y = 33.9 // 손에 든 공은 라인 안쪽
    doThrow(st, thrower, target.idx, 0, -1, 0.45)
    // 공이 목표 선수 근처(1.5 m)에 왔을 때의 높이 — 예전엔 2 m 높이로 머리 위를 지나갔다
    let zAt = 99
    for (let i = 0; i < 120; i++) {
      step(st, idle)
      if (Math.abs(st.ball.y - target.y) < 1.5) zAt = Math.min(zAt, st.ball.z)
      if (st.ball.owner >= 0) break
    }
    expect(zAt).toBeLessThan(1.2)
    expect(st.ball.owner).toBe(target.idx)
  })

  it('라인과 평행하게 던져도 공이 피치 안으로 들어온다 (바로 상대 스로인이 되지 않는다)', () => {
    const st = match(22)
    const t = st.teams[0]
    const thrower = st.players[t.start + 3]
    thrower.x = 0
    thrower.y = 34.4
    thrower.facing = 768 // 안쪽(−y)을 본다
    for (const p of st.players) {
      if (p.idx === thrower.idx) continue
      p.x = -40 + p.idx * 0.5
      p.y = -20
    }
    st.ball.owner = thrower.idx
    st.ball.x = 0
    st.ball.y = 33.9
    doThrow(st, thrower, -1, 1, 0, 0.5) // → 만 누른 채
    expect(st.ball.vy).toBeLessThan(-3)
    for (let i = 0; i < 30; i++) step(st, idle)
    expect(st.phase).toBe('play')
    expect(st.events.filter((e) => e.type === 'throwin').length).toBe(0)
  })
})

describe('프리킥 — 공격 팀은 오프사이드 위치에 서지 않는다', () => {
  it('프리킥을 기다리는 동안 킥커를 뺀 공격수 전원이 라인 뒤에 있다', () => {
    const st = match(31)
    const t = st.teams[0]
    const dir = t.dir
    // 상대 진영 25 m 지점에서 우리 프리킥. 공격수 하나를 일부러 상대 골문 앞에 세운다
    setupFreeKick(st, 0, dir * 25, 5)
    const fw = st.players[t.start + 9]
    fw.x = dir * 45
    fw.y = 0
    for (let i = 0; i < 20; i++) step(st, idle)
    expect(st.phase).toBe('freekick')
    const allow = Math.max(offsideLineX(st, 0) * dir, st.ball.x * dir, 0)
    for (const p of st.players) {
      if (p.team !== 0 || p.sk.isGK || p.sentOff || p.idx === st.restart!.kicker) continue
      expect(p.x * dir).toBeLessThanOrEqual(allow + 0.01)
    }
  })
})

describe('골키퍼 — 손끝 슛은 자주 흘린다', () => {
  it('12 m 정면 코너 슛(자동 보조)이 셋 중 하나 이상 들어간다', () => {
    let goals = 0
    const N = 60
    for (let s = 0; s < N; s++) {
      const st = match(100 + s)
      const t = st.teams[0]
      const gk = st.players[st.teams[1].gk]
      const shooter = st.players[t.start + 9]
      for (const p of st.players) {
        if (p.idx === gk.idx || p.idx === shooter.idx) continue
        p.x = -t.dir * 40
        p.y = 10 + p.idx * 0.8
      }
      gk.x = t.dir * (HALF_L - 1)
      gk.y = 0
      gk.vx = 0
      gk.vy = 0
      gk.action = ACT_RUN
      gk.actT = 0
      gk.holdT = 0
      shooter.x = t.dir * (HALF_L - 12)
      shooter.y = 0.5
      shooter.vx = 0
      shooter.vy = 0
      shooter.action = ACT_RUN
      shooter.gotT = st.tick - 60
      shooter.sk.fin = 0.6
      shooter.sk.sho = 0.6
      st.ball.owner = shooter.idx
      st.ball.x = shooter.x
      st.ball.y = shooter.y
      st.ball.z = 0
      const g0 = t.goals
      // 사람처럼: 방향키 골문 쪽 + D 를 0.5 초 홀드했다 뗀 슛
      doShoot(st, shooter, t.dir, 0, 0.8, false, null)
      for (let i = 0; i < 90; i++) {
        step(st, idle)
        if (t.goals > g0) {
          goals++
          break
        }
        if (st.ball.owner >= 0 || st.phase !== 'play') break
      }
    }
    expect(goals / N).toBeGreaterThan(0.33)
  })
})

describe('직접 프리킥 조준 — 키커 뒤 시점에서 ← → 코너 · ↑ ↓ 높이', () => {
  function humanFreeKick(): GameState {
    const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
    const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
    const st = createState({ seed: 41, halfSec: 120, squads: [home, away], human: [true, false], bots: [2, 2] })
    step(st, [{ ...EMPTY_INPUT, buttons: BTN_S }, EMPTY_INPUT])
    expect(st.phase).toBe('play')
    const dir = st.teams[0].dir
    setupFreeKick(st, 0, dir * (HALF_L - 22), 0)
    for (let i = 0; i < 5; i++) step(st, idle)
    expect(kickerView(st)).toBe(true)
    return st
  }
  /** D 를 20틱 홀드했다 뗀다 — 공의 초기 속도를 돌려준다 */
  function kick(st0: GameState, mx: number, my: number): { vx: number; vy: number; vz: number } {
    const st = snapshot(st0)
    for (let i = 0; i < 20; i++) step(st, [{ mx, my, buttons: BTN_D, a: 0, b: 0 }, EMPTY_INPUT])
    step(st, [{ mx, my, buttons: 0, a: 0, b: 0 }, EMPTY_INPUT])
    expect(st.phase).toBe('play')
    return { vx: st.ball.vx, vy: st.ball.vy, vz: st.ball.vz }
  }

  it('→ 는 화면 오른쪽(월드 −dir·y) 코너, ← 는 반대 코너', () => {
    const st = humanFreeKick()
    const dir = st.teams[0].dir
    const right = kick(st, 127, 0)
    const left = kick(st, -127, 0)
    expect(Math.sign(right.vy)).toBe(-dir)
    expect(Math.sign(left.vy)).toBe(dir)
    expect(Math.sign(right.vx)).toBe(dir)
  })

  it('↑ 는 높게, ↓ 는 깔아서', () => {
    const st = humanFreeKick()
    const up = kick(st, 60, 127)
    const down = kick(st, 60, -127)
    expect(up.vz).toBeGreaterThan(down.vz + 2)
  })

  it('미리보기(previewRestartKick)와 실제 킥의 초기 속도가 오차 범위 안에서 같다', () => {
    const st = humanFreeKick()
    for (let i = 0; i < 20; i++) step(st, [{ mx: 127, my: 40, buttons: BTN_D, a: 0, b: 0 }, EMPTY_INPUT])
    const pv = previewRestartKick(st, 0, 'D', 127, 40, Math.min(1, st.teams[0].holdShoot / 36))!
    expect(pv).not.toBeNull()
    step(st, [{ mx: 127, my: 40, buttons: 0, a: 0, b: 0 }, EMPTY_INPUT])
    const b = st.ball
    const angPv = Math.atan2(pv.vy, pv.vx)
    const angReal = Math.atan2(b.vy, b.vx)
    expect(Math.abs(angPv - angReal)).toBeLessThan((8 * Math.PI) / 180)
    expect(Math.abs(Math.hypot(pv.vx, pv.vy) - Math.hypot(b.vx, b.vy))).toBeLessThan(0.5)
    expect(Math.abs(pv.vz - b.vz)).toBeLessThan(1.6)
  })
})
