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
    // 조건 2 는 **포지션을 가리지 않고** 그 구단에서 가장 비싼 18명으로 잰다.
    // 포지션 몫을 정해 두고 재면 포메이션에 따라 그 몫을 벗어나 상한을 넘는 스쿼드가 나온다
    // (2026-09-09: 강원 FC 4-3-3 이 231 로 상한 230 을 넘었다).
    const s = topN(own, SQUAD_SIZE)
    if (s > clubMax) {
      clubMax = s
      clubWorst = club.name
    }
  }
  const cond1 = Math.round(best18 * 0.7)
  const cap = Math.max(cond1, clubMax)
  return { cap, best18, clubMax, clubWorst }
}

/** 포지션을 맞춘 최고 급여 18명 (GK 2 · DF 6 · MF 6 · FW 4) — 올스타 팀의 값 */
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

/** 포지션을 가리지 않은 최고 급여 n명 — 그 풀에서 나올 수 있는 가장 비싼 스쿼드 */
function topN(pool: Card[], n: number): number {
  const list = pool.map((c) => cardSalary(c)).sort((a, b) => b - a)
  let total = 0
  for (let i = 0; i < n && i < list.length; i++) total += list[i]
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

const DEFAULT_PRESETS = (): [Sliders, Sliders, Sliders] => [
  { line: 1, press: 1, width: 2, mentality: 1 },
  { line: 2, press: 2, width: 2, mentality: 2 },
  { line: 3, press: 3, width: 3, mentality: 3 },
]

function bandPos(band: string): string {
  return band === 'DF' || band === 'WB' ? 'DF' : band === 'FW' ? 'FW' : 'MF'
}

/**
 * 한 구단의 선수만으로 스쿼드를 짠다 — **팀컬러 +4** 가 붙는 순수 구단 팀.
 * 자리마다 그 구단에서 가장 좋은 선수를 넣되, 모자라면 다른 포지션에서 능숙도가 높은 쪽으로 메운다.
 * 급여 상한은 여기서 보지 않는다 — 상한이 "어느 구단이든 자기 선수 18명은 들어간다"로 잡혀 있다 (DESIGN 5.4).
 */
export function clubSquad(clubId: number, formation = '4-3-3', name?: string): Squad {
  const shape = FORMATIONS[formation]
  const own = POOL.filter((c) => c.club === clubId)
  if (own.length < SQUAD_SIZE) throw new Error(`구단 ${clubId} 에 선수가 모자랍니다`)
  const used = new Set<number>()
  const pick = (pos: string): number => {
    let best: Card | null = null
    let bestS = -1
    for (const c of own) {
      if (used.has(c.id)) continue
      // 제 포지션이면 그대로, 아니면 크게 깎아서 후보로만 남긴다
      const fit = c.pos === pos ? 1 : 0.35
      const s = cardOvr(c, 0) * fit
      if (s > bestS) {
        bestS = s
        best = c
      }
    }
    if (!best) throw new Error(`${pos} 카드가 없습니다`)
    used.add(best.id)
    return best.id
  }
  const ids = [pick('GK'), ...shape.map(([band]) => pick(bandPos(band)))]
  for (const pos of ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']) ids.push(pick(pos))
  return {
    name: name ?? clubById(clubId)?.name ?? '내 스쿼드',
    formation,
    ids,
    enh: new Array(SQUAD_SIZE).fill(0),
    presets: DEFAULT_PRESETS(),
    kickers: [-1, -1, -1],
  }
}

/** 처음 여는 사람에게 줄 스쿼드 — 1부 구단 하나의 순수 팀 (팀컬러 +4 가 붙는다) */
export function starterSquad(formation = '4-3-3'): Squad {
  const first = CLUBS.find((c) => c.div === 1) ?? CLUBS[0]
  return clubSquad(first.id, formation, '내 스쿼드')
}

/** 스쿼드에서 가장 많은 구단 (유니폼 색을 여기서 가져온다) */
export function squadClub(sq: Squad): Club | undefined {
  const color = teamColorBonus(sq.ids.slice(0, START_SIZE))
  return color.club >= 0 ? clubById(color.club) : undefined
}
