// 두 합성 스쿼드(홈 4-3-3 · 원정 4-4-2) N 판 — 팀별 골·슛·크로스 (32차 진단: 크로스 변경 뒤 승패가 기울었나)
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const n = Number(process.argv[2] ?? 60)
const seed0 = Number(process.argv[3] ?? 1000)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const g = [0, 0]
const sh = [0, 0]
const cr = [0, 0]
const hd = [0, 0]
let w = 0, d = 0, l = 0
for (let i = 0; i < n; i++) {
  const st = createState({ seed: seed0 + i, halfSec: 180, squads: [home, away] })
  let live = false
  const prev = new Array<number>(22).fill(0)
  while (!st.done) {
    step(st, idle)
    const b = st.ball
    if (!live && b.passLive && b.passTo >= 0) {
      live = true
      const k = b.passKind
      if ((k === 'highcross' || k === 'lob' || k === 'lowcross') && Math.abs(b.y) > 14) cr[st.players[b.lastTouch].team]++
    } else if (live && (!b.passLive || b.owner >= 0)) live = false
    for (const p of st.players) {
      if (p.action === 5 && prev[p.idx] !== 5) hd[p.team]++
      prev[p.idx] = p.action
    }
  }
  for (let t = 0; t < 2; t++) {
    g[t] += st.teams[t].goals
    sh[t] += st.stats[t].shots
  }
  if (st.teams[0].goals > st.teams[1].goals) w++
  else if (st.teams[0].goals < st.teams[1].goals) l++
  else d++
}
const f = (a: number[]): string => `${(a[0] / n).toFixed(2)} : ${(a[1] / n).toFixed(2)}`
console.log(`${n}판 (시드 ${seed0}+) · 홈 ${w}승 ${d}무 ${l}패 · 골 ${f(g)} · 슛 ${f(sh)} · 크로스 ${f(cr)} · 헤딩 ${f(hd)}`)
