// 급여·영입 경제 진단 — 상한이 헐거운지, 타 구단 영입 제한이 값을 하는지 잰다.
// npm run economy

import { CLUBS, POOL } from '../src/data/pool'
import { START_SIZE, cardOvr, cardSalary, clubHandicap, clubSquad, computeCap, payOf } from '../src/cards/squad'
import { cardById } from '../src/data/pool'
import type { Card } from '../src/cards/cards'

const { cap, best18, clubMax, clubWorst } = computeCap()
console.log(`상한 ${cap}  (조건1 올스타18×0.70 = ${Math.round(best18 * 0.7)} · 조건2 최고구단18 = ${clubMax} [${clubWorst}])\n`)

/** 뭉침 단계 + 약체 가산 (실제 규칙과 같게) */
function bonusOf(ownInXi: number, clubId: number): number {
  const tier = ownInXi >= 11 ? 4 : ownInXi >= 9 ? 3 : ownInXi >= 7 ? 2 : ownInXi >= 5 ? 1 : 0
  return tier + (tier > 0 ? clubHandicap(clubId) : 0)
}

/**
 * 그 구단이 짤 수 있는 **가장 센 선발 11** 을 찾는다.
 * outMax = 타 구단에서 데려올 수 있는 인원. 급여 상한을 지킨다.
 * 벤치 7명은 자기 구단에서 가장 싼 선수로 채운 값을 급여에 더한다 (상한을 정직하게 쓰기 위해).
 */
function bestXI(clubId: number, outMax: number, benchOutMax: number): { ovr: number; sal: number; out: number } {
  const own = POOL.filter((c) => c.club === clubId)
  const out = POOL.filter((c) => c.club !== clubId)
  const byOvr = (a: Card, b: Card): number => cardOvr(b, 0) - cardOvr(a, 0)
  const ownGk = own.filter((c) => c.pos === 'GK').sort(byOvr)
  const ownOut = own.filter((c) => c.pos !== 'GK').sort(byOvr)
  const outGk = out.filter((c) => c.pos === 'GK').sort(byOvr)
  const outFld = out.filter((c) => c.pos !== 'GK').sort(byOvr)

  let best = { ovr: 0, sal: 0, out: 0 }
  for (let nOut = 0; nOut <= outMax; nOut++) {
    // 외부는 필드 선수로만 데려온다 (GK 는 자기 구단)
    const xi: Card[] = [ownGk[0]]
    const nOwnFld = START_SIZE - 1 - nOut
    for (let i = 0; i < nOwnFld && i < ownOut.length; i++) xi.push(ownOut[i])
    for (let i = 0; i < nOut && i < outFld.length; i++) xi.push(outFld[i])
    if (xi.length < START_SIZE || xi.some((c) => !c)) continue
    // 벤치 — 자기 구단에서 가장 싼 7명 (급여만 쓴다)
    const usedIds = new Set(xi.map((c) => c.id))
    const benchPool = own.filter((c) => !usedIds.has(c.id)).sort((a, b) => cardSalary(a) - cardSalary(b))
    if (benchPool.length < 7) continue
    const benchSal = benchPool.slice(0, 7).reduce((t, c) => t + payOf(c, clubId), 0)
    const sal = xi.reduce((t, c) => t + payOf(c, clubId), 0) + benchSal
    if (sal > cap) continue
    const ownInXi = xi.filter((c) => c.club === clubId).length
    const bonus = bonusOf(ownInXi, clubId)
    const ovr = xi.reduce((t, c) => t + cardOvr(c, bonus), 0) / START_SIZE
    if (ovr > best.ovr) best = { ovr, sal, out: nOut }
  }
  return best
}

function report(label: string, outMax: number, benchOutMax: number): { spread: number; rows: { name: string; div: number; ovr: number; sal: number; out: number }[] } {
  const rows: { name: string; div: number; ovr: number; sal: number; out: number }[] = []
  for (const cl of CLUBS) {
    try { clubSquad(cl.id) } catch { continue }
    const b = bestXI(cl.id, outMax, benchOutMax)
    rows.push({ name: cl.name, div: cl.div, ovr: b.ovr, sal: b.sal, out: b.out })
  }
  rows.sort((a, b) => b.ovr - a.ovr)
  const spread = rows[0].ovr - rows[rows.length - 1].ovr
  console.log(`==== ${label} ====`)
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(11)} ${r.div}부  최강선발 OVR ${r.ovr.toFixed(1)}  급여 ${String(r.sal).padStart(3)}/${cap}  영입 ${r.out}명`)
  }
  console.log(`  ── 최고 ${rows[0].ovr.toFixed(1)} (${rows[0].name}) · 최저 ${rows[rows.length - 1].ovr.toFixed(1)} (${rows[rows.length - 1].name}) · 격차 ${spread.toFixed(1)}\n`)
  return { spread, rows }
}

const a = report('지금 (영입 제한 없음 · 상한만)', 11, 7)
const b = report('제안 (선발 영입 5명 · 후보 2명)', 5, 2)
const c = report('자기 구단만 (영입 0명 · 팀컬러 +4)', 0, 0)

console.log('==== 요약 ====')
console.log(`  영입 무제한 : 격차 ${a.spread.toFixed(1)}  · 1위 ${a.rows[0].name} ${a.rows[0].ovr.toFixed(1)}`)
console.log(`  영입 5+2    : 격차 ${b.spread.toFixed(1)}  · 1위 ${b.rows[0].name} ${b.rows[0].ovr.toFixed(1)}`)
console.log(`  영입 0      : 격차 ${c.spread.toFixed(1)}  · 1위 ${c.rows[0].name} ${c.rows[0].ovr.toFixed(1)}`)
