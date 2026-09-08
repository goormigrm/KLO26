// 테스트 공용 — 합성 스쿼드로 한 경기를 만들고 끝까지 돌린다.
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, hashState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState } from '../src/core/state'

export const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

export function makeMatch(seed: number, halfSec = 180): GameState {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  return createState({ seed, halfSec, squads: [home, away] })
}

export function runFull(seed: number, halfSec = 180): { hashes: number[]; st: GameState } {
  const st = makeMatch(seed, halfSec)
  const hashes: number[] = []
  let guard = 0
  while (!st.done && guard < 400000) {
    step(st, idle)
    if (st.tick % 60 === 0) hashes.push(hashState(st))
    guard++
  }
  return { hashes, st }
}
