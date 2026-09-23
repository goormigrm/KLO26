// 시범 한 판을 틱 단위로 — 공·수비수 거리·터치 상태 (32차 진단용)
import { EMPTY_INPUT } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { clubSquad, toSquadConfig } from '../src/cards/squad'
import { CLUBS } from '../src/data/pool'
import { drillById, judge, startDrill } from '../src/game/drills'
import { demoInput } from '../src/game/demos'
import { feetX, feetY } from '../src/core/physics'

const id = process.argv[2] ?? 'fake'
const seed = Number(process.argv[3] ?? 1)
const from = Number(process.argv[4] ?? 60)
const to = Number(process.argv[5] ?? 80)
const a = CLUBS[0]
const b = CLUBS[1]
const st = createState({ seed, halfSec: 36000, squads: [toSquadConfig(clubSquad(a.id, '4-3-3'), a.name, a.short), toSquadConfig(clubSquad(b.id, '4-4-2'), b.name, b.short)], human: [true, false] })
const d = drillById(id)!
const c = startDrill(d, st)
const m: Record<string, number> = {}
for (let k = 0; k <= to; k++) {
  const i = demoInput(d, k, st, c, m)
  step(st, [i, EMPTY_INPUT])
  const r = judge(d, st, c, i)
  if (k >= from) {
    const me = st.players[c.me]
    const df = st.players[c.f.def]
    const bl = st.ball
    const dd = Math.hypot(feetX(df, 0.3) - bl.x, feetY(df, 0.3) - bl.y)
    const t = me as unknown as { touchT?: number; touchLen?: number; touchI?: number }
    console.log(`k${k} own${bl.owner} me(${me.x.toFixed(2)},${me.y.toFixed(2)}) v${Math.hypot(me.vx, me.vy).toFixed(1)} ball(${bl.x.toFixed(2)},${bl.y.toFixed(2)}) def(${df.x.toFixed(2)},${df.y.toFixed(2)}) press${df.press ? 1 : 0} bit${df.bitT > st.tick ? 1 : 0} act${df.action} dFeetBall ${dd.toFixed(2)} touch ${t.touchT !== undefined ? `${st.tick - t.touchT}/${t.touchI} len ${t.touchLen?.toFixed(2)}` : '-'} ${r ?? ''}`)
  }
  if (r !== null) break
}
