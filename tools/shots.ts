// 슛 → 골 전환율 계측 (사용자 제보 2026-09-11 — "유효슛 16개에 골 0, 골키퍼가 다 막았다").
//
//   npm run shots            (자리별 150번)
//   npm run shots -- 300
//
// 22명을 치우고 슈터 하나와 상대 골키퍼만 세운다. 사람이 차듯 `aimSide = null`(자동 보조 — 골키퍼가 비운 코너)로
// 거리·각도·힘·결정력·달리기 여부를 바꿔 가며 찬다. 유효슛 가운데 골·잡힘·쳐냄·골대·그 밖을 센다.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { doShoot } from '../src/core/ball'
import { ACT_RUN, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const N = Number(process.argv[2] ?? 150)

function match(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

function setup(st: GameState, d: number, lat: number, fin: number, running: boolean): number {
  const t = st.teams[0]
  const gk = st.players[st.teams[1].gk]
  const shooter = st.players.find((p) => p.team === 0 && p.idx !== t.gk)!
  for (const p of st.players) {
    if (p.idx === gk.idx || p.idx === shooter.idx) continue
    p.x = -t.dir * 40
    p.y = 10 + p.idx * 0.8
  }
  gk.x = t.dir * (HALF_L - 1.0)
  gk.y = 0
  gk.vx = 0
  gk.vy = 0
  gk.action = ACT_RUN
  gk.actT = 0
  gk.holdT = 0
  shooter.x = t.dir * (HALF_L - d)
  shooter.y = lat
  const sp = running ? shooter.sk.vmax * 0.95 : 0
  const l = Math.hypot(d, lat) || 1
  shooter.vx = (t.dir * d / l) * sp
  shooter.vy = (-lat / l) * sp
  shooter.action = ACT_RUN
  shooter.gotT = st.tick - 60
  shooter.stamina = 1
  shooter.sk.fin = fin
  shooter.sk.sho = fin
  const b = st.ball
  b.owner = shooter.idx
  b.x = shooter.x
  b.y = shooter.y
  b.z = 0
  b.vx = 0
  b.vy = 0
  b.vz = 0
  return shooter.idx
}

type Out = 'goal' | 'held' | 'parry' | 'post' | 'off' | 'other'

function shoot(seed: number, d: number, lat: number, fin: number, running: boolean, power: number): { out: Out; onT: boolean } {
  const st = match(seed)
  const shooter = setup(st, d, lat, fin, running)
  const goals = st.teams[0].goals
  const gkIdx = st.teams[1].gk
  const ev0 = st.events.length
  doShoot(st, st.players[shooter], st.teams[0].dir, 0, power, false, null)
  const onT = st.ball.onTarget
  if (!onT) return { out: 'off', onT }
  for (let i = 0; i < 120; i++) {
    step(st, idle)
    if (st.teams[0].goals > goals) return { out: 'goal', onT }
    if (st.ball.owner === gkIdx) return { out: 'held', onT }
    for (let k = ev0; k < st.events.length; k++) {
      const e = st.events[k]
      if (e.type === 'save' && st.ball.owner !== gkIdx) return { out: 'parry', onT }
      if (e.type === 'post') return { out: 'post', onT }
    }
    if (st.phase !== 'play' && st.phase !== 'goal') return { out: 'other', onT }
  }
  return { out: 'other', onT }
}

interface Row { label: string; n: number; onT: number; goal: number; held: number; parry: number; post: number; other: number }

function run(label: string, d: number, lat: number, fin: number, running: boolean, power: number): Row {
  const r: Row = { label, n: 0, onT: 0, goal: 0, held: 0, parry: 0, post: 0, other: 0 }
  for (let s = 0; s < N; s++) {
    const o = shoot(5000 + s * 7, d, lat, fin, running, power)
    r.n++
    if (o.out === 'off') continue
    r.onT++
    r[o.out]++
  }
  return r
}

const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : '—')
const rows: Row[] = []
console.log(`슛 전환율 — 자리별 ${N}번 · 골키퍼는 골문 가운데 서 있다 · 사람 슛(자동 보조)`)
console.log('')
for (const [d, lat] of [[8, 0], [12, 0], [16, 0], [20, 0], [25, 0], [12, 8], [16, 10]] as [number, number][]) {
  for (const fin of [0.5, 0.75]) {
    for (const [running, power] of [[false, 0.8], [true, 0.8], [false, 0.4]] as [boolean, number][]) {
      rows.push(run(`${String(d).padStart(2)} m · 옆 ${String(lat).padStart(2)} · 결정력 ${fin} · ${running ? '달리며' : '서서  '} · 힘 ${power}`, d, lat, fin, running, power))
    }
  }
}
console.log('자리                                              유효    골(유효 중)  잡힘   쳐냄   골대   그 밖')
for (const r of rows) {
  console.log(
    `${r.label}   ${pct(r.onT, r.n).padStart(4)}   ${pct(r.goal, r.onT).padStart(5)}        ${pct(r.held, r.onT).padStart(4)}   ${pct(r.parry, r.onT).padStart(4)}   ${pct(r.post, r.onT).padStart(4)}   ${pct(r.other, r.onT).padStart(4)}`,
  )
}
const tot = rows.reduce((a, r) => ({ onT: a.onT + r.onT, goal: a.goal + r.goal, held: a.held + r.held, parry: a.parry + r.parry }), { onT: 0, goal: 0, held: 0, parry: 0 })
console.log('')
console.log(`전체 — 유효슛 ${tot.onT} · 골 ${pct(tot.goal, tot.onT)} · 잡힘 ${pct(tot.held, tot.onT)} · 쳐냄 ${pct(tot.parry, tot.onT)}`)
