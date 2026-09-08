// 경기가 축구처럼 굴러가나 — 골·슛·점유율의 대략적 범위 (정밀 밸런스는 tools/balance.ts, 단계 7).
import { describe, expect, it } from 'vitest'
import { runFull } from './helpers'

describe('경기', () => {
  it('3분 하프 × 4시드 — 골이 나고, 슛이 있고, 점유율이 한쪽으로 쏠리지 않는다', () => {
    let goals = 0
    let shots = 0
    let possA = 0
    let possB = 0
    const seeds = [101, 202, 303, 404]
    for (const s of seeds) {
      const { st } = runFull(s, 180)
      expect(st.done).toBe(true)
      goals += st.teams[0].goals + st.teams[1].goals
      shots += st.stats[0].shots + st.stats[1].shots
      possA += st.stats[0].poss
      possB += st.stats[1].poss
      const kinds = new Set(st.events.map((e) => e.type))
      expect(kinds.has('kickoff')).toBe(true)
      expect(kinds.has('half')).toBe(true)
      expect(kinds.has('end')).toBe(true)
    }
    const avgGoals = goals / seeds.length
    const avgShots = shots / seeds.length
    console.log(`평균 골 ${avgGoals.toFixed(2)} · 평균 슛 ${avgShots.toFixed(1)} · 점유 ${((possA / (possA + possB)) * 100).toFixed(0)}%`)
    expect(avgGoals).toBeGreaterThan(0.5)
    expect(avgGoals).toBeLessThan(8)
    expect(avgShots).toBeGreaterThan(4)
    const share = possA / (possA + possB)
    expect(share).toBeGreaterThan(0.3)
    expect(share).toBeLessThan(0.7)
  }, 120000)
})
