// 전술(프리셋·슬라이더)이 **내가 조작하지 않는 선수들의 움직임**을 실제로 바꾸는가 (사용자 질문 2026-09-11).
//   npm run tactics
//
// 두 팀 모두 봇이다. 홈만 프리셋을 바꾸고 원정은 균형으로 고정한다.
// 선수들의 **평균 위치**를 직접 재므로 "움직임이 달라지나"에 바로 답한다.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, hashState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { ownGoalX, type GameState, type SquadConfig, type Sliders } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const HALF = 180
const N = Number(process.argv[2] ?? 24)

const PRESETS: { name: string; s: Sliders }[] = [
  { name: '수비', s: { line: 1, press: 1, width: 2, mentality: 1 } },
  { name: '균형', s: { line: 2, press: 2, width: 2, mentality: 2 } },
  { name: '공격', s: { line: 3, press: 3, width: 3, mentality: 3 } },
]

function withPresets(sq: SquadConfig, s: Sliders): SquadConfig {
  return { ...sq, presets: [s, s, s] as [Sliders, Sliders, Sliders] }
}

interface M {
  /** 우리 골문에서 잰 팀 평균 전진 거리 (m) — 클수록 라인이 높다 */
  lineX: number
  /** 좌우 퍼짐 (y 표준편차, m) */
  width: number
  /** 공 소유자에게 가장 가까운 우리 수비수 거리 (m) — 작을수록 압박 */
  pressD: number
  goals: number
  conceded: number
  shots: number
  tackles: number
  fouls: number
  poss: number
  hash: number
  samples: number
}

function measure(sl: Sliders): M {
  const m: M = { lineX: 0, width: 0, pressD: 0, goals: 0, conceded: 0, shots: 0, tackles: 0, fouls: 0, poss: 0, hash: 0, samples: 0 }
  for (let i = 0; i < N; i++) {
    const seed = 8000 + i * 13
    const home = withPresets(synthSquad(700 + i, { name: 'H', short: 'H', formation: '4-3-3', quality: 66 }), sl)
    const away = withPresets(synthSquad(900 + i, { name: 'A', short: 'A', formation: '4-3-3', quality: 66 }), PRESETS[1].s)
    const st: GameState = createState({ seed, halfSec: HALF, squads: [home, away] })
    let n = 0
    while (!st.done) {
      step(st, idle)
      if (st.tick % 10 !== 0 || st.phase !== 'play') continue
      const t = st.teams[0]
      // 필드 10명(골키퍼 제외)의 **우리 골문에서 잰 전진 거리**와 좌우 퍼짐
      let fwd = 0
      let sy = 0
      let sy2 = 0
      let c = 0
      for (const p of st.players) {
        if (p.team !== 0 || p.idx === t.gk) continue
        fwd += (p.x - ownGoalX(t)) * t.dir
        sy += p.y
        sy2 += p.y * p.y
        c++
      }
      if (c === 0) continue
      m.lineX += fwd / c
      m.width += Math.sqrt(Math.max(0, sy2 / c - (sy / c) * (sy / c)))
      // 공 소유자가 상대일 때, 가장 가까운 우리 선수 거리
      const owner = st.ball.owner
      if (owner >= 0 && st.players[owner]?.team === 1) {
        const b = st.players[owner]
        let best = 999
        for (const p of st.players) {
          if (p.team !== 0 || p.idx === t.gk) continue
          const d = Math.hypot(p.x - b.x, p.y - b.y)
          if (d < best) best = d
        }
        if (best < 999) {
          m.pressD += best
          n++
        }
      }
      m.samples++
    }
    m.goals += st.teams[0].goals
    m.conceded += st.teams[1].goals
    m.shots += st.stats[0].shots
    m.tackles += st.stats[0].tackles
    m.fouls += st.stats[0].fouls
    const tot = st.stats[0].poss + st.stats[1].poss
    m.poss += tot > 0 ? (st.stats[0].poss / tot) * 100 : 50
    m.hash ^= hashState(st)
  }
  return m
}

console.log(`전술 A/B — 프리셋마다 ${N}경기 (홈만 프리셋 변경 · 원정은 균형 고정 · 둘 다 봇)\n`)
console.log('프리셋   라인높이  좌우퍼짐  압박거리  점유%   슛   태클  파울   골   실점   지문')
console.log('-'.repeat(88))
const rows = PRESETS.map((p) => ({ p, m: measure(p.s) }))
for (const { p, m } of rows) {
  const s = Math.max(1, m.samples)
  console.log(
    `${p.name.padEnd(6)} ${(m.lineX / s).toFixed(2).padStart(7)}m ${(m.width / s).toFixed(2).padStart(8)}m ` +
      `${(m.pressD / s).toFixed(2).padStart(8)}m ${(m.poss / N).toFixed(1).padStart(6)} ${(m.shots / N).toFixed(1).padStart(5)} ` +
      `${(m.tackles / N).toFixed(1).padStart(5)} ${(m.fouls / N).toFixed(1).padStart(5)} ${(m.goals / N).toFixed(2).padStart(5)} ` +
      `${(m.conceded / N).toFixed(2).padStart(6)}  ${(m.hash >>> 0).toString(16).padStart(8, '0')}`,
  )
}
const hs = new Set(rows.map((r) => r.m.hash >>> 0))
console.log(
  `\n지문 ${hs.size === rows.length ? '전부 다르다 → 전술이 sim 을 실제로 바꾼다' : '겹친다 → 전술이 안 읽히는 값이 있다'}`,
)
console.log('라인높이 = 우리 골문에서 잰 필드 10명 평균 전진 거리 · 압박거리 = 상대 볼 소유자에게 가장 가까운 우리 선수 거리')
