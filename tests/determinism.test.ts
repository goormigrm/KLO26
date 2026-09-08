// 단계 2 검토 기준 — 같은 시드로 두 번 돌리면 60틱마다의 해시가 전부 같아야 한다 (DESIGN 4.12 · 11장).
import { describe, expect, it } from 'vitest'
import { runFull } from './helpers'

describe('결정론', () => {
  it('같은 시드 두 번 → 해시 전부 일치 (30초 하프)', () => {
    const a = runFull(20260908, 30)
    const b = runFull(20260908, 30)
    expect(a.hashes.length).toBeGreaterThan(50)
    expect(a.hashes).toEqual(b.hashes)
    expect(a.st.done).toBe(true)
    expect(a.st.phase).toBe('end')
  }, 60000)

  it('다른 시드는 다른 경기', () => {
    const a = runFull(1, 30)
    const b = runFull(2, 30)
    expect(a.hashes).not.toEqual(b.hashes)
  }, 60000)

  it('좌표에 NaN 이 없다 · 선수가 피치 밖 2 m 안', () => {
    const { st } = runFull(7, 30)
    for (const p of st.players) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(54.6)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(36.1)
    }
    expect(Number.isFinite(st.ball.x) && Number.isFinite(st.ball.z)).toBe(true)
  }, 60000)
})
