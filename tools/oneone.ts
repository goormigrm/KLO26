// 1대1 계측 — 공격수가 골키퍼와 단둘이 남았을 때 얼마나 들어가나. `npx vite-node tools/oneone.ts [횟수] [거리]`
// 사용자 제보(2026-09-09): "1:1 골키퍼와 공격수 싸움인데도 안 들어가는건 비현실적".
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { doShoot } from '../src/core/ball'
import { HALF_L, HALF_W } from '../src/core/state'

const n = Number(process.argv[2] ?? 400)
const shotDist = Number(process.argv[3] ?? 14)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

let goals = 0
let saved = 0
let wide = 0
for (let i = 0; i < n; i++) {
  const st = createState({ seed: 7000 + i, halfSec: 60, squads: [home, away] })
  st.phase = 'play'
  st.restart = null
  const dir = st.teams[0].dir
  const gx = dir * HALF_L
  // 공격수만 남기고 나머지는 멀리 (오프사이드·간섭 없음)
  const striker = st.players.find((p) => p.team === 0 && p.band === 'FW')!
  for (const p of st.players) {
    if (p.idx === striker.idx) continue
    if (p.sk.isGK && p.team === 1) continue
    p.x = -dir * (HALF_L - 4)
    p.y = (p.idx % 2 ? 1 : -1) * (HALF_W - 4)
    p.sentOff = false
  }
  striker.x = gx - dir * shotDist
  striker.y = ((i % 5) - 2) * 2.2
  striker.facing = dir > 0 ? 0 : 512
  striker.stamina = 1
  const gk = st.players[st.teams[1].gk]
  gk.x = gx - dir * 3
  gk.y = 0
  st.ball.owner = striker.idx
  st.ball.x = striker.x
  st.ball.y = striker.y
  st.ball.z = 0
  st.ball.lastTouch = striker.idx
  st.ball.lastTeam = 0
  // 사람이 방향키를 골문 쪽으로만 밀고 D 를 찬 것과 같다 (옆으로 안 민다)
  doShoot(st, striker, dir, 0, 0.75, false, null)
  const g0 = st.teams[0].goals
  let guard = 0
  while (st.phase === 'play' && guard < 240) {
    step(st, idle)
    guard++
  }
  if (st.teams[0].goals > g0) goals++
  else if (st.stats[1].saves > 0) saved++
  else wide++
}
console.log(`1대1 ${n}회 · 거리 ${shotDist} m · 방향키는 골문 쪽으로만`)
console.log(`골 ${((goals / n) * 100).toFixed(1)}% · 선방 ${((saved / n) * 100).toFixed(1)}% · 빗나감·기타 ${((wide / n) * 100).toFixed(1)}%`)
