// 스로인 뒤 공이 누구에게 가는가 (사용자 제보 2026-09-11 — "스로인 때 이유 없이 상대에게 넘어간다").
//   npm run throwin            (20판)
// 스로인을 던진 순간부터 5초 안에 처음 공을 잡은 팀과, 그 전에 난 판정(두 번 터치·아웃 등)을 센다.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const n = Number(process.argv[2] ?? 20)

const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

const out: Record<string, number> = {}
const bump = (k: string): void => { out[k] = (out[k] ?? 0) + 1 }
let total = 0
for (let i = 0; i < n; i++) {
  const st = createState({ seed: 7000 + i, halfSec: 180, squads: [home, away] })
  while (!st.done) {
    if (st.phase === 'throwin' && st.restart) {
      const team = st.restart.team
      const kicker = st.restart.kicker
      // 던질 때까지
      while (!st.done && st.phase === 'throwin') step(st, idle)
      if (st.done) break
      total++
      const ev0 = st.events.length
      let res = ''
      for (let t = 0; t < 300 && !res; t++) {
        step(st, idle)
        for (let k = ev0; k < st.events.length; k++) {
          const e = st.events[k]
          if (e.type === 'freekick') { res = st.callText.includes('두 번') ? (e.team === team ? '우리 프리킥(상대 두 번 터치?)' : '상대 프리킥 — 두 번 터치') : e.team === team ? '우리 프리킥' : '상대 프리킥(파울·오프사이드)'; break }
          if (e.type === 'throwin') { res = e.team === team ? '다시 우리 스로인' : '바로 나감 — 상대 스로인'; break }
          if (e.type === 'goalkick' || e.type === 'corner') { res = `${e.type} ${e.team === team ? '우리' : '상대'}`; break }
          if (e.type === 'goal') { res = '골'; break }
        }
        if (res) break
        const o = st.ball.owner
        if (o >= 0) {
          const p = st.players[o]
          if (p.idx === kicker) res = '던진 사람이 다시 잡음'
          else if (p.team === team) res = p.sk.isGK ? '우리 GK 가 잡음' : '아군이 받음'
          else res = p.sk.isGK ? '상대 GK 가 잡음' : `상대가 가로챔 (${t < 40 ? '공중·헤딩' : '땅'})`
        }
      }
      bump(res || '5초 안에 아무도 못 잡음')
    } else step(st, idle)
  }
}
console.log(`판 ${n} · 스로인 ${total}번`)
for (const [k, v] of Object.entries(out).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${String(v).padStart(4)}  ${Math.round((100 * v) / total)}%`)
