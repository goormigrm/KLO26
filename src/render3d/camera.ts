// 방송 카메라 수학 (DESIGN 7.1). Three 를 import 하지 않아 vitest 에서 가볍게 검증한다.
//
// 좌표 약속 — sim `(x, y)` → Three `(x, 높이, z = −y)`.
// 카메라는 sim 의 −y 쪽 사이드라인 바깥(Three 의 +z)에 서서 −z 를 본다.
// 그래서 화면 오른쪽 = sim +x, 화면 위 = sim +y (먼 쪽). 방향키를 그대로 월드 방향으로 써도 화면과 맞는다.

import { HALF_L, HALF_W } from '../core/state'

/**
 * 사이드라인 바깥 거리 · 높이 (m).
 * 2026-09-15 (FC 온라인 영상 벤치마크, 개발계획 3장): 38/30 → **32/24** — 선수가 1.3 배 크게, 내려다보는 각은 비슷하게.
 * 골문에 가까워지면(`near`) **낮은 측면 컷**으로 — 거리 −10 · 높이 −12 까지 내려가 골문 앞 장면이 방송처럼 가까워진다.
 */
export const CAM_SIDE = 32
export const CAM_H = 24
/** 골문 근처(near = 1)에서 거리·높이를 이만큼 줄인다 */
export const NEAR_SIDE_DROP = 10
export const NEAR_H_DROP = 12
/** 시선이 닿는 곳을 카메라 쪽으로 이만큼 당긴다 (m) — 지평선(관중석)이 위로 올라가 피치가 더 보인다 */
export const LOOK_PULL = 5
/** 세로 시야각 — 넓게 / 골문 앞에서 줌인 */
export const FOV_WIDE = 30
export const FOV_TIGHT = 25
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
  /** 골문 근접도 0~1 — 줌인과 낮은 컷의 기준 */
  near: number
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
  return { x, lookY, fov, near }
}

/** 화면 비율에 맞춘 세로 FOV — 16:9 보다 좁으면 가로 시야를 지키고 세로를 늘린다 */
export function fovForAspect(fov: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= BASE_ASPECT) return fov
  const halfV = ((fov / 2) * Math.PI) / 180
  const tanH = Math.tan(halfV) * BASE_ASPECT
  return (Math.atan(tanH / aspect) * 2 * 180) / Math.PI
}

/** 카메라 위치 (Three 좌표) — 골문에 가까울수록 낮고 가깝게 */
export function cameraPosition(t: CamTarget): { x: number; y: number; z: number } {
  const n = clamp(t.near ?? 0, 0, 1)
  return { x: t.x, y: CAM_H - NEAR_H_DROP * n, z: HALF_W + CAM_SIDE - NEAR_SIDE_DROP * n }
}

/** 시선 끝 (Three 좌표) — 낮은 컷에서는 시선을 조금 올려 골문이 화면 가운데 오게 */
export function cameraLookAt(t: CamTarget): { x: number; y: number; z: number } {
  const n = clamp(t.near ?? 0, 0, 1)
  return { x: t.x, y: 0.9 * n, z: -t.lookY + LOOK_PULL - 2 * n }
}
