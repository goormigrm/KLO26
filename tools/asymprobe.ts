// 홈/원정 기울기 **원인 가르기** — asym.ts 와 같은 대칭 경기를 변형해서 돌린다 (2026-09-16, 0-e).
//   base     그대로 (팀 0 = 홈, +x 공격, 전반 킥오프)
//   swapdir  팀 0 이 −x 로 공격하며 시작 (진영만 뒤집음 — 좌표 편향이면 결과가 뒤집힌다)
//   ko1      팀 1 이 전반 킥오프 (킥오프 편향이면 결과가 뒤집힌다)
//   both     둘 다
// 팀 번호(처리 순서) 편향이면 네 변형 모두 팀 1 이 이긴다.
// `npx vite-node tools/asymprobe.ts [판수] [모드] [시드시작]`
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { setupKickoff } from '../src/core/rules'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { GameState, TeamStats } from '../src/core/state'

const N = Number(process.argv[2] ?? 100)
const MODE = process.argv[3] ?? 'base'
const SEED0 = Number(process.argv[4] ?? 7000)
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const sq = synthSquad(11, { name: '같음', short: '같음', formation: '4-3-3', quality: 66 })

type Acc = Record<string, [number, number]>
const KEYS = ['goals', 'shots', 'onTarget', 'passes', 'passOk', 'tackles', 'poss', 'corners', 'saves', 'fouls', 'offsides', 'blocks', 'posts'] as const
function mk(): Acc {
  const a: Acc = {}
  for (const k of KEYS) a[k] = [0, 0]
  return a
}
const H = [mk(), mk()] // 전반 · 후반
let hw = 0
let aw = 0
let dr = 0

function snap(st: GameState, blocks: number[], posts: number[]): Record<string, [number, number]> {
  const o: Record<string, [number, number]> = {}
  for (const k of KEYS) {
    if (k === 'goals') o[k] = [st.teams[0].goals, st.teams[1].goals]
    else if (k === 'blocks') o[k] = [blocks[0], blocks[1]]
    else if (k === 'posts') o[k] = [posts[0], posts[1]]
    else o[k] = [st.stats[0][k as keyof TeamStats] as number, st.stats[1][k as keyof TeamStats] as number]
  }
  return o
}

for (let i = 0; i < N; i++) {
  const st = createState({ seed: SEED0 + i, halfSec: 180, squads: [sq, { ...sq, name: '같음2', short: '같2' }] })
  if (MODE === 'swapdir' || MODE === 'both') {
    st.teams[0].dir = -1
    st.teams[1].dir = 1
  }
  if (MODE === 'ko1' || MODE === 'both') {
    setupKickoff(st, 1)
    st.firstKickoff = 1
  } else if (MODE === 'swapdir') setupKickoff(st, 0)
  const blocks = [0, 0]
  const posts = [0, 0]
  let seenEv = 0
  let s1: Record<string, [number, number]> | null = null
  while (!st.done) {
    step(st, idle)
    for (; seenEv < st.events.length; seenEv++) {
      const e = st.events[seenEv]
      if (e.type === 'half') s1 = snap(st, blocks, posts)
      if (e.type === 'block') blocks[e.team]++
      if (e.type === 'post' && e.team >= 0) posts[e.team]++
    }
  }
  const s2 = snap(st, blocks, posts)
  for (const k of KEYS) {
    for (let t = 0; t < 2; t++) {
      const a = s1 ? s1[k][t] : 0
      H[0][k][t] += a
      H[1][k][t] += s2[k][t] - a
    }
  }
  if (st.teams[0].goals > st.teams[1].goals) hw++
  else if (st.teams[0].goals < st.teams[1].goals) aw++
  else dr++
}
console.log(`[${MODE}] 판 ${N} (시드 ${SEED0}~) · 팀0 ${hw}승 ${dr}무 ${aw}패 (${((hw / (hw + aw)) * 100).toFixed(1)}%)`)
const line = (k: string): string => {
  const a = H[0][k]
  const b = H[1][k]
  if (k === 'poss') {
    const p1 = (a[0] / (a[0] + a[1])) * 100
    const p2 = (b[0] / (b[0] + b[1])) * 100
    return `${k.padEnd(9)} 전반 팀0 ${p1.toFixed(1)}% | 후반 팀0 ${p2.toFixed(1)}%`
  }
  return `${k.padEnd(9)} 전반 ${(a[0] / N).toFixed(2)} · ${(a[1] / N).toFixed(2)} | 후반 ${(b[0] / N).toFixed(2)} · ${(b[1] / N).toFixed(2)} | 합 ${((a[0] + b[0]) / N).toFixed(2)} · ${((a[1] + b[1]) / N).toFixed(2)}`
}
for (const k of KEYS) console.log(line(k))
