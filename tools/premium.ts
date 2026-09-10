// 영입 웃돈(이적료) 배수를 바꿔 가며, 급여 상한이 실제로 걸리는지 잰다.
import { CLUBS, POOL } from '../src/data/pool'
import { START_SIZE, cardOvr, cardSalary, clubSquad, computeCap } from '../src/cards/squad'
import type { Card } from '../src/cards/cards'

const { cap } = computeCap()
const colorBonus = (n: number): number => (n >= 11 ? 4 : n >= 9 ? 3 : n >= 7 ? 2 : n >= 5 ? 1 : 0)

function bestXI(clubId: number, outMax: number, prem: number): { ovr: number; sal: number; out: number; atCap: boolean } {
  const own = POOL.filter((c) => c.club === clubId)
  const out = POOL.filter((c) => c.club !== clubId)
  const byOvr = (a: Card, b: Card): number => cardOvr(b, 0) - cardOvr(a, 0)
  const ownGk = own.filter((c) => c.pos === 'GK').sort(byOvr)
  const ownFld = own.filter((c) => c.pos !== 'GK').sort(byOvr)
  const outFld = out.filter((c) => c.pos !== 'GK').sort(byOvr)
  const pay = (c: Card): number => (c.club === clubId ? cardSalary(c) : Math.round(cardSalary(c) * prem))

  let best = { ovr: 0, sal: 0, out: 0, atCap: false }
  for (let nOut = 0; nOut <= outMax; nOut++) {
    const xi: Card[] = [ownGk[0]]
    for (let i = 0; i < START_SIZE - 1 - nOut && i < ownFld.length; i++) xi.push(ownFld[i])
    for (let i = 0; i < nOut && i < outFld.length; i++) xi.push(outFld[i])
    if (xi.length < START_SIZE || xi.some((c) => !c)) continue
    const used = new Set(xi.map((c) => c.id))
    const bench = own.filter((c) => !used.has(c.id)).sort((a, b) => cardSalary(a) - cardSalary(b)).slice(0, 7)
    if (bench.length < 7) continue
    const sal = xi.reduce((t, c) => t + pay(c), 0) + bench.reduce((t, c) => t + pay(c), 0)
    if (sal > cap) continue
    const bonus = colorBonus(xi.filter((c) => c.club === clubId).length)
    const ovr = xi.reduce((t, c) => t + cardOvr(c, bonus), 0) / START_SIZE
    if (ovr > best.ovr) best = { ovr, sal, out: nOut, atCap: sal > cap * 0.95 }
  }
  return best
}

console.log(`상한 ${cap} · 선발 영입 최대 5명 기준\n`)
console.log('웃돈   최고OVR   최저OVR   격차   상한에 닿는 구단  평균 영입인원  평균 급여')
for (const prem of [1, 1.25, 1.5, 1.75, 2]) {
  const rows = []
  for (const cl of CLUBS) {
    try { clubSquad(cl.id) } catch { continue }
    rows.push(bestXI(cl.id, 5, prem))
  }
  rows.sort((a, b) => b.ovr - a.ovr)
  const hi = rows[0].ovr
  const lo = rows[rows.length - 1].ovr
  const atCap = rows.filter((r) => r.atCap).length
  const avgOut = rows.reduce((t, r) => t + r.out, 0) / rows.length
  const avgSal = rows.reduce((t, r) => t + r.sal, 0) / rows.length
  console.log(
    `×${prem.toFixed(2)}  ${hi.toFixed(1)}     ${lo.toFixed(1)}     ${(hi - lo).toFixed(1)}    ${String(atCap).padStart(2)}/${rows.length}            ${avgOut.toFixed(1)}명          ${avgSal.toFixed(0)}/${cap}`,
  )
}
