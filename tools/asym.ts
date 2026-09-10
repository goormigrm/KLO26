// 홈/원정 비대칭 진단 — 같은 스쿼드끼리 N 판을 돌려 **전반/후반별** 득점과 사건을 홈·원정으로 나눠 센다.
// 한쪽 하프에서만 기울면 킥오프·진영 교체 쪽, 늘 기울면 상시 편향이다. `npx vite-node tools/asym.ts [판수]`
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const N = Number(process.argv[2] ?? 100)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const sq = synthSquad(11, { name: '같음', short: '같음', formation: '4-3-3', quality: 66 })

const g = { h1: [0, 0], h2: [0, 0] }
const shots = { h1: [0, 0], h2: [0, 0] }
const poss = { h1: [0, 0], h2: [0, 0] }
const saves = [0, 0]
const blocks = [0, 0]
let hw = 0
let aw = 0
let dr = 0
for (let i = 0; i < N; i++) {
  const st = createState({ seed: 7000 + i, halfSec: 180, squads: [sq, { ...sq, name: '같음2', short: '같2' }] })
  let seenEv = 0
  let s1 = [0, 0]
  let sh1 = [0, 0]
  while (!st.done) {
    step(st, idle)
    const ot = st.ball.owner >= 0 ? st.players[st.ball.owner].team : -1
    if (ot >= 0) (st.half === 1 ? poss.h1 : poss.h2)[ot]++
    for (; seenEv < st.events.length; seenEv++) {
      const e = st.events[seenEv]
      if (e.type === 'half') {
        s1 = [st.teams[0].goals, st.teams[1].goals]
        sh1 = [st.stats[0].shots, st.stats[1].shots]
      }
      if (e.type === 'save') saves[e.team]++
      if (e.type === 'block') blocks[e.team]++
    }
  }
  for (let t = 0; t < 2; t++) {
    g.h1[t] += s1[t]
    g.h2[t] += st.teams[t].goals - s1[t]
    shots.h1[t] += sh1[t]
    shots.h2[t] += st.stats[t].shots - sh1[t]
  }
  if (st.teams[0].goals > st.teams[1].goals) hw++
  else if (st.teams[0].goals < st.teams[1].goals) aw++
  else dr++
}
const f = (a: number[]): string => `홈 ${(a[0] / N).toFixed(2)} · 원정 ${(a[1] / N).toFixed(2)}`
console.log(`판 ${N} · 홈 ${hw}승 ${dr}무 ${aw}패 (${((hw / (hw + aw)) * 100).toFixed(1)}%)`)
console.log(`전반 골 ${f(g.h1)} | 후반 골 ${f(g.h2)}`)
console.log(`전반 슛 ${f(shots.h1)} | 후반 슛 ${f(shots.h2)}`)
console.log(`전반 점유 ${((poss.h1[0] / (poss.h1[0] + poss.h1[1])) * 100).toFixed(1)}% | 후반 점유 ${((poss.h2[0] / (poss.h2[0] + poss.h2[1])) * 100).toFixed(1)}%`)
console.log(`선방 홈 ${(saves[0] / N).toFixed(2)} · 원정 ${(saves[1] / N).toFixed(2)} | 블록 홈 ${(blocks[0] / N).toFixed(2)} · 원정 ${(blocks[1] / N).toFixed(2)}`)
