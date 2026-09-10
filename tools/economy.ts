// 급여 경제 진단 — 상한이 헐거운지, 타 구단 영입이 몇 명까지 되는지 잰다.
// npm run economy

import { CLUBS, POOL, cardById } from '../src/data/pool'
import { SQUAD_SIZE, START_SIZE, cardOvr, cardSalary, clubSquad, computeCap, teamColorBonus } from '../src/cards/squad'
import type { Card } from '../src/cards/cards'

const { cap, best18, clubMax, clubWorst } = computeCap()
const cond1 = Math.round(best18 * 0.7)

console.log('==== 급여 상한 ====')
console.log(`상한 ${cap}  (조건1 올스타18×0.70 = ${cond1} · 조건2 최고구단18 = ${clubMax} [${clubWorst}])`)
console.log(`올스타 18명(포지션 맞춤) 급여 = ${best18}`)

// ---- 급여 구간 분포
const tiers = new Map<number, number>()
for (const c of POOL) tiers.set(cardSalary(c), (tiers.get(cardSalary(c)) ?? 0) + 1)
console.log('\n==== 급여 구간별 인원 (1,056명) ====')
for (const s of [...tiers.keys()].sort((a, b) => b - a)) {
  const n = tiers.get(s)!
  console.log(`  급여 ${String(s).padStart(2)} : ${String(n).padStart(4)}명 (${((n / POOL.length) * 100).toFixed(1)}%)`)
}

// ---- 구단별 자동 스쿼드 급여 · 여유
console.log('\n==== 구단별 자기 선수 18명 (팀컬러 +4) ====')
const rows: { name: string; div: number; sal: number; ovr: number }[] = []
for (const cl of CLUBS) {
  try {
    const sq = clubSquad(cl.id)
    const sal = sq.ids.reduce((t, id) => t + cardSalary(cardById(id)!), 0)
    const ovr = sq.ids.slice(0, START_SIZE).reduce((t, id) => t + cardOvr(cardById(id)!, 4), 0) / START_SIZE
    rows.push({ name: cl.name, div: cl.div, sal, ovr })
  } catch { /* 18명 미만 구단 */ }
}
rows.sort((a, b) => b.sal - a.sal)
for (const r of rows) {
  console.log(`  ${r.name.padEnd(10)} ${r.div}부  급여 ${String(r.sal).padStart(3)}/${cap}  여유 ${String(cap - r.sal).padStart(3)}  선발평균OVR(+4) ${r.ovr.toFixed(1)}`)
}
const sals = rows.map((r) => r.sal)
const avg = sals.reduce((a, b) => a + b, 0) / sals.length
console.log(`  ── 평균 ${avg.toFixed(1)} · 최소 ${Math.min(...sals)} · 최대 ${Math.max(...sals)} · 평균 여유 ${(cap - avg).toFixed(1)} (상한의 ${(((cap - avg) / cap) * 100).toFixed(0)}%)`)

// ---- 상한 안에서 짤 수 있는 최강 스쿼드 (포지션 맞춤 탐욕)
function bestUnderCap(pool: Card[], budget: number): { ids: number[]; sal: number; ovr: number } {
  const need: [string, number][] = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]]
  const ids: number[] = []
  let sal = 0
  let ovrSum = 0
  for (const [pos, n] of need) {
    const list = pool.filter((c) => c.pos === pos).sort((a, b) => cardOvr(b, 0) - cardOvr(a, 0))
    for (let i = 0; i < n && i < list.length; i++) {
      ids.push(list[i].id)
      sal += cardSalary(list[i])
      ovrSum += cardOvr(list[i], 0)
    }
  }
  return { ids, sal, ovr: ovrSum / ids.length }
}
const allstar = bestUnderCap(POOL, cap)
console.log('\n==== 상한을 무시한 최강 18 (포지션 맞춤) ====')
console.log(`  급여 ${allstar.sal} (상한 ${cap} 의 ${((allstar.sal / cap) * 100).toFixed(0)}%) · 평균 OVR ${allstar.ovr.toFixed(1)}`)

// ---- 타 구단 영입을 N명 섞었을 때 급여
console.log('\n==== 자기 구단 + 타 구단 영입 N명 (가장 비싼 선수로) ====')
const topOutside = (clubId: number, n: number): Card[] =>
  POOL.filter((c) => c.club !== clubId).sort((a, b) => cardOvr(b, 0) - cardOvr(a, 0)).slice(0, n)

for (const n of [0, 3, 5, 7, 9, 11, 18]) {
  let overCount = 0
  let salSum = 0
  for (const cl of CLUBS) {
    let sq
    try { sq = clubSquad(cl.id) } catch { continue }
    const own = sq.ids.map((id) => cardById(id)!)
    // 가장 싼 n명을 최고 외부 선수로 교체
    const idx = own.map((c, i) => [i, cardSalary(c)] as const).sort((a, b) => a[1] - b[1]).slice(0, n).map(([i]) => i)
    const outs = topOutside(cl.id, n)
    const mixed = own.slice()
    idx.forEach((i, k) => { mixed[i] = outs[k] })
    const sal = mixed.reduce((t, c) => t + cardSalary(c), 0)
    salSum += sal
    if (sal > cap) overCount++
  }
  const m = salSum / rows.length
  console.log(`  영입 ${String(n).padStart(2)}명 → 평균 급여 ${m.toFixed(1)}/${cap}  상한초과 구단 ${overCount}/${rows.length}`)
}

// ---- 팀컬러가 유지되는 영입 한도
console.log('\n==== 팀컬러 (선발 11명 중 최다 구단 인원) ====')
for (const outXI of [0, 2, 4, 5, 6, 7]) {
  const ids = clubSquad(CLUBS[0].id).ids.slice(0, START_SIZE)
  const outs = topOutside(CLUBS[0].id, outXI)
  const mixed = ids.slice()
  for (let k = 0; k < outXI; k++) mixed[START_SIZE - 1 - k] = outs[k].id
  const tc = teamColorBonus(mixed)
  console.log(`  선발 외부영입 ${outXI}명 → 자기구단 ${START_SIZE - outXI}명 · 팀컬러 +${tc.bonus}`)
}
