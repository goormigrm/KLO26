// 설정 — 브라우저(localStorage)에만 남는다. 전적은 저장하지 않는다 (DECISIONS D-14).

import { FORMATION_LIST } from '../core/formation'
import type { Difficulty } from '../core/state'

export interface Settings {
  /** 그림자 (저사양 PC 는 끈다 — DESIGN 7.1) */
  shadows: boolean
  /** 렌더 해상도 배율 1 / 0.75 */
  resScale: number
  /** 화면 아래 조작 안내 띠 */
  keysHint: boolean
  difficulty: Difficulty
  halfMin: 2 | 3 | 4
  formation: string
  oppFormation: string
}

const KEY = 'klo26.settings'

export const DEFAULT_SETTINGS: Settings = {
  shadows: true,
  resScale: 1,
  keysHint: true,
  difficulty: 2,
  halfMin: 3,
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
