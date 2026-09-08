// 시뮬레이션 상태와 상수. src/core 는 렌더·DOM·오디오를 모른다 (DESIGN 4.12).
// 좌표: m, 원점 = 센터 스팟, x 가 긴 쪽. 각 팀은 `dir`(+1/−1) 방향의 골문을 공격한다. 후반은 dir 을 뒤집는다.

import type { Rng } from './rng'
import type { Skills } from './skills'

export const PITCH_L = 105
export const PITCH_W = 68
export const HALF_L = 52.5
export const HALF_W = 34
export const GOAL_HALF = 3.66
export const GOAL_H = 2.44
export const POST_R = 0.06
export const BOX_L = 16.5
export const BOX_HALF_W = 20.16
export const SIX_L = 5.5
export const SIX_HALF_W = 9.16
export const PEN_SPOT = 11

export const TICK_HZ = 60
export const TICK_MS = 1000 / TICK_HZ
export const DT = 1 / TICK_HZ
/** 경기 시계 배율 — 실시간 3분 = 45분 */
export const CLOCK_SCALE = 15
/** 한 하프의 실시간 초 (기본 3분 — DECISIONS 3장 2) */
export const DEFAULT_HALF_SEC = 180

export const PLAYER_R = 0.35
export const BALL_R = 0.11
/** 발에서 이 거리 안이면 공을 잡을 수 있다 */
export const CONTROL_R = 0.55
/** AI 가 다시 결정하는 주기(틱). 선수마다 idx 로 어긋나게 돌린다 */
export const DECIDE_TICKS = 15
export const RESTART_TICKS = 90
export const KICKOFF_TICKS = 60
export const GOAL_TICKS = 150
export const HALFTIME_TICKS = 300

export type PosGroup = 'GK' | 'DF' | 'MF' | 'FW'
export type Foot = 'L' | 'R' | 'B'

/** 카드 한 장에서 시뮬이 읽는 것. 실명·사진 없음 — id 와 보호명뿐 */
export interface PlayerSpec {
  id: number
  name: string
  no: number
  pos: PosGroup
  /** 키 cm · 몸무게 kg — 헤더·몸싸움·렌더 크기 */
  h: number
  w: number
  foot: Foot
  /** KM26 능력치 0~100 (pac, acc, fin, pas …). 빠진 키는 50 으로 본다 */
  attr: Record<string, number>
  /** GK 전용 (ref, one, han, cmd, aer, com, kic, pun …) */
  gkA?: Record<string, number>
  /** 포지션 능숙도 0~100 (GK, DC, DL, … ST). 없으면 자기 포지션군 자리 100 */
  posFam?: Record<string, number>
}

export const ACT_RUN = 0
export const ACT_KICK = 1
export const ACT_SLIDE = 2
export const ACT_FALLEN = 3
export const ACT_DIVE = 4

export interface Player {
  idx: number
  team: number
  spec: PlayerSpec
  slot: string
  band: string
  x: number
  y: number
  vx: number
  vy: number
  /** 0..1023 */
  facing: number
  stamina: number
  action: number
  /** 동작이 끝날 때까지 남은 틱 */
  actT: number
  sk: Skills
  /** 포메이션 자리 (매 틱 다시 계산) */
  ax: number
  ay: number
  /** 이동 목표 */
  tx: number
  ty: number
  sprint: boolean
  /** 압박 중 — 볼 근처에서 태클을 시도한다 (AI 판단 또는 사람의 PRESS 홀드) */
  press: boolean
  /** 마지막으로 공을 찬 틱 — 직후엔 자기 공을 다시 못 잡는다 */
  lastKick: number
  /** GK 가 공을 손에 들고 있는 남은 틱 */
  holdT: number
  yellow: number
  sentOff: boolean
  /** 드리블 목표 방향 (AI) — decide 사이에도 유지 */
  dribX: number
  dribY: number
  /** 공을 잡은 틱 — 12틱 안에 차면 퍼스트 타임(오차 ×1.3) */
  gotT: number
  /** 스탠딩 태클(Space) 남은 틱 — 그동안 뺏을 확률 ×3 */
  tackleT: number
  /** 루즈볼을 잡는 순간 바로 걷어낸다 (수비 D) */
  clearNext: boolean
}

export interface Ball {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** 공을 발에 붙인 선수 idx, 없으면 −1 */
  owner: number
  lastTouch: number
  lastTeam: number
  kickTick: number
  /** 슛이었다면 찬 선수 idx (선방 통계용). 다른 사람이 만지면 −1 */
  shotBy: number
  /** 패스라면 받으라고 보낸 선수 idx */
  passTo: number
  /** 슛이 골문 안으로 향하고 있었나 (선방 통계) */
  onTarget: boolean
}

export type Phase = 'kickoff' | 'play' | 'goal' | 'throwin' | 'goalkick' | 'corner' | 'halftime' | 'end'

export interface Restart {
  team: number
  kicker: number
  x: number
  y: number
}

export interface Sliders {
  /** 수비 라인 0~4 */
  line: number
  /** 압박 0~4 */
  press: number
  /** 폭 0~4 */
  width: number
  /** 멘탈리티 0~4 */
  mentality: number
}

export const DEFAULT_SLIDERS: Sliders = { line: 2, press: 2, width: 2, mentality: 2 }

/** 봇 난이도. 0 = 봇 아님(사람) */
export type Difficulty = 0 | 1 | 2 | 3

export interface Team {
  name: string
  short: string
  human: boolean
  bot: Difficulty
  dir: 1 | -1
  formation: string
  sliders: Sliders
  presets: [Sliders, Sliders, Sliders]
  preset: number
  /** 사람이 조작 중인 선수 idx (−1 = 없음) */
  controlled: number
  goals: number
  /** 지난 틱 버튼 — 눌린 순간(edge) 판별 */
  prevButtons: number
  /** 슛 버튼을 누르고 있는 틱 수 (파워) */
  holdShoot: number
  holdPass: number
  /** 마지막으로 A 를 누른 틱 (더블 탭 = 로우 크로스) */
  lastA: number
  /** 이번 틱 방향키 (−1..1) · 홀드 키 */
  inX: number
  inY: number
  sprint: boolean
  slow: boolean
  jockey: boolean
  /** Q 홀드 — 두 번째 수비수도 압박 */
  assist: boolean
  /** 선수 idx 범위 [start, start+11) */
  start: number
  gk: number
}

export interface TeamStats {
  shots: number
  onTarget: number
  passes: number
  passOk: number
  tackles: number
  poss: number
  corners: number
  saves: number
}

export type EventType = 'goal' | 'shot' | 'save' | 'kickoff' | 'half' | 'end' | 'corner' | 'throwin' | 'goalkick' | 'tackle'

export interface SimEvent {
  tick: number
  type: EventType
  team: number
  player: number
  x: number
  y: number
}

export interface GameState {
  tick: number
  half: 1 | 2
  /** 이 하프의 실시간 경과 초 */
  clock: number
  halfSec: number
  phase: Phase
  phaseT: number
  restart: Restart | null
  kickoffTeam: number
  /** 전반을 시작한 팀 — 후반은 반대 */
  firstKickoff: number
  /** 이번 틱 시작 때 공의 x (골라인 통과 판정) */
  prevBallX: number
  players: Player[]
  ball: Ball
  teams: [Team, Team]
  rng: Rng
  /** 봇 전용 난수 — 사람 대전에서 봇이 없어도 경기 난수 흐름이 같게 */
  botRng: Rng
  events: SimEvent[]
  stats: [TeamStats, TeamStats]
  done: boolean
}

export interface SquadConfig {
  name: string
  short: string
  formation: string
  /** [0] 이 GK, [1..10] 이 FORMATION_SHAPE 순서. 11명을 넘는 것은 벤치 */
  players: PlayerSpec[]
  sliders?: Sliders
  presets?: [Sliders, Sliders, Sliders]
}

export interface MatchConfig {
  seed: number
  halfSec?: number
  squads: [SquadConfig, SquadConfig]
  /** 사람이 조작하는 팀. 기본 [false, false] = 봇 vs 봇 */
  human?: [boolean, boolean]
  /** 봇 난이도 (사람이 아닌 팀). 기본 2 */
  bots?: [Difficulty, Difficulty]
}

/** 팀 t 가 공격하는 골문의 x */
export function goalX(team: Team): number {
  return team.dir * HALF_L
}

export function emptyStats(): TeamStats {
  return { shots: 0, onTarget: 0, passes: 0, passOk: 0, tackles: 0, poss: 0, corners: 0, saves: 0 }
}
