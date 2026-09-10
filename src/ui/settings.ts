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
  /** 테스트 모드 (`?test=1` 일 때만 쓴다) — AI 대 AI 관전 · 키 입력 표시 · 원정 봇 난이도 */
  testSpectate: boolean
  testKeyView: boolean
  testAwayDiff: number
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
  testSpectate: true,
  testKeyView: true,
  testAwayDiff: 2,
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
    if (typeof s.testSpectate !== 'boolean') s.testSpectate = true
    if (typeof s.testKeyView !== 'boolean') s.testKeyView = true
    if (![1, 2, 3].includes(s.testAwayDiff)) s.testAwayDiff = 2
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

// ---------------------------------------------------------------- 설정 패널 (로비·경기 중 공용)
//
// 로비와 경기 중이 **같은 패널**을 쓴다 (bedorage-duck 방식) — 한 곳만 고치면 둘 다 바뀐다.
// 전부 **내 화면 설정**이라 P2P 로 보내지 않고 브라우저에만 남는다.

export interface SettingsHooks {
  /** 소리 켜기/끄기 */
  setMuted(muted: boolean): void
  /** 그림자 (렌더러에 즉시) */
  setShadows(on: boolean): void
  /** 렌더 해상도 배율 (렌더러에 즉시) */
  setResScale(v: number): void
  /** 화면 아래 조작 안내 띠 */
  setKeysHint(on: boolean): void
  /** 값이 바뀌어 패널을 다시 그려야 한다 */
  rerender(): void
}

function segRow(label: string, id: string, items: [string, string][], cur: string, note = ''): string {
  const btns = items.map(([v, t]) => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${t}</button>`).join('')
  return `<div class="srow"><label>${label}</label><div class="sctl"><div class="seg" id="${id}">${btns}</div>${
    note ? `<small>${note}</small>` : ''
  }</div></div>`
}

/** 설정 패널 HTML — 로비 팝업과 경기 중 창이 함께 쓴다 */
export function settingsPanelHtml(s: Settings, muted: boolean): string {
  return `<div class="setpanel">
    ${segRow('소리', 'st-sound', [['1', '🔊 켜기'], ['0', '🔇 끄기']], muted ? '0' : '1', '관중석·휘슬·킥 — 전부 코드로 만든 소리')}
    ${segRow('그림자', 'st-shadows', [['1', '켜기'], ['0', '끄기']], s.shadows ? '1' : '0', '저사양 PC 는 끄면 가벼워집니다')}
    ${segRow('렌더 해상도', 'st-res', [['1', '100%'], ['0.75', '75%']], String(s.resScale), '75% 는 조금 흐려지지만 빨라집니다')}
    ${segRow('조작 안내 띠', 'st-keys', [['1', '보이기'], ['0', '숨기기']], s.keysHint ? '1' : '0', '화면 아래 키 안내')}
  </div>`
}

/** 설정 패널 배선. `root` 는 패널이 들어 있는 요소 */
export function bindSettingsPanel(root: ParentNode, s: Settings, hooks: SettingsHooks): void {
  const on = (sel: string, cb: (v: string) => void): void => {
    root.querySelectorAll<HTMLButtonElement>(`${sel} button`).forEach((b) => {
      b.onclick = () => {
        cb(b.dataset.v!)
        saveSettings(s)
        hooks.rerender()
      }
    })
  }
  on('#st-sound', (v) => hooks.setMuted(v === '0'))
  on('#st-shadows', (v) => {
    s.shadows = v === '1'
    hooks.setShadows(s.shadows)
  })
  on('#st-res', (v) => {
    s.resScale = Number(v) === 0.75 ? 0.75 : 1
    hooks.setResScale(s.resScale)
  })
  on('#st-keys', (v) => {
    s.keysHint = v === '1'
    hooks.setKeysHint(s.keysHint)
  })
}
