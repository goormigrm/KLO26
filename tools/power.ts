import { CLUBS, POOL } from '../src/data/pool'
import { cardSalary, SQUAD_SIZE } from '../src/cards/squad'

const rows = CLUBS.map((cl) => {
  const own = POOL.filter((c) => c.club === cl.id)
  const top = own.map(cardSalary).sort((a, b) => b - a).slice(0, SQUAD_SIZE)
  return { name: cl.name, div: cl.div, n: own.length, power: top.reduce((a, b) => a + b, 0) }
}).sort((a, b) => b.power - a.power)

for (const r of rows) console.log(`  ${r.name.padEnd(16)} ${r.div}부  전력(최고18 급여) ${String(r.power).padStart(3)}  선수 ${r.n}명`)
const p = rows.map((r) => r.power)
console.log(`\n  최대 ${Math.max(...p)} · 최소 ${Math.min(...p)} · 중앙 ${p[Math.floor(p.length / 2)]}`)
for (const t of [200, 160, 120]) console.log(`  ${t} 이상: ${p.filter((x) => x >= t).length}개 구단`)
