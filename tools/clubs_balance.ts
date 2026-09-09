// 실제 구단끼리 붙여 본다 (DESIGN 12장). `npx vite-node tools/clubs_balance.ts [판수]`
// 합성 스쿼드(quality 66)와 달리 구단마다 세기가 다르다 — 1부/2부가 갈리는지, 골이 목표 안인지 본다.
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { CLUBS } from '../src/data/pool'
import { clubSquad, toSquadConfig } from '../src/cards/squad'

const n = Number(process.argv[2] ?? 60)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const cfgOf = new Map<number, ReturnType<typeof toSquadConfig>>()
for (const c of CLUBS) cfgOf.set(c.id, toSquadConfig(clubSquad(c.id, c.div === 1 ? '4-3-3' : '4-4-2'), c.name, c.short))

let goals = 0
let nil = 0
let big = 0
let k1w = 0
let k1n = 0
let sameW = 0
let sameD = 0
let sameN = 0
for (let i = 0; i < n; i++) {
  const a = CLUBS[(i * 7) % CLUBS.length]
  const b = CLUBS[(i * 13 + 3) % CLUBS.length]
  if (a.id === b.id) continue
  const st = createState({ seed: 4000 + i, halfSec: 180, squads: [cfgOf.get(a.id)!, cfgOf.get(b.id)!] })
  while (!st.done) step(st, idle)
  const g = st.teams[0].goals + st.teams[1].goals
  goals += g
  if (g === 0) nil++
  if (st.teams[0].goals >= 5 || st.teams[1].goals >= 5) big++
  if (a.div !== b.div) {
    k1n++
    const k1IsHome = a.div === 1
    const homeWin = st.teams[0].goals > st.teams[1].goals
    const draw = st.teams[0].goals === st.teams[1].goals
    if (draw) k1w += 0.5
    else if (homeWin === k1IsHome) k1w++
  } else if (a.div === b.div) {
    sameN++
    if (st.teams[0].goals > st.teams[1].goals) sameW++
    else if (st.teams[0].goals === st.teams[1].goals) sameD++
  }
}
console.log(`실제 구단 ${n}판 · 평균 골 ${(goals / n).toFixed(2)} · 0:0 ${((nil / n) * 100).toFixed(0)}% · 5골+ ${((big / n) * 100).toFixed(0)}%`)
console.log(`1부 vs 2부 ${k1n}판 — 1부 승률 ${k1n ? ((k1w / k1n) * 100).toFixed(1) : '-'}%  (세야 정상)`)
console.log(`같은 부 ${sameN}판 — 홈 ${sameW}승 ${sameD}무 · 홈 승률 ${sameN ? (((sameW + sameD * 0.5) / sameN) * 100).toFixed(1) : '-'}%`)
