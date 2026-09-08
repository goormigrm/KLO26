// 한 경기의 사건 종류·점유·공 위치 분포를 찍는다 — 밸런스 원인 진단용. `npx vite-node tools/probe.ts [seed]`
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const seed = Number(process.argv[2] ?? 101)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const st = createState({ seed, halfSec: 180, squads: [home, away] })

const zone = [0, 0, 0] // 공 x 가 수비 1/3 · 중앙 · 공격 1/3 (홈 기준)
const phase = new Map<string, number>()
let loose = 0
let owned = 0
let final3 = 0
while (!st.done) {
  step(st, idle)
  phase.set(st.phase, (phase.get(st.phase) ?? 0) + 1)
  const x = st.ball.x
  zone[x < -17.5 ? 0 : x > 17.5 ? 2 : 1]++
  if (st.ball.owner < 0) loose++
  else owned++
  if (st.ball.owner >= 0 && Math.abs(st.ball.x) > 35) final3++
}
const ev = new Map<string, number>()
for (const e of st.events) ev.set(e.type, (ev.get(e.type) ?? 0) + 1)
console.log('점수', st.teams[0].goals, ':', st.teams[1].goals, '틱', st.tick)
console.log('사건', [...ev.entries()].map(([k, v]) => `${k}×${v}`).join(' '))
console.log('단계 틱', [...phase.entries()].map(([k, v]) => `${k}×${v}`).join(' '))
console.log('공 위치 1/3', zone.map((v) => ((v / st.tick) * 100).toFixed(0) + '%').join(' / '), '· 루즈볼', ((loose / st.tick) * 100).toFixed(0) + '%', '· 파이널서드 소유', ((final3 / st.tick) * 100).toFixed(0) + '%')
console.log('통계', JSON.stringify(st.stats))
