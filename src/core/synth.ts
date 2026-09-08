// 합성 스쿼드 — 실제 카드 데이터가 들어오기 전(단계 1 · PREP A-1)에 시뮬을 돌리기 위한 가짜 선수.
// 이름은 "홈7" 같은 자리표시자다. 실존 인물과 무관하다.

import { FORMATIONS } from './formation'
import { makeRng, rand } from './rng'
import type { Foot, PlayerSpec, PosGroup, SquadConfig } from './state'

const FIELD_KEYS = ['pac', 'acc', 'agi', 'bal', 'jum', 'str', 'sta', 'fir', 'tec', 'dri', 'pas', 'vis', 'crs', 'fin', 'lon', 'pen', 'hea', 'cmp', 'dec', 'cnt', 'ant', 'pos', 'mar', 'tck', 'agg', 'bra', 'fla', 'wor', 'tea']
const GK_KEYS = ['ref', 'one', 'han', 'cmd', 'aer', 'com', 'kic', 'pun', 'tro', 'ecc']

/** 포지션군별 오프셋 — 그 자리에서 중요한 능력치를 올리고 나머지를 내린다 */
const BIAS: Record<PosGroup, Record<string, number>> = {
  GK: { pac: -15, acc: -12, dri: -25, fin: -30, pas: -8, tck: -25, mar: -20, agi: 5, jum: 8 },
  DF: { tck: 12, mar: 12, pos: 10, hea: 10, str: 8, ant: 6, fin: -18, dri: -8, lon: -10, crs: -6 },
  MF: { pas: 12, vis: 10, tec: 8, sta: 8, dec: 6, fir: 6, tck: -2, hea: -6, fin: -6 },
  FW: { fin: 14, dri: 10, acc: 8, pac: 6, lon: 6, cmp: 6, tck: -18, mar: -16, pos: -10 },
}

function n(r: ReturnType<typeof makeRng>, mean: number, sd: number): number {
  const z = (rand(r) + rand(r) + rand(r) - 1.5) * 2
  const v = Math.round(mean + z * sd)
  return v < 5 ? 5 : v > 99 ? 99 : v
}

function makePlayer(r: ReturnType<typeof makeRng>, id: number, no: number, pos: PosGroup, quality: number, short: string): PlayerSpec {
  const attr: Record<string, number> = {}
  const bias = BIAS[pos]
  for (const k of FIELD_KEYS) attr[k] = n(r, quality + (bias[k] ?? 0), 8)
  const gkA: Record<string, number> = {}
  for (const k of GK_KEYS) gkA[k] = n(r, pos === 'GK' ? quality + 4 : 25, 7)
  const h = Math.round(pos === 'GK' ? 178 + rand(r) * 16 : 168 + rand(r) * 24)
  const w = Math.round(h - 105 + (rand(r) - 0.5) * 10)
  const fr = rand(r)
  const foot: Foot = fr < 0.72 ? 'R' : fr < 0.94 ? 'L' : 'B'
  return { id, name: `${short}${no}`, no, pos, h, w, foot, attr, gkA }
}

/** 포메이션 순서대로 11명 + 벤치 7명 */
export function synthSquad(seed: number, opts: { name: string; short: string; formation: string; quality: number }): SquadConfig {
  const r = makeRng(seed)
  const shape = FORMATIONS[opts.formation]
  if (!shape) throw new Error(`포메이션 없음: ${opts.formation}`)
  const players: PlayerSpec[] = []
  let no = 1
  players.push(makePlayer(r, seed * 100 + no, no, 'GK', opts.quality, opts.short))
  for (const [band] of shape) {
    no++
    const pos: PosGroup = band === 'DF' || band === 'WB' ? 'DF' : band === 'FW' ? 'FW' : 'MF'
    players.push(makePlayer(r, seed * 100 + no, no, pos, opts.quality, opts.short))
  }
  const benchPos: PosGroup[] = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']
  for (const pos of benchPos) {
    no++
    players.push(makePlayer(r, seed * 100 + no, no, pos, opts.quality - 4, opts.short))
  }
  return { name: opts.name, short: opts.short, formation: opts.formation, players }
}
