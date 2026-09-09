// 방송 카메라 수학 (DESIGN 7.1). Three 를 import 하지 않아 vitest 에서 가볍게 검증한다.
//
// 좌표 약속 — sim `(x, y)` → Three `(x, 높이, z = −y)`.
// 카메라는 sim 의 −y 쪽 사이드라인 바깥(Three 의 +z)에 서서 −z 를 본다.
// 그래서 화면 오른쪽 = sim +x, 화면 위 = sim +y (먼 쪽). 방향키를 그대로 월드 방향으로 써도 화면과 맞는다.

import { HALF_L, HALF_W } from '../core/state'

/** 사이드라인 바깥 거리 · 높이 (m). 설계 38/26 에서 높이를 올리고 시선을 앞으로 당겨 내려다보는 각을 약 25° 로 */
export const CAM_SIDE = 38
export const CAM_H = 30
/** 시선이 닿는 곳을 카메라 쪽으로 이만큼 당긴다 (m) — 지평선(관중석)이 위로 올라가 피치가 더 보인다 */
export const LOOK_PULL = 6
/** 세로 시야각 — 넓게 / 골문 앞에서 줌인 */
export const FOV_WIDE = 32
export const FOV_TIGHT = 26
/** 진행 방향으로 앞서 보는 거리 (m) */
export const LEAD_MAX = 6
/** 기준 화면 비율. 이보다 좁으면 좌우를 자르지 않고 세로 시야를 늘린다 */
export const BASE_ASPECT = 16 / 9

export interface CamTarget {
  /** 카메라·시선의 x (sim) */
  x: number
  /** 시선이 닿는 y (sim). 공이 먼 쪽이면 살짝 올려 본다 */
  lookY: number
  fov: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 공 위치·속도 → 카메라가 겨눌 것. 리드를 얹고, 골문이 화면에 남도록 x 를 자른다 */
export function broadcastTarget(bx: number, by: number, bvx: number): CamTarget {
  const lead = clamp(bvx * 0.5, -LEAD_MAX, LEAD_MAX)
  const x = clamp(bx + lead, -(HALF_L - 8), HALF_L - 8)
  const near = clamp((Math.abs(bx) - 28) / 22, 0, 1)
  const fov = FOV_WIDE + (FOV_TIGHT - FOV_WIDE) * near
  const lookY = clamp(by, -HALF_W, HALF_W) * 0.45
  return { x, lookY, fov }
}

/** 화면 비율에 맞춘 세로 FOV — 16:9 보다 좁으면 가로 시야를 지키고 세로를 늘린다 */
export function fovForAspect(fov: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= BASE_ASPECT) return fov
  const halfV = ((fov / 2) * Math.PI) / 180
  const tanH = Math.tan(halfV) * BASE_ASPECT
  return (Math.atan(tanH / aspect) * 2 * 180) / Math.PI
}

/** 카메라 위치 (Three 좌표) */
export function cameraPosition(t: CamTarget): { x: number; y: number; z: number } {
  return { x: t.x, y: CAM_H, z: HALF_W + CAM_SIDE }
}

/** 시선 끝 (Three 좌표) */
export function cameraLookAt(t: CamTarget): { x: number; y: number; z: number } {
  return { x: t.x, y: 0, z: -t.lookY + LOOK_PULL }
}
