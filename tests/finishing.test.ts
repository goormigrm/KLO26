// 결정력 vs 골키퍼 · 전력 질주 중 슛 (사용자 지적 2026-09-11).
//
// "슈팅 능력이 높으면 골키퍼가 잡거나 쳐내지 못할 확률이 올라야 하고, 빠르게 드리블하다 찬 슛은
//  자세가 불안해 슈팅 능력이 떨어져야 한다" — 같은 자리(16 m, 코너 조준)에서 같은 골키퍼를 상대로
//  많이 차서 확률로 본다. 골키퍼 코앞으로 차는 슛은 누가 차도 막히므로 코너를 겨눈다.

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { doShoot } from '../src/core/ball'
import { ACT_RUN, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed: number): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 180, squads: [home, away] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  return st
}

/** 22명을 치우고 슈터 하나(팀 0)와 상대 골키퍼만 세운다 — 슈터 16 m · GK 골문 가운데 */
function setup(st: GameState, fin: number, running: boolean): number {
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
  shooter.x = t.dir * (HALF_L - 16)
  shooter.y = 0.5
  shooter.vx = running ? t.dir * shooter.sk.vmax * 0.95 : 0
  shooter.vy = 0
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

type Out = 'goal' | 'held' | 'other'

/** 코너(aimSide = +1)를 노려 한 번 차고 결말이 날 때까지 굴린다 */
function shoot(seed: number, fin: number, running: boolean): Out {
  const st = match(seed)
  const shooter = setup(st, fin, running)
  const goals = st.teams[0].goals
  doShoot(st, st.players[shooter], st.teams[0].dir, 0, 0.8, false, 1)
  for (let i = 0; i < 90; i++) {
    step(st, idle)
    if (st.teams[0].goals > goals) return 'goal'
    if (st.ball.owner === st.teams[1].gk) return 'held'
    if (st.phase !== 'play' && st.phase !== 'goal') return 'other'
  }
  return 'other'
}

function tally(fin: number, running: boolean, n = 200): { goal: number; held: number } {
  let goal = 0
  let held = 0
  for (let s = 0; s < n; s++) {
    const r = shoot(3000 + s * 3, fin, running)
    if (r === 'goal') goal++
    else if (r === 'held') held++
  }
  return { goal, held }
}

describe('결정력과 골키퍼 · 전력 질주 중 슛', () => {
  it('결정력이 높은 슛은 골이 더 많고, 골키퍼가 손에 넣는 일이 더 적다', () => {
    const lo = tally(0.38, false)
    const hi = tally(0.92, false)
    expect(hi.goal).toBeGreaterThan(lo.goal * 1.2)
    expect(hi.held).toBeLessThan(lo.held)
  })

  it('전력으로 달리던 중의 슛은 서서 찬 슛보다 덜 들어간다 (불안한 자세)', () => {
    const still = tally(0.7, false)
    const run = tally(0.7, true)
    expect(run.goal).toBeLessThan(still.goal * 0.85)
  })
})
