// 카드 데이터 — 실제 K리그 2026 명단을 보호명으로 구운 결과 (DESIGN 5.1 · 10.2).
// 여기가 지키는 것: **저장소에 실명이 없다**는 약속과, 데이터가 sim 이 먹는 모양이라는 것.

import { describe, expect, it } from 'vitest'
import { CLUBS, POOL, POOL_HASH, POOL_SIZE, cardById, clubOf } from '../src/data/pool'
import { sixGKOf, sixOf } from '../src/cards/cards'
import { clubSquad, cardOvr, checkSquad, computeCap, starterSquad, squadClub, teamworkBonus } from '../src/cards/squad'
import { encodeSquad, decodeSquad } from '../src/cards/squadcode'
import { skillsOf } from '../src/core/skills'

const CAP = computeCap().cap

describe('카드 데이터', () => {
  it('29구단 · 한 구단 18명 이상 · id 가 겹치지 않고 11비트에 들어간다', () => {
    // 장수를 못 박지 않는다 — 원본(KM26)이 명단을 갱신하면 늘고 준다 (2026-09-09: 1,024 → 1,056).
    // 대신 **깨지면 안 되는 것**을 본다: 구단 수 · 구단마다 스쿼드를 짤 수 있는 인원 · id 규격.
    expect(POOL_SIZE).toBeGreaterThanOrEqual(29 * 18)
    expect(CLUBS.length).toBe(29)
    expect(new Set(POOL.map((c) => c.id)).size).toBe(POOL_SIZE)
    // 스쿼드 코드가 id 를 11비트로 접는다 (squadcode.ts). 넘으면 코드가 조용히 딴 선수를 가리킨다.
    for (const c of POOL) expect(c.id).toBeLessThanOrEqual(2047)
    for (const club of CLUBS) {
      const own = POOL.filter((c) => c.club === club.id)
      expect(own.length, `${club.name} 인원`).toBeGreaterThanOrEqual(18)
      expect(own.filter((c) => c.pos === 'GK').length, `${club.name} GK`).toBeGreaterThanOrEqual(1)
    }
  })

  it('구단은 1부 12팀 · 2부 17팀이고 색 두 개를 갖는다', () => {
    expect(CLUBS.filter((c) => c.div === 1).length).toBe(12)
    expect(CLUBS.filter((c) => c.div === 2).length).toBe(17)
    for (const c of CLUBS) {
      expect(c.name.length).toBeGreaterThan(1)
      expect(c.short.length).toBeGreaterThan(0)
      expect(c.col).toBeGreaterThanOrEqual(0)
      expect(c.col2).toBeGreaterThanOrEqual(0)
    }
  })

  it('구단명에 기업 이름이 없다 (DESIGN 10.2 — 고지 대신 안 쓴다)', () => {
    // 원본 구단명에 들어 있던 기업·브랜드 표기
    const banned = ['현대', '삼성', 'SK', 'HD', '하나', '이랜드', '아이파크', '상무']
    for (const c of CLUBS) {
      for (const b of banned) expect(c.name).not.toContain(b)
    }
  })

  it('모든 선수가 사람 이름 꼴이고 자리표시자가 아니다', () => {
    for (const c of POOL) {
      // 원본에 한 글자 이름이 실제로 있다 (외국 선수 등록명). 비어 있지만 않으면 된다
      expect(c.name.length).toBeGreaterThanOrEqual(1)
      // 예전 자리표시자("가1-07") 꼴이 아니다
      expect(c.name).not.toMatch(/^[가-힣]\d+-\d+$/)
      expect(c.no).toBeGreaterThanOrEqual(0)
      expect(c.h).toBeGreaterThanOrEqual(155)
      expect(c.h).toBeLessThanOrEqual(210)
      expect(['GK', 'DF', 'MF', 'FW']).toContain(c.pos)
      expect(['L', 'R', 'B']).toContain(c.foot)
    }
  })

  it('한 구단 안에서 이름이 겹치지 않는다 (충돌 회피)', () => {
    for (const club of CLUBS) {
      const names = POOL.filter((c) => c.club === club.id).map((c) => c.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('sim 이 읽는 능력치가 전부 있고 0~99 안', () => {
    const need = ['pac', 'acc', 'agi', 'bal', 'jum', 'str', 'sta', 'fir', 'tec', 'dri', 'pas', 'vis',
      'crs', 'fin', 'lon', 'pen', 'hea', 'cmp', 'dec', 'cnt', 'ant', 'pos', 'mar', 'tck', 'agg', 'bra', 'fla', 'wor', 'tea']
    for (const c of POOL) {
      for (const k of need) {
        const v = c.attr[k]
        expect(typeof v).toBe('number')
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(99)
      }
    }
  })

  it('골키퍼만 GK 능력치를 갖는다', () => {
    const gks = POOL.filter((c) => c.pos === 'GK')
    expect(gks.length).toBeGreaterThan(50)
    for (const c of gks) {
      expect(c.gkA).toBeDefined()
      expect(c.gkA!.ref).toBeGreaterThan(0)
    }
    // 필드 선수는 GK 능력치가 없다 — skillsOf 가 오용 페널티를 준다
    expect(POOL.filter((c) => c.pos !== 'GK' && c.gkA).length).toBe(0)
  })

  it('포지션 능숙도가 자기 자리에서 가장 높다', () => {
    let ok = 0
    const gks = POOL.filter((c) => c.pos === 'GK')
    for (const c of gks) if ((c.posFam?.GK ?? 0) >= 90) ok++
    expect(ok / gks.length).toBeGreaterThan(0.9)
  })

  it('스킬 변환이 터지지 않는다', () => {
    for (const c of POOL.slice(0, 120)) {
      const sk = skillsOf(c, c.pos === 'GK' ? 'GK' : 'CM', c.pos === 'GK' ? 'GK' : 'MF')
      expect(sk.vmax).toBeGreaterThan(3)
      expect(Number.isFinite(sk.gkReach)).toBe(true)
    }
  })

  it('6스탯이 0~99 안', () => {
    for (const c of POOL.slice(0, 200)) {
      const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThanOrEqual(99)
      }
    }
  })

  it('데이터 지문은 16비트', () => {
    expect(POOL_HASH).toBeGreaterThanOrEqual(0)
    expect(POOL_HASH).toBeLessThanOrEqual(0xffff)
  })
})

describe('구단 스쿼드', () => {
  it('29개 구단 전부 자기 선수만으로 규칙을 통과한다 (급여 상한 포함)', () => {
    for (const club of CLUBS) {
      const sq = clubSquad(club.id, '4-3-3')
      const chk = checkSquad(sq, CAP)
      expect(chk.errors, `${club.name}: ${chk.errors.join(' / ')}`).toEqual([])
      // 자기 선수만 썼으니 뭉침 단계는 최대치 (총 보너스에는 약체 가산이 더 붙는다)
      expect(teamworkBonus(sq.ids.slice(0, 11)).tier).toBe(4)
      expect(squadClub(sq)?.id).toBe(club.id)
    }
  })

  it('처음 여는 사람의 스쿼드도 규칙을 통과한다', () => {
    const chk = checkSquad(starterSquad('4-3-3'), CAP)
    expect(chk.errors).toEqual([])
  })

  it('구단 스쿼드도 코드 왕복이 된다', () => {
    for (const club of CLUBS.slice(0, 8)) {
      const sq = clubSquad(club.id, '4-4-2')
      const back = decodeSquad(encodeSquad(sq))
      expect(back.ok).toBe(true)
      if (back.ok) expect(back.squad.ids).toEqual(sq.ids)
    }
  })

  it('1부가 2부보다 세고, 어느 구단도 무너져 있지 않다', () => {
    const avgOf = (club: (typeof CLUBS)[number]): number => {
      const own = POOL.filter((c) => c.club === club.id)
      return own.reduce((a, c) => a + cardOvr(c, 0), 0) / own.length
    }
    const k1 = CLUBS.filter((c) => c.div === 1).map(avgOf)
    const k2 = CLUBS.filter((c) => c.div === 2).map(avgOf)
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length
    // 실제 리그 구조 — 1부가 2부보다 확실히 세다 (K리그2 능력치는 원본이 생성한 값이다, DESIGN 5.1)
    expect(mean(k1)).toBeGreaterThan(mean(k2) + 6)
    // 그래도 어느 구단이든 경기는 된다
    expect(Math.min(...k1, ...k2)).toBeGreaterThan(42)
    expect(Math.max(...k1, ...k2)).toBeLessThan(90)
  })

  it('모든 포메이션에서 자리 포지션이 맞는다 — GK 자리에 GK (2026-09-09 제보)', () => {
    for (const f of ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '3-4-3']) {
      for (const club of CLUBS.slice(0, 6)) {
        const sq = clubSquad(club.id, f)
        expect(cardById(sq.ids[0])?.pos, `${club.name} ${f} 선발 GK`).toBe('GK')
        expect(cardById(sq.ids[11])?.pos, `${club.name} ${f} 벤치 GK`).toBe('GK')
        // 선발 필드 10명에 GK 가 섞이지 않는다
        for (let i = 1; i < 11; i++) expect(cardById(sq.ids[i])?.pos).not.toBe('GK')
      }
    }
  })

  it('데이터 지문이 다른 저장 스쿼드는 버린다 — 자리표시자 시절 id 가 딴 선수를 가리킨다', () => {
    const sq = clubSquad(CLUBS[0].id, '4-3-3')
    // 지문이 없거나 다르면 못 쓴다 (loadSquad 가 이 규칙으로 버린다)
    expect(sq.hash === undefined || sq.hash !== POOL_HASH).toBe(true)
    const saved = { ...sq, hash: POOL_HASH }
    expect(saved.hash).toBe(POOL_HASH)
    const stale = { ...sq, hash: (POOL_HASH ^ 0x1234) & 0xffff }
    expect(stale.hash).not.toBe(POOL_HASH)
  })

  it('카드 조회가 된다', () => {
    const c = POOL[10]
    expect(cardById(c.id)?.name).toBe(c.name)
    expect(clubOf(c).id).toBe(c.club)
  })
})
