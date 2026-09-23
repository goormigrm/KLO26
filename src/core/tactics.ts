// 팀 전술 · 개인 전술 (2026-09-15, 사용자 12번 — FC 온라인 "세팅부터 전개까지" 영상을 참고한 설계, DESIGN 4.10a).
//
// - 팀 전술 7종: 프리셋(수비·균형·공격)마다 0~4. 넷은 예전 슬라이더(라인·압박·폭·멘탈리티), 셋이 새로 붙었다(템포·빌드업·수비 방식).
// - 개인 전술: 선발 자리(1~10)마다 역할 0~3. 역할의 **뜻은 자리군(ST·윙·CAM·CM·풀백·CB)마다 다르다** — 같은 숫자라도 이름·효과가 다르다.
//
// sim(`ai.ts`)은 여기의 **숫자 계수**(RoleTraits)만 본다. 이름·설명은 UI(스쿼드 화면·HUD) 용이다.
// 결정론: 계수는 스쿼드 데이터에서 한 번 계산해 Player 에 박히고, 프리셋 전환은 입력에 실려 간다.

import type { Band } from './formation'
import { SLIDER_KEYS, type Sliders, type Team } from './state'

export const PRESET_NAMES = ['수비', '균형', '공격'] as const

// ---------------------------------------------------------------- 경기 중 전술 키 (2026-09-23 FC 온라인 조작, DESIGN 3.1a)

/**
 * 숫자 4~0 — **편집하지 않는 기본 전술 일곱 벌**. FC 온라인은 숫자 1~0 이 "저장된 클럽 전술"이다.
 * 이 게임은 스쿼드(파일·스쿼드 코드)에 세 벌(1~3)만 저장한다 — 열 벌을 다 편집하게 하려면 스쿼드 코드 규격(v2)이 바뀌어야 해서
 * 나머지 일곱 자리는 코드에 박힌 전술로 채웠다 (DECISIONS G-65).
 */
export const BUILTIN_TACTICS: readonly { name: string; s: Sliders }[] = [
  { name: '역습', s: { line: 1, press: 1, width: 2, mentality: 2, tempo: 4, buildup: 3, defStyle: 2 } },
  { name: '점유', s: { line: 3, press: 2, width: 3, mentality: 2, tempo: 0, buildup: 0, defStyle: 1 } },
  { name: '측면 공격', s: { line: 2, press: 2, width: 4, mentality: 3, tempo: 2, buildup: 2, defStyle: 2 } },
  { name: '롱볼', s: { line: 2, press: 2, width: 3, mentality: 3, tempo: 3, buildup: 4, defStyle: 2 } },
  { name: '전방 압박', s: { line: 4, press: 4, width: 2, mentality: 3, tempo: 3, buildup: 2, defStyle: 3 } },
  { name: '텐백', s: { line: 0, press: 0, width: 1, mentality: 0, tempo: 1, buildup: 4, defStyle: 1 } },
  { name: '총공세', s: { line: 4, press: 4, width: 4, mentality: 4, tempo: 4, buildup: 3, defStyle: 4 } },
]
export const PRESET_COUNT = 3 + BUILTIN_TACTICS.length

/** 전술 번호(0~9) 이름 — 0~2 는 스쿼드의 세 벌, 3~9 는 기본 전술 */
export function presetName(i: number): string {
  return i < 3 ? PRESET_NAMES[i] ?? '' : BUILTIN_TACTICS[i - 3]?.name ?? ''
}

/** 공수 밸런스 −2~+2 ([ ]) — 경기마다 보통에서 시작 */
export const BALANCE_NAMES = ['전원 수비', '수비적', '보통', '공격적', '전원 공격'] as const

/** 순간 전술 F1~F4 — 이름 · 길이(틱). 코너킥 공격이면 같은 키가 `CORNER_PLANS` 다 */
export const TAC_NAMES = ['', '오프사이드 트랩', '전방 압박', '공격 가담', '수비 가담'] as const
export const TAC_TICKS = [0, 180, 600, 600, 600] as const
export const CORNER_PLANS = ['기본', '니어 포스트', '파 포스트', '짧은 코너', '세컨드 볼'] as const

const lv = (v: number): number => Math.max(0, Math.min(4, v))

/**
 * 실제로 뛰는 팀 전술 = 고른 전술(1~0) + 공수 밸런스([ ]) + 순간 전술(F1~F4).
 * 셋 중 하나가 바뀔 때만 sim 이 부른다 — `team.sliders` 를 다시 만든다(AI 는 이것만 본다)
 */
export function applyTeamTactics(team: Team, tick: number): void {
  const s = normalizeSliders(team.preset < 3 ? team.presets[team.preset] : BUILTIN_TACTICS[team.preset - 3]?.s)
  const bal = team.balance
  if (bal !== 0) {
    s.mentality = lv(s.mentality + bal)
    s.line = lv(s.line + bal)
    if (bal === 2 || bal === -2) s.press = lv(s.press + bal / 2)
  }
  if (team.tac > 0 && team.tacUntil > tick) {
    if (team.tac === 1) s.line = lv(s.line + 2)
    else if (team.tac === 2) {
      s.press = 4
      s.line = lv(s.line + 1)
    } else if (team.tac === 3) {
      s.mentality = 4
      s.width = lv(s.width + 1)
    } else {
      s.mentality = 0
      s.line = Math.min(s.line, 1)
      s.press = Math.min(s.press, 1)
    }
  }
  team.sliders = s
}

/** 팀 전술 하나의 이름·양끝 라벨·설명 (스쿼드 화면 슬라이더 줄) */
export interface TacticMeta {
  key: keyof Sliders
  name: string
  lo: string
  hi: string
  desc: string
}

export const TEAM_TACTICS: TacticMeta[] = [
  { key: 'line', name: '수비 라인', lo: '내려서', hi: '올려서', desc: '수비진이 서는 높이. 올리면 상대를 좁게 가두지만 뒷공간이 생깁니다.' },
  { key: 'press', name: '압박', lo: '지연', hi: '강하게', desc: '공 가진 상대에게 붙는 거리와 인원(1~3명). 강하면 체력이 빨리 닳습니다.' },
  { key: 'width', name: '폭', lo: '좁게', hi: '넓게', desc: '선수들이 좌우로 벌리는 정도.' },
  { key: 'mentality', name: '멘탈리티', lo: '수비적', hi: '공격적', desc: '팀 블록을 앞뒤로 밀고, 지원 러닝 인원(2~4)과 세트피스 때 박스 안 인원(5~7)이 바뀝니다.' },
  { key: 'tempo', name: '템포', lo: '침착', hi: '빠르게', desc: '받은 공을 얼마나 빨리 내보내나. 빠르면 받자마자 전진 패스, 침착하면 몰고 가며 기다립니다.' },
  { key: 'buildup', name: '빌드업', lo: '짧게', hi: '길게', desc: '골키퍼·수비의 배급. 짧게는 발밑 패스로 올라가고, 길게는 펀트·롱볼로 한 번에 넘깁니다.' },
  { key: 'defStyle', name: '수비 방식', lo: '지역', hi: '대인', desc: '지역은 자리를 지키다 위험 지역에 들어온 상대만 잡고, 대인은 멀리서부터 사람을 따라갑니다.' },
]

/** 프리셋 기본값 — 수비 / 균형 / 공격 (스쿼드 화면 "기본값으로" · 프리셋이 없는 스쿼드) */
export function defaultPresets(): [Sliders, Sliders, Sliders] {
  return [
    // 2026-09-16 `npm run tactics` 로 다시 잰 기본값 (DESIGN 4.10b):
    //  · 템포는 세 벌 다 보통(2) — 공격에 '빠르게'를 묶었더니 받자마자 내보내 점유 41%·슛 4.8 로 수비(57%·8.3)보다 못했다
    //  · 공격의 빌드업 짧게(1)·수비 방식 1 도 슛을 깎았다(6.1) → 둘 다 2 로: 슛 9.1 · 골 2.13 · 실점 1.38(균형 5.3 · 1.75 · 1.38)
    //  · 수비는 시험한 변형(빌드업 2 · 수비 방식 2 · 압박 2 · 라인 2)이 전부 실점을 늘려 그대로
    { line: 1, press: 1, width: 2, mentality: 1, tempo: 2, buildup: 3, defStyle: 3 },
    { line: 2, press: 2, width: 2, mentality: 2, tempo: 2, buildup: 2, defStyle: 2 },
    { line: 3, press: 3, width: 3, mentality: 3, tempo: 2, buildup: 2, defStyle: 2 },
  ]
}

/** 빠진 키는 2(보통)로 — 예전 저장 스쿼드(슬라이더 4종)를 그대로 쓸 수 있게 */
export function normalizeSliders(s: Partial<Sliders> | undefined | null): Sliders {
  const out = {} as Sliders
  for (const k of SLIDER_KEYS) {
    const v = s?.[k]
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(4, Math.round(v))) : 2
  }
  return out
}

/** 슬라이더 값 0~4 를 한 단어로 (UI) */
export function levelLabel(t: TacticMeta, v: number): string {
  if (v === 2) return '보통'
  if (v < 2) return v === 0 ? `${t.lo} ++` : `${t.lo} +`
  return v === 4 ? `${t.hi} ++` : `${t.hi} +`
}

// ---------------------------------------------------------------- 개인 전술

export type RoleGroup = 'ST' | 'WING' | 'CAM' | 'CM' | 'FB' | 'CB' | 'GK'

export const ROLE_GROUP_NAMES: Record<RoleGroup, string> = {
  ST: '스트라이커', WING: '윙어', CAM: '공격형 MF', CM: '중앙 MF', FB: '풀백', CB: '센터백', GK: '골키퍼',
}

/** 자리 → 자리군. 역할 이름표와 계수표가 이걸로 갈린다 */
export function roleGroupOf(slot: string): RoleGroup {
  switch (slot) {
    case 'GK':
      return 'GK'
    case 'ST':
    case 'LS':
    case 'RS':
      return 'ST'
    case 'LW':
    case 'RW':
    case 'LM':
    case 'RM':
    case 'LAM':
    case 'RAM':
      return 'WING'
    case 'CAM':
      return 'CAM'
    case 'LB':
    case 'RB':
    case 'LWB':
    case 'RWB':
      return 'FB'
    case 'LCB':
    case 'CB':
    case 'RCB':
    case 'SW':
      return 'CB'
    default:
      return 'CM'
  }
}

export interface RoleMeta {
  name: string
  desc: string
}

/** 자리군마다 역할 4개 (0 = 기본). 골키퍼는 하나 */
export const ROLES: Record<RoleGroup, RoleMeta[]> = {
  ST: [
    { name: '기본', desc: '앞선에 서서 침투와 포스트 플레이를 상황에 맞게.' },
    { name: '침투형', desc: '수비 뒷공간을 먼저 노립니다. 앞으로 뛰는 빈도가 크게 늘고 수비 때도 앞에 남습니다. 스루패스와 짝.' },
    { name: '포스트형', desc: '박스 안에 버티고 크로스를 받습니다. 침투 대신 크로스 때 첫 번째로 니어포스트에 섭니다.' },
    { name: '폴스 나인', desc: '중원으로 내려와 공을 받아 줍니다. 짧은 빌드업과 짝 — 뒤에서 올라오는 미드필더에게 공간을 냅니다.' },
  ],
  WING: [
    { name: '기본', desc: '측면에서 침투와 크로스를 상황에 맞게.' },
    { name: '안으로', desc: '중앙 쪽으로 좁혀 서고 골문 쪽으로 침투합니다. 반대발 윙어에게.' },
    { name: '밖으로', desc: '터치라인까지 넓게 벌려 크로스를 노립니다. 폭을 만들고 풀백에게 오버랩 공간을 줍니다.' },
    { name: '침투형', desc: '측면 뒷공간으로 자주 뛰어 들어갑니다.' },
  ],
  CAM: [
    { name: '기본', desc: '공격수 뒤에서 연결과 침투를 상황에 맞게.' },
    { name: '침투형', desc: '공격수와 나란히 뒷공간을 노리고 크로스 때 박스로 먼저 들어갑니다.' },
    { name: '플레이메이커', desc: '내려와 공을 받고 돌립니다. 침투보다 연결.' },
    { name: '박스 투 박스', desc: '공격 땐 박스까지, 수비 땐 중원까지 부지런히 오르내립니다.' },
  ],
  CM: [
    { name: '기본', desc: '중원에서 자리를 지키며 상황에 따라 지원.' },
    { name: '박스 투 박스', desc: '공격에 가담해 박스 근처까지 올라가고, 뒷공간으로도 뜁니다. 체력을 많이 씁니다.' },
    { name: '홀딩', desc: '지원 러닝에 나서지 않고 수비진 앞을 지킵니다. 역습 대비.' },
    { name: '플레이메이커', desc: '공 가진 동료 근처로 와서 받아 주고 돌립니다.' },
  ],
  FB: [
    { name: '기본', desc: '수비가 먼저, 여유가 있으면 오버랩.' },
    { name: '오버랩', desc: '공격 때 윙어 바깥으로 깊게 올라갑니다. 크로스 옵션이 늘지만 뒷공간이 생깁니다.' },
    { name: '스테이', desc: '올라가지 않고 수비 라인에 남습니다. 지원 러닝 없음.' },
    { name: '안으로', desc: '공격 때 중앙 미드필더처럼 안쪽으로 좁혀 들어갑니다(인버티드).' },
  ],
  CB: [
    { name: '기본', desc: '수비 라인을 지킵니다.' },
    { name: '전진', desc: '공격 때 하프라인 근처까지 올라와 빌드업에 참여합니다.' },
    { name: '스테이', desc: '어떤 상황에도 뒤에 남습니다.' },
    { name: '스위퍼', desc: '수비 때 동료보다 몇 미터 뒤에서 뒷공간을 지웁니다.' },
  ],
  GK: [{ name: '기본', desc: '골키퍼는 개인 전술이 없습니다 — 빌드업(팀 전술)이 배급을 정합니다.' }],
}

/**
 * AI 가 보는 역할 계수. 전부 "기본 = 아무 변화 없음" 이 되게 잡았다.
 * - fwd  공격(우리 소유) 때 앵커를 공격 방향으로 미는 거리(m). 음수면 내려온다
 * - back 수비(상대 소유) 때 같은 것. 양수면 앞에 남는다
 * - wide 앵커 y 배수 (1 = 그대로)
 * - run  침투 러닝 0 안 함 · 1 보통 · 2 적극(더 멀리서, 더 좁은 틈에도)
 * - box  크로스 때 박스로 뛰는 우선순위 0 안 감 · 1 · 2 먼저
 * - hold 1 이면 지원 러닝(rank < n)에 나서지 않는다
 * - drop 1 이면 우리 소유 때 소유자 쪽으로 내려와 짧은 패스 옵션이 된다
 */
export interface RoleTraits {
  fwd: number
  back: number
  wide: number
  run: number
  box: number
  hold: number
  drop: number
}

function traits(o: Partial<RoleTraits>, base: RoleTraits): RoleTraits {
  return { ...base, ...o }
}

/** 자리군 → 기본 계수 (역할 0). 밴드별 기본 동작이 여기 있다 */
function baseTraits(band: Band, group: RoleGroup): RoleTraits {
  const fw = band === 'FW' || band === 'AM'
  return {
    fwd: 0,
    back: 0,
    wide: 1,
    run: fw ? 1 : 0,
    box: group === 'ST' || group === 'WING' || group === 'CAM' || group === 'CM' ? 1 : 0,
    hold: 0,
    drop: 0,
  }
}

const ROLE_TRAITS: Record<RoleGroup, Partial<RoleTraits>[]> = {
  ST: [{}, { run: 2, fwd: 3, back: 3 }, { run: 0, box: 2 }, { drop: 1, fwd: -5, run: 1, box: 1 }],
  WING: [{}, { wide: 0.55, run: 2 }, { wide: 1.2, run: 0, box: 0 }, { run: 2, fwd: 3 }],
  CAM: [{}, { run: 2, fwd: 3, box: 2 }, { drop: 1, fwd: -3, run: 0 }, { run: 1, box: 1, fwd: 2, back: -3 }],
  CM: [{}, { run: 1, fwd: 4, back: -2, box: 1 }, { hold: 1, fwd: -3, back: -4, box: 0 }, { drop: 1, run: 0 }],
  FB: [{}, { fwd: 8, run: 1, wide: 1.15 }, { hold: 1, fwd: -3 }, { wide: 0.6, fwd: 3 }],
  CB: [{}, { fwd: 5 }, { hold: 1, fwd: -2 }, { back: -4, fwd: -3 }],
  GK: [{}],
}

export function roleTraits(band: Band | string, slot: string, role: number): RoleTraits {
  const g = roleGroupOf(slot)
  const base = baseTraits(band as Band, g)
  const list = ROLE_TRAITS[g]
  const r = Number.isInteger(role) && role >= 0 && role < list.length ? role : 0
  return traits(list[r], base)
}

/** 역할 수 (자리군마다 4, 골키퍼 1) — 검증·코드가 쓴다 */
export const ROLE_MAX = 3
