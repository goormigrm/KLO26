// 카드 능력치 → 경기 스킬 (DESIGN 4.3~4.8 · 5.7). 전부 0~1 로 정규화한다.
// 포지션 능숙도 페널티는 KM26 applyFamiliarity 의 계수를 옮겼다 — 무겁게 0.58 · 가볍게 0.26 · GK 오용 0.42.

import { BAND_ORDER, SLOT_FAM, bandOfPos, type Band } from './formation'
import type { PlayerSpec } from './state'

export interface Skills {
  /** 최고 속도 m/s */
  vmax: number
  /** 가속 m/s² */
  accel: number
  /** 틱당 최대 회전 (각도 단위 0..1023) */
  turn: number
  /** 퍼스트 터치 */
  ctl: number
  /** 드리블 (터치 촘촘함·볼 소유 속도) */
  drib: number
  /** 패스 정확도 */
  pas: number
  vis: number
  crs: number
  /** 슛 정확도(SHO) · 결정력 · 중거리 */
  sho: number
  fin: number
  lon: number
  pen: number
  cmp: number
  tck: number
  mark: number
  posn: number
  dec: number
  head: number
  str: number
  sta: number
  agg: number
  isGK: boolean
  /** GK: 반응 지연(초) · 도달 거리(m) · 잡기 · 킥 · 위치 */
  gkReact: number
  gkReach: number
  gkHand: number
  gkKick: number
  gkPos: number
  /** 능숙도 0~1 (표시·디버그) */
  fam: number
}

const S = (v: number | undefined): number => {
  const x = v === undefined ? 50 : v
  return x < 0 ? 0 : x > 100 ? 1 : x / 100
}

/** 키·몸무게 보정 (KM26 bodyFx, 기준 178 cm / 74 kg) */
export function bodyFx(h: number, w: number): { tall: number; mass: number; bulk: number } {
  const tall = (h - 178) / 20
  const mass = (w - 74) / 15
  return { tall, mass, bulk: mass * 0.6 + tall * 0.4 }
}

/** 능숙도 0~100 → 페널티 배수. sqrt 섞은 곡선으로 KM26 의 감마 1.45 를 흉내 낸다 (Math.pow 금지) */
function famCurve(fam: number): number {
  const f = fam < 0 ? 0 : fam > 100 ? 1 : fam / 100
  return Math.sqrt(f) * 0.6 + f * 0.4
}

export function skillsOf(spec: PlayerSpec, slot: string, band: Band): Skills {
  const a = spec.attr
  const g = spec.gkA ?? {}
  const { tall, mass, bulk } = bodyFx(spec.h, spec.w)
  const isGK = slot === 'GK'

  // 능숙도 — 데이터가 없으면 자기 포지션군 밴드면 100, 아니면 라인 차이로 깎는다
  const famKey = SLOT_FAM[slot] ?? 'MC'
  let fam: number
  if (spec.posFam && spec.posFam[famKey] !== undefined) fam = spec.posFam[famKey]
  else {
    const own = bandOfPos(spec.pos)
    const d = Math.abs(BAND_ORDER[own] - BAND_ORDER[band])
    fam = d === 0 ? 100 : d < 1 ? 70 : d < 2 ? 45 : 20
  }
  const gc = famCurve(fam)
  let heavy = 1 - (1 - gc) * 0.58
  let light = 1 - (1 - gc) * 0.26
  // 라인 이탈: 한 칸당 −13%, 최대 −55%
  const ownBand = bandOfPos(spec.pos)
  const bandGap = Math.abs(BAND_ORDER[ownBand] - BAND_ORDER[band])
  const outPen = 1 - Math.min(0.55, bandGap * 0.13)
  heavy *= outPen
  light *= outPen
  // GK 오용: GK 를 필드에 / 필드 선수를 골문에
  const misuse = (spec.pos === 'GK') !== isGK ? 0.58 : 1
  heavy *= misuse
  light *= misuse

  const PAC = S(a.pac) * 0.55 + S(a.acc) * 0.45
  const agiK = 1 - bulk * 0.085
  const paceK = 1 - Math.max(0, mass) * 0.05

  const sk: Skills = {
    vmax: (6.0 + 3.2 * PAC) * paceK,
    accel: 4.0 + 6.0 * S(a.acc),
    turn: (12 + 10 * S(a.agi)) * agiK,
    ctl: (S(a.fir) * 0.65 + S(a.tec) * 0.2 + S(a.cmp) * 0.15) * light,
    drib: (S(a.dri) * 0.4 + S(a.tec) * 0.2 + S(a.agi) * 0.2 + S(a.bal) * 0.1 + S(a.fir) * 0.1) * agiK * light,
    pas: (S(a.pas) * 0.45 + S(a.vis) * 0.25 + S(a.crs) * 0.15 + S(a.tec) * 0.15) * heavy,
    vis: S(a.vis) * heavy,
    crs: (S(a.crs) * 0.62 + S(a.tec) * 0.2 + S(a.vis) * 0.18) * heavy,
    sho: (S(a.fin) * 0.5 + S(a.lon) * 0.2 + S(a.cmp) * 0.15 + S(a.hea) * 0.1 + S(a.pen) * 0.05) * light,
    fin: (S(a.fin) * 0.58 + S(a.cmp) * 0.24 + S(a.dec) * 0.18) * light,
    lon: (S(a.lon) * 0.72 + S(a.tec) * 0.16 + S(a.fla) * 0.12) * light,
    pen: S(a.pen) * 0.7 + S(a.cmp) * 0.3,
    cmp: S(a.cmp),
    tck: (S(a.tck) * 0.6 + S(a.ant) * 0.2 + S(a.agg) * 0.1 + S(a.str) * 0.1) * light,
    mark: (S(a.mar) * 0.5 + S(a.pos) * 0.2 + S(a.ant) * 0.18 + S(a.str) * 0.12) * heavy,
    posn: (S(a.pos) * 0.5 + S(a.ant) * 0.28 + S(a.cnt) * 0.22) * heavy,
    dec: (S(a.dec) * 0.55 + S(a.cnt) * 0.25 + S(a.cmp) * 0.2) * heavy,
    head: (S(a.hea) * 0.55 + S(a.jum) * 0.28 + S(a.str) * 0.1 + S(a.bra) * 0.07) * (1 + tall * 0.11 + mass * 0.03) * light,
    str: S(a.str) * (1 + mass * 0.12 + tall * 0.04),
    sta: S(a.sta),
    agg: S(a.agg),
    isGK,
    gkReact: 0.25 - 0.15 * (S(g.ref) * 0.6 + S(g.one) * 0.4),
    gkReach: 1.2 + 1.0 * (S(g.ref) * 0.5 + S(a.agi) * 0.3 + S(a.jum) * 0.2) + tall * 0.25,
    gkHand: S(g.han) * 0.7 + S(g.cmd) * 0.3,
    gkKick: S(g.kic) * 0.8 + S(a.pas) * 0.2,
    gkPos: S(g.cmd) * 0.4 + S(g.com) * 0.3 + S(a.pos) * 0.3,
    fam: fam / 100,
  }
  if (isGK && misuse < 1) {
    // 필드 선수를 골문에: GK 능력치가 없으므로 전부 낮게
    sk.gkReact = 0.28
    sk.gkReach = 1.2
    sk.gkHand = 0.25
    sk.gkPos = 0.3
  }
  return sk
}
