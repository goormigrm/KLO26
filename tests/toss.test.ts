// 동전 던지기 — 홈/원정을 경기마다 정한다 (사용자 요청 2026-09-11).
// 온라인에서 두 브라우저가 **같은 홈**을 봐야 하므로 시드에서 유도한다.
import { describe, expect, it } from 'vitest'
import { tossHostHome } from '../src/game/toss'
import { CLUBS } from '../src/data/pool'

describe('동전 던지기', () => {
  it('같은 시드는 언제나 같은 결과 (결과 링크를 다시 열어도 홈이 같다)', () => {
    for (const seed of [0, 1, 7, 12345, 0x7fffffff, 20260911]) {
      expect(tossHostHome(seed)).toBe(tossHostHome(seed))
    }
  })

  it('방장·게스트가 서로 다른 팀을 맡고, 홈은 정확히 한 명이다', () => {
    for (let seed = 0; seed < 500; seed++) {
      const hostHome = tossHostHome(seed)
      const hostMe = (true === hostHome ? 0 : 1) as 0 | 1
      const guestMe = (false === hostHome ? 0 : 1) as 0 | 1
      expect(hostMe).not.toBe(guestMe)
      expect(hostMe + guestMe).toBe(1)
    }
  })

  it('한쪽으로 쏠리지 않는다 (2,000판에서 40~60%)', () => {
    let home = 0
    for (let seed = 0; seed < 2000; seed++) if (tossHostHome(seed)) home++
    const rate = home / 2000
    expect(rate).toBeGreaterThan(0.4)
    expect(rate).toBeLessThan(0.6)
  })

  it('상대 구단 고르기(`seed % CLUBS.length`)와 얽히지 않는다 — 특정 구단이 늘 원정이면 안 된다', () => {
    const per = new Array(CLUBS.length).fill(0).map(() => ({ home: 0, n: 0 }))
    for (let seed = 0; seed < 6000; seed++) {
      const c = per[seed % CLUBS.length]
      c.n++
      if (tossHostHome(seed)) c.home++
    }
    for (const c of per) {
      const rate = c.home / c.n
      expect(rate).toBeGreaterThan(0.3)
      expect(rate).toBeLessThan(0.7)
    }
  })
})
