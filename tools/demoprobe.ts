// 조작 연습 시범 진단 — 한 연습의 시범을 시드마다 돌려 결과(판정 문구)와 끝났을 때 공·선수 자리를 찍는다 (32차 2026-09-23).
//   npx vite-node tools/demoprobe.ts [연습 id] [club|synth] [시드 수]
import { EMPTY_INPUT } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'
import { clubSquad, toSquadConfig } from '../src/cards/squad'
import { CLUBS } from '../src/data/pool'
import { drillById, judge, startDrill } from '../src/game/drills'
import { demoInput } from '../src/game/demos'

const id = process.argv[2] ?? 'fake'
const kind = process.argv[3] ?? 'club'
const n = Number(process.argv[4] ?? 12)

function synthState(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 70 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec: 36000, squads: [home, away], human: [true, false] })
}
function clubState(seed: number): GameState {
  const a = CLUBS[0]
  const b = CLUBS[1]
  return createState({
    seed,
    halfSec: 36000,
    squads: [toSquadConfig(clubSquad(a.id, '4-3-3'), a.name, a.short), toSquadConfig(clubSquad(b.id, '4-4-2'), b.name, b.short)],
    human: [true, false],
  })
}

const d = drillById(id)!
let ok = 0
for (let s = 1; s <= n; s++) {
  const st = kind === 'club' ? clubState(s) : synthState(s)
  const c = startDrill(d, st)
  const m: Record<string, number> = {}
  let r: true | string | null = null
  let k = 0
  const trace: string[] = []
  for (; k < d.limit * 60 + 120 && r === null; k++) {
    const i = demoInput(d, k, st, c, m)
    step(st, [i, EMPTY_INPUT])
    r = judge(d, st, c, i)
    if (k % 15 === 0 && k < 150) {
      const me = st.players[c.me]
      const df = c.f.def !== undefined ? st.players[c.f.def] : null
      trace.push(`k${k} me(${me.x.toFixed(1)},${me.y.toFixed(1)}) own${st.ball.owner} ball(${st.ball.x.toFixed(1)},${st.ball.y.toFixed(1)}) ${df ? `def(${df.x.toFixed(1)},${df.y.toFixed(1)}) bit${df.bitT > st.tick ? 1 : 0}` : ''}`)
    }
  }
  if (r === true) ok++
  console.log(`시드 ${s}: ${r === true ? '성공' : r} (k ${k}) · fake ${m.f ?? '-'}`)
  if (r !== true && s <= 3) console.log('   ' + trace.join('\n   '))
}
console.log(`${id} ${kind}: ${ok}/${n}`)
