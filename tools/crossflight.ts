// 크로스가 날아가는 동안 공격 팀이 무엇을 하나 (32차 진단) — 크로스마다 30틱 뒤: 박스로 뛰는(runT 방금) 선수 · 공 쫓는 선수 · 오프사이드 물러남 · 박스 안
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { goalX } from '../src/core/state'

const N = Number(process.argv[2] ?? 12)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const tot = { n: 0, running: 0, chasing: 0, offside: 0, inBox: 0, near45: 0, airT: 0, lines: [] as string[] }
for (let m = 0; m < N; m++) {
  const st = createState({ seed: 3000 + m, halfSec: 180, squads: [home, away] })
  let pend: { t: number; team: number; gx: number } | null = null
  let live = false
  while (!st.done) {
    step(st, idle)
    const b = st.ball
    if (!live && b.passLive && b.passTo >= 0) {
      live = true
      const k = b.passKind
      if ((k === 'highcross' || k === 'lob' || k === 'lowcross') && Math.abs(b.y) > 14) {
        const team = st.players[b.lastTouch].team
        const gx = goalX(st.teams[team])
        if (Math.abs(b.x - gx) < 40) pend = { t: st.tick, team, gx }
      }
    } else if (live && (!b.passLive || b.owner >= 0)) {
      live = false
      if (pend) tot.airT += st.tick - pend.t
    }
    if (pend && st.tick - pend.t === 30) {
      tot.n++
      const row: string[] = []
      for (const q of st.players) {
        if (q.team !== pend.team || q.sk.isGK || q.sentOff) continue
        const dq = Math.hypot(q.x - pend.gx, q.y)
        if (st.tick - q.runT <= 15) tot.running++
        if (q.press) tot.chasing++
        if (q.offside) tot.offside++
        if (Math.abs(q.x - pend.gx) < 16 && Math.abs(q.y) < 12) tot.inBox++
        if (dq < 45) tot.near45++
        if (dq < 35) row.push(`${q.slot}${dq.toFixed(0)}${st.tick - q.runT <= 15 ? '*' : ''}${q.press ? 'p' : ''}${q.offside ? 'o' : ''}(box${q.rt.box})`)
      }
      if (tot.lines.length < 8) tot.lines.push(`live ${b.passLive ? 1 : 0} kind ${b.passKind} · ${row.join(' ')}`)
      pend = null
    }
  }
}
console.log(`크로스 ${tot.n} · 30틱 뒤 평균: 박스로 뛰는 중 ${(tot.running / tot.n).toFixed(2)} · 공 쫓는 중 ${(tot.chasing / tot.n).toFixed(2)} · 오프사이드 ${(tot.offside / tot.n).toFixed(2)} · 박스 안 ${(tot.inBox / tot.n).toFixed(2)} · 골문 45 m 안 ${(tot.near45 / tot.n).toFixed(2)}`)
console.log(tot.lines.join('\n'))
