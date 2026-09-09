// 카드 풀 — K리그 2026 29개 구단 1,024명.
//
// `cards.json` 은 `tools/build_cards.py` 가 구운 파일이다. 손으로 고치지 않는다.
// **선수 이름은 보호명**이고(성씨를 다른 실재 성씨로 바꿔 실존 인물과 겹치지 않게 한다),
// 구단명은 지역명만 남기고 기업·구단 고유 명칭을 쓰지 않는다 (DESIGN 10.2 · DECISIONS 3장 1).
// 저장소에 실명은 한 건도 없다 — 빌드 도구가 그것을 확인하고 나서야 파일을 쓴다.
//
// 파일은 **컬럼 형식**이다. 키 이름을 1,024번 되풀이하지 않으려고 값만 배열로 넣었다.
// 여기서 한 번 풀어 `Card` 로 만든다.

import type { Card } from '../cards/cards'
import type { Foot, PosGroup } from '../core/state'
import raw from './cards.json'

/** 자리표시자였을 때와 같은 모양의 구단 정보 */
export interface Club {
  /** 배열 인덱스 (카드의 `club` 이 가리키는 값) */
  id: number
  /** 원본 구단 키 (`ulsan` 같은 것) — 디버그·정렬용 */
  key: string
  name: string
  short: string
  /** 1부 / 2부 */
  div: 1 | 2
  col: number
  col2: number
}

function hexToInt(s: string): number {
  const t = s.replace('#', '')
  const v = parseInt(t, 16)
  return Number.isFinite(v) ? v : 0x888888
}

export const CLUBS: Club[] = raw.clubs.map((c, i) => ({
  id: i,
  key: c.id,
  name: c.name,
  short: c.short,
  div: (c.div === 1 ? 1 : 2) as 1 | 2,
  col: hexToInt(c.col),
  col2: hexToInt(c.col2),
}))

export const CLUB_COUNT = CLUBS.length

const ATTR_KEYS = raw.attrKeys as string[]
const GK_KEYS = raw.gkKeys as string[]
const FAM_KEYS = raw.famKeys as string[]
const POS_LIST = raw.posList as PosGroup[]
const FOOT_LIST = raw.footList as Foot[]

type Row = [number, string, number, number, number, number, number, number, number[], number[] | 0, number[]]

function toCard(r: Row): Card {
  const attr: Record<string, number> = {}
  for (let i = 0; i < ATTR_KEYS.length; i++) attr[ATTR_KEYS[i]] = r[8][i]
  const posFam: Record<string, number> = {}
  for (let i = 0; i < FAM_KEYS.length; i++) posFam[FAM_KEYS[i]] = r[10][i]
  let gkA: Record<string, number> | undefined
  if (r[9] !== 0) {
    gkA = {}
    const g = r[9]
    for (let i = 0; i < GK_KEYS.length; i++) gkA[GK_KEYS[i]] = g[i]
  }
  return {
    id: r[0],
    name: r[1],
    no: r[2],
    pos: POS_LIST[r[3]] ?? 'MF',
    h: r[4],
    w: r[5],
    foot: FOOT_LIST[r[6]] ?? 'R',
    attr,
    gkA,
    posFam,
    club: r[7],
  }
}

/** 카드 1,024장. 파일이 고정이라 어느 브라우저에서나 같다 */
export const POOL: Card[] = (raw.players as unknown as Row[]).map(toCard)
export const POOL_SIZE = POOL.length

/** id → 카드 (id 가 1..N 순서라는 보장이 없어 표를 만든다) */
const BY_ID = new Map<number, Card>()
for (const c of POOL) BY_ID.set(c.id, c)

/**
 * 데이터 지문 — 스쿼드 코드에 16비트로 박는다. 데이터가 다른 사람끼리는 붙지 않는다 (DESIGN 5.9).
 * 원본 `dataHash` 와 실제로 구운 값 둘 다 섞는다 — 도구가 바뀌어도 지문이 따라 움직인다.
 */
export const POOL_HASH: number = (() => {
  let h = 0x811c9dc5
  const mixStr = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i) & 0xff
      h = Math.imul(h, 0x01000193)
    }
  }
  mixStr(String(raw.dataHash ?? ''))
  for (const c of POOL) {
    h ^= c.id
    h = Math.imul(h, 0x01000193)
    for (const k of ATTR_KEYS) {
      h ^= c.attr[k]
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0) & 0xffff
})()

export function cardById(id: number): Card | undefined {
  return BY_ID.get(id)
}

export function clubOf(c: Card): Club {
  return CLUBS[c.club]
}
