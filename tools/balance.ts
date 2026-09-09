// 봇 vs 봇 대량 계측 (DESIGN 12장). `npx vite-node tools/balance.ts [판수] [하프초]`
// 골 분포 · 슛 · 유효슛 · 점유율 · 패스 성공률 · 태클 · 틱당 시간을 찍는다.
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const n = Number(process.argv[2] ?? 50)
const halfSec = Number(process.argv[3] ?? 180)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

const dist = new Map<number, number>()
let hw = 0
let aw = 0
let dr = 0
let goals = 0
let shots = 0
let onT = 0
let passes = 0
let passOk = 0
let tackles = 0
let possA = 0
let possB = 0
let ticks = 0
let big = 0
let nil = 0
let fouls = 0
let yellows = 0
let reds = 0
let offs = 0
let corners = 0
let saves = 0
const t0 = performance.now()
for (let i = 0; i < n; i++) {
  const st = createState({ seed: 1000 + i, halfSec, squads: [home, away] })
  while (!st.done) step(st, idle)
  const g = st.teams[0].goals + st.teams[1].goals
  dist.set(g, (dist.get(g) ?? 0) + 1)
  goals += g
  if (st.teams[0].goals > st.teams[1].goals) hw++
  else if (st.teams[0].goals < st.teams[1].goals) aw++
  else dr++
  if (g === 0) nil++
  if (st.teams[0].goals >= 5 || st.teams[1].goals >= 5) big++
  for (let t = 0; t < 2; t++) {
    shots += st.stats[t].shots
    onT += st.stats[t].onTarget
    passes += st.stats[t].passes
    passOk += st.stats[t].passOk
    tackles += st.stats[t].tackles
    fouls += st.stats[t].fouls
    yellows += st.stats[t].yellows
    reds += st.stats[t].reds
    offs += st.stats[t].offsides
    corners += st.stats[t].corners
    saves += st.stats[t].saves
  }
  possA += st.stats[0].poss
  possB += st.stats[1].poss
  ticks += st.tick
}
const ms = performance.now() - t0
console.log(`판 ${n} · 하프 ${halfSec}s · 틱당 ${(ms / ticks).toFixed(4)} ms`)
console.log(`평균 골 ${(goals / n).toFixed(2)} · 0:0 ${((nil / n) * 100).toFixed(0)}% · 5골+ ${((big / n) * 100).toFixed(0)}%`)
console.log(`홈 승 ${hw} · 무 ${dr} · 원정 승 ${aw}`)
console.log(`판당 슛 ${(shots / n).toFixed(1)} · 유효 ${(onT / n).toFixed(1)} · 패스 ${(passes / n).toFixed(0)} (성공 ${((passOk / Math.max(1, passes)) * 100).toFixed(0)}%) · 태클 ${(tackles / n).toFixed(1)}`)
console.log(`판당 파울 ${(fouls / n).toFixed(1)} · 경고 ${(yellows / n).toFixed(2)} · 퇴장 ${(reds / n).toFixed(2)} · 오프사이드 ${(offs / n).toFixed(1)} · 코너 ${(corners / n).toFixed(1)} · 선방 ${(saves / n).toFixed(1)}`)
console.log(`점유 홈 ${((possA / (possA + possB)) * 100).toFixed(0)}%`)
console.log('골 분포', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([g, c]) => `${g}골×${c}`).join(' '))
