// 🎯 조작 연습 (2026-09-23) — 연습마다 상황이 서는지, 가만히 있으면 성공하지 않는지, 그 키로 하면 성공하는지.
// 판정은 진짜 sim 위에서 돈다 (game/drills.ts) — 여기서도 같은 step 으로 굴린다.

import { describe, expect, it } from 'vitest'
import { BTN_A, BTN_D, BTN_E, BTN_PACE, BTN_Q, BTN_S, BTN_W, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'
import { clubSquad, toSquadConfig } from '../src/cards/squad'
import { CLUBS } from '../src/data/pool'
import { DRILLS, DRILL_CATS, drillById, judge, startDrill, type Drill, type DrillCtx } from '../src/game/drills'
import { DEMOS, demoInput, findDemoSeed, inputCodes } from '../src/game/demos'

function inp(buttons: number, mx = 0, my = 0): Input {
  return { mx, my, buttons, a: 0, b: 0 }
}

function synthState(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 70 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec: 36000, squads: [home, away], human: [true, false] })
}

function clubState(seed: number): GameState {
  const a = CLUBS[0]
  const b = CLUBS[1]
  return createState({
    seed,
    halfSec: 36000,
    squads: [toSquadConfig(clubSquad(a.id, '4-3-3'), a.name, a.short), toSquadConfig(clubSquad(b.id, '4-4-2'), b.name, b.short)],
    human: [true, false],
  })
}

/** 한 시도를 끝까지 — script(틱 번호, 상태) 가 이번 틱 입력을 준다 */
function run(d: Drill, seed: number, script: (k: number, st: GameState, c: DrillCtx) => Input): true | string {
  const st = synthState(seed)
  const c = startDrill(d, st)
  for (let k = 0; k < d.limit * 60 + 120; k++) {
    const i = script(k, st, c)
    step(st, [i, EMPTY_INPUT])
    const r = judge(d, st, c, i)
    if (r !== null) return r
  }
  return '끝나지 않음'
}

describe('조작 연습 — 목록', () => {
  it('연습마다 id 가 다르고, 분류·키·조건·요령이 있다', () => {
    const ids = new Set(DRILLS.map((d) => d.id))
    expect(ids.size).toBe(DRILLS.length)
    expect(DRILLS.length).toBeGreaterThanOrEqual(20)
    for (const d of DRILLS) {
      expect(DRILL_CATS).toContain(d.cat)
      expect(d.keys.length).toBeGreaterThan(0)
      expect(d.goal.length).toBeGreaterThan(5)
      expect(d.tip.length).toBeGreaterThan(5)
    }
    for (const cat of DRILL_CATS) expect(DRILLS.some((d) => d.cat === cat)).toBe(true)
  })

  it('실제 구단 스쿼드로도 상황이 선다 — 쓰는 선수만 경기장에, 조작할 선수가 있다', () => {
    for (const d of DRILLS) {
      for (const st of [synthState(3), clubState(3)]) {
        const c = startDrill(d, st)
        expect(c.me, d.id).toBeGreaterThanOrEqual(0)
        const on = st.players.filter((p) => !p.sentOff)
        expect(on.length, d.id).toBeGreaterThanOrEqual(2)
        expect(on.length, d.id).toBeLessThanOrEqual(8)
        expect(['play', ...(d.phases ?? [])], d.id).toContain(st.phase)
        for (const p of on) expect(Math.abs(p.x), `${d.id} ${p.idx}`).toBeLessThan(53)
        // 한 틱 굴려도 판정이 바로 나지 않는다
        step(st, [EMPTY_INPUT, EMPTY_INPUT])
        expect(judge(d, st, c, EMPTY_INPUT), d.id).toBeNull()
      }
    }
  })

  it('가만히 있으면 어느 연습도 성공하지 않는다', () => {
    for (const d of DRILLS) {
      for (const seed of [1, 2]) {
        const r = run(d, seed, () => EMPTY_INPUT)
        expect(r, `${d.id} #${seed}`).not.toBe(true)
        expect(typeof r).toBe('string')
      }
    }
  }, 60000)
})

describe('조작 연습 — 그 키로 하면 성공한다', () => {
  it('녹온: E 로 달리다 수비수 앞에서 Shift 톡 → 옆으로 치고 지나간다', () => {
    const d = drillById('knock')!
    let ok = 0
    for (let seed = 1; seed <= 12; seed++) {
      let tapped = -1
      const r = run(d, seed, (k, st, c) => {
        const me = st.players[c.me]
        const def = st.players[c.f.def]
        const dist = Math.hypot(def.x - me.x, def.y - me.y)
        if (tapped < 0 && st.ball.owner === c.me && dist < 7) {
          tapped = k
          return inp(BTN_E | BTN_PACE, 127, 60)
        }
        return inp(BTN_E, 127, tapped >= 0 && k - tapped < 40 ? 60 : 0)
      })
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(2)
  })

  it('딩크: S 를 짧게 눌렀다 떼고 바로 S', () => {
    const d = drillById('dink')!
    let ok = 0
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(d, seed, (k) => (k < 6 ? inp(BTN_S, 127) : k === 7 ? inp(BTN_S, 127) : inp(0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(5)
  })

  it('낮은 크로스: A 를 누르고 떼자마자 A', () => {
    const d = drillById('lowcross')!
    let ok = 0
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(d, seed, (k) => (k === 0 ? inp(BTN_A, 127, -127) : k === 2 ? inp(BTN_A) : inp(0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(3)
  })

  it('로빙 스루: Q+W', () => {
    const d = drillById('lobthrough')!
    let ok = 0
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(d, seed, (k) => (k < 3 ? inp(BTN_Q, 127, 60) : k === 3 ? inp(BTN_Q | BTN_W, 127, 60) : inp(0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(3)
  })

  it('벽 점프: 차기 0.13 초 전에 W — 뛰어오른 벽이 높은 프리킥을 막는다', () => {
    const d = drillById('wall')!
    let ok = 0
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(d, seed, (_k, st) => (st.phase === 'freekick' && st.phaseT === 8 ? inp(BTN_W) : inp(0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(4)
  })

  it('PK 막기: 다이빙 방향을 고르면 가끔 막는다 (반은 반대쪽)', () => {
    const d = drillById('pksave')!
    let ok = 0
    for (let seed = 1; seed <= 24; seed++) {
      const side = seed % 2 ? 127 : -127
      const r = run(d, seed, (k) => (k === 20 ? inp(BTN_D, side) : inp(0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(2)
  })

  it('파넨카: Q 누른 채 D 를 절반쯤 모았다 떼기 — 먼저 뛴 골키퍼 위로', () => {
    const d = drillById('panenka')!
    let ok = 0
    // 40% 안팎 (60판 24) — 골키퍼가 먼저 안 뛰면(25%) 가운데 공을 잡는다
    for (let seed = 1; seed <= 40; seed++) {
      const r = run(d, seed, (k) => (k < 17 ? inp(BTN_Q | BTN_D) : inp(k < 19 ? BTN_Q : 0)))
      if (r === true) ok++
    }
    expect(ok).toBeGreaterThanOrEqual(10)
  })
})

describe('조작 연습 — 🤖 시범', () => {
  // 연습 화면(game/practice.ts)이 찾는 시드와 같은 40개
  const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i)

  it('연습마다 시범 대본이 있고, 사람 키보드로 낼 수 있는 입력만 쓴다 (방향키 ±127·0)', () => {
    for (const d of DRILLS) {
      expect(DEMOS[d.id], d.id).toBeTypeOf('function')
      const st = synthState(5)
      const c = startDrill(d, st)
      const m: Record<string, number> = {}
      for (let k = 0; k < 240; k++) {
        const i = demoInput(d, k, st, c, m)
        expect([-127, 0, 127], d.id).toContain(i.mx)
        expect([-127, 0, 127], d.id).toContain(i.my)
        step(st, [i, EMPTY_INPUT])
        if (judge(d, st, c, i) !== null) break
      }
    }
  }, 60000)

  it('어느 연습이든 40개 시드 안에 시범이 성공하는 판이 있다 — 합성 스쿼드 · 실제 구단 스쿼드', () => {
    for (const d of DRILLS) {
      expect(findDemoSeed(d, synthState, seeds), `${d.id} 합성`).toBeGreaterThanOrEqual(0)
      expect(findDemoSeed(d, clubState, seeds), `${d.id} 구단`).toBeGreaterThanOrEqual(0)
    }
  }, 180000)

  it('찾은 시드를 다시 돌리면 똑같이 성공한다 (결정론 — 화면에서 보여 주는 시범)', () => {
    for (const id of ['knock', 'finesse', 'pksave', 'wall']) {
      const d = drillById(id)!
      const s = findDemoSeed(d, synthState, seeds)
      const st = synthState(s)
      const c = startDrill(d, st)
      const m: Record<string, number> = {}
      let r: true | string | null = null
      for (let k = 0; k < d.limit * 60 + 120 && r === null; k++) {
        const i = demoInput(d, k, st, c, m)
        step(st, [i, EMPTY_INPUT])
        r = judge(d, st, c, i)
      }
      expect(r, id).toBe(true)
    }
  }, 60000)

  it('시범 입력 → 불을 켤 키 이름', () => {
    expect(inputCodes({ mx: 127, my: -127, buttons: 1 << 3 | 1 << 9, a: 0, b: 0 }).sort()).toEqual(['ArrowDown', 'ArrowRight', 'KeyD', 'KeyZ'].sort())
  })
})
