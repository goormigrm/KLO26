// 틱당 0.5 ms 예산 (DESIGN 4.14). 측정 PC 사정에 흔들리므로 3,000틱 평균으로 본다.
import { describe, expect, it } from 'vitest'
import { step } from '../src/core/sim'
import { idle, makeMatch } from './helpers'

describe('성능', () => {
  it('봇 vs 봇 틱당 0.5 ms 안', () => {
    const st = makeMatch(3, 180)
    for (let i = 0; i < 600; i++) step(st, idle) // 워밍업
    const n = 3000
    const t0 = performance.now()
    for (let i = 0; i < n; i++) step(st, idle)
    const ms = (performance.now() - t0) / n
    console.log(`틱당 ${ms.toFixed(4)} ms`)
    expect(ms).toBeLessThan(0.5)
  }, 60000)
})
