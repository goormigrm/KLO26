// 스쿼드 — 규칙 검증 · 급여 상한 · 팀워크 · 강화 · 타 구단 영입 (DESIGN 5.4~5.8).
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

/**
 * 타 구단에서 데려올 수 있는 인원 (사용자 결정 2026-09-11 · DECISIONS G-17).
 *
 * 왜 필요한가 — 급여 상한만으로는 구단이 뜻을 잃는다. 상한(252)은 **어느 구단이든 자기 선수 18명이
 * 들어가야 한다**는 조건 때문에 252 아래로 못 내리는데, 252 는 동시에 **누구나 올스타 선발을 살 수 있는
 * 값**이다. 실측: 제한이 없으면 29개 구단 **전부** 최강 선발 OVR 92~94 로 수렴했다(격차 8.1).
 * 5명·2명으로 묶으면 격차 16.5 — 약한 구단도 따라붙지만(파주 62.8 → 72.7) 구단 색은 남는다.
 */
export const OUT_XI_MAX = 5
export const OUT_BENCH_MAX = 2

/**
 * 영입 웃돈(이적료) — 타 구단 선수는 급여가 이 배수만큼 든다.
 * 자기 구단 선수는 그대로라 "자기 선수 18명은 상한 안" 조건이 깨지지 않는다.
 * ×1.5 에서 상한에 닿는 구단이 1/29 → 5/29 로 늘어 **예산이 다시 선택을 만든다**(평균 사용 186 → 224).
 */
export const TRANSFER_PREMIUM = 1.5

/** 저장·공유되는 스쿼드 (사람이 짠 것 그대로) */
export interface Squad {
  name: string
  formation: string
  /**
   * 이 스쿼드를 짤 때의 **데이터 지문**. 카드 데이터가 바뀌면 저장된 id 가 딴 선수를 가리키므로
   * (자리표시자 → 실제 명단으로 바꿨을 때 골키퍼 자리에 공격수가 앉았다, 2026-09-09 제보) 다르면 버린다.
   * 스쿼드 코드에는 이미 같은 지문이 박혀 있다 (DESIGN 5.9).
   */
  hash?: number
  /** 이 스쿼드의 주력 구단 (구단을 고르고 시작했으면) */
  club?: number
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
 * 이 스쿼드의 **주력 구단** — 선발 11명 중 가장 많은 구단.
 * `sq.club` 선언값을 믿지 않는다: P2P 에서 받은 스쿼드는 상대가 적어 보낸 것이라 영입 인원을
 * 줄이려고 아무 값이나 넣을 수 있다. 세어서 정하면 거짓말이 이득이 되지 않는다 (DESIGN 5.8).
 */
export function homeClubOf(sq: Squad): number {
  return teamworkBonus(sq.ids.slice(0, START_SIZE)).club
}

/** 실제로 내는 급여 — 타 구단에서 데려오면 웃돈이 붙는다 */
export function payOf(c: Card, homeClub: number): number {
  const base = cardSalary(c)
  return c.club === homeClub ? base : Math.round(base * TRANSFER_PREMIUM)
}

/** 타 구단에서 데려온 인원 (선발·후보 따로) */
export function countOutside(sq: Squad, homeClub: number): { xi: number; bench: number } {
  let xi = 0
  let bench = 0
  for (let i = 0; i < sq.ids.length; i++) {
    const c = cardById(sq.ids[i])
    if (!c || c.club === homeClub) continue
    if (i < START_SIZE) xi++
    else bench++
  }
  return { xi, bench }
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

/**
 * 구단 전력 — 그 구단에서 **가장 비싼 18명**의 급여 합 (64 ~ 252).
 * 카드 데이터에서 뽑으므로 두 브라우저가 늘 같은 값을 본다 (결정론).
 */
const CLUB_POWER: number[] = CLUBS.map((cl) => {
  const own = POOL.filter((c) => c.club === cl.id)
    .map((c) => cardSalary(c))
    .sort((a, b) => b - a)
  let t = 0
  for (let i = 0; i < SQUAD_SIZE && i < own.length; i++) t += own[i]
  return t
})

/**
 * **약체 가산** — 전력이 낮은 구단일수록 팀워크가 더 붙는다 (사용자 요청 2026-09-11).
 * 급여가 싼 구단은 상한을 다 못 쓰고도 약하다. 그 구단으로 뭉쳐서 뛰면 그만큼 더 준다.
 * 전력 252(서울 한강) → +0 · 64(파주) → +3.
 */
export function clubHandicap(clubId: number): number {
  const p = CLUB_POWER[clubId] ?? 0
  if (p >= 200) return 0
  if (p >= 160) return 1
  if (p >= 120) return 2
  return 3
}

/** 같은 구단 인원 → 기본 단계 (5·7·9·11명 → +1·2·3·4) */
function teamworkTier(count: number): number {
  return count >= 11 ? 4 : count >= 9 ? 3 : count >= 7 ? 2 : count >= 5 ? 1 : 0
}

/**
 * **팀워크** — 선발 11명 중 같은 구단 선수가 많을수록 손발이 맞는다 (DESIGN 5.6).
 * 예전 이름은 "팀컬러" 였는데 무슨 뜻인지 알기 어려워 바꿨다 (사용자 요청 2026-09-11).
 *
 * `bonus = tier + handicap` — 뭉친 만큼(tier) 주고, **약한 구단이면 더**(handicap) 준다.
 * 가산은 팀워크가 붙을 때(같은 구단 5명 이상)만 얹는다 — 남의 구단 선수만 모아 놓고
 * 약체 가산만 받아 가지 못하게.
 */
export function teamworkBonus(startIds: number[]): {
  club: number
  count: number
  tier: number
  handicap: number
  bonus: number
} {
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
  const tier = teamworkTier(count)
  const handicap = tier > 0 && club >= 0 ? clubHandicap(club) : 0
  return { club, count, tier, handicap, bonus: tier + handicap }
}

export interface SquadCheck {
  ok: boolean
  errors: string[]
  /**
   * **고칠 수 없는** 문제만 (선수 수·지문·골키퍼·중복·포메이션·강화 범위).
   * 급여와 영입 인원은 화면에서 고칠 수 있으므로 여기 넣지 않는다 — 규칙이 바뀌었다고
   * 저장해 둔 스쿼드를 말없이 버리면 안 된다 (`loadSquad` 가 이걸 본다).
   */
  hard: string[]
  salary: number
  cap: number
  enhTotal: number
  teamwork: { club: number; count: number; tier: number; handicap: number; bonus: number }
  /** 주력 구단 (선발 최다) */
  homeClub: number
  /** 타 구단 영입 인원 — 선발·후보 따로 */
  outside: { xi: number; bench: number }
}

/** 스쿼드 규칙 검사 (DESIGN 5.8). 어기면 받지 않는다 */
export function checkSquad(sq: Squad, cap: number): SquadCheck {
  const errors: string[] = []
  /** 화면에서 고칠 수 있는 문제 (급여·영입 인원) — `hard` 에서 뺀다 */
  const soft: string[] = []
  if (!FORMATIONS[sq.formation]) errors.push(`포메이션이 없습니다: ${sq.formation}`)
  if (sq.ids.length !== SQUAD_SIZE) errors.push(`선수가 ${SQUAD_SIZE}명이 아닙니다 (${sq.ids.length}명)`)
  if (sq.enh.length !== SQUAD_SIZE) errors.push('강화 배열 길이가 다릅니다')
  const seen = new Set<number>()
  const homeClub = homeClubOf(sq)
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
    salary += payOf(c, homeClub)
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
  if (salary > cap) soft.push(`급여 상한 초과: ${salary} / ${cap}`)
  // 타 구단 영입 제한 (G-17) — 구단이 뜻을 잃지 않게
  const outside = countOutside(sq, homeClub)
  if (outside.xi > OUT_XI_MAX) soft.push(`선발 영입은 ${OUT_XI_MAX}명까지입니다 (${outside.xi}명)`)
  if (outside.bench > OUT_BENCH_MAX) soft.push(`후보 영입은 ${OUT_BENCH_MAX}명까지입니다 (${outside.bench}명)`)
  for (const p of sq.presets) {
    for (const k of ['line', 'press', 'width', 'mentality'] as const) {
      const v = p[k]
      if (!Number.isInteger(v) || v < 0 || v > 4) errors.push('슬라이더는 0~4 입니다')
    }
  }
  for (const k of sq.kickers) if (k < -1 || k > 10) errors.push('키커는 선발 인덱스여야 합니다')
  const hard = errors.slice()
  errors.push(...soft)
  return {
    ok: errors.length === 0,
    errors,
    hard,
    salary,
    cap,
    enhTotal,
    teamwork: teamworkBonus(sq.ids.slice(0, START_SIZE)),
    homeClub,
    outside,
  }
}

/** 스쿼드 → sim 이 먹는 SquadConfig. 강화·팀워크를 능력치에 얹는다 */
export function toSquadConfig(sq: Squad, name: string, short: string): SquadConfig {
  const color = teamworkBonus(sq.ids.slice(0, START_SIZE))
  const players = sq.ids.map((id, i) => {
    const c = cardById(id)
    if (!c) throw new Error(`없는 선수 id: ${id}`)
    // 팀워크는 선발에게만 (DESIGN 5.6 — 후보는 세지 않는다)
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
 * 한 구단의 선수만으로 스쿼드를 짠다 — **팀워크가 가장 높게** 붙는 순수 구단 팀.
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

/** 처음 여는 사람에게 줄 스쿼드 — 1부 구단 하나의 순수 팀 (팀워크가 가득 붙는다) */
export function starterSquad(formation = '4-3-3'): Squad {
  const first = CLUBS.find((c) => c.div === 1) ?? CLUBS[0]
  return clubSquad(first.id, formation, '내 스쿼드')
}

/** 스쿼드에서 가장 많은 구단 (유니폼 색을 여기서 가져온다) */
export function squadClub(sq: Squad): Club | undefined {
  const color = teamworkBonus(sq.ids.slice(0, START_SIZE))
  return color.club >= 0 ? clubById(color.club) : undefined
}
