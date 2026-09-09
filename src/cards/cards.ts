// 카드 — 6스탯 · OVR · 급여 (DESIGN 5.2~5.4). 시뮬은 원본 능력치 40종을 읽고, 6스탯은 표시·급여용이다.
//
// ⚠ 실제 K리그 선수 데이터는 **아직 저장소에 없다** (PREP A-1 원작자 허락 재확인 대기).
// 지금은 `src/data/pool.ts` 가 만든 합성 카드 1,024장으로 돈다. 데이터가 오면 그 파일만 갈아 끼운다.

import type { PlayerSpec, PosGroup } from '../core/state'

/** 카드 = 선수 데이터 + 소속 구단 */
export interface Card extends PlayerSpec {
  /** 구단 id (팀컬러 계산용) */
  club: number
}

export interface Six {
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
  phy: number
}

/** GK 6스탯 (표시 이름이 다르다) */
export interface SixGK {
  div: number
  han: number
  kic: number
  ref: number
  pos: number
  spd: number
}

const A = (a: Record<string, number>, k: string): number => {
  const v = a[k]
  return v === undefined ? 50 : v
}
const r99 = (v: number): number => (v < 1 ? 1 : v > 99 ? 99 : Math.round(v))

/** 필드 6스탯 (DESIGN 5.2) */
export function sixOf(c: PlayerSpec): Six {
  const a = c.attr
  return {
    pac: r99(A(a, 'pac') * 0.55 + A(a, 'acc') * 0.45),
    sho: r99(A(a, 'fin') * 0.5 + A(a, 'lon') * 0.2 + A(a, 'cmp') * 0.15 + A(a, 'hea') * 0.1 + A(a, 'pen') * 0.05),
    pas: r99(A(a, 'pas') * 0.45 + A(a, 'vis') * 0.25 + A(a, 'crs') * 0.15 + A(a, 'tec') * 0.15),
    dri: r99(A(a, 'dri') * 0.4 + A(a, 'tec') * 0.2 + A(a, 'agi') * 0.2 + A(a, 'bal') * 0.1 + A(a, 'fir') * 0.1),
    def: r99(A(a, 'tck') * 0.3 + A(a, 'mar') * 0.25 + A(a, 'pos') * 0.2 + A(a, 'ant') * 0.15 + A(a, 'hea') * 0.1),
    phy: r99(A(a, 'str') * 0.35 + A(a, 'sta') * 0.3 + A(a, 'jum') * 0.15 + A(a, 'bra') * 0.1 + A(a, 'agg') * 0.1),
  }
}

/** GK 6스탯 (DESIGN 5.2) */
export function sixGKOf(c: PlayerSpec): SixGK {
  const a = c.attr
  const g = c.gkA ?? {}
  return {
    div: r99(A(g, 'ref') * 0.5 + A(a, 'agi') * 0.3 + A(a, 'jum') * 0.2),
    han: r99(A(g, 'han') * 0.7 + A(g, 'cmd') * 0.3),
    kic: r99(A(g, 'kic') * 0.8 + A(a, 'pas') * 0.2),
    ref: r99(A(g, 'ref') * 0.6 + A(g, 'one') * 0.4),
    pos: r99(A(g, 'cmd') * 0.4 + A(g, 'com') * 0.3 + A(a, 'pos') * 0.3),
    spd: r99(A(a, 'pac') * 0.5 + A(a, 'acc') * 0.5),
  }
}

/** 포지션군별 OVR 가중치 (DESIGN 5.3) */
const W: Record<Exclude<PosGroup, 'GK'>, [number, number, number, number, number, number]> = {
  FW: [0.2, 0.35, 0.1, 0.2, 0.05, 0.1],
  MF: [0.15, 0.15, 0.3, 0.25, 0.1, 0.05],
  DF: [0.15, 0.05, 0.1, 0.1, 0.4, 0.2],
}
const W_GK: [number, number, number, number, number, number] = [0.25, 0.2, 0.1, 0.25, 0.15, 0.05]

/**
 * OVR 보정 계수 — 앵커 두 개(상위 1% = 85 · 중앙값 = 63)를 맞추는 선형 변환 `a·raw + b`.
 * **손으로 정하지 않는다**: `calibrateOvr` 가 카드 풀에서 뽑아 여기 채운다 (DESIGN 12장 원칙).
 */
export interface OvrFit {
  a: number
  b: number
}

export const DEFAULT_FIT: OvrFit = { a: 1, b: 0 }

/** 보정 전 원점수 */
export function rawOvr(c: PlayerSpec): number {
  if (c.pos === 'GK') {
    const s = sixGKOf(c)
    const v = [s.div, s.han, s.kic, s.ref, s.pos, s.spd]
    let t = 0
    for (let i = 0; i < 6; i++) t += v[i] * W_GK[i]
    return t
  }
  const s = sixOf(c)
  const v = [s.pac, s.sho, s.pas, s.dri, s.def, s.phy]
  const w = W[c.pos]
  let t = 0
  for (let i = 0; i < 6; i++) t += v[i] * w[i]
  return t
}

export function ovrOf(c: PlayerSpec, fit: OvrFit): number {
  const v = Math.round(rawOvr(c) * fit.a + fit.b)
  return v < 40 ? 40 : v > 99 ? 99 : v
}

/** 앵커 두 개로 a·b 를 푼다 — 상위 1% → 85 · 중앙값 → 63 */
export function calibrateOvr(cards: PlayerSpec[], topPct = 85, medPct = 63): OvrFit {
  if (cards.length < 4) return DEFAULT_FIT
  const raws = cards.map(rawOvr).sort((x, y) => x - y)
  const at = (q: number): number => raws[Math.min(raws.length - 1, Math.max(0, Math.round(q * (raws.length - 1))))]
  const hi = at(0.99)
  const mid = at(0.5)
  if (hi - mid < 0.001) return DEFAULT_FIT
  const a = (topPct - medPct) / (hi - mid)
  return { a, b: topPct - a * hi }
}

/** 급여표 (DESIGN 5.4) */
export function salaryOf(ovr: number): number {
  if (ovr <= 55) return 3
  if (ovr <= 60) return 4
  if (ovr <= 65) return 5
  if (ovr <= 70) return 7
  if (ovr <= 75) return 9
  if (ovr <= 80) return 12
  if (ovr <= 85) return 16
  return 21
}

/**
 * 강화 · 팀컬러를 능력치에 얹는다 (DESIGN 5.5 · 5.6).
 * **+1 = 능력치 40종(GK 11종) 전부 +1**, 상한 99. 원본을 건드리지 않고 새 spec 을 만든다.
 */
export function boostSpec(c: Card, plus: number): Card {
  if (plus <= 0) return c
  const attr: Record<string, number> = {}
  for (const k in c.attr) attr[k] = Math.min(99, c.attr[k] + plus)
  let gkA: Record<string, number> | undefined
  if (c.gkA) {
    gkA = {}
    for (const k in c.gkA) gkA[k] = Math.min(99, c.gkA[k] + plus)
  }
  return { ...c, attr, gkA }
}

/** 능숙도 색 (DESIGN 5.7) */
export function famColor(fam: number): string {
  if (fam >= 100) return '#3fb950'
  if (fam >= 70) return '#8bc34a'
  if (fam >= 45) return '#e3b341'
  if (fam >= 20) return '#e08a3c'
  return '#f85149'
}
