// 크로서가 왜 안 기다리나 — 깊은 사이드 소유 틱마다 조건별로 센다 (32차 진단)
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { goalX } from '../src/core/state'
import { nearestOppDist } from '../src/core/ball'

const N = Number(process.argv[2] ?? 12)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
const c = { ticks: 0, pressed: 0, noComing: 0, full: 0, timeout: 0, wait: 0, episodes: 0, epLen: [] as number[], endBy: new Map<string, number>() }
for (let m = 0; m < N; m++) {
  const st = createState({ seed: 3000 + m, halfSec: 180, squads: [home, away] })
  let ep = -1
  let epOwner = -1
  while (!st.done) {
    step(st, idle)
    const b = st.ball
    const o = b.owner >= 0 ? st.players[b.owner] : null
    const team = o ? st.teams[o.team] : null
    const deep = !!o && !o.sk.isGK && st.phase === 'play' && Math.abs(o.y) > 16 && o.x * team!.dir > 33
    if (deep) {
      if (ep < 0 || epOwner !== o!.idx) {
        ep = st.tick
        epOwner = o!.idx
        c.episodes++
      }
      c.ticks++
      const gx = goalX(team!)
      let inBox = 0
      let coming = 0
      for (const q of st.players) {
        if (q.team !== o!.team || q.idx === o!.idx || q.sk.isGK || q.sentOff) continue
        const dq = Math.hypot(q.x - gx, q.y)
        if (dq < 16 && Math.abs(q.y) < 12) inBox++
        else if (st.tick - q.runT < 20 && dq < 34) coming++
      }
      const opD = nearestOppDist(st, o!)
      if (opD <= 2.8) c.pressed++
      else if (inBox >= 2) c.full++
      else if (coming === 0) c.noComing++
      else if (st.tick - o!.crossT >= 72) c.timeout++
      else c.wait++
    } else if (ep >= 0) {
      c.epLen.push(st.tick - ep)
      const why = st.phase !== 'play' ? `국면 ${st.phase}` : b.owner < 0 ? `자유 공(${b.passKind || '-'} · lastTeam ${b.lastTeam === st.players[epOwner].team ? '우리' : '상대'})` : st.players[b.owner].team === st.players[epOwner].team ? '동료가 가짐(밖)' : '상대가 가짐'
      c.endBy.set(why, (c.endBy.get(why) ?? 0) + 1)
      ep = -1
      epOwner = -1
    }
  }
}
c.epLen.sort((a, b) => a - b)
console.log(`깊은 사이드 소유: ${c.episodes}번 · ${c.ticks}틱 (중앙값 ${c.epLen[Math.floor(c.epLen.length / 2)] ?? 0}틱)`)
console.log(`  압박받음 ${c.pressed} · 박스에 이미 2명+ ${c.full} · 뛰는 동료 없음 ${c.noComing} · 1.2초 넘음 ${c.timeout} · 기다림 ${c.wait}`)
console.log(`  끝난 이유: ${[...c.endBy.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
