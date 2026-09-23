// 페이크 시범 변형 비교 — 슛 조준(my)·파워(모으는 틱)마다 성공 수 (32차 진단용)
import { EMPTY_INPUT, BTN_C, BTN_D, BTN_E, BTN_Z, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'
import { clubSquad, toSquadConfig } from '../src/cards/squad'
import { CLUBS } from '../src/data/pool'
import { drillById, judge, startDrill } from '../src/game/drills'

const I = (b: number, mx = 0, my = 0): Input => ({ mx, my, buttons: b, a: 0, b: 0 })
function mk(kind: string, seed: number): GameState {
  if (kind === 'club') {
    const a = CLUBS[0]
    const b = CLUBS[1]
    return createState({ seed, halfSec: 36000, squads: [toSquadConfig(clubSquad(a.id, '4-3-3'), a.name, a.short), toSquadConfig(clubSquad(b.id, '4-4-2'), b.name, b.short)], human: [true, false] })
  }
  return createState({ seed, halfSec: 36000, squads: [synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 70 }), synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })], human: [true, false] })
}
const d = drillById('fake')!
for (const kind of ['club', 'synth']) {
  for (const my of [127, -127]) {
    for (const hold of [8, 14]) {
      for (const pass of [22, 16, 12]) {
        let ok = 0
        const why = new Map<string, number>()
        for (let s = 1; s <= 20; s++) {
          const st = mk(kind, s)
          const c = startDrill(d, st)
          const m: Record<string, number> = {}
          let r: true | string | null = null
          for (let k = 0; k < d.limit * 60 + 120 && r === null; k++) {
            let i: Input
            const me = st.players[c.me]
            const df = st.players[c.f.def]
            const dir = st.teams[0].dir
            if (m.f === undefined) {
              if (st.ball.owner === c.me && Math.hypot(me.x - df.x, me.y - df.y) < 4.2) m.f = k
              i = I(0, 127, 0)
            }
            if (m.f !== undefined) {
              const j = k - m.f
              if (j === 0) i = I(BTN_Z | BTN_C, 127, 0)
              else if (j === 1) i = I(BTN_Z | BTN_C | BTN_D, 127, 0)
              else if (j === 2) i = I(BTN_Z | BTN_C, 127, 0)
              else {
                const passed = (me.x - df.x) * dir > 0.8
                if (m.p === undefined && passed && Math.abs(me.x - dir * 52.5) < pass) m.p = k
                if (m.p === undefined && j > 120) m.p = k
                if (m.p === undefined) i = passed ? I(BTN_E, 127, 0) : I(BTN_E, 127, 127)
                else i = k - m.p < hold ? I(BTN_D, 127, my) : I(0)
              }
            } else i = I(0, 127, 0)
            step(st, [i!, EMPTY_INPUT])
            r = judge(d, st, c, i!)
          }
          if (r === true) ok++
          else why.set(String(r), (why.get(String(r)) ?? 0) + 1)
        }
        console.log(`${kind} my ${my} hold ${hold} 슛거리 ${pass}: ${ok}/20 · ${[...why.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
      }
    }
  }
}
