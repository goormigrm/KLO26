// 유니폼 색 — 구단 색에서 만든다 (DESIGN 7.1 "상의 col, 소매·양말 col2").
// 실제 유니폼 디자인은 쓰지 않는다. 색 두 개만 쓴다.
//
// 두 팀 색이 가까우면 원정이 흰 상의로 갈아입는다 — 방송 시점에서 22명을 구별해야 한다.

import type { Club } from '../data/pool'
import type { Kit } from './player3d'

/** 색이 밝으면 등번호를 어둡게 */
function numberColor(shirt: number): number {
  const r = (shirt >> 16) & 255
  const g = (shirt >> 8) & 255
  const b = shirt & 255
  const lum = (r * 299 + g * 587 + b * 114) / 1000
  return lum > 150 ? 0x1a1a1a : 0xffffff
}

/**
 * 두 색의 거리 (0~441). 이 값 아래면 원정이 흰 상의로 갈아입는다.
 * 방송 시점은 선수가 작게 보여 색이 꽤 떨어져 있어야 갈린다 —
 * 안양(#5f2c8c 보라) vs 울산(#0053a0 파랑)이 105 인데 화면에서 헷갈렸다 (2026-09-09).
 */
export const CLASH_DIST = 130

/** 두 색의 거리 (0~441) */
export function colorDist(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255)
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255)
  const db = (a & 255) - (b & 255)
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

const NEUTRAL: Kit = { shirt: 0xd8d8d8, sleeve: 0x9a9a9a, shorts: 0x2a2a2a, socks: 0xd8d8d8, number: 0x1a1a1a }
/** 원정 대체 유니폼 — 흰 상의 */
const AWAY_WHITE: Kit = { shirt: 0xf2f2f2, sleeve: 0x2a2a2a, shorts: 0x2a2a2a, socks: 0xf2f2f2, number: 0x1a1a1a }

function kitOf(club: Club | undefined): Kit {
  if (!club) return NEUTRAL
  return {
    shirt: club.col,
    sleeve: club.col2,
    shorts: club.col2,
    socks: club.col,
    number: numberColor(club.col),
  }
}

/** GK 는 두 팀·필드 선수와 겹치지 않게 눈에 띄는 색으로 */
const GK_COLORS = [0x2fbf71, 0xe0c341, 0x39c7b9, 0xd15fd1, 0xf07f2a]

function gkKitFor(taken: number[], seed: number): Kit {
  let best = GK_COLORS[0]
  let bestD = -1
  for (let i = 0; i < GK_COLORS.length; i++) {
    const c = GK_COLORS[(i + seed) % GK_COLORS.length]
    let d = 999
    for (const t of taken) d = Math.min(d, colorDist(c, t))
    if (d > bestD) {
      bestD = d
      best = c
    }
  }
  return { shirt: best, sleeve: 0x22262b, shorts: 0x22262b, socks: best, number: numberColor(best) }
}

export interface MatchKits {
  kits: [Kit, Kit]
  gkKits: [Kit, Kit]
  /** 레이더·결과 화면이 쓰는 CSS 색 */
  css: [string, string]
  /** 원정이 대체 유니폼으로 갈아입었나 */
  awayChanged: boolean
}

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0')

/** 두 구단으로 한 경기 유니폼을 정한다 */
export function matchKits(home: Club | undefined, away: Club | undefined): MatchKits {
  const h = kitOf(home)
  let a = kitOf(away)
  // 색이 가까우면 원정이 흰 상의로 (DESIGN 7.1)
  const changed = colorDist(h.shirt, a.shirt) < CLASH_DIST
  if (changed) a = { ...AWAY_WHITE, sleeve: away ? away.col2 : AWAY_WHITE.sleeve, socks: 0xf2f2f2 }
  const taken = [h.shirt, a.shirt]
  return {
    kits: [h, a],
    gkKits: [gkKitFor(taken, 0), gkKitFor([...taken, GK_COLORS[0]], 2)],
    css: [hex(h.shirt), hex(a.shirt)],
    awayChanged: changed,
  }
}
