// 설정 — 브라우저(localStorage)에만 남는다. 전적은 저장하지 않는다 (DECISIONS D-14).

import { FORMATION_LIST } from '../core/formation'
import type { Difficulty } from '../core/state'
import type { VoiceInfo } from '../audio/tts'

export interface Settings {
  /** 닉네임 — 방 목록·대기실에 보인다 */
  nick: string
  /** 그림자 (저사양 PC 는 끈다 — DESIGN 7.1) */
  shadows: boolean
  /** 렌더 해상도 배율 1 / 0.75 */
  resScale: number
  /** 도움 표시 — 발밑 링·방향 화살표·상대 링 (2026-09-15). 끄면 FC 온라인처럼 팀색 삼각형과 이름만 */
  helpers: boolean
  /** 화면 아래 조작 안내 띠 */
  keysHint: boolean
  /** 왼쪽 아래 **내가 지금 누르는 키** 표시 (방향키 제외) — Q+D 같은 조합이 실제로 들어가는지 본다 (2026-09-11) */
  keyView: boolean
  /** 중계 음성 — 골·페널티킥·퇴장 같은 하이라이트에서 한 줄씩 읽는다 (2026-09-16 · `audio/tts.ts`) */
  commentary: boolean
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
  helpers: true,
  keysHint: true,
  keyView: true,
  commentary: true,
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
    if (typeof s.helpers !== 'boolean') s.helpers = true
    if (!Number.isInteger(s.oppClub)) s.oppClub = -1
    if (typeof s.testSpectate !== 'boolean') s.testSpectate = true
    if (typeof s.testKeyView !== 'boolean') s.testKeyView = true
    if (typeof s.keyView !== 'boolean') s.keyView = true
    if (typeof s.commentary !== 'boolean') s.commentary = true
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
  /** 도움 표시 (렌더러에 즉시) */
  setHelpers?(on: boolean): void
  /** 화면 아래 조작 안내 띠 */
  setKeysHint(on: boolean): void
  /** 왼쪽 아래 입력 키 표시 — 경기 중에만 뜻이 있다 (로비는 안 넘겨도 된다) */
  setKeyView?(on: boolean): void
  /** 중계 음성 켜고 끄기 — 경기 중에만 뜻이 있다 (2026-09-16) */
  setCommentary?(on: boolean): void
  /** 지금 무슨 음성으로 읽는지 (설명 줄에 보여 준다) */
  voiceInfo?(): VoiceInfo
  /** 값이 바뀌어 패널을 다시 그려야 한다 */
  rerender(): void
}

function segRow(label: string, id: string, items: [string, string][], cur: string, note = ''): string {
  const btns = items.map(([v, t]) => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${t}</button>`).join('')
  return `<div class="srow"><label>${label}</label><div class="sctl"><div class="seg" id="${id}">${btns}</div>${
    note ? `<small>${note}</small>` : ''
  }</div></div>`
}

/**
 * 중계 음성 설명 줄 — 지금 무슨 음성으로 읽는지, 남성 음성이 없으면 어떻게 받는지 (2026-09-16).
 * 브라우저·운영체제마다 깔린 음성이 달라서 **재 보고 알려 주는 편**이 정확하다.
 */
function voiceNote(v: VoiceInfo | undefined): string {
  if (!v) return '골·퇴장 같은 장면에서 한 줄'
  if (!v.ok) return '한국어 음성이 없습니다 (윈도우 설정 → 음성)'
  // "Microsoft Heami - Korean (Korean)" 처럼 긴 이름은 앞부분만
  const short = v.name.replace(/^Microsoft\s+/i, '').split(/\s+[-–(]/)[0].trim()
  if (v.male) return `골·퇴장 같은 장면에서 한 줄 · ${short} (남성)`
  return `골·퇴장 같은 장면에서 한 줄 · ${short} 피치를 낮춰서 (윈도우 설정에서 남성 음성을 받으면 바뀝니다)`
}

/** 설정 패널 HTML — 로비 팝업과 경기 중 창이 함께 쓴다 */
export function settingsPanelHtml(s: Settings, muted: boolean, voice?: VoiceInfo): string {
  return `<div class="setpanel">
    ${segRow('소리', 'st-sound', [['1', '🔊 켜기'], ['0', '🔇 끄기']], muted ? '0' : '1', '관중석·휘슬·킥 (경기 중 배경음악 없음)')}
    ${segRow('중계 음성', 'st-voice', [['1', '켜기'], ['0', '끄기']], s.commentary ? '1' : '0', voiceNote(voice))}
    ${segRow('그림자', 'st-shadows', [['1', '켜기'], ['0', '끄기']], s.shadows ? '1' : '0', '저사양 PC 는 끄기')}
    ${segRow('렌더 해상도', 'st-res', [['1', '100%'], ['0.75', '75%']], String(s.resScale), '75% 는 흐린 대신 빠릅니다')}
    ${segRow('도움 표시', 'st-helpers', [['1', '보이기'], ['0', '숨기기']], s.helpers ? '1' : '0', '발밑 링 · 방향 화살표')}
    ${segRow('조작 안내 띠', 'st-keys', [['1', '보이기'], ['0', '숨기기']], s.keysHint ? '1' : '0', '화면 아래 키 안내')}
    ${segRow('입력 키 표시', 'st-keyview', [['1', '보이기'], ['0', '숨기기']], s.keyView ? '1' : '0', '지금 누르는 키')}
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
  on('#st-helpers', (v) => {
    s.helpers = v === '1'
    hooks.setHelpers?.(s.helpers)
  })
  on('#st-keys', (v) => {
    s.keysHint = v === '1'
    hooks.setKeysHint(s.keysHint)
  })
  on('#st-keyview', (v) => {
    s.keyView = v === '1'
    hooks.setKeyView?.(s.keyView)
  })
  on('#st-voice', (v) => {
    s.commentary = v === '1'
    hooks.setCommentary?.(s.commentary)
  })
}
