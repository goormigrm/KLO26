// 설정 — 브라우저(localStorage)에만 남는다. 전적은 저장하지 않는다 (DECISIONS D-14).

import { FORMATION_LIST } from '../core/formation'
import type { Difficulty } from '../core/state'

export interface Settings {
  /** 닉네임 — 방 목록·대기실에 보인다 */
  nick: string
  /** 그림자 (저사양 PC 는 끈다 — DESIGN 7.1) */
  shadows: boolean
  /** 렌더 해상도 배율 1 / 0.75 */
  resScale: number
  /** 화면 아래 조작 안내 띠 */
  keysHint: boolean
  difficulty: Difficulty
  halfMin: 2 | 3 | 4
  /** 혼자 하기 상대 구단 (−1 = 무작위) */
  oppClub: number
  formation: string
  oppFormation: string
}

const KEY = 'klo26.settings'

export const DEFAULT_SETTINGS: Settings = {
  nick: '',
  shadows: true,
  resScale: 1,
  keysHint: true,
  difficulty: 2,
  halfMin: 3,
  oppClub: -1,
  formation: '4-3-3',
  oppFormation: '4-4-2',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
    if (!FORMATION_LIST.includes(s.formation)) s.formation = DEFAULT_SETTINGS.formation
    if (!FORMATION_LIST.includes(s.oppFormation)) s.oppFormation = DEFAULT_SETTINGS.oppFormation
    if (![1, 2, 3].includes(s.difficulty)) s.difficulty = 2
    if (![2, 3, 4].includes(s.halfMin)) s.halfMin = 3
    if (s.resScale !== 0.75) s.resScale = 1
    if (!Number.isInteger(s.oppClub)) s.oppClub = -1
    if (typeof s.nick !== 'string') s.nick = ''
    s.nick = s.nick.slice(0, 12)
    return s
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 사생활 모드 등 — 저장 못 해도 게임은 된다
  }
}
