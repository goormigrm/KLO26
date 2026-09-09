// 방송 카메라 수학 (DESIGN 7.1). Three 없이 순수 함수만.
import { describe, expect, it } from 'vitest'
import { BASE_ASPECT, FOV_TIGHT, FOV_WIDE, LEAD_MAX, broadcastTarget, cameraLookAt, cameraPosition, fovForAspect } from '../src/render3d/camera'
import { HALF_L, HALF_W } from '../src/core/state'

describe('방송 카메라', () => {
  it('공을 따라가되 진행 방향으로 리드를 얹는다 (최대 6 m)', () => {
    expect(broadcastTarget(0, 0, 0).x).toBe(0)
    expect(broadcastTarget(0, 0, 4).x).toBeCloseTo(2)
    expect(broadcastTarget(0, 0, 40).x).toBe(LEAD_MAX)
    expect(broadcastTarget(0, 0, -40).x).toBe(-LEAD_MAX)
  })

  it('골라인 근처에서는 x 를 잘라 골문이 화면에 남는다', () => {
    expect(broadcastTarget(HALF_L, 0, 30).x).toBeLessThanOrEqual(HALF_L - 8)
    expect(broadcastTarget(-HALF_L, 0, -30).x).toBeGreaterThanOrEqual(-(HALF_L - 8))
  })

  it('골문에 가까워질수록 줌인 (FOV 35 → 28)', () => {
    expect(broadcastTarget(0, 0, 0).fov).toBe(FOV_WIDE)
    expect(broadcastTarget(HALF_L, 0, 0).fov).toBe(FOV_TIGHT)
    const mid = broadcastTarget(40, 0, 0).fov
    expect(mid).toBeLessThan(FOV_WIDE)
    expect(mid).toBeGreaterThan(FOV_TIGHT)
  })

  it('카메라는 −y 사이드라인 밖(Three +z)에 서서 시선 z 는 −y', () => {
    const t = broadcastTarget(10, 20, 0)
    const p = cameraPosition(t)
    expect(p.z).toBeGreaterThan(HALF_W)
    expect(p.y).toBeGreaterThan(0)
    expect(cameraLookAt(t).z).toBeLessThan(0)
    expect(cameraLookAt(t).x).toBe(p.x)
  })

  it('좁은 창은 세로 FOV 를 키워 좌우를 자르지 않는다', () => {
    expect(fovForAspect(35, BASE_ASPECT)).toBe(35)
    expect(fovForAspect(35, 2.2)).toBe(35)
    const narrow = fovForAspect(35, 4 / 3)
    expect(narrow).toBeGreaterThan(35)
    // 가로 시야가 같은지: tan(v/2)·aspect 가 보존된다
    const tanH = (fov: number, a: number): number => Math.tan(((fov / 2) * Math.PI) / 180) * a
    expect(tanH(narrow, 4 / 3)).toBeCloseTo(tanH(35, BASE_ASPECT), 6)
  })
})
