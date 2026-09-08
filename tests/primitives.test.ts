// 결정론의 바닥이 되는 두 파일이 약속대로 도는지. 게임 코드가 생기면 determinism.test.ts 가 따로 생긴다.
import { describe, expect, it } from 'vitest'
import { ANGLE_STEPS, angleDiff, atan2A, radToAngle, sinA, cosA } from '../src/core/fixedmath'
import { makeRng, rand, randInt } from '../src/core/rng'

describe('rng', () => {
  it('같은 시드는 같은 수열', () => {
    const a = makeRng(20260908)
    const b = makeRng(20260908)
    for (let i = 0; i < 1000; i++) expect(rand(a)).toBe(rand(b))
  })
  it('[0,1) 안', () => {
    const r = makeRng(7)
    for (let i = 0; i < 10000; i++) {
      const v = rand(r)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('randInt 는 [lo, hi)', () => {
    const r = makeRng(3)
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThan(5)
    }
  })
})

describe('fixedmath', () => {
  it('sin/cos 테이블은 1/65536 격자 위', () => {
    for (let a = 0; a < ANGLE_STEPS; a++) {
      expect(sinA(a) * 65536).toBe(Math.round(sinA(a) * 65536))
      expect(cosA(a) * 65536).toBe(Math.round(cosA(a) * 65536))
    }
  })
  it('atan2A 는 실제 각도와 1스텝 안', () => {
    for (let i = 0; i < 360; i++) {
      const rad = (i / 360) * Math.PI * 2
      const want = radToAngle(rad)
      const got = atan2A(Math.sin(rad), Math.cos(rad))
      expect(Math.abs(angleDiff(got, want))).toBeLessThanOrEqual(1)
    }
  })
})
