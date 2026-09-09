// 단계 7 검증 (DESIGN 12장). `npx vite-node tools/verify.ts [판수]`
//
// 세 가지를 본다:
//  1. **슬라이더가 연결됐는지 지문으로** — 같은 시드로 값만 바꿔 돌려 결과 지문이 같으면 엔진이 그 값을 안 읽는 것이다
//     (KMD26 이 "패스 길이 미반영"을 이걸로 잡았다).
//  2. **짝 비교 + 부호검정** — 같은 시드로 낮은 값·높은 값을 나란히 돌리고, 그 손잡이가 직접 건드리는 지표가
//     기대한 쪽으로 움직인 쌍의 비율을 센다.
//  3. **효과 크기** — 팀컬러 · 강화 · 능숙도가 승률을 얼마나 바꾸나.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, hashState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { boostSpec } from '../src/cards/cards'
import { POOL, type Card } from '../src/data/pool'
import type { PlayerSpec, Sliders, SquadConfig } from '../src/core/state'

const N = Number(process.argv[2] ?? 120)
const HALF = 180
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

const baseHome = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const baseAway = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

interface Result {
  hash: number
  goalsA: number
  goalsB: number
  shots: number
  tackles: number
  fouls: number
  offsides: number
  possA: number
  possB: number
  corners: number
  /** 공이 홈 진영에 있던 틱 비율 */
  deep: number
  /** 공의 평균 x (홈 공격 방향 +) */
  ballX: number
  shotsA: number
  passB: number
  passOkB: number
}

function withSliders(sq: SquadConfig, s: Partial<Sliders>): SquadConfig {
  const base: Sliders = { line: 2, press: 2, width: 2, mentality: 2, ...s }
  return { ...sq, presets: [base, base, base], sliders: base }
}

function run(seed: number, home: SquadConfig, away: SquadConfig): Result {
  const st = createState({ seed, halfSec: HALF, squads: [home, away] })
  let deep = 0
  let sumX = 0
  while (!st.done) {
    step(st, idle)
    if (st.ball.x < 0) deep++
    // 후반은 진영이 바뀌므로 홈 공격 방향으로 되돌려 센다
    sumX += st.ball.x * st.teams[0].dir
  }
  return {
    hash: hashState(st),
    goalsA: st.teams[0].goals,
    goalsB: st.teams[1].goals,
    shots: st.stats[0].shots + st.stats[1].shots,
    tackles: st.stats[0].tackles + st.stats[1].tackles,
    fouls: st.stats[0].fouls + st.stats[1].fouls,
    offsides: st.stats[0].offsides + st.stats[1].offsides,
    possA: st.stats[0].poss,
    possB: st.stats[1].poss,
    corners: st.stats[0].corners + st.stats[1].corners,
    deep: deep / Math.max(1, st.tick),
    ballX: sumX / Math.max(1, st.tick),
    shotsA: st.stats[0].shots,
    passB: st.stats[1].passes,
    passOkB: st.stats[1].passOk,
  }
}

function pct(a: number, b: number): string {
  return `${((a / Math.max(1, a + b)) * 100).toFixed(1)}%`
}

// ---------------------------------------------------------------- 1 · 슬라이더 지문
console.log('=== 1. 슬라이더 지문 (같은 시드로 값만 바꿔 지문이 달라지는가)')
const SLIDERS: (keyof Sliders)[] = ['line', 'press', 'width', 'mentality']
const fpSeeds = [101, 202, 303, 404, 505]
for (const key of SLIDERS) {
  let differ = 0
  for (const seed of fpSeeds) {
    const lo = run(seed, withSliders(baseHome, { [key]: 0 }), baseAway)
    const hi = run(seed, withSliders(baseHome, { [key]: 4 }), baseAway)
    if (lo.hash !== hi.hash) differ++
  }
  const ok = differ === fpSeeds.length
  console.log(`  ${key.padEnd(10)} ${differ}/${fpSeeds.length} 시드에서 지문이 달라짐 ${ok ? '✅ 연결됨' : '❌ 엔진이 안 읽는다'}`)
}

// ---------------------------------------------------------------- 2 · 짝 비교 + 부호검정
console.log('\n=== 2. 짝 비교 (손잡이가 직접 건드리는 지표가 기대한 쪽으로 움직이나)')
interface Pair {
  key: keyof Sliders
  label: string
  metric: (r: Result) => number
  expect: 'up' | 'down'
}
const PAIRS: Pair[] = [
  // 압박이 하려는 일은 "상대가 편하게 못 돌리게" 다 — 태클 수보다 상대 패스 성공률이 곧은 지표다
  { key: 'press', label: '압박 ↑ → 상대 패스 성공률 ↓', metric: (r) => r.passOkB / Math.max(1, r.passB), expect: 'down' },
  { key: 'press', label: '압박 ↑ → 파울 ↑', metric: (r) => r.fouls, expect: 'up' },
  { key: 'line', label: '수비 라인 ↑ → 상대 오프사이드 ↑', metric: (r) => r.offsides, expect: 'up' },
  { key: 'line', label: '수비 라인 ↑ → 공이 우리 진영에 있는 시간 ↓', metric: (r) => r.deep, expect: 'down' },
  { key: 'mentality', label: '멘탈리티 ↑ → 우리 슛 ↑', metric: (r) => r.shotsA, expect: 'up' },
  { key: 'mentality', label: '멘탈리티 ↑ → 공이 상대 진영 쪽으로', metric: (r) => r.ballX, expect: 'up' },
  { key: 'width', label: '폭 ↑ → 코너킥 ↑ (측면 공격)', metric: (r) => r.corners, expect: 'up' },
]
const pairSeeds = Array.from({ length: 16 }, (_, i) => 900 + i)
for (const p of PAIRS) {
  let win = 0
  let tie = 0
  for (const seed of pairSeeds) {
    const lo = run(seed, withSliders(baseHome, { [p.key]: 0 }), baseAway)
    const hi = run(seed, withSliders(baseHome, { [p.key]: 4 }), baseAway)
    const a = p.metric(lo)
    const b = p.metric(hi)
    if (a === b) tie++
    else if (p.expect === 'up' ? b > a : b < a) win++
  }
  const n = pairSeeds.length - tie
  const rate = n > 0 ? (win / n) * 100 : 0
  console.log(`  ${p.label.padEnd(38)} ${win}/${n} (${rate.toFixed(0)}%)${tie ? ` · 동률 ${tie}` : ''} ${rate >= 62 ? '✅' : rate >= 50 ? '△' : '❌'}`)
}

// ---------------------------------------------------------------- 3 · 효과 크기
console.log('\n=== 3. 효과 크기 (승률 차)')

function boostSquad(sq: SquadConfig, plus: number, onlyStart = true): SquadConfig {
  const players = sq.players.map((p, i) => (onlyStart && i >= 11 ? p : (boostSpec(p as Card, plus) as PlayerSpec)))
  return { ...sq, players }
}

/** 강화 예산 24 를 고른 자리에 준다. 4-3-3 기준 1~4 는 수비, 8~10 은 공격 */
function enhSquad(idx: number[]): (sq: SquadConfig) => SquadConfig {
  return (sq) => {
    const give = new Array(18).fill(0)
    let left = 24
    for (const i of idx) {
      const v = Math.min(5, left)
      give[i] = v
      left -= v
      if (left <= 0) break
    }
    const players = sq.players.map((p, i) => (give[i] ? (boostSpec(p as Card, give[i]) as PlayerSpec) : p))
    return { ...sq, players }
  }
}

/**
 * **짝 비교**로 잰다 — 같은 시드로 보정 있음/없음을 나란히 돌린다.
 * 그냥 따로 돌리면 시드 잡음(±6%p)이 효과(+8~15%p)를 덮는다.
 */
function effect(label: string, mkHome: (s: SquadConfig) => SquadConfig, n = N): void {
  let base = 0
  let boosted = 0
  let gfB = 0
  let gaB = 0
  let gf0 = 0
  let ga0 = 0
  for (let i = 0; i < n; i++) {
    const a = run(2000 + i, baseHome, baseAway)
    const b = run(2000 + i, mkHome(baseHome), baseAway)
    base += a.goalsA > a.goalsB ? 1 : a.goalsA === a.goalsB ? 0.5 : 0
    boosted += b.goalsA > b.goalsB ? 1 : b.goalsA === b.goalsB ? 0.5 : 0
    gf0 += a.goalsA
    ga0 += a.goalsB
    gfB += b.goalsA
    gaB += b.goalsB
  }
  const r0 = (base / n) * 100
  const r1 = (boosted / n) * 100
  const diff = r1 - r0
  const ok = diff >= 8 && diff <= 15
  console.log(
    `  ${label.padEnd(24)} ${r0.toFixed(1)}% → ${r1.toFixed(1)}% (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p) ` +
      `· 득실 ${(gf0 / n).toFixed(2)}:${(ga0 / n).toFixed(2)} → ${(gfB / n).toFixed(2)}:${(gaB / n).toFixed(2)} ${ok ? '✅ 8~15%p' : diff > 0 ? '△' : '❌'}`,
  )
}

effect('팀컬러 +4 (선발 전원)', (s) => boostSquad(s, 4))
effect('강화 24 → 수비 5명', enhSquad([1, 2, 3, 4, 5]))
effect('강화 24 → 공격 5명', enhSquad([8, 9, 10, 7, 6]))
effect('팀컬러 +1 (5명 맞춤)', (s) => boostSquad(s, 1))

// ---------------------------------------------------------------- 4 · 홈/원정 대칭
console.log('\n=== 4. 홈/원정 대칭 (같은 스쿼드끼리)')
{
  const same = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const mirror = { ...same, name: '원정', short: '원정' }
  let w = 0
  let d = 0
  let l = 0
  let goals = 0
  for (let i = 0; i < N; i++) {
    const r = run(5000 + i, same, mirror)
    goals += r.goalsA + r.goalsB
    if (r.goalsA > r.goalsB) w++
    else if (r.goalsA === r.goalsB) d++
    else l++
  }
  const rate = ((w + d * 0.5) / N) * 100
  const ok = rate >= 47 && rate <= 53
  console.log(`  홈 ${w}승 ${d}무 ${l}패 · 승률 ${rate.toFixed(1)}% ${ok ? '✅ 47~53%' : '⚠ 기준 밖'} · 평균 ${(goals / N).toFixed(2)}골`)
}

// ---------------------------------------------------------------- 5 · 능숙도
console.log('\n=== 5. 포지션 능숙도 (초록 11명 vs 빨강 11명)')
{
  // 빨강: 필드 선수를 전부 엉뚱한 자리에 (GK 를 필드로, FW 를 수비로)
  const green = synthSquad(11, { name: '초록', short: '초록', formation: '4-3-3', quality: 66 })
  const redPlayers = green.players.map((p, i) => (i === 0 ? p : { ...p, pos: 'GK' as const, posFam: { GK: 100 } }))
  const red = { ...green, name: '빨강', short: '빨강', players: redPlayers }
  let w = 0
  let d = 0
  for (let i = 0; i < N; i++) {
    const r = run(6000 + i, green, red)
    if (r.goalsA > r.goalsB) w++
    else if (r.goalsA === r.goalsB) d++
  }
  const rate = ((w + d * 0.5) / N) * 100
  console.log(`  초록 승률 ${rate.toFixed(1)}% ${rate >= 70 ? '✅ ≥70%' : '⚠ 기준(70%) 밖'}`)
}

// ---------------------------------------------------------------- 6 · 결정론
console.log('\n=== 6. 결정론 (같은 시드 100회)')
{
  const first = run(777, baseHome, baseAway).hash
  let same = 0
  for (let i = 0; i < 100; i++) if (run(777, baseHome, baseAway).hash === first) same++
  console.log(`  해시 일치 ${same}/100 ${same === 100 ? '✅' : '❌'}`)
}

console.log(`\n(카드 풀 ${POOL.length}장 · 판당 ${HALF}초 하프 · ${pct(1, 1)} 는 자리표시자)`)
