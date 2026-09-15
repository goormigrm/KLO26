// 크로스 상황 진단 — 홈(사람, 입력 없음 = 서서 공을 든다)이 사이드 깊숙이 공을 가졌을 때 3 초 동안 동료들이 박스로 오는가
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { HALF_L, goalX } from '../src/core/state'
import { offsideLineX } from '../src/core/ball'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const st = createState({ seed: 5, halfSec: 180, squads: [home, away], human: [true, false] })
let guard = 0
while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
// 흐름을 30 초 돌려 자연스러운 자리로
for (let i = 0; i < 1800; i++) step(st, idle)
const t = st.teams[0]
const dir = t.dir
const gx = goalX(t)
const o = st.players[10] // RW
o.x = dir * 40
o.y = 22
o.vx = 0
o.vy = 0
st.ball.owner = o.idx
st.ball.x = o.x
st.ball.y = o.y
st.ball.z = 0
t.controlled = o.idx
const dist = (a: { x: number; y: number }, x: number, y: number): number => Math.hypot(a.x - x, a.y - y)
const report = (label: string): void => {
  const mates = st.players.filter((p) => p.team === 0 && p.idx !== o.idx && !p.sk.isGK).map((p) => ({ p, d: dist(p, gx, 0) })).sort((a, b) => a.d - b.d)
  const line = Math.abs(offsideLineX(st, 0) - gx)
  const inBox = mates.filter((m) => m.d < 22 && Math.abs(m.p.y) < 14).length
  console.log(`${label}: 박스 안 ${inBox} · 오프사이드 라인 골문에서 ${line.toFixed(1)} m · 동료 거리 ${mates.slice(0, 5).map((m) => `${m.p.slot}${m.d.toFixed(0)}${st.tick - m.p.runT < 20 ? '*' : ''}(tx${Math.abs(m.p.tx - gx).toFixed(0)})`).join(' ')}`)
}
report('t0')
for (let s = 1; s <= 4; s++) {
  for (let i = 0; i < 60; i++) {
    // 소유자는 제자리 (사람 입력 없음)
    step(st, idle)
    if (st.ball.owner !== o.idx) {
      console.log(`  공을 잃음 t+${s}s tick ${i} → owner ${st.ball.owner} phase ${st.phase}`)
      break
    }
  }
  report(`t+${s}s`)
  if (st.ball.owner !== o.idx) break
}
