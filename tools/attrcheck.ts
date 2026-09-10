// 능력치가 실제로 경기에 반영되는가 — 능력치 묶음별 A/B 계측 (사용자 요청 2026-09-11).
//
//   npm run attrcheck        (기본 60판 × 양쪽 교대 = 120경기/묶음)
//   npm run attrcheck -- 120
//
// 방법 — 완전히 같은 두 스쿼드를 만들고 **한 묶음만** 한쪽은 HI, 한쪽은 LO 로 바꾼다.
// 홈/원정을 교대로 뒤집어 홈 이점을 지운다. 대조군(아무것도 안 바꿈)이 잡음 바닥이다.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import type { PlayerSpec, SquadConfig } from '../src/core/state'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const HALF = 180
const N = Number(process.argv[2] ?? 60)
const HI = 92
const LO = 38

/** 능력치 묶음 — 이름 → 필드 능력치 키 · GK 능력치 키 */
const GROUPS: { key: string; label: string; attr: string[]; gk?: string[]; only?: 'out' | 'gk' }[] = [
  { key: 'shoot', label: '슈팅 (fin·lon·cmp·hea·pen)', attr: ['fin', 'lon', 'cmp', 'hea', 'pen'] },
  { key: 'fin', label: '  └ 결정력만 (fin)', attr: ['fin'] },
  { key: 'def', label: '수비 (tck·mar·pos·ant·cnt)', attr: ['tck', 'mar', 'pos', 'ant', 'cnt'] },
  { key: 'tck', label: '  └ 태클만 (tck)', attr: ['tck'] },
  { key: 'mar', label: '  └ 마크만 (mar)', attr: ['mar'] },
  { key: 'pace', label: '속도 (pac·acc)', attr: ['pac', 'acc'] },
  { key: 'pass', label: '패스 (pas·vis·crs·tec)', attr: ['pas', 'vis', 'crs', 'tec'] },
  { key: 'drib', label: '드리블 (dri·tec·agi·bal)', attr: ['dri', 'tec', 'agi', 'bal'] },
  { key: 'str', label: '몸싸움 (str)', attr: ['str'] },
  { key: 'gk', label: '골키퍼 (ref·han·cmd·one·kic)', attr: [], gk: ['ref', 'han', 'cmd', 'one', 'kic'], only: 'gk' },
  { key: 'none', label: '대조군 (아무것도 안 바꿈)', attr: [] },
]

function setAttrs(sq: SquadConfig, keys: string[], gkKeys: string[], v: number, only?: 'out' | 'gk'): SquadConfig {
  const players = sq.players.map((p, i): PlayerSpec => {
    const isGk = i === 0 || p.pos === 'GK'
    if (only === 'gk' && !isGk) return p
    if (only === 'out' && isGk) return p
    const attr = { ...p.attr }
    for (const k of keys) attr[k] = v
    const gkA = p.gkA ? { ...p.gkA } : undefined
    if (gkA) for (const k of gkKeys) gkA[k] = v
    return { ...p, attr, gkA }
  })
  return { ...sq, players }
}

interface Out {
  goalsFor: number
  goalsAgainst: number
  shots: number
  shotsAgainst: number
  onTarget: number
  tackles: number
  fouls: number
  saves: number
  poss: number
  passes: number
  passOk: number
  wins: number
  draws: number
}

const zero = (): Out => ({
  goalsFor: 0, goalsAgainst: 0, shots: 0, shotsAgainst: 0, onTarget: 0, tackles: 0,
  fouls: 0, saves: 0, poss: 0, passes: 0, passOk: 0, wins: 0, draws: 0,
})

/** 한 판. `hiSide` 가 HI 팀이 앉은 자리 */
function play(seed: number, a: SquadConfig, b: SquadConfig, hiSide: 0 | 1, acc: Out): void {
  const st = createState({ seed, halfSec: HALF, squads: hiSide === 0 ? [a, b] : [b, a] })
  while (!st.done) step(st, idle)
  const me = hiSide
  const you = (1 - hiSide) as 0 | 1
  acc.goalsFor += st.teams[me].goals
  acc.goalsAgainst += st.teams[you].goals
  acc.shots += st.stats[me].shots
  acc.shotsAgainst += st.stats[you].shots
  acc.onTarget += st.stats[me].onTarget
  acc.tackles += st.stats[me].tackles
  acc.fouls += st.stats[me].fouls
  acc.saves += st.stats[me].saves
  acc.passes += st.stats[me].passes
  acc.passOk += st.stats[me].passOk
  const tot = st.stats[me].poss + st.stats[you].poss
  acc.poss += tot > 0 ? (st.stats[me].poss / tot) * 100 : 50
  if (st.teams[me].goals > st.teams[you].goals) acc.wins++
  else if (st.teams[me].goals === st.teams[you].goals) acc.draws++
}

function measure(g: (typeof GROUPS)[number]): Out {
  const acc = zero()
  for (let i = 0; i < N; i++) {
    const seed = 3000 + i * 7
    const base = synthSquad(500 + i, { name: 'A', short: 'A', formation: '4-3-3', quality: 66 })
    const hi = g.attr.length || g.gk?.length ? setAttrs(base, g.attr, g.gk ?? [], HI, g.only) : base
    const lo = g.attr.length || g.gk?.length ? setAttrs(base, g.attr, g.gk ?? [], LO, g.only) : base
    // 같은 시드로 홈·원정을 뒤집어 두 번 — 홈 이점을 지운다
    play(seed, hi, lo, 0, acc)
    play(seed, hi, lo, 1, acc)
  }
  return acc
}

const games = N * 2
console.log(`능력치 A/B — 묶음마다 ${games}경기 (HI ${HI} vs LO ${LO}, 전후반 ${HALF / 60}분, 홈·원정 교대)
`)
console.log('묶음                            승률   골   실점  내슛 상대슛 유효슛% 점유%  태클 파울 선방 패스성공%')
console.log('-'.repeat(104))
const only = (process.argv[3] ?? '').split(',').filter(Boolean)
for (const g of GROUPS) {
  if (only.length && !only.includes(g.key) && g.key !== 'none') continue
  const o = measure(g)
  const win = ((o.wins + o.draws * 0.5) / games) * 100
  const onT = (o.onTarget / Math.max(1, o.shots)) * 100
  const pok = (o.passOk / Math.max(1, o.passes)) * 100
  console.log(
    `${g.label.padEnd(28)} ${win.toFixed(1).padStart(5)}% ${(o.goalsFor / games).toFixed(2)} ${(o.goalsAgainst / games).toFixed(2)} ` +
      `${(o.shots / games).toFixed(1).padStart(5)} ${(o.shotsAgainst / games).toFixed(1).padStart(5)} ` +
      `${onT.toFixed(1).padStart(6)}% ${(o.poss / games).toFixed(1).padStart(5)} ` +
      `${(o.tackles / games).toFixed(1).padStart(4)} ${(o.fouls / games).toFixed(1).padStart(4)} ` +
      `${(o.saves / games).toFixed(1).padStart(4)} ${pok.toFixed(1).padStart(7)}%`,
  )
}
console.log('')
console.log('대조군이 잡음 바닥이다. 승률이 거기서 안 움직이면 그 능력치는 경기에 안 닿는다.')
