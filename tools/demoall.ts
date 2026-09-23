// 모든 연습의 시범 성공 수 — 테스트와 같은 시드(1000~1039)·같은 두 스쿼드 (32차: 엔진을 바꾸면 시범이 깨지는지 한 번에 본다)
//   npx vite-node tools/demoall.ts [id,id,...]
import { EMPTY_INPUT } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'
import { clubSquad, toSquadConfig } from '../src/cards/squad'
import { CLUBS } from '../src/data/pool'
import { DRILLS, judge, startDrill } from '../src/game/drills'
import { demoInput } from '../src/game/demos'

function synthState(seed: number): GameState {
  return createState({ seed, halfSec: 36000, squads: [synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 70 }), synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })], human: [true, false] })
}
function clubState(seed: number): GameState {
  const a = CLUBS[0]
  const b = CLUBS[1]
  return createState({ seed, halfSec: 36000, squads: [toSquadConfig(clubSquad(a.id, '4-3-3'), a.name, a.short), toSquadConfig(clubSquad(b.id, '4-4-2'), b.name, b.short)], human: [true, false] })
}
const only = process.argv[2] ? process.argv[2].split(',') : null
const rows: string[] = []
for (const d of DRILLS) {
  if (only && !only.includes(d.id)) continue
  const out: string[] = []
  for (const [name, mk] of [['합성', synthState], ['구단', clubState]] as const) {
    let ok = 0
    const why = new Map<string, number>()
    for (let s = 1000; s < 1040; s++) {
      const st = mk(s)
      const c = startDrill(d, st)
      const m: Record<string, number> = {}
      let r: true | string | null = null
      for (let k = 0; k < d.limit * 60 + 120 && r === null; k++) {
        const i = demoInput(d, k, st, c, m)
        step(st, [i, EMPTY_INPUT])
        r = judge(d, st, c, i)
      }
      if (r === true) ok++
      else why.set(String(r).slice(0, 18), (why.get(String(r).slice(0, 18)) ?? 0) + 1)
    }
    const top = [...why.entries()].sort((a, b) => b[1] - a[1])[0]
    out.push(`${name} ${String(ok).padStart(2)}/40${ok === 0 && top ? ` (${top[0]} ${top[1]})` : ''}`)
  }
  rows.push(`${d.id.padEnd(10)} ${out.join(' · ')}`)
}
console.log(rows.join('\n'))
