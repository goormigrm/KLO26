// 유니폼 색 — 구단 색 **하나**로 만든다 (2026-09-10 사용자 결정: 정확하지 않은 정보로 두 색을 섞지 않는다).
// 홈은 상의·소매·바지·양말 전부 `col`. 원정은 **골키퍼를 빼고 상하의 모두 흰색**.
// 실제 유니폼 디자인은 쓰지 않는다.

import type { Club } from '../data/pool'
import type { Kit } from './player3d'

/** 색이 밝으면 등번호를 어둡게 */
function numberColor(shirt: number): number {
  return luminance(shirt) > 150 ? 0x1a1a1a : 0xffffff
}

function luminance(c: number): number {
  const r = (c >> 16) & 255
  const g = (c >> 8) & 255
  const b = c & 255
  return (r * 299 + g * 587 + b * 114) / 1000
}

/** 두 색의 거리 (0~441) — GK 색 고르기에 쓴다 */
export function colorDist(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255)
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255)
  const db = (a & 255) - (b & 255)
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

const NEUTRAL = 0x9a9a9a
export const WHITE = 0xf4f4f4

/** 단색 유니폼 */
function solid(color: number): Kit {
  return { shirt: color, sleeve: color, shorts: color, socks: color, number: numberColor(color) }
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
  /** 원정이 흰 유니폼인가 (늘 참 — 홈이 흰색에 가까울 때만 원정이 자기 색을 입는다) */
  awayChanged: boolean
}

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0')

/** 두 구단으로 한 경기 유니폼을 정한다 — 홈 단색, 원정 흰색 */
export function matchKits(home: Club | undefined, away: Club | undefined): MatchKits {
  const homeColor = home ? home.col : NEUTRAL
  const h = solid(homeColor)
  // 홈이 거의 흰색이면 원정이 흰 옷을 입을 수 없다 — 그때만 원정이 자기 색
  const homeIsWhite = luminance(homeColor) > 200
  const a = homeIsWhite ? solid(away ? away.col : NEUTRAL) : solid(WHITE)
  const taken = [h.shirt, a.shirt]
  return {
    kits: [h, a],
    gkKits: [gkKitFor(taken, 0), gkKitFor([...taken, GK_COLORS[0]], 2)],
    css: [hex(h.shirt), hex(a.shirt)],
    awayChanged: !homeIsWhite,
  }
}
