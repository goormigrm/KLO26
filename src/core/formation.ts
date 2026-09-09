// 포메이션 12종과 슬롯 좌표 — KM26 `FORMATION_SHAPE` · `SLOT_XY` 를 그대로 옮겼다 (DESIGN 4.10).
// SLOT_XY 는 0~1 정규화(x=0 자기 골라인, x=1 상대 골라인). 상대 팀은 점대칭(mirror)이다.

import { HALF_L, HALF_W, PITCH_L, PITCH_W, type Sliders } from './state'
import { clamp } from './fixedmath'

export type Band = 'GK' | 'DF' | 'WB' | 'DM' | 'MF' | 'AM' | 'FW'

export const SLOT_XY: Record<string, { x: number; y: number }> = {
  GK: { x: 0.04, y: 0.5 },
  LB: { x: 0.2, y: 0.1 }, LCB: { x: 0.16, y: 0.32 }, CB: { x: 0.14, y: 0.5 }, RCB: { x: 0.16, y: 0.68 }, RB: { x: 0.2, y: 0.9 },
  SW: { x: 0.09, y: 0.5 },
  LWB: { x: 0.25, y: 0.06 }, RWB: { x: 0.25, y: 0.94 },
  LDM: { x: 0.29, y: 0.36 }, DM: { x: 0.27, y: 0.5 }, RDM: { x: 0.29, y: 0.64 },
  LM: { x: 0.46, y: 0.12 }, LCM: { x: 0.42, y: 0.34 }, CM: { x: 0.4, y: 0.5 }, RCM: { x: 0.42, y: 0.66 }, RM: { x: 0.46, y: 0.88 },
  LAM: { x: 0.6, y: 0.28 }, CAM: { x: 0.6, y: 0.5 }, RAM: { x: 0.6, y: 0.72 },
  LW: { x: 0.72, y: 0.15 }, LS: { x: 0.76, y: 0.36 }, ST: { x: 0.8, y: 0.5 }, RS: { x: 0.76, y: 0.64 }, RW: { x: 0.72, y: 0.85 },
}

/** 필드 플레이어 10명의 [밴드, 슬롯]. GK 는 항상 별도 */
export const FORMATIONS: Record<string, [Band, string][]> = {
  '4-3-3': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['MF', 'LCM'], ['MF', 'CM'], ['MF', 'RCM'], ['FW', 'LW'], ['FW', 'ST'], ['FW', 'RW']],
  '4-4-2': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['MF', 'LM'], ['MF', 'LCM'], ['MF', 'RCM'], ['MF', 'RM'], ['FW', 'LS'], ['FW', 'RS']],
  '4-2-3-1': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['DM', 'LDM'], ['DM', 'RDM'], ['AM', 'LAM'], ['AM', 'CAM'], ['AM', 'RAM'], ['FW', 'ST']],
  '4-1-4-1': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['DM', 'DM'], ['MF', 'LM'], ['MF', 'LCM'], ['MF', 'RCM'], ['MF', 'RM'], ['FW', 'ST']],
  '4-2-2-2': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['DM', 'LDM'], ['DM', 'RDM'], ['AM', 'LAM'], ['AM', 'RAM'], ['FW', 'LS'], ['FW', 'RS']],
  '4-3-1-2': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['MF', 'LCM'], ['MF', 'CM'], ['MF', 'RCM'], ['AM', 'CAM'], ['FW', 'LS'], ['FW', 'RS']],
  '4-4-1-1': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'RCB'], ['DF', 'RB'], ['MF', 'LM'], ['MF', 'LCM'], ['MF', 'RCM'], ['MF', 'RM'], ['AM', 'CAM'], ['FW', 'ST']],
  '3-5-2': [['DF', 'LCB'], ['DF', 'CB'], ['DF', 'RCB'], ['WB', 'LWB'], ['WB', 'RWB'], ['MF', 'LCM'], ['MF', 'CM'], ['MF', 'RCM'], ['FW', 'LS'], ['FW', 'RS']],
  '5-3-2': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'CB'], ['DF', 'RCB'], ['DF', 'RB'], ['MF', 'LCM'], ['MF', 'CM'], ['MF', 'RCM'], ['FW', 'LS'], ['FW', 'RS']],
  '5-2-1-2': [['DF', 'LB'], ['DF', 'LCB'], ['DF', 'CB'], ['DF', 'RCB'], ['DF', 'RB'], ['DM', 'LDM'], ['DM', 'RDM'], ['AM', 'CAM'], ['FW', 'LS'], ['FW', 'RS']],
  '3-4-3': [['DF', 'LCB'], ['DF', 'CB'], ['DF', 'RCB'], ['MF', 'LM'], ['MF', 'LCM'], ['MF', 'RCM'], ['MF', 'RM'], ['FW', 'LW'], ['FW', 'ST'], ['FW', 'RW']],
  '3-4-2-1': [['DF', 'LCB'], ['DF', 'CB'], ['DF', 'RCB'], ['MF', 'LM'], ['MF', 'LCM'], ['MF', 'RCM'], ['MF', 'RM'], ['AM', 'LAM'], ['AM', 'RAM'], ['FW', 'ST']],
}

export const FORMATION_LIST = Object.keys(FORMATIONS)

/** 슬롯 → 능숙도 자리 (KM26 SLOT_FAM) */
export const SLOT_FAM: Record<string, string> = {
  GK: 'GK', SW: 'SW', LCB: 'DC', CB: 'DC', RCB: 'DC', LB: 'DL', RB: 'DR', LWB: 'WBL', RWB: 'WBR',
  LDM: 'DM', DM: 'DM', RDM: 'DM', LCM: 'MC', CM: 'MC', RCM: 'MC', LM: 'ML', RM: 'MR',
  LAM: 'AML', CAM: 'AMC', RAM: 'AMR', LW: 'LW', RW: 'RW', LS: 'ST', ST: 'ST', RS: 'ST',
}

/** 밴드 순서 (KM26 BAND_ORDER) — 라인 이탈 페널티에 쓴다 */
export const BAND_ORDER: Record<Band, number> = { GK: 0, DF: 1, WB: 1.6, DM: 2.2, MF: 2.6, AM: 3.2, FW: 4 }

/** 수비 라인 슬라이더가 밴드별로 먹는 비율 (KM26 LINE_W) */
const LINE_W: Record<Band, number> = { GK: 0, DF: 1.0, WB: 0.95, DM: 0.85, MF: 0.7, AM: 0.45, FW: 0.25 }

/** 팀 블록을 x 축으로 이만큼 압축한다 (KM26 COMPACT · MIDX) */
const COMPACT = 0.52
const MIDX = 0.44

/** 포지션군(스펙)이 슬롯 밴드와 맞는가 — 능숙도 데이터가 없을 때의 기본값에 쓴다 */
export function bandOfPos(pos: 'GK' | 'DF' | 'MF' | 'FW'): Band {
  return pos === 'GK' ? 'GK' : pos === 'DF' ? 'DF' : pos === 'MF' ? 'MF' : 'FW'
}

/**
 * 자리(앵커) — 정규화 슬롯 좌표를 피치 좌표로 편 뒤 공 위치·슬라이더·소유 여부로 옮긴다 (DESIGN 4.10).
 * dir = 팀 공격 방향. 결과는 절대 좌표.
 */
export function anchorOf(
  slot: string,
  band: Band,
  dir: number,
  sliders: Sliders,
  ballX: number,
  ballY: number,
  inPossession: boolean,
  out: { x: number; y: number },
): void {
  const s = SLOT_XY[slot] ?? SLOT_XY.CM
  let bx = (s.x - MIDX) * PITCH_L * COMPACT
  bx += (sliders.line - 2) * 3.0 * LINE_W[band]
  // 멘탈리티는 팀 블록을 통째로 앞뒤로 민다. ±4 m 로는 지표가 안 움직여 ±6 m 로 키웠다 (2026-09-09 짝 비교)
  bx += (sliders.mentality - 2) * 3.0
  bx += inPossession ? 5 : -3
  const widthK = 0.85 + sliders.width * 0.075
  const by = (s.y - 0.5) * PITCH_W * 0.9 * widthK
  // 공 끌림: x 0.40 · y 0.30
  const x = dir * bx + ballX * 0.4
  const y = dir * by + ballY * 0.3
  out.x = clamp(x, -HALF_L + 1, HALF_L - 1)
  out.y = clamp(y, -HALF_W + 1, HALF_W - 1)
}
