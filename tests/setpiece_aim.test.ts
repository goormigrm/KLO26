// 사용자 제보 2026-09-23 두 가지를 지킨다.
//  1. "PK·프리킥이 누른 방향과 다르게 날아간다" — 방향키를 D 와 같이(또는 조금 먼저) 떼면 떼는 틱의 방향키가 (0,0) 이 되어
//     PK 는 아무 구석으로, 프리킥은 골키퍼가 비운 구석으로 갔다. 이제 0.33 초 기억하고(`kickStick`), 좌우를 안 누르면 가운데다.
//  2. "골키퍼가 다이빙한 반대쪽 공도 막는다" — sim 에서 잰다: 몸을 날린 쪽의 반대로 지나가는 공을 막은 적이 없어야 한다.
//     (그림은 렌더가 다이브 쪽을 날기 시작할 때 한 번, 옆 속도가 없으면 공 쪽으로 정한다 — 예전엔 지난 다이브 쪽을 썼다)

import { describe, expect, it } from 'vitest'
import { BTN_D, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { doShoot } from '../src/core/ball'
import { performRestartKick, setupFreeKick, setupPenalty } from '../src/core/rules'
import { ACT_DIVE, ACT_RUN, HALF_L, type GameState } from '../src/core/state'

const inp = (b: number, mx = 0, my = 0): Input => ({ mx, my, buttons: b, a: 0, b: 0 })
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function human(seed: number): GameState {
  const st = createState({
    seed, halfSec: 36000, human: [true, false],
    squads: [synthSquad(11, { name: 'a', short: 'a', formation: '4-3-3', quality: 70 }), synthSquad(22, { name: 'b', short: 'b', formation: '4-4-2', quality: 66 })],
  })
  st.phase = 'play'
  return st
}

/** 화면 기준 (mx,my) 를 누른 채 D 를 20틱 모으고 — 방향키를 early 틱 먼저 놓고 D 를 뗀다. 골라인에서 공의 월드 y */
function kick(kind: 'pk' | 'fk', seed: number, early: number, mx: number, my: number): number {
  const st = human(seed)
  if (kind === 'pk') setupPenalty(st, 0)
  else setupFreeKick(st, 0, 30, 0)
  st.phaseT = 99999
  for (let k = 0; k < 20; k++) step(st, [inp(BTN_D, k < 20 - early ? mx : 0, k < 20 - early ? my : 0), EMPTY_INPUT])
  step(st, [inp(0), EMPTY_INPUT]) // D 와 (남아 있던) 방향키를 같은 틱에 뗀다
  const b = st.ball
  return b.y + b.vy * ((HALF_L - b.x) / b.vx)
}

describe('세트피스 조준 — 누른 방향 그대로', () => {
  // 홈(dir +1)이 +x 로 찬다 · 카메라는 키커 뒤 → 화면 ← = 월드 +y
  for (const kind of ['pk', 'fk'] as const) {
    it(`${kind}: ← 를 D 와 같이 떼도 · 3틱 먼저 떼도 화면 왼쪽(+y)으로`, () => {
      for (let s = 1; s <= 8; s++) {
        expect(kick(kind, s, 0, -127, 0), `같이 뗌 #${s}`).toBeGreaterThan(1.2)
        expect(kick(kind, s, 3, -127, 0), `3틱 먼저 #${s}`).toBeGreaterThan(1.2)
        expect(kick(kind, s, 3, 127, 0), `→ #${s}`).toBeLessThan(-1.2)
      }
    })
    it(`${kind}: ↑ 만 · 아무 방향 없음 = 가운데 (아무 구석이 아니다)`, () => {
      for (let s = 1; s <= 8; s++) {
        expect(Math.abs(kick(kind, s, 0, 0, 127)), `↑ #${s}`).toBeLessThan(1.3)
        expect(Math.abs(kick(kind, s, 0, 0, 0)), `없음 #${s}`).toBeLessThan(1.3)
      }
    })
  }
  it('0.33 초보다 오래전에 뗀 방향키는 기억하지 않는다 — 처음에 ← 를 눌렀다 떼고 D 만 40틱 더 모으면 가운데', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const st = human(seed)
      setupPenalty(st, 0)
      st.phaseT = 99999
      for (let k = 0; k < 45; k++) step(st, [inp(BTN_D, k < 5 ? -127 : 0), EMPTY_INPUT])
      step(st, [inp(0), EMPTY_INPUT])
      const b = st.ball
      expect(Math.abs(b.y + b.vy * ((HALF_L - b.x) / b.vx))).toBeLessThan(1.3)
    }
  })
})

describe('골키퍼 — 몸을 날린 반대쪽 공은 못 막는다', () => {
  it('슛·PK 600번 — 다이브 반대쪽으로 지나가는 공을 막은 적이 없다', () => {
    let saves = 0
    let wrong = 0
    for (let s = 0; s < 600; s++) {
      const st = createState({
        seed: 9000 + s, halfSec: 180,
        squads: [synthSquad(11, { name: 'a', short: 'a', formation: '4-3-3', quality: 66 }), synthSquad(22, { name: 'b', short: 'b', formation: '4-4-2', quality: 66 })],
      })
      let g = 0
      while (st.phase !== 'play' && g++ < 2000) step(st, idle)
      const t = st.teams[0]
      const gk = st.players[st.teams[1].gk]
      if (s % 3 === 0) {
        setupPenalty(st, 0)
        performRestartKick(st, { kind: 'D', dx: t.dir, dy: 0, power: 0.6, lat: s % 2 ? 1 : -1, lift: 0 })
      } else {
        const sh = st.players.find((p) => p.team === 0 && p.idx !== t.gk)!
        for (const p of st.players) if (p.idx !== gk.idx && p.idx !== sh.idx) p.x = -t.dir * 40
        gk.x = t.dir * (HALF_L - 1)
        gk.y = 0
        gk.vx = 0
        gk.vy = 0
        gk.action = ACT_RUN
        gk.holdT = 0
        sh.x = t.dir * (HALF_L - [10, 14, 18, 22][s % 4])
        sh.y = [-8, -3, 0, 3, 8][s % 5]
        sh.vx = 0
        sh.vy = 0
        sh.gotT = st.tick - 60
        const b = st.ball
        b.owner = sh.idx
        b.x = sh.x
        b.y = sh.y
        b.z = 0
        b.vx = 0
        b.vy = 0
        b.vz = 0
        doShoot(st, sh, t.dir, 0, 0.8, false, s % 2 ? 1 : -1)
      }
      const ev0 = st.events.length
      let dive: { y0: number; s: number; tick: number } | null = null
      for (let i = 0; i < 120; i++) {
        const last = { x: st.ball.x, y: st.ball.y, vx: st.ball.vx, vy: st.ball.vy }
        step(st, idle)
        if (!dive && gk.action === ACT_DIVE) dive = { y0: gk.y - gk.vy / 60, s: Math.sign(gk.vy), tick: st.tick }
        const saved = st.events.slice(ev0).some((e) => e.type === 'save') || st.ball.owner === gk.idx
        if (saved) {
          saves++
          // 공이 골키퍼 선을 지나는 자리 — 막기 직전 틱의 공으로 연장. 다이브 뒤 0.33 초 안에 막은 것만 본다
          const cross = last.y + last.vy * ((gk.x - last.x) / (Math.abs(last.vx) > 0.5 ? last.vx : 1e-6))
          if (dive && dive.tick < st.tick && st.tick - dive.tick <= 20) {
            const side = cross - dive.y0
            if (Math.abs(side) > 0.3 && Math.sign(side) !== dive.s) wrong++
          }
          break
        }
        if (st.phase !== 'play') break
      }
    }
    expect(saves).toBeGreaterThan(200)
    expect(wrong).toBe(0)
  }, 120000)
})
