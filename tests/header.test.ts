// 헤딩 (2026-09-15, 사용자 제보 "헤딩 골이 되나?") — 공중볼을 머리로 슛·패스·클리어.
import { describe, expect, it } from 'vitest'
import { BTN_D, BTN_S, EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { ACT_HEAD, HALF_L, type GameState } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

function match(seed: number, human: boolean): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const st = createState({ seed, halfSec: 120, squads: [home, away], human: [human, false], bots: [2, 2] })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, [human ? { ...EMPTY_INPUT, buttons: BTN_S } : EMPTY_INPUT, EMPTY_INPUT])
  step(st, idle)
  step(st, idle)
  return st
}

function park(st: GameState, keep: number[]): void {
  for (const p of st.players) {
    if (keep.includes(p.idx)) continue
    p.x = -45 + (p.idx % 11) * 0.6
    p.y = p.team === 0 ? -30 : 30
    p.vx = 0
    p.vy = 0
  }
}

/** 공격수 att 의 머리 높이로 떨어지는 크로스를 놓는다 (아군이 찬 공) */
function crossTo(st: GameState, att: { x: number; y: number; idx: number }, dir: number): void {
  const b = st.ball
  b.owner = -1
  b.x = att.x - dir * 3
  b.y = att.y
  b.z = 2.2
  b.vx = dir * 6
  b.vy = 0
  b.vz = 2
  b.lastTeam = 0
  b.lastTouch = st.teams[0].start + 3
  b.passTo = att.idx
  b.passLive = true
  b.shotBy = -1
  b.kickTick = st.tick - 20
}

describe('헤딩', () => {
  it('사람: 공중볼이 머리에 올 때 D 를 누르고 있으면 헤딩 슛 — 골문 쪽으로 내리꽂힌다', () => {
    let shots = 0
    for (let seed = 0; seed < 6; seed++) {
      const st = match(71 + seed, true)
      const t = st.teams[0]
      const dir = t.dir
      const att = st.players[t.start + 9]
      const gk = st.players[st.teams[1].gk]
      park(st, [att.idx, gk.idx])
      att.x = dir * (HALF_L - 9)
      att.y = 2
      att.vx = 0
      att.vy = 0
      gk.x = dir * (HALF_L - 1)
      gk.y = 0
      t.controlled = att.idx
      crossTo(st, att, dir)
      const ev0 = st.events.length
      let headed = false
      for (let i = 0; i < 60; i++) {
        step(st, [{ mx: 0, my: 0, buttons: BTN_D, a: 0, b: 0 }, EMPTY_INPUT])
        if (att.action === ACT_HEAD) headed = true
        const shot = st.events.slice(ev0).find((e) => e.type === 'shot' && e.player === att.idx)
        if (shot) {
          shots++
          expect(headed).toBe(true)
          break
        }
      }
    }
    // 헤더 능력치에 따라 헛헤딩도 있다 — 여섯 번 중 셋은 슛이 나야 한다
    expect(shots).toBeGreaterThanOrEqual(3)
  })

  it('AI: 박스 근처 공격수는 아군 크로스를 머리로 슛한다', () => {
    let shots = 0
    for (let seed = 0; seed < 8; seed++) {
      const st = match(81 + seed, false)
      const t = st.teams[0]
      const dir = t.dir
      const att = st.players[t.start + 9]
      const gk = st.players[st.teams[1].gk]
      park(st, [att.idx, gk.idx])
      att.x = dir * (HALF_L - 9)
      att.y = 2
      att.vx = 0
      att.vy = 0
      gk.x = dir * (HALF_L - 1)
      gk.y = 0
      crossTo(st, att, dir)
      const ev0 = st.events.length
      for (let i = 0; i < 60; i++) {
        step(st, idle)
        if (st.events.slice(ev0).some((e) => e.type === 'shot' && e.player === att.idx)) {
          shots++
          break
        }
      }
    }
    expect(shots).toBeGreaterThanOrEqual(3)
  })
})
