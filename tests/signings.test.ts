// 타 구단 영입 제한 · 영입 웃돈 (사용자 결정 2026-09-11 · DECISIONS G-17).
//
// 왜 있는가 — 급여 상한만으로는 구단이 뜻을 잃는다. 실측으로 제한이 없으면 29개 구단이
// 전부 최강 선발 OVR 92~94 로 수렴했다. `npm run economy` 로 다시 잴 수 있다.

import { describe, expect, it } from 'vitest'
import {
  OUT_BENCH_MAX, OUT_XI_MAX, START_SIZE, SQUAD_SIZE, TRANSFER_PREMIUM,
  cardSalary, checkSquad, clubSquad, computeCap, countOutside, homeClubOf, payOf, type Squad,
} from '../src/cards/squad'
import { CLUBS, POOL, cardById } from '../src/data/pool'

const CAP = computeCap().cap

/**
 * 그 구단이 아닌 선수 n명 — **구단을 하나씩 달리** 뽑는다.
 * 한 구단에서 몰아 뽑으면 그 구단이 선발 최다가 되어 주력 구단이 바뀐다(그래서 영입 인원이 안 는다).
 * 그게 규칙의 뜻이기도 하다: 선발 11명 중 **6명은 한 구단**이어야 한다.
 */
function outsiders(clubId: number, n: number): number[] {
  const out: number[] = []
  for (const cl of CLUBS) {
    if (cl.id === clubId || out.length >= n) continue
    const c = POOL.find((x) => x.club === cl.id && x.pos !== 'GK')
    if (c) out.push(c.id)
  }
  return out
}

function base(): Squad {
  return clubSquad(CLUBS[0].id, '4-3-3')
}

describe('타 구단 영입 제한', () => {
  it('자기 구단만으로 짠 스쿼드는 영입 0명이고 규칙을 지킨다', () => {
    for (const cl of CLUBS) {
      let sq: Squad
      try {
        sq = clubSquad(cl.id, '4-3-3')
      } catch {
        continue
      }
      const c = checkSquad(sq, CAP)
      expect(c.outside).toEqual({ xi: 0, bench: 0 })
      expect(c.homeClub).toBe(cl.id)
      expect(c.ok, `${cl.name}: ${c.errors.join(' / ')}`).toBe(true)
    }
  })

  it(`선발 영입은 ${OUT_XI_MAX}명까지 — 하나 더 넣으면 규칙 위반`, () => {
    const sq = base()
    const outs = outsiders(CLUBS[0].id, OUT_XI_MAX + 1)
    // 선발 자리 1..N 에 넣는다 (0 은 골키퍼라 건드리지 않는다)
    for (let i = 0; i < OUT_XI_MAX; i++) sq.ids[1 + i] = outs[i]
    expect(countOutside(sq, homeClubOf(sq)).xi).toBe(OUT_XI_MAX)
    expect(checkSquad(sq, CAP).errors.some((e) => e.includes('선발 영입'))).toBe(false)

    sq.ids[1 + OUT_XI_MAX] = outs[OUT_XI_MAX]
    const c = checkSquad(sq, CAP)
    // 영입을 구단마다 하나씩 했으므로 주력 구단은 그대로다
    expect(c.homeClub).toBe(CLUBS[0].id)
    expect(c.outside.xi).toBe(OUT_XI_MAX + 1)
    expect(c.ok).toBe(false)
    expect(c.errors.some((e) => e.includes('선발 영입'))).toBe(true)
  })

  it(`후보 영입은 ${OUT_BENCH_MAX}명까지`, () => {
    const sq = base()
    const outs = outsiders(CLUBS[0].id, OUT_BENCH_MAX + 1)
    for (let i = 0; i < OUT_BENCH_MAX; i++) sq.ids[START_SIZE + i] = outs[i]
    expect(checkSquad(sq, CAP).errors.some((e) => e.includes('후보 영입'))).toBe(false)

    sq.ids[START_SIZE + OUT_BENCH_MAX] = outs[OUT_BENCH_MAX]
    const c = checkSquad(sq, CAP)
    expect(c.outside.bench).toBe(OUT_BENCH_MAX + 1)
    expect(c.errors.some((e) => e.includes('후보 영입'))).toBe(true)
  })

  it('한 구단에서 몰아 데려오면 **그 구단이 된다** — 제한을 우회할 수 없다', () => {
    const sq = base()
    const other = CLUBS[1].id
    const many = POOL.filter((c) => c.club === other && c.pos !== 'GK').slice(0, 6)
    expect(many.length).toBe(6)
    for (let i = 0; i < 6; i++) sq.ids[1 + i] = many[i].id
    const c = checkSquad(sq, CAP)
    // 선발 최다가 6명인 그 구단으로 넘어가고, 남은 내 구단 5명이 "영입" 으로 세어진다
    expect(c.homeClub).toBe(other)
    expect(c.outside.xi).toBe(OUT_XI_MAX)
    expect(c.errors.some((e) => e.includes('선발 영입'))).toBe(false)
  })

  it('주력 구단은 선언값이 아니라 선발에서 센다 — 거짓말이 이득이 되지 않는다', () => {
    const sq = base()
    // 남의 구단이라고 우겨 봐도 영입 인원이 줄지 않는다 (오히려 11명이 된다)
    sq.club = CLUBS[5].id
    expect(homeClubOf(sq)).toBe(CLUBS[0].id)
    expect(checkSquad(sq, CAP).outside.xi).toBe(0)
  })
})

describe('영입 웃돈', () => {
  it('자기 구단 선수는 그대로, 타 구단 선수는 웃돈이 붙는다', () => {
    const home = CLUBS[0].id
    const own = POOL.find((c) => c.club === home)!
    const out = POOL.find((c) => c.club !== home)!
    expect(payOf(own, home)).toBe(cardSalary(own))
    expect(payOf(out, home)).toBe(Math.round(cardSalary(out) * TRANSFER_PREMIUM))
    expect(payOf(out, home)).toBeGreaterThan(cardSalary(out))
  })

  it('웃돈이 붙어도 **자기 선수 18명**은 상한 안에 들어온다 (상한 조건 2)', () => {
    for (const cl of CLUBS) {
      let sq: Squad
      try {
        sq = clubSquad(cl.id, '4-3-3')
      } catch {
        continue
      }
      expect(checkSquad(sq, CAP).salary, cl.name).toBeLessThanOrEqual(CAP)
    }
  })

  it('영입하면 급여가 실제로 더 든다', () => {
    const sq = base()
    const before = checkSquad(sq, CAP).salary
    const out = cardById(outsiders(CLUBS[0].id, 1)[0])!
    const replaced = cardById(sq.ids[1])!
    sq.ids[1] = out.id
    const after = checkSquad(sq, CAP).salary
    expect(after - before).toBe(Math.round(cardSalary(out) * TRANSFER_PREMIUM) - cardSalary(replaced))
  })
})

describe('고칠 수 있는 문제와 못 고치는 문제를 나눈다', () => {
  it('영입 초과·급여 초과는 hard 가 아니다 — 저장된 스쿼드를 버리지 않는다', () => {
    const sq = base()
    const outs = outsiders(CLUBS[0].id, OUT_XI_MAX + 1)
    for (let i = 0; i <= OUT_XI_MAX; i++) sq.ids[1 + i] = outs[i]
    const c = checkSquad(sq, CAP)
    expect(c.ok).toBe(false)
    expect(c.errors.length).toBeGreaterThan(0)
    expect(c.hard).toEqual([])
  })

  it('선수 수가 모자라면 hard 다 — 이건 화면에서 못 고친다', () => {
    const sq = base()
    sq.ids = sq.ids.slice(0, SQUAD_SIZE - 1)
    expect(checkSquad(sq, CAP).hard.length).toBeGreaterThan(0)
  })
})
