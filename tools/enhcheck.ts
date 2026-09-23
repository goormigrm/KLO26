// 강화가 값을 하는가 — 강화 배분·단계 크기별 A/B (2026-09-23, HANDOVER 다음 단계 2).
//
//   npx vite-node tools/enhcheck.ts [쌍 수] [배분] [단계]
//     배분: tw4(팀워크 +4 기준선) · def(수비 5명) · att(공격 5명) · even(선발 고르게)
//     단계: 강화 1 이 능력치 몇을 올리나 (지금 코드는 1)
//
// 방법 — verify 3장과 같은 **짝 비교**에 홈/원정 교대를 더했다. 같은 시드로
//   r0 = 같은 스쿼드끼리 · r1 = 한쪽만 강화 를 나란히 돌리고, 강화 쪽이 홈인 판과 원정인 판을 번갈아 둔다.
// 승 1 · 무 0.5 · 패 0 의 평균 차가 효과다. 소스를 바꾸지 않고 `boostSpec(p, 배분 × 단계)` 로 후보를 흉내 낸다.

import { boostSpec, type Card } from '../src/cards/cards'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { PlayerSpec, SquadConfig } from '../src/core/state'

const N = Number(process.argv[2] ?? 150)
const MODE = process.argv[3] ?? 'def'
const STEP = Number(process.argv[4] ?? 1)
const SEED0 = Number(process.argv[5] ?? 3000)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const base = synthSquad(11, { name: '같음', short: '같음', formation: '4-3-3', quality: 66 })

/** 18칸 강화 배분 (예산 24 · 카드당 5) — verify 와 같은 자리 번호 (4-3-3: 1~4 수비 · 8~10 공격) */
function give(mode: string): number[] {
  const g = new Array(18).fill(0)
  const fill = (idx: number[]): void => {
    let left = 24
    for (const i of idx) {
      const v = Math.min(5, left)
      g[i] = v
      left -= v
      if (left <= 0) break
    }
  }
  if (mode === 'def') fill([1, 2, 3, 4, 5])
  else if (mode === 'att') fill([8, 9, 10, 7, 6])
  else if (mode === 'even') {
    // 스쿼드 화면 "선발 고르게" 와 같다 — 선발 11명 +2, 남는 2 는 공격 둘에게
    for (let i = 0; i < 11; i++) g[i] = 2
    g[9] += 1
    g[10] += 1
  }
  return g
}

function boosted(sq: SquadConfig): SquadConfig {
  if (MODE === 'tw4') {
    return { ...sq, players: sq.players.map((p, i) => (i < 11 ? (boostSpec(p as Card, 4) as PlayerSpec) : p)) }
  }
  const g = give(MODE)
  return { ...sq, players: sq.players.map((p, i) => (g[i] ? (boostSpec(p as Card, g[i] * STEP) as PlayerSpec) : p)) }
}

/** 한 판 — `mine` 쪽 결과를 1 · 0.5 · 0 으로 */
function play(seed: number, mine: SquadConfig, other: SquadConfig, mineHome: boolean): { s: number; gf: number; ga: number } {
  const squads: [SquadConfig, SquadConfig] = mineHome ? [mine, other] : [other, mine]
  const st = createState({ seed, halfSec: 180, squads })
  while (!st.done) step(st, idle)
  const me = mineHome ? 0 : 1
  const gf = st.teams[me].goals
  const ga = st.teams[1 - me].goals
  return { s: gf > ga ? 1 : gf === ga ? 0.5 : 0, gf, ga }
}

const plain = { ...base, name: '보통', short: '보통' }
const strong = { ...boosted(base), name: '강화', short: '강화' }
let d = 0
let r0 = 0
let r1 = 0
let gf0 = 0
let ga0 = 0
let gf1 = 0
let ga1 = 0
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i
  const home = i % 2 === 0
  const a = play(seed, { ...base }, plain, home)
  const b = play(seed, strong, plain, home)
  r0 += a.s
  r1 += b.s
  d += b.s - a.s
  gf0 += a.gf
  ga0 += a.ga
  gf1 += b.gf
  ga1 += b.ga
}
const pct = (x: number): string => ((x / N) * 100).toFixed(1)
const label = MODE === 'tw4' ? '팀워크 +4 (기준선)' : `강화 24 ${MODE} × 단계 ${STEP}`
console.log(
  `[${label}] 쌍 ${N} · ${pct(r0)}% → ${pct(r1)}% (${d >= 0 ? '+' : ''}${pct(d)}%p) · 득실 ${(gf0 / N).toFixed(2)}:${(ga0 / N).toFixed(2)} → ${(gf1 / N).toFixed(2)}:${(ga1 / N).toFixed(2)}`,
)
