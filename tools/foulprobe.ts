// 파울 폭주 진단 — 한 판을 돌리며 파울 사건마다 가해자·위치·직전 소유자(골키퍼 보유?)를 찍는다 (2026-09-15 재검증: 시드 3004 가 78회)
//   npx vite-node tools/foulprobe.ts [시드] [하프초]
// st.pending 은 같은 틱 안에서 rules 가 소비하므로 **events 의 증가**로 잡는다.
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'

const seed = Number(process.argv[2] ?? 3004)
const HALF = Number(process.argv[3] ?? 180)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const st = createState({ seed, halfSec: HALF, squads: [home, away] })
const byPlayer = new Map<string, number>()
const byPhase = new Map<string, number>()
let n = 0
let seen = 0
let gkVictim = 0
let lines = 0
let ghost = 0
let ghostLines = 0
while (!st.done) {
  const ownerBefore = st.ball.owner
  const victim = ownerBefore >= 0 ? st.players[ownerBefore] : null
  const holdBefore = victim ? victim.holdT : 0
  const vSpd = victim ? Math.hypot(victim.vx, victim.vy) : 0
  const phaseBefore = st.phase
  const statBefore = st.stats[0].fouls + st.stats[1].fouls
  const evBefore = st.events.length
  step(st, idle)
  const statNow = st.stats[0].fouls + st.stats[1].fouls
  const evFoul = st.events.slice(evBefore).filter((e) => e.type === 'foul').length
  if (statNow - statBefore > evFoul) {
    ghost++
    if (ghostLines++ < 20) {
      let near = 99
      let nearName = ''
      if (victim) for (const q of st.players) if (q.team !== victim.team && !q.sentOff) { const d = Math.hypot(q.x - victim.x, q.y - victim.y); if (d < near) { near = d; nearName = `${q.spec.name}(${q.slot}) press ${q.press} tackleT ${q.tackleT} act ${q.action}` } }
      console.log(`  [통계만 +${statNow - statBefore - evFoul}] t${st.tick} ${phaseBefore}→${st.phase} 소유자 ${victim ? `${victim.team}:${victim.spec.name}(${victim.slot})${victim.sk.isGK ? ' GK' : ''} hold ${holdBefore}` : '-'} · 가장 가까운 상대 ${nearName} ${near.toFixed(1)} m · pending ${st.pending ? st.pending.kind : '-'}`)
    }
  }
  for (; seen < st.events.length; seen++) {
    const e = st.events[seen]
    if (e.type !== 'foul') continue
    n++
    const by = st.players[e.player]
    const key = `${by.team}:${by.spec.name}(${by.slot})`
    byPlayer.set(key, (byPlayer.get(key) ?? 0) + 1)
    byPhase.set(phaseBefore, (byPhase.get(phaseBefore) ?? 0) + 1)
    if (victim && victim.sk.isGK) gkVictim++
    if (lines++ < 30) {
      console.log(
        `t${e.tick} ${phaseBefore} by ${key} at (${e.x.toFixed(0)},${e.y.toFixed(0)}) · 피해자 ${victim ? `${victim.team}:${victim.spec.name}(${victim.slot})${victim.sk.isGK ? ' GK' : ''} hold ${holdBefore} v${vSpd.toFixed(1)}` : '(자유 공)'}`,
      )
    }
  }
}
console.log(`통계 파울 ${st.stats[0].fouls + st.stats[1].fouls} · 사건 없이 오른 통계 ${ghost}`)
console.log(`시드 ${seed} · 파울 ${n} · 골키퍼가 피해자 ${gkVictim} · 국면 ${[...byPhase.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log('가해자:', [...byPlayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · '))
