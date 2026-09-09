// 카드 풀 — **자리표시자**다.
//
// ⚠ 실제 K리그 2026 선수 데이터는 저장소에 없다. 원작자 허락 재확인(PREP A-1) 전에는 넣지 않기로 했다.
// 그때까지 시드 하나로 생성한 합성 카드 1,024장(29구단)으로 스쿼드·급여·팀컬러·코드를 전부 돌린다.
// 데이터가 오면 `tools/build_cards.py` 가 구운 JSON 을 여기에 끼우고 `POOL_HASH` 만 바꾸면 나머지는 그대로 돈다.
//
// 이름은 "가1-07" 처럼 자리표시자다 — 실존 인물과 무관하다.

import { makeRng, rand } from '../core/rng'
import type { Card } from '../cards/cards'
import type { Foot, PosGroup } from '../core/state'

/** 구단 수 · 구단당 카드 수 (29 × 35 ≈ 1,015 + 9 = 1,024) */
export const CLUB_COUNT = 29
export const POOL_SIZE = 1024

/** 자리표시자 구단 — 실제 구단 이름·색은 데이터가 올 때 (DESIGN 5.1) */
export interface Club {
  id: number
  name: string
  short: string
  /** 1부 / 2부 */
  div: 1 | 2
  col: number
  col2: number
}

const SYL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하']
const HUES = [0, 20, 35, 90, 140, 175, 200, 220, 250, 280, 320, 345]

function hsl(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to = (v: number): number => Math.round((v + m) * 255)
  return (to(r) << 16) | (to(g) << 8) | to(b)
}

export const CLUBS: Club[] = Array.from({ length: CLUB_COUNT }, (_, i) => {
  const h = HUES[i % HUES.length] + (i >= HUES.length ? 12 : 0)
  return {
    id: i,
    name: `${SYL[i % SYL.length]}${Math.floor(i / SYL.length) + 1} FC`,
    short: `${SYL[i % SYL.length]}${Math.floor(i / SYL.length) + 1}`,
    div: (i < 12 ? 1 : 2) as 1 | 2,
    col: hsl(h, 0.62, 0.44),
    col2: hsl((h + 180) % 360, 0.2, i % 3 === 0 ? 0.9 : 0.2),
  }
})

const FIELD_KEYS = ['pac', 'acc', 'agi', 'bal', 'jum', 'str', 'sta', 'fir', 'tec', 'dri', 'pas', 'vis', 'crs', 'fin', 'lon', 'pen', 'hea', 'cmp', 'dec', 'cnt', 'ant', 'pos', 'mar', 'tck', 'agg', 'bra', 'fla', 'wor', 'tea']
const GK_KEYS = ['ref', 'one', 'han', 'cmd', 'aer', 'com', 'kic', 'pun', 'tro', 'ecc']

const BIAS: Record<PosGroup, Record<string, number>> = {
  GK: { pac: -15, acc: -12, dri: -25, fin: -30, pas: -8, tck: -25, mar: -20, agi: 5, jum: 8 },
  DF: { tck: 12, mar: 12, pos: 10, hea: 10, str: 8, ant: 6, fin: -18, dri: -8, lon: -10, crs: -6 },
  MF: { pas: 12, vis: 10, tec: 8, sta: 8, dec: 6, fir: 6, tck: -2, hea: -6, fin: -6 },
  FW: { fin: 14, dri: 10, acc: 8, pac: 6, lon: 6, cmp: 6, tck: -18, mar: -16, pos: -10 },
}

/** 슬롯 능숙도 자리 — 주 포지션은 100, 이웃은 낮게 */
const FAM_NEAR: Record<PosGroup, string[]> = {
  GK: ['GK'],
  DF: ['DC', 'DL', 'DR', 'WBL', 'WBR', 'DM'],
  MF: ['DM', 'MC', 'ML', 'MR', 'AMC'],
  FW: ['ST', 'AML', 'AMR', 'AMC'],
}
const ALL_FAM = ['GK', 'SW', 'DC', 'DL', 'DR', 'WBL', 'WBR', 'DM', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST']

type R = ReturnType<typeof makeRng>

function n(r: R, mean: number, sd: number): number {
  const z = (rand(r) + rand(r) + rand(r) - 1.5) * 2
  const v = Math.round(mean + z * sd)
  return v < 5 ? 5 : v > 99 ? 99 : v
}

/** 구단별 인원 구성 — GK 4 · DF 13 · MF 10 · FW 8 = 35 */
const SHAPE: PosGroup[] = [
  ...Array<PosGroup>(4).fill('GK'),
  ...Array<PosGroup>(13).fill('DF'),
  ...Array<PosGroup>(10).fill('MF'),
  ...Array<PosGroup>(8).fill('FW'),
]

function makeCard(r: R, id: number, club: Club, no: number, pos: PosGroup, quality: number): Card {
  const attr: Record<string, number> = {}
  const bias = BIAS[pos]
  for (const k of FIELD_KEYS) attr[k] = n(r, quality + (bias[k] ?? 0), 8)
  const gkA: Record<string, number> = {}
  for (const k of GK_KEYS) gkA[k] = n(r, pos === 'GK' ? quality + 4 : 25, 7)
  const h = Math.round(pos === 'GK' ? 180 + rand(r) * 16 : 168 + rand(r) * 26)
  const w = Math.round(h - 105 + (rand(r) - 0.5) * 10)
  const fr = rand(r)
  const foot: Foot = fr < 0.72 ? 'R' : fr < 0.94 ? 'L' : 'B'
  const posFam: Record<string, number> = {}
  const near = FAM_NEAR[pos]
  for (const f of ALL_FAM) {
    if (f === near[0]) posFam[f] = 100
    else if (near.includes(f)) posFam[f] = 55 + Math.round(rand(r) * 40)
    else posFam[f] = pos === 'GK' || f === 'GK' ? 5 : 12 + Math.round(rand(r) * 26)
  }
  return {
    id,
    name: `${club.short}-${String(no).padStart(2, '0')}`,
    no,
    pos,
    h,
    w,
    foot,
    attr,
    gkA,
    posFam,
    club: club.id,
  }
}

function build(): Card[] {
  const r = makeRng(0x4b4c4f26)
  const out: Card[] = []
  let id = 1
  for (const club of CLUBS) {
    // 1부가 조금 세다 — 실제 리그 구조를 흉내 낸 것뿐이다
    const base = club.div === 1 ? 64 : 58
    const clubK = (rand(r) - 0.5) * 7
    for (let i = 0; i < SHAPE.length && out.length < POOL_SIZE; i++) {
      const pos = SHAPE[i]
      // 주전일수록 세게 (구단 안 서열)
      const depth = i < 1 || (i >= 4 && i < 8) || (i >= 17 && i < 21) || (i >= 27 && i < 30) ? 6 : i % 3 === 0 ? 2 : -3
      out.push(makeCard(r, id, club, (i % 33) + 1, pos, base + clubK + depth))
      id++
    }
  }
  // 1,024장에 모자라면 채운다
  while (out.length < POOL_SIZE) {
    const club = CLUBS[out.length % CLUB_COUNT]
    out.push(makeCard(r, id++, club, (out.length % 33) + 1, 'MF', 60))
  }
  return out
}

/** 카드 1,024장. 시드가 고정이라 어느 브라우저에서나 같다 */
export const POOL: Card[] = build()

/** 데이터 지문 — 스쿼드 코드에 16비트로 박는다. 데이터가 다르면 붙지 않는다 (DESIGN 5.9) */
export const POOL_HASH: number = (() => {
  let h = 0x811c9dc5
  for (const c of POOL) {
    h ^= c.id
    h = Math.imul(h, 0x01000193)
    for (const k of FIELD_KEYS) {
      h ^= c.attr[k]
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0) & 0xffff
})()

export function cardById(id: number): Card | undefined {
  return POOL[id - 1]?.id === id ? POOL[id - 1] : POOL.find((c) => c.id === id)
}

export function clubOf(c: Card): Club {
  return CLUBS[c.club]
}
