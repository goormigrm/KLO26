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
/** 골 뒤 세레모니 (2026-09-11: 2.5 초 → 9 초 — 리플레이 5 초 + 세레모니. 허전하다는 사용자 제보) */
export const GOAL_TICKS = 540
/** 모두 건너뛰면 이만큼만 남기고 킥오프로 (화면이 툭 끊기지 않게) */
export const GOAL_SKIP_TICKS = 30
export const HALFTIME_TICKS = 300
export const FOUL_TICKS = 110
export const PENALTY_TICKS = 150

/** 센터 서클 반지름 = 프리킥 벽 거리 = 코너킥 거리 (m) */
export const CIRCLE_R = 9.15
/** 스로인 때 상대가 떨어져 있어야 하는 거리 (m) */
export const THROWIN_CLEAR = 2
/** 스로인 최대 속도 (m/s) — 손으로 던지므로 킥보다 훨씬 느리다 */
export const THROW_SPEED_MAX = 14
/** 교체 가능 인원 · 벤치 크기 */
export const MAX_SUBS = 3
export const BENCH_SIZE = 7

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
  /** 마지막으로 아군이 공을 찬 순간 오프사이드 위치였나 (DESIGN 4.9) */
  offside: boolean
  /** 스로인을 던지는 중 — 렌더가 두 팔을 올린다 */
  throwing: boolean
  /** 이 선수가 교체로 들어온 사람인가 (결과 화면 표시용) */
  subbedIn: boolean
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
  /** 이 슛을 찬 선수의 결정력(0~1) — 골키퍼가 잡을지·쳐낼지 정할 때 본다 (2026-09-11). 슛이 아니면 0 */
  shotQ: number
  /** 패스라면 받으라고 보낸 선수 idx */
  passTo: number
  /** 슛이 골문 안으로 향하고 있었나 (선방 통계) */
  onTarget: boolean
  /** 스로인으로 들어온 공 — 직접 골이 인정되지 않는다 */
  fromThrow: boolean
  /** 리스타트를 찬 선수 — 남이 만지기 전에 다시 만지면 두 번 터치 반칙 */
  restartBy: number
  /** 패스가 아직 살아 있다 (아무도 못 받았다) — 공간으로 보낸 패스도 성공률에 세기 위해 */
  passLive: boolean
}

export type Phase =
  | 'kickoff' | 'play' | 'goal' | 'throwin' | 'goalkick' | 'corner'
  | 'freekick' | 'penalty' | 'halftime' | 'end'

/** 세트피스 재개 정보 */
export interface Restart {
  team: number
  kicker: number
  x: number
  y: number
  /** 손으로 던진다 (스로인) — 차기 금지 */
  hands: boolean
  /** 이 재개에서는 오프사이드를 보지 않는다 (스로인·골킥·코너) */
  noOffside: boolean
}

/** 반칙 판정. ball.ts 가 rules.ts 를 import 하지 않도록, 틱 끝에서 sim 이 세트피스로 바꾼다 */
export interface PendingCall {
  kind: 'offside' | 'foul' | 'gkcharge' | 'twice'
  /** 재개를 얻는 팀 */
  team: number
  /** 반칙한 선수 (카드 대상). 없으면 −1 */
  by: number
  x: number
  y: number
  /** 0 없음 · 1 경고 · 2 퇴장 */
  card: number
  penalty: boolean
}

/** 교체 명령 — 다음 데드볼에 적용 (DESIGN 2장) */
export interface SubOrder {
  /** 나가는 선발 (팀 안 0~10) */
  out: number
  /** 들어오는 벤치 (0~6) */
  in: number
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
  /** Enter — 이번 골 세레모니를 건너뛰겠다 (온라인은 양쪽 다 true 여야 넘어간다) */
  skipCele: boolean
  /** 선수 idx 범위 [start, start+11) */
  start: number
  gk: number
  /** 벤치 — 교체로 들어올 수 있는 선수 (DESIGN 2장 · 7명) */
  bench: PlayerSpec[]
  /** 남은 교체 횟수 */
  subsLeft: number
  /** 넣어 둔 교체 명령 — 다음 데드볼에 적용 */
  pendingSub: SubOrder | null
  /** 골키퍼 돌진(수비 W) — 이 틱까지 GK 가 볼 소유자에게 나간다 */
  gkRush: number
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
  fouls: number
  yellows: number
  reds: number
  offsides: number
}

export type EventType =
  | 'goal' | 'shot' | 'save' | 'kickoff' | 'half' | 'end' | 'corner' | 'throwin' | 'goalkick' | 'tackle'
  | 'foul' | 'card' | 'offside' | 'penalty' | 'freekick' | 'sub' | 'post'
  /** 주심 휘슬 — 킥오프를 실제로 차는 순간 (kickoff 사건은 "자리 잡기", 휘슬은 "시작") */
  | 'whistle'
  /** 수비수가 슛을 몸으로 막았다 */
  | 'block'
  /** 추가시간 알림 — n = 분 */
  | 'added'

export interface SimEvent {
  tick: number
  type: EventType
  team: number
  player: number
  x: number
  y: number
  /** 카드면 1 경고 · 2 퇴장. 교체면 들어온 선수 idx. 그 밖엔 0 */
  n?: number
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
  /** 마지막 골 — 넣은 선수 idx(−1 = 자책골 등) · 팀. 세레모니가 여기로 모인다 */
  goalScorer: number
  goalTeam: number
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
  /** 이번 틱에 나온 반칙 — sim 이 틱 끝에서 세트피스로 바꾼다. 한 틱에 하나만 */
  pending: PendingCall | null
  /** 마지막 판정 문구용 — 배너가 읽는다 (렌더 전용, 해시에 안 들어간다) */
  callText: string
  /** callText 를 적은 틱 — HUD 가 잠깐만 띄운다 (렌더 전용) */
  callTick: number
  /** 이 하프에서 공이 죽어 있던 실시간 초 — 추가시간의 근거 (DESIGN 2장) */
  stoppage: number
  /** 발표한 추가시간(경기 분). −1 = 아직 안 정했다 */
  added: number
}

/** 추가시간 상한 (경기 분) · 시간이 다 된 뒤 공격 흐름을 기다려 주는 최대 실시간 초 */
export const ADDED_MAX_MIN = 5
export const END_GRACE_SEC = 20

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
  return {
    shots: 0, onTarget: 0, passes: 0, passOk: 0, tackles: 0, poss: 0, corners: 0, saves: 0,
    fouls: 0, yellows: 0, reds: 0, offsides: 0,
  }
}

/** 자기 진영 골문의 x */
export function ownGoalX(team: Team): number {
  return -team.dir * HALF_L
}

/** 경기에 뛰고 있는가 (퇴장 아님) */
export function onPitch(p: Player): boolean {
  return !p.sentOff
}

/** (x, y) 가 team 이 지키는 페널티 박스 안인가 */
export function inBoxOf(team: Team, x: number, y: number): boolean {
  return Math.abs(x - ownGoalX(team)) < BOX_L && Math.abs(y) < BOX_HALF_W
}
