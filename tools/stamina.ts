// 체력이 경기 길이에 맞게 닳는가 (사용자 제보 2026-09-11 — "전반 끝인데 대부분 0 에 가깝다").
//   npm run stamina            (10판 · 하프 180초)
//   npm run stamina -- 10 120
// 하프타임과 종료 시점에 22명의 체력을 찍는다 — 카드 체력(sta)이 낮은 쪽/높은 쪽으로 나눠서.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const n = Number(process.argv[2] ?? 10)
const halfSec = Number(process.argv[3] ?? 180)

const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

interface Acc { n: number; sum: number; lo: number; hi: number; loN: number; hiN: number; zero: number }
const mk = (): Acc => ({ n: 0, sum: 0, lo: 0, hi: 0, loN: 0, hiN: 0, zero: 0 })
const half = mk()
const end = mk()
function take(acc: Acc, st: ReturnType<typeof createState>): void {
  for (const p of st.players) {
    if (p.sk.isGK) continue
    acc.n++
    acc.sum += p.stamina
    if (p.stamina < 0.1) acc.zero++
    if (p.sk.sta < 0.55) { acc.lo += p.stamina; acc.loN++ }
    else if (p.sk.sta > 0.7) { acc.hi += p.stamina; acc.hiN++ }
  }
}
for (let i = 0; i < n; i++) {
  const st = createState({ seed: 4000 + i, halfSec, squads: [home, away] })
  let seenHalf = false
  while (!st.done) {
    step(st, idle)
    if (!seenHalf && st.phase === 'halftime') { seenHalf = true; take(half, st) }
  }
  take(end, st)
}
const pct = (v: number): string => `${Math.round(v * 100)}%`
const show = (label: string, a: Acc): void =>
  console.log(`${label} — 평균 ${pct(a.sum / a.n)} · 체력 낮은 선수(sta<.55) ${pct(a.lo / Math.max(1, a.loN))} · 높은 선수(sta>.7) ${pct(a.hi / Math.max(1, a.hiN))} · 10% 아래 ${pct(a.zero / a.n)}`)
console.log(`판 ${n} · 하프 ${halfSec}s · 필드 선수 20명`)
show('하프타임', half)
show('경기 종료', end)
