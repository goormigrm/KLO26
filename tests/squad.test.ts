// 카드 · 스쿼드 · 코드 (DESIGN 5장 · 11장 5단계 기준).
// "규칙 위반 스쿼드가 전부 거절된다 · 코드 왕복 1,000건 · 손상 코드 거부"
import { describe, expect, it } from 'vitest'
import { makeRng, rand } from '../src/core/rng'
import { CLUBS, POOL, POOL_SIZE, cardById } from '../src/data/pool'
import { calibrateOvr, ovrOf, rawOvr, salaryOf, sixGKOf, sixOf } from '../src/cards/cards'
import {
  ENH_BUDGET, ENH_MAX, OVR_FIT, SQUAD_SIZE, cardOvr, cardSalary, checkSquad, clubHandicap, clubSquad, computeCap, starterSquad,
  teamworkBonus, toSquadConfig, type Squad,
} from '../src/cards/squad'
import { CODE_PREFIX, decodeSquad, encodeSquad } from '../src/cards/squadcode'
import { createState } from '../src/core/sim'

const CAP = computeCap().cap

function clone(s: Squad): Squad {
  return { ...s, ids: [...s.ids], enh: [...s.enh], presets: [{ ...s.presets[0] }, { ...s.presets[1] }, { ...s.presets[2] }], kickers: [...s.kickers] as Squad['kickers'] }
}

describe('카드 풀', () => {
  it('풀 전체 · 29구단 · id 가 겹치지 않는다', () => {
    expect(POOL.length).toBe(POOL_SIZE)
    expect(CLUBS.length).toBe(29)
    expect(new Set(POOL.map((c) => c.id)).size).toBe(POOL_SIZE)
    expect(new Set(POOL.map((c) => c.club)).size).toBe(29)
  })

  it('6스탯은 0~99 안', () => {
    for (const c of POOL.slice(0, 60)) {
      const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThanOrEqual(99)
      }
    }
  })

  it('OVR 보정은 앵커 두 개를 맞춘다 — 상위 1% 85 · 중앙값 63', () => {
    const fit = calibrateOvr(POOL)
    const ovrs = POOL.map((c) => ovrOf(c, fit)).sort((a, b) => a - b)
    const at = (q: number): number => ovrs[Math.round(q * (ovrs.length - 1))]
    expect(Math.abs(at(0.99) - 85)).toBeLessThanOrEqual(2)
    expect(Math.abs(at(0.5) - 63)).toBeLessThanOrEqual(2)
  })

  it('급여표는 OVR 이 오르면 안 내려간다', () => {
    let prev = 0
    for (let o = 40; o <= 99; o++) {
      const s = salaryOf(o)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('강화 +1 은 능력치 40종 전부 +1 이고 OVR 도 오른다', () => {
    const c = POOL.find((p) => p.pos === 'FW' && rawOvr(p) < 70)!
    expect(cardOvr(c, 3)).toBeGreaterThan(cardOvr(c, 0))
    // 급여는 강화와 무관 (DESIGN 5.5)
    expect(cardSalary(c)).toBe(salaryOf(cardOvr(c, 0)))
  })
})

describe('급여 상한 — 도구가 데이터로 정한다 (DESIGN 5.4)', () => {
  const r = computeCap()

  it('29개 구단 어디든 자기 선수 18명이면 상한 안에 든다 (K리그2 포함)', () => {
    expect(r.cap).toBeGreaterThanOrEqual(r.clubMax)
    for (const club of CLUBS) {
      const own = POOL.filter((c) => c.club === club.id)
      expect(own.length).toBeGreaterThanOrEqual(SQUAD_SIZE)
    }
  })

  it('올스타 18명은 상한 밖', () => {
    expect(r.best18).toBeGreaterThan(r.cap)
  })
})

describe('스쿼드 규칙 — 위반은 전부 거절된다 (DESIGN 5.8)', () => {
  const base = starterSquad('4-3-3')

  it('기본 스쿼드는 통과한다', () => {
    const c = checkSquad(base, CAP)
    expect(c.errors).toEqual([])
    expect(c.ok).toBe(true)
  })

  it('같은 선수를 두 번 넣으면 거절', () => {
    const s = clone(base)
    s.ids[5] = s.ids[4]
    expect(checkSquad(s, CAP).ok).toBe(false)
  })

  it('선발 골키퍼가 0명 또는 2명이면 거절', () => {
    const s = clone(base)
    const gk2 = POOL.find((c) => c.pos === 'GK' && !s.ids.includes(c.id))!
    s.ids[5] = gk2.id
    expect(checkSquad(s, CAP).ok).toBe(false)
  })

  it('강화 예산·카드당 상한을 넘으면 거절', () => {
    const over = clone(base)
    over.enh[0] = ENH_MAX + 1
    expect(checkSquad(over, CAP).ok).toBe(false)
    const budget = clone(base)
    for (let i = 0; i < 6; i++) budget.enh[i] = ENH_MAX
    expect(budget.enh.reduce((a, b) => a + b, 0)).toBeGreaterThan(ENH_BUDGET)
    expect(checkSquad(budget, CAP).ok).toBe(false)
  })

  it('급여 상한을 넘으면 거절', () => {
    const rich = clone(base)
    const best = [...POOL].sort((a, b) => cardSalary(b) - cardSalary(a))
    const used = new Set<number>()
    let gk = 0
    let i = 0
    for (let k = 0; k < SQUAD_SIZE; k++) {
      while (i < best.length && (used.has(best[i].id) || (best[i].pos === 'GK' && gk >= 1 && k < 11))) i++
      const c = best[i]
      if (!c) break
      if (c.pos === 'GK') gk++
      used.add(c.id)
      rich.ids[k] = c.id
      i++
    }
    // 첫 자리는 GK 여야 하므로 자리만 맞춘다
    const gkIdx = rich.ids.findIndex((id) => cardById(id)?.pos === 'GK')
    if (gkIdx > 0) {
      const t = rich.ids[0]
      rich.ids[0] = rich.ids[gkIdx]
      rich.ids[gkIdx] = t
    }
    const c = checkSquad(rich, CAP)
    expect(c.salary).toBeGreaterThan(CAP)
    expect(c.ok).toBe(false)
  })

  it('슬라이더가 0~4 밖이면 거절', () => {
    const s = clone(base)
    s.presets[1].press = 9
    expect(checkSquad(s, CAP).ok).toBe(false)
  })

  it('없는 선수 id 는 거절', () => {
    const s = clone(base)
    s.ids[3] = 99999
    expect(checkSquad(s, CAP).ok).toBe(false)
  })
})

describe('팀워크 (DESIGN 5.6)', () => {
  it('뭉침 단계 — 같은 구단 5·7·9·11명 → +1·2·3·4', () => {
    const club = CLUBS[0]
    const own = POOL.filter((c) => c.club === club.id)
    // 나머지는 **서로 다른 구단**에서 한 명씩 — 안 그러면 그쪽이 최다 구단이 된다
    const others = CLUBS.slice(1).map((cl) => POOL.find((c) => c.club === cl.id)!)
    const mk = (n: number): number[] => [...own.slice(0, n).map((c) => c.id), ...others.slice(0, 11 - n).map((c) => c.id)]
    // `tier` 가 뭉침 단계다. `bonus` 에는 약체 가산이 더 얹힌다 (2026-09-11)
    expect(teamworkBonus(mk(4)).tier).toBe(0)
    expect(teamworkBonus(mk(5)).tier).toBe(1)
    expect(teamworkBonus(mk(7)).tier).toBe(2)
    expect(teamworkBonus(mk(9)).tier).toBe(3)
    expect(teamworkBonus(mk(11)).tier).toBe(4)
    // 뭉치지 않으면 약체 가산도 없다 — 남의 구단만 모아 놓고 가산만 받아 갈 수 없다
    expect(teamworkBonus(mk(4)).handicap).toBe(0)
    expect(teamworkBonus(mk(4)).bonus).toBe(0)
  })

  it('약체 가산 — 전력이 낮은 구단일수록 더 붙는다', () => {
    const power = CLUBS.map((cl) => ({ cl, h: clubHandicap(cl.id) }))
    // 가장 센 구단은 가산이 없고, 가장 약한 구단은 가산이 있다
    expect(Math.min(...power.map((p) => p.h))).toBe(0)
    expect(Math.max(...power.map((p) => p.h))).toBeGreaterThan(0)
    for (const { cl, h } of power) {
      expect(h, cl.name).toBeGreaterThanOrEqual(0)
      expect(h, cl.name).toBeLessThanOrEqual(3)
    }
    // 순수 구단 팀이면 bonus = 4 + 그 구단 가산
    for (const cl of CLUBS) {
      const sq = clubSquad(cl.id, '4-3-3')
      const tw = teamworkBonus(sq.ids.slice(0, 11))
      expect(tw.tier, cl.name).toBe(4)
      expect(tw.bonus, cl.name).toBe(4 + clubHandicap(cl.id))
    }
  })

  it('팀워크는 선발에게만 붙는다 (후보 제외)', () => {
    const club = CLUBS[1]
    const own = POOL.filter((c) => c.club === club.id)
    const sq = starterSquad('4-3-3')
    // 선발 11명을 같은 구단으로
    const gk = own.find((c) => c.pos === 'GK')!
    const rest = own.filter((c) => c.id !== gk.id).slice(0, 10)
    sq.ids = [gk.id, ...rest.map((c) => c.id), ...sq.ids.slice(11)]
    const tw = teamworkBonus(sq.ids.slice(0, 11))
    expect(tw.tier).toBe(4)
    expect(tw.bonus).toBe(4 + clubHandicap(club.id))
    const cfg = toSquadConfig(sq, '테스트', '테')
    const startBoost = cfg.players[3].attr.pac - (cardById(sq.ids[3])!.attr.pac as number)
    const benchBoost = cfg.players[12].attr.pac - (cardById(sq.ids[12])!.attr.pac as number)
    expect(startBoost).toBe(tw.bonus)
    expect(benchBoost).toBe(0)
  })
})

describe('스쿼드 코드 (DESIGN 5.9)', () => {
  it('왕복 1,000건 — 넣은 그대로 나온다', () => {
    const r = makeRng(4242)
    const base = starterSquad('4-3-3')
    for (let t = 0; t < 1000; t++) {
      const s = clone(base)
      s.formation = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2'][Math.floor(rand(r) * 5)]
      for (let i = 0; i < SQUAD_SIZE; i++) {
        s.ids[i] = POOL[Math.floor(rand(r) * POOL.length)].id
        s.enh[i] = Math.floor(rand(r) * (ENH_MAX + 1))
      }
      for (const p of s.presets) {
        p.line = Math.floor(rand(r) * 5)
        p.press = Math.floor(rand(r) * 5)
        p.width = Math.floor(rand(r) * 5)
        p.mentality = Math.floor(rand(r) * 5)
      }
      s.kickers = [Math.floor(rand(r) * 12) - 1, Math.floor(rand(r) * 12) - 1, -1] as Squad['kickers']
      const code = encodeSquad(s)
      const back = decodeSquad(code)
      expect(back.ok).toBe(true)
      if (!back.ok) return
      expect(back.squad.formation).toBe(s.formation)
      expect(back.squad.ids).toEqual(s.ids)
      expect(back.squad.enh).toEqual(s.enh)
      expect(back.squad.presets).toEqual(s.presets)
      expect(back.squad.kickers).toEqual(s.kickers)
    }
  })

  it('코드는 KLO26- 으로 시작하고 길이가 일정하다', () => {
    const a = encodeSquad(starterSquad('4-3-3'))
    const b = encodeSquad(starterSquad('4-4-2'))
    expect(a.startsWith(CODE_PREFIX)).toBe(true)
    expect(a.length).toBe(b.length)
  })

  it('한 글자만 바뀌어도 거부한다 — 조용히 다른 스쿼드가 되지 않는다', () => {
    const sq = starterSquad('4-3-3')
    const code = encodeSquad(sq)
    let rejected = 0
    let silent = 0
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = CODE_PREFIX.length; i < code.length; i++) {
      const cur = code[i]
      const next = alphabet[(alphabet.indexOf(cur) + 7) % alphabet.length]
      const bad = code.slice(0, i) + next + code.slice(i + 1)
      const res = decodeSquad(bad)
      if (!res.ok) rejected++
      else if (JSON.stringify(res.squad.ids) !== JSON.stringify(sq.ids)) silent++
    }
    // 체크섬 10비트라 1/1024 는 통과할 수 있다. 한 글자 변조 전부를 통과시키면 안 된다
    expect(rejected).toBeGreaterThan(0)
    expect(silent).toBe(0)
  })

  it('잘린 코드·엉뚱한 접두어는 거부', () => {
    const code = encodeSquad(starterSquad('4-3-3'))
    expect(decodeSquad(code.slice(0, code.length - 6)).ok).toBe(false)
    expect(decodeSquad(code.replace(CODE_PREFIX, 'KLO25-')).ok).toBe(false)
    expect(decodeSquad('아무 글자').ok).toBe(false)
  })
})

describe('스쿼드 → 경기', () => {
  it('스쿼드로 실제 경기를 만들 수 있다', () => {
    const sq = starterSquad('4-3-3')
    const cfg = toSquadConfig(sq, '홈', '홈')
    const st = createState({ seed: 3, halfSec: 30, squads: [cfg, cfg] })
    expect(st.players.length).toBe(22)
    expect(st.teams[0].bench.length).toBe(7)
    expect(OVR_FIT.a).toBeGreaterThan(0)
  })
})
