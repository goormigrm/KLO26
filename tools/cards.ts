// 카드·급여 상한 계측 (DESIGN 5.4 · 12장). `npx vite-node tools/cards.ts`
import { CLUBS, POOL } from '../src/data/pool'
import { rawOvr } from '../src/cards/cards'
import { OVR_FIT, cardOvr, cardSalary, computeCap, SQUAD_SIZE } from '../src/cards/squad'

const ovrs = POOL.map((c) => cardOvr(c, 0)).sort((a, b) => a - b)
const at = (q: number): number => ovrs[Math.round(q * (ovrs.length - 1))]
const byPos: Record<string, number> = {}
for (const c of POOL) byPos[c.pos] = (byPos[c.pos] ?? 0) + 1

console.log(`카드 ${POOL.length}장 · 구단 ${CLUBS.length} · OVR 보정 a=${OVR_FIT.a.toFixed(4)} b=${OVR_FIT.b.toFixed(2)}`)
console.log(`OVR 최소 ${at(0)} · 중앙값 ${at(0.5)} · 상위 1% ${at(0.99)} · 최대 ${at(1)}  (앵커 63 / 85)`)
console.log(`포지션 ${Object.entries(byPos).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`원점수 범위 ${Math.min(...POOL.map(rawOvr)).toFixed(1)} ~ ${Math.max(...POOL.map(rawOvr)).toFixed(1)}`)

const cap = computeCap()
console.log(`\n급여 상한 ${cap.cap}`)
console.log(`  조건1 올스타 18명 급여 ${cap.best18} × 0.70 = ${Math.round(cap.best18 * 0.7)}`)
console.log(`  조건2 가장 비싼 구단(${cap.clubWorst}) 자기 선수 18명 = ${cap.clubMax}`)
console.log(`  → ${cap.clubMax > Math.round(cap.best18 * 0.7) ? '조건2 가 상한을 정했다 (K리그2 포함 요구)' : '조건1 이 상한을 정했다'}`)

// 29개 구단 전부 자기 선수로 상한 안에 드는지 확인 (DESIGN 5.4 조건 2)
let worst = 0
let worstName = ''
for (const club of CLUBS) {
  const own = POOL.filter((c) => c.club === club.id)
  const need: Record<string, number> = { GK: 2, DF: 6, MF: 6, FW: 4 }
  let sum = 0
  for (const pos in need) {
    const list = own.filter((c) => c.pos === pos).map(cardSalary).sort((a, b) => a - b)
    for (let i = 0; i < need[pos] && i < list.length; i++) sum += list[i]
  }
  if (sum > worst) {
    worst = sum
    worstName = club.name
  }
}
console.log(`  가장 싼 18명으로도 ${worstName} 가 ${worst} — 상한 ${cap.cap} 안: ${worst <= cap.cap ? '예' : '아니오'}`)
console.log(`  (스쿼드는 ${SQUAD_SIZE}명)`)
