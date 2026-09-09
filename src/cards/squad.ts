// 스쿼드 — 규칙 검증 · 급여 상한 · 팀컬러 · 강화 (DESIGN 5.4~5.8).
// **받는 쪽이 전부 다시 센다** — 서버가 없으니 상대가 보낸 스쿼드를 그대로 믿지 않는다 (DESIGN 5.8).

import { FORMATIONS } from '../core/formation'
import type { SquadConfig, Sliders } from '../core/state'
import { CLUBS, POOL, cardById, type Club } from '../data/pool'
import { boostSpec, calibrateOvr, ovrOf, salaryOf, type Card, type OvrFit } from './cards'

/** 스쿼드 예산 · 카드당 상한 (DESIGN 5.5) */
export const ENH_BUDGET = 24
export const ENH_MAX = 5
export const SQUAD_SIZE = 18
export const START_SIZE = 11

/** 저장·공유되는 스쿼드 (사람이 짠 것 그대로) */
export interface Squad {
  name: string
  formation: string
  /** 18명 — [0] GK, [1..10] 포메이션 슬롯 순, [11..17] 벤치 (DESIGN 5.8) */
  ids: number[]
  /** 18명 강화 (0~5) */
  enh: number[]
  presets: [Sliders, Sliders, Sliders]
  /** PK · FK · CK 키커 (선발 인덱스 0~10, −1 = 자동) */
  kickers: [number, number, number]
}

/** OVR 보정은 카드 풀에서 한 번만 뽑는다 (DESIGN 5.3 — 손으로 정하지 않는다) */
export const OVR_FIT: OvrFit = calibrateOvr(POOL)

export function cardOvr(c: Card, plus = 0): number {
  return ovrOf(plus > 0 ? boostSpec(c, plus) : c, OVR_FIT)
}

export function cardSalary(c: Card): number {
  // 급여는 강화와 무관하다 (DESIGN 5.5)
  return salaryOf(cardOvr(c, 0))
}

/**
 * 급여 상한 — **도구가 데이터로 정한다** (DESIGN 5.4 · D-9).
 * 조건 1: 최상위 18명(포지션 맞춤) 급여 합 × 0.70
 * 조건 2: 29개 구단 어디든 자기 선수 18명으로 짠 팀은 상한 안 (K리그2 포함 — 사용자 결정)
 * 둘이 부딪히면 2 가 우선이다.
 */
export function computeCap(pool: Card[] = POOL): { cap: number; best18: number; clubMax: number; clubWorst: string } {
  const best18 = bestEighteen(pool)
  let clubMax = 0
  let clubWorst = ''
  for (const club of CLUBS) {
    const own = pool.filter((c) => c.club === club.id)
    if (own.length < SQUAD_SIZE) continue
    const s = bestEighteen(own)
    if (s > clubMax) {
      clubMax = s
      clubWorst = club.name
    }
  }
  const cond1 = Math.round(best18 * 0.7)
  const cap = Math.max(cond1, clubMax)
  return { cap, best18, clubMax, clubWorst }
}

/** 포지션을 맞춘 최고 급여 18명 (GK 2 · DF 6 · MF 6 · FW 4) */
function bestEighteen(pool: Card[]): number {
  const need: Record<string, number> = { GK: 2, DF: 6, MF: 6, FW: 4 }
  let total = 0
  for (const pos in need) {
    const list = pool
      .filter((c) => c.pos === pos)
      .map((c) => cardSalary(c))
      .sort((a, b) => b - a)
    for (let i = 0; i < need[pos] && i < list.length; i++) total += list[i]
  }
  return total
}

/** 팀컬러 — 선발 11명 중 최다 구단 인원 → 전원 보너스 (DESIGN 5.6) */
export function teamColorBonus(startIds: number[]): { club: number; count: number; bonus: number } {
  const n = new Map<number, number>()
  for (const id of startIds) {
    const c = cardById(id)
    if (!c) continue
    n.set(c.club, (n.get(c.club) ?? 0) + 1)
  }
  let club = -1
  let count = 0
  // 동률은 구단 id 가 작은 쪽 — 결정론
  for (const cl of CLUBS) {
    const v = n.get(cl.id) ?? 0
    if (v > count) {
      count = v
      club = cl.id
    }
  }
  const bonus = count >= 11 ? 4 : count >= 9 ? 3 : count >= 7 ? 2 : count >= 5 ? 1 : 0
  return { club, count, bonus }
}

export interface SquadCheck {
  ok: boolean
  errors: string[]
  salary: number
  cap: number
  enhTotal: number
  color: { club: number; count: number; bonus: number }
}

/** 스쿼드 규칙 검사 (DESIGN 5.8). 어기면 받지 않는다 */
export function checkSquad(sq: Squad, cap: number): SquadCheck {
  const errors: string[] = []
  if (!FORMATIONS[sq.formation]) errors.push(`포메이션이 없습니다: ${sq.formation}`)
  if (sq.ids.length !== SQUAD_SIZE) errors.push(`선수가 ${SQUAD_SIZE}명이 아닙니다 (${sq.ids.length}명)`)
  if (sq.enh.length !== SQUAD_SIZE) errors.push('강화 배열 길이가 다릅니다')
  const seen = new Set<number>()
  let salary = 0
  let gkCount = 0
  for (let i = 0; i < sq.ids.length; i++) {
    const c = cardById(sq.ids[i])
    if (!c) {
      errors.push(`없는 선수 id: ${sq.ids[i]}`)
      continue
    }
    if (seen.has(c.id)) errors.push(`같은 선수를 두 번 넣었습니다: ${c.name}`)
    seen.add(c.id)
    salary += cardSalary(c)
    if (i < START_SIZE && c.pos === 'GK') gkCount++
  }
  if (gkCount !== 1) errors.push(`선발 골키퍼는 정확히 1명이어야 합니다 (${gkCount}명)`)
  if (sq.ids[0] !== undefined && cardById(sq.ids[0])?.pos !== 'GK') errors.push('첫 자리는 골키퍼여야 합니다')
  let enhTotal = 0
  for (const e of sq.enh) {
    if (!Number.isInteger(e) || e < 0 || e > ENH_MAX) errors.push(`강화는 0~${ENH_MAX} 입니다`)
    enhTotal += e
  }
  if (enhTotal > ENH_BUDGET) errors.push(`강화 예산 초과: ${enhTotal} / ${ENH_BUDGET}`)
  if (salary > cap) errors.push(`급여 상한 초과: ${salary} / ${cap}`)
  for (const p of sq.presets) {
    for (const k of ['line', 'press', 'width', 'mentality'] as const) {
      const v = p[k]
      if (!Number.isInteger(v) || v < 0 || v > 4) errors.push('슬라이더는 0~4 입니다')
    }
  }
  for (const k of sq.kickers) if (k < -1 || k > 10) errors.push('키커는 선발 인덱스여야 합니다')
  return {
    ok: errors.length === 0,
    errors,
    salary,
    cap,
    enhTotal,
    color: teamColorBonus(sq.ids.slice(0, START_SIZE)),
  }
}

/** 스쿼드 → sim 이 먹는 SquadConfig. 강화·팀컬러를 능력치에 얹는다 */
export function toSquadConfig(sq: Squad, name: string, short: string): SquadConfig {
  const color = teamColorBonus(sq.ids.slice(0, START_SIZE))
  const players = sq.ids.map((id, i) => {
    const c = cardById(id)
    if (!c) throw new Error(`없는 선수 id: ${id}`)
    // 팀컬러는 선발에게만 (DESIGN 5.6 — 벤치는 세지 않는다)
    const plus = (sq.enh[i] ?? 0) + (i < START_SIZE ? color.bonus : 0)
    return boostSpec(c, plus)
  })
  return { name, short, formation: sq.formation, players, presets: sq.presets }
}

export function clubById(id: number): Club | undefined {
  return CLUBS[id]
}

/** 빈 스쿼드 — 포메이션에 맞는 가장 싼 선수로 채운다 (스쿼드 화면 시작점) */
export function starterSquad(formation = '4-3-3'): Squad {
  const shape = FORMATIONS[formation]
  const used = new Set<number>()
  const pick = (pos: string): number => {
    // 급여가 낮은 쪽부터 — 상한 걱정 없이 시작한다
    let best: Card | null = null
    let bestS = 1e9
    for (const c of POOL) {
      if (used.has(c.id) || c.pos !== pos) continue
      const s = cardSalary(c)
      if (s < bestS) {
        bestS = s
        best = c
      }
    }
    if (!best) throw new Error(`${pos} 카드가 없습니다`)
    used.add(best.id)
    return best.id
  }
  const bandPos = (band: string): string => (band === 'DF' || band === 'WB' ? 'DF' : band === 'FW' ? 'FW' : 'MF')
  const ids = [pick('GK'), ...shape.map(([band]) => pick(bandPos(band)))]
  for (const pos of ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']) ids.push(pick(pos))
  return {
    name: '내 스쿼드',
    formation,
    ids,
    enh: new Array(SQUAD_SIZE).fill(0),
    presets: [
      { line: 1, press: 1, width: 2, mentality: 1 },
      { line: 2, press: 2, width: 2, mentality: 2 },
      { line: 3, press: 3, width: 3, mentality: 3 },
    ],
    kickers: [-1, -1, -1],
  }
}
