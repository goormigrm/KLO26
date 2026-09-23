// 조작 연습 (2026-09-23, 사용자 "조작키가 늘었으니 연습 모드 — 선수 1명을 조작해서 특정 조작키를 특정 상황에서 성공할 때까지").
//
// 연습 하나 = **상황**(setup) + **성공 판정**(check). 진짜 sim 을 그대로 돌린다 — 판정·물리·AI 가 경기와 똑같다.
// 쓰지 않는 선수는 퇴장 상태로 "치워 둔다"(sentOff) — sim(이동·AI·판정·오프사이드 라인)과 렌더가 이미 빼고 돈다.
// 성공 판정은 **그 키로** 해냈는지까지 본다 (녹온이면 Shift 로 친 녹온, 감아차기면 감아찬 공의 골).
// DOM 을 모른다 — tests/practice.test.ts 가 같은 판정을 Node 에서 돌린다.

import { atan2A } from '../core/fixedmath'
import { doPass } from '../core/ball'
import { BTN_A, BTN_C, BTN_D, BTN_GK, BTN_PACE, BTN_Z, type Input } from '../core/input'
import { rand } from '../core/rng'
import { setupFreeKick, setupPenalty } from '../core/rules'
import type { Skills } from '../core/skills'
import { ACT_DIVE, ACT_FALLEN, ACT_RUN, ACT_SLIDE, CIRCLE_R, HALF_L, type GameState, type Phase, type Player } from '../core/state'

export type DrillCat = '드리블' | '패스' | '슛' | '수비' | '골키퍼' | '세트피스'
export const DRILL_CATS: DrillCat[] = ['드리블', '패스', '슛', '수비', '골키퍼', '세트피스']

/** 한 번의 시도 동안 판정이 들고 다니는 것 */
export interface DrillCtx {
  /** 시도를 시작한 틱 · 그때까지 쌓인 사건 수 */
  start: number
  evFrom: number
  /** 처음 조작하는 선수 */
  me: number
  /** 연습마다 쓰는 표시 (선수 번호 · 틱 · 0/1) */
  f: Record<string, number>
  /** 내가 찬 마지막 슛의 종류 (ball.passKind — shot·finesse·driven·power-good·chip·header·panenka…) */
  kind: string
}

export interface Drill {
  id: string
  cat: DrillCat
  title: string
  /** 누를 키 — 화면에 키캡으로 그린다 (`+` 는 함께, `→` 는 차례로) */
  keys: string
  /** 성공 조건 한 줄 */
  goal: string
  /** 요령 한 줄 */
  tip: string
  /** 이 안에 못 하면 다시 (초) */
  limit: number
  /** 실패로 보지 않는 단계 (세트피스 연습) */
  phases?: Phase[]
  setup(st: GameState, c: DrillCtx): void
  /** 한 틱이 끝난 뒤 — 이번 틱의 입력과 함께. true 성공 · 문자열 실패 이유 · null 계속 */
  check(st: GameState, c: DrillCtx, inp: Input): true | string | null
}

// ---------------------------------------------------------------- 상황 만들기

/** 전원을 치우고 play 로 — 연습에 쓸 선수만 `put` 으로 다시 세운다 */
function park(st: GameState): void {
  st.phase = 'play'
  st.phaseT = 0
  st.restart = null
  st.pending = null
  st.callText = ''
  for (const p of st.players) {
    p.sentOff = true
    p.x = (p.team === 0 ? -1 : 1) * (HALF_L + 12)
    p.y = -40 - (p.idx % 11) * 1.5
    p.vx = 0
    p.vy = 0
    p.action = ACT_RUN
    p.actT = 0
    p.press = false
    p.holdT = 0
    p.tackleT = 0
    p.tx = p.x
    p.ty = p.y
  }
  const b = st.ball
  b.owner = -1
  b.vx = 0
  b.vy = 0
  b.vz = 0
  b.z = 0
  b.passTo = -1
  b.passLive = false
  b.shotBy = -1
  b.restartBy = -1
  b.passKind = ''
}

/** 선수 하나를 (x, y) 에 세운다 — (fx, fy) 를 바라본다 */
function put(st: GameState, idx: number, x: number, y: number, fx: number, fy: number, v = 0): Player {
  const p = st.players[idx]
  p.sentOff = false
  p.x = x
  p.y = y
  p.facing = atan2A(fy - y, fx - x)
  const l = Math.hypot(fx - x, fy - y) || 1
  p.vx = ((fx - x) / l) * v
  p.vy = ((fy - y) / l) * v
  p.tx = x
  p.ty = y
  p.stamina = 1
  p.yellow = 0
  p.action = ACT_RUN
  p.lastKick = -100
  return p
}

function give(st: GameState, idx: number): void {
  const p = st.players[idx]
  const b = st.ball
  b.owner = idx
  b.lastTouch = idx
  b.lastTeam = p.team
  b.x = p.x
  b.y = p.y
  b.z = 0
  b.vx = p.vx
  b.vy = p.vy
  b.vz = 0
  b.kickTick = st.tick - 100
  p.gotT = st.tick - 100
}

/** 팀 t 필드 선수 중 능력치 key 가 가장 높은 사람 (not 은 빼고) — 내 스쿼드의 그 일에 맞는 선수로 연습한다 */
function best(st: GameState, t: number, key: keyof Skills, not: number[] = []): number {
  let bi = -1
  let bv = -1
  for (const p of st.players) {
    if (p.team !== t || p.sk.isGK || not.includes(p.idx)) continue
    const v = Number(p.sk[key])
    if (v > bv) {
      bv = v
      bi = p.idx
    }
  }
  return bi
}

/** 공을 가진 팀 (없으면 −1) */
function ownerTeam(st: GameState): number {
  return st.ball.owner < 0 ? -1 : st.players[st.ball.owner].team
}

/** 시도 시작 뒤에 난 사건 */
function since(st: GameState, c: DrillCtx, type: string, team = -1): { player: number; team: number; tick: number }[] {
  const out: { player: number; team: number; tick: number }[] = []
  for (let i = c.evFrom; i < st.events.length; i++) {
    const e = st.events[i]
    if (e.type === type && (team < 0 || e.team === team)) out.push(e)
  }
  return out
}

/** 공이 방금(이번 틱에) 발을 떠났나 — sim 이 틱 끝에 tick 을 올리므로 1 을 뺀다 */
function justKicked(st: GameState): boolean {
  return st.ball.kickTick === st.tick - 1
}

/** 내 슛의 종류를 따라간다 (드리븐처럼 날아가는 중에 바뀐다) */
function trackShot(st: GameState, c: DrillCtx, who = c.me): void {
  if (st.ball.shotBy === who) c.kind = st.ball.passKind
}

/** 키 하나를 누른 순간 (이번 틱 입력 · 지난 틱 표시로) */
function pressed(c: DrillCtx, inp: Input, bit: number, name: string): boolean {
  const now = (inp.buttons & bit) !== 0
  const was = c.f[name] === 1
  c.f[name] = now ? 1 : 0
  return now && !was
}

const KIND_TEXT: Record<string, string> = {
  shot: '보통 슛', finesse: '감아차기', flair: '플레어 슛', driven: '드리븐 슛', chip: '칩슛', header: '헤딩',
  panenka: '파넨카', power: '파워 슛(타이밍 빗나감)', 'power-good': '파워 슛',
}

/** 슛 연습의 공통 판정 — want 종류로 넣었으면 성공 */
function shotCheck(st: GameState, c: DrillCtx, want: string, what: string): true | string | null {
  trackShot(st, c)
  if (since(st, c, 'goal', 0).length > 0) {
    if (want === '' || c.kind === want) return true
    return `골! 그런데 ${KIND_TEXT[c.kind] ?? '다른 슛'}이었습니다 — ${what}`
  }
  if (since(st, c, 'goal', 1).length > 0) return '실점했습니다'
  if (ownerTeam(st) === 1) return st.players[st.ball.owner].sk.isGK ? '골키퍼가 잡았습니다' : '빼앗겼습니다'
  return null
}

/** 상대 골키퍼를 골문에 세운다 (홈이 공격하는 쪽 +x) */
function oppKeeper(st: GameState, x = HALF_L - 1.2): number {
  const g = st.teams[1].gk
  put(st, g, x, 0, 0, 0)
  return g
}

/** 우리 골키퍼 (홈이 지키는 쪽 −x) */
function ourKeeper(st: GameState, x = -HALF_L + 1.2): number {
  const g = st.teams[0].gk
  put(st, g, x, 0, 0, 0)
  return g
}

// ---------------------------------------------------------------- 연습 목록

export const DRILLS: Drill[] = [
  // ---- 드리블 ----
  {
    id: 'knock', cat: '드리블', title: '녹온 — 치고 달리기',
    keys: 'E + Shift', goal: '달리면서 Shift 로 공을 앞으로 차 놓고, 수비수를 지나 다시 잡기',
    tip: 'E 로 전력질주하다 Shift 를 짧게 톡. 공을 몰 때보다 빨리 달릴 수 있다 — 수비수 옆 빈 곳으로 방향키를 트세요',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'vmax')
      put(st, c.me, -14, 0, 0, 0, 5)
      give(st, c.me)
      c.f.def = best(st, 1, 'tck')
      put(st, c.f.def, 4, 0, -14, 0)
    },
    check(st, c, inp) {
      const b = st.ball
      if (b.passKind === 'knock' && b.lastTouch === c.me && justKicked(st)) c.f.knock = inp.buttons & BTN_PACE ? 1 : 2
      if (ownerTeam(st) === 1) return '수비수에게 빼앗겼습니다'
      const me = st.players[c.me]
      if (b.owner === c.me && me.x > st.players[c.f.def].x + 1.5) {
        if (c.f.knock === 1) return true
        if (!c.f.knock) return '녹온 없이 지나갔습니다 — 달리면서 Shift 를 톡'
      }
      return null
    },
  },
  {
    id: 'qknock', cat: '드리블', title: '퀵 녹온 — E 두 번',
    keys: 'E → E', goal: 'E 를 빠르게 두 번 눌러 길게 치고, 수비수를 지나 다시 잡기',
    tip: '0.25 초 안에 E 두 번. 세 번이면 더 길게 친다(슈퍼 녹온) — 너무 길면 수비수가 먼저 닿습니다',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'vmax')
      put(st, c.me, -14, 0, 0, 0, 4)
      give(st, c.me)
      c.f.def = best(st, 1, 'tck')
      put(st, c.f.def, 4, -1, -14, 0)
    },
    check(st, c, inp) {
      const b = st.ball
      if (b.passKind === 'knock' && b.lastTouch === c.me && justKicked(st)) c.f.knock = inp.buttons & BTN_PACE ? 1 : 2
      if (ownerTeam(st) === 1) return '수비수에게 빼앗겼습니다'
      const me = st.players[c.me]
      if (b.owner === c.me && me.x > st.players[c.f.def].x + 1.5) {
        if (c.f.knock === 2) return true
        return c.f.knock === 1 ? 'Shift 녹온이었습니다 — 이번엔 E 를 두 번' : '녹온 없이 지나갔습니다 — E 를 빠르게 두 번'
      }
      return null
    },
  },
  {
    id: 'firsttouch', cat: '드리블', title: '퍼스트 터치 녹온',
    keys: 'Ctrl + 방향키', goal: '오는 패스를 Ctrl+방향키로 받으면서 뒤의 수비수 반대쪽으로 치고 나가기',
    tip: '공이 오기 전에 Ctrl 과 방향키(↑ 또는 ↓)를 누르고 있으면, 받는 순간 그쪽으로 툭 친다',
    limit: 8,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'ctl')
      const mate = best(st, 0, 'pas', [c.me])
      put(st, c.me, 0, 0, 18, 5)
      put(st, mate, 18, 5, 0, 0)
      c.f.def = best(st, 1, 'tck')
      put(st, c.f.def, -6, 0.5, 0, 0)
      give(st, mate)
      doPass(st, st.players[mate], 'ground', c.me, 0, 0, 0.3)
      st.teams[0].controlled = c.me
    },
    check(st, c) {
      const b = st.ball
      // 받는 순간 친 녹온은 같은 틱에 공이 다시 발을 떠난다 — 발에 붙은 적 없이 'knock' 이면 퍼스트 터치다
      if (b.passKind === 'knock' && b.lastTouch === c.me && justKicked(st) && !c.f.held) c.f.ft = st.tick
      if (ownerTeam(st) === 1) return '빼앗겼습니다'
      if (b.owner === c.me) {
        if (c.f.ft) return true
        c.f.held = 1
        return '그냥 받았습니다 — Ctrl 과 방향키를 누른 채 받으세요'
      }
      return null
    },
  },
  {
    id: 'heel', cat: '드리블', title: '힐투볼롤 — 돌아서기',
    keys: 'Shift + Q + 방향키 앞 → 뒤', goal: '달려오는 수비수 앞에서 공을 끌며 돌아서고, 1 초 동안 지키기',
    tip: 'Shift 와 Q 를 누른 채, 방향키를 가는 쪽(→)으로 밀었다가 곧바로 반대(←)로',
    limit: 8,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'drib')
      put(st, c.me, 0, 0, 10, 0, 1.5)
      give(st, c.me)
      c.f.def = best(st, 1, 'tck')
      put(st, c.f.def, 8, 0, 0, 0)
    },
    check(st, c) {
      const me = st.players[c.me]
      if (!c.f.roll && me.skillT > st.tick) c.f.roll = st.tick
      if (ownerTeam(st) === 1) return '빼앗겼습니다'
      if (c.f.roll && st.ball.owner === c.me && st.tick - c.f.roll >= 60) return true
      return null
    },
  },

  // ---- 패스 ----
  {
    id: 'dink', cat: '패스', title: '딩크 패스 — S 두 번',
    keys: 'S → S', goal: '가운데 선 수비수 발 위로 살짝 띄워 동료에게',
    tip: 'S 를 떼서 패스가 나간 직후(0.15 초 안) S 를 한 번 더. 공이 발높이 위로 뜬다',
    limit: 8,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'pas')
      c.f.mate = best(st, 0, 'ctl', [c.me])
      put(st, c.me, 0, 0, 16, 0)
      put(st, c.f.mate, 16, 1, 0, 0)
      give(st, c.me)
      put(st, best(st, 1, 'tck'), 7, 0.4, 0, 0)
    },
    check(st, c) {
      const b = st.ball
      if (b.dink && b.lastTouch === c.me) c.f.dink = 1
      if (ownerTeam(st) === 1) return '끊겼습니다 — 수비수 발에 걸렸다'
      if (b.owner === c.f.mate) return c.f.dink ? true : '땅볼로 갔습니다 — S 를 뗀 직후 한 번 더'
      return null
    },
  },
  {
    id: 'cutback', cat: '패스', title: '컷백 — 드라이브 땅볼',
    keys: 'Z + S', goal: '골라인 근처에서 뒤쪽 동료에게 빠른 땅볼(컷백)',
    tip: 'Z 를 누른 채 S. 박스 옆 깊은 곳이면 방향키 없이도 뒤쪽 동료를 찾는다',
    limit: 8,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'crs')
      c.f.mate = best(st, 0, 'fin', [c.me])
      put(st, c.me, 44, 17, HALF_L, 17, 2)
      put(st, c.f.mate, 39, 1, HALF_L, 0)
      give(st, c.me)
      put(st, best(st, 1, 'tck'), 48, 7, 44, 17)
      oppKeeper(st)
    },
    check(st, c, inp) {
      const b = st.ball
      if (inp.buttons & BTN_Z) c.f.z = st.tick
      if (justKicked(st) && b.lastTouch === c.me && b.passKind === 'ground') c.f.drive = st.tick - (c.f.z ?? -99) <= 2 ? 1 : 2
      if (ownerTeam(st) === 1) return '끊겼습니다'
      if (b.owner === c.f.mate) return c.f.drive === 1 ? true : '보통 패스였습니다 — Z 를 누른 채 S'
      return null
    },
  },
  {
    id: 'lobthrough', cat: '패스', title: '로빙 스루 — 수비 뒤로 띄우기',
    keys: 'Q + W', goal: '수비 라인 뒤로 띄운 스루를 동료가 라인을 넘어 받기',
    tip: 'Q 를 누른 채 W. Z 까지 같이 누르면 낮게 깔리는 로빙 스루다. 동료가 뛰기 시작할 때 내면 오프사이드가 안 된다',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'pas')
      c.f.mate = best(st, 0, 'vmax', [c.me])
      put(st, c.me, 4, -4, 20, 0)
      // 동료는 라인 바로 뒤에서 이미 뛰기 시작했다 — 로빙 스루는 달리는 선수 앞, 수비 등 뒤에 떨어뜨리는 패스다
      put(st, c.f.mate, 16.5, 4, 30, 4, 6)
      give(st, c.me)
      put(st, best(st, 1, 'tck'), 19, 6, 0, 0)
      put(st, best(st, 1, 'posn', [best(st, 1, 'tck')]), 19, -2, 0, 0)
      oppKeeper(st)
    },
    check(st, c) {
      const b = st.ball
      if ((b.passKind === 'lobthrough' || b.passKind === 'lowlobthrough') && b.lastTouch === c.me) c.f.lob = 1
      if (ownerTeam(st) === 1) return '끊겼습니다'
      if (b.owner === c.f.mate && st.players[c.f.mate].x > 20.5) return c.f.lob ? true : '땅볼 스루였습니다 — Q 를 누른 채 W'
      return null
    },
  },
  {
    id: 'onetwo', cat: '패스', title: '원투 — 침투 패스',
    keys: 'Q + S → W', goal: 'Q+S 로 주고 뛰어 들어가, 받은 동료로 W 스루를 돌려받기',
    tip: 'Q+S 를 하면 패스한 선수가 앞으로 뛴다. 조작은 받은 동료로 넘어오니 그 선수로 W — 앞으로 뛰는 선수에게',
    limit: 12,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'vmax')
      c.f.mate = best(st, 0, 'pas', [c.me])
      // 이미 달리고 있다 — 원투는 멈춘 채가 아니라 달리며 주고받는다
      put(st, c.me, 0, -6, 14, -6, 5)
      put(st, c.f.mate, 15, 3, 0, 0)
      give(st, c.me)
      // 붙는 수비수는 바깥에서 온다 — 동료에게 가는 길은 열려 있고, 뒤로 돌아 들어가는 길을 막는다
      put(st, best(st, 1, 'tck'), 6, -9, 0, -6)
      put(st, best(st, 1, 'posn', [best(st, 1, 'tck')]), 27, 0, 0, 0)
      oppKeeper(st)
    },
    check(st, c) {
      const b = st.ball
      const me = st.players[c.me]
      if (me.goUntil > st.tick && b.lastTouch === c.me) c.f.go = 1
      if (ownerTeam(st) === 1) return '끊겼습니다'
      if (b.owner === c.me && me.x >= 14) return c.f.go ? true : '침투 패스(Q+S)로 시작하세요'
      return null
    },
  },
  {
    id: 'lowcross', cat: '패스', title: '낮은 크로스 — A 두 번',
    keys: 'A → A', goal: '측면에서 낮고 빠른 크로스를 박스 안 동료에게',
    tip: 'A 로 띄운 직후(0.15 초 안) A 를 한 번 더 — 낮게 깔린다. Q+A 는 높게, Z+A 는 빠르게',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'crs')
      put(st, c.me, 38, 25, HALF_L, 20, 2)
      give(st, c.me)
      put(st, best(st, 0, 'head', [c.me]), 46, 2, HALF_L, 0)
      put(st, best(st, 0, 'fin', [c.me, best(st, 0, 'head', [c.me])]), 43, -4, HALF_L, 0)
      put(st, best(st, 1, 'tck'), 47, 0, 38, 25)
      oppKeeper(st)
    },
    check(st, c) {
      const b = st.ball
      if (b.passKind === 'lowcross' && b.lastTouch === c.me) c.f.lc = 1
      if (since(st, c, 'goal', 0).length > 0 || (b.owner >= 0 && b.owner !== c.me && ownerTeam(st) === 0)) {
        return c.f.lc ? true : '높게 갔습니다 — A 를 뗀 직후 A 한 번 더'
      }
      if (ownerTeam(st) === 1) return '끊겼습니다'
      return null
    },
  },

  // ---- 슛 ----
  {
    id: 'finesse', cat: '슛', title: '감아차기',
    keys: 'Z + D', goal: '박스 모서리에서 가까운 포스트 쪽 구석으로 감아 넣기',
    tip: 'Z 를 누른 채 D 를 모았다 떼기(가까운 포스트 쪽 ↗). 공이 포스트 바깥으로 나갔다 안쪽으로 휘어 붙는다 — 먼 포스트는 거리만큼 골키퍼가 따라간다',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'fin')
      put(st, c.me, 33, 11, HALF_L, 0)
      give(st, c.me)
      // 수비수는 바깥에서 붙으러 온다 — 먼 포스트로 가는 길은 비어 있다
      put(st, best(st, 1, 'tck'), 36.5, 14.5, 33, 11)
      oppKeeper(st)
    },
    check: (st, c) => shotCheck(st, c, 'finesse', 'Z 를 누른 채 D'),
  },
  {
    id: 'driven', cat: '슛', title: '드리븐 슛 — D 두 번',
    keys: 'D → D', goal: '낮고 세게 깔아 차서 넣기',
    tip: 'D 를 떼서 슛이 나간 직후(0.15 초 안) D 를 한 번 더. Z 도 누르고 있으면 감기는 드리븐',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'sho')
      put(st, c.me, 34, -3, HALF_L, 0)
      give(st, c.me)
      oppKeeper(st)
    },
    check: (st, c) => shotCheck(st, c, 'driven', 'D 를 뗀 직후 D 한 번 더'),
  },
  {
    id: 'power', cat: '슛', title: '파워 슛 — 타이밍 게이지',
    keys: 'F + D → D', goal: '머리 위 게이지가 초록일 때 D 를 한 번 더 눌러 넣기',
    tip: 'F 를 누른 채 D 를 모았다 뗀다. 0.5 초 준비 동안 흰 눈금이 초록 칸에 올 때 D',
    limit: 12,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'sho')
      put(st, c.me, 31, 5, HALF_L, 0)
      give(st, c.me)
      oppKeeper(st)
    },
    check: (st, c) => shotCheck(st, c, 'power-good', '게이지 초록에서 D'),
  },
  {
    id: 'chip', cat: '슛', title: '칩슛',
    keys: 'Q + D', goal: '앞으로 나온 골키퍼 머리 위로 띄워 넣기',
    tip: 'Q 를 누른 채 D. 적게 모을수록 높고 느리다 — 골키퍼가 나왔을 때만 쓰세요',
    limit: 10,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'fin')
      put(st, c.me, 36, 0, HALF_L, 0, 3)
      give(st, c.me)
      oppKeeper(st, 45)
    },
    check: (st, c) => shotCheck(st, c, 'chip', 'Q 를 누른 채 D'),
  },
  {
    id: 'fake', cat: '슛', title: '페이크 슛 → 슛',
    keys: 'Z + C + D', goal: '앞의 수비수를 페이크로 묶고 슛으로 넣기',
    tip: '수비수에게 몰고 가다 4 m 앞에서 Z 와 C 를 누른 채 D — 차는 척만 한다. 속은 수비수는 0.4 초 못 움직인다. 그 옆으로 지나가 슛',
    limit: 12,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'drib')
      put(st, c.me, 22, 0, HALF_L, 0, 5)
      give(st, c.me)
      c.f.def = best(st, 1, 'tck')
      put(st, c.f.def, 31, 0.3, 22, 0)
      oppKeeper(st)
    },
    check(st, c) {
      if (st.teams[0].fakeT >= c.start) c.f.fake = 1
      const r = shotCheck(st, c, '', '')
      if (r === true && !c.f.fake) return '골! 그런데 페이크 없이 넣었습니다 — Z+C+D 로 먼저 속이세요'
      return r
    },
  },
  {
    id: 'header', cat: '슛', title: '헤딩 슛',
    keys: 'D (공중볼)', goal: '측면 크로스를 머리로 넣기',
    tip: '크로스가 오면 공 쪽으로 가며 D 를 누르고 있기 — 머리 높이에서 닿는 순간 헤딩 슛',
    limit: 8,
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'head')
      put(st, c.me, 40, -2, HALF_L, 0)
      const w = best(st, 0, 'crs', [c.me])
      put(st, w, 40, 25, HALF_L, 0)
      give(st, w)
      doPass(st, st.players[w], 'highcross', c.me, 0, 0, 0.6)
      put(st, best(st, 1, 'head'), 47, 6, 40, 25)
      oppKeeper(st)
      st.teams[0].controlled = c.me
    },
    check: (st, c) => shotCheck(st, c, 'header', '공중볼이 머리 높이에 올 때 D'),
  },

  // ---- 수비 ----
  {
    id: 'barge', cat: '수비', title: '어깨 밀치기',
    keys: 'D (붙어서 누른 순간)', goal: '나란히 달리는 공격수를 어깨로 밀어 공을 뺏기 (반칙 없이)',
    tip: '옆에 붙었을 때 D 를 톡. 뒤에서 밀면 반칙이다 — 옆이나 앞에서. 힘(몸싸움)이 셀수록 잘 된다',
    limit: 10,
    setup(st, c) {
      park(st)
      c.f.att = best(st, 1, 'drib')
      put(st, c.f.att, -8, 0, -HALF_L, 0, 4)
      give(st, c.f.att)
      c.me = best(st, 0, 'str')
      put(st, c.me, -8.3, 1.1, -HALF_L, 0, 4)
      ourKeeper(st)
      st.teams[0].controlled = c.me
    },
    check(st, c, inp) {
      if (pressed(c, inp, BTN_D, 'dh')) c.f.barge = st.tick
      if (since(st, c, 'tackle', 0).some((e) => e.player === c.me && e.tick - (c.f.barge ?? -99) <= 2)) return true
      if (ownerTeam(st) === 0) return '공은 뺏었지만 밀치기가 아니었습니다 — 붙어서 D 를 톡'
      if (st.players[c.f.att].x < -34) return '돌파당했습니다'
      return null
    },
  },
  {
    id: 'jockey', cat: '수비', title: '견제 — 붙어서 다투기',
    keys: 'C + 방향키(상대 쪽)', goal: 'C 로 마주 보며 버티다 방향키를 상대 쪽으로 넣어 뺏기',
    tip: 'C 만 누르면 뒷걸음으로 버틴다. 거리가 2 m 안일 때 방향키를 상대 쪽으로 — 견제 자세의 도전은 1.5배 잘 뺏는다',
    limit: 12,
    setup(st, c) {
      park(st)
      c.f.att = best(st, 1, 'drib')
      put(st, c.f.att, -4, 3, -HALF_L, 0, 4)
      give(st, c.f.att)
      c.me = best(st, 0, 'tck')
      put(st, c.me, -16, 0, 0, 0)
      ourKeeper(st)
      st.teams[0].controlled = c.me
    },
    check(st, c, inp) {
      if (inp.buttons & BTN_C) c.f.c = st.tick
      if (since(st, c, 'tackle', 0).some((e) => e.player === c.me)) {
        return st.tick - (c.f.c ?? -99) <= 2 ? true : '뺏었지만 견제(C)가 아니었습니다'
      }
      const a = st.players[c.f.att]
      if (a.x < st.players[c.me].x - 4 && st.ball.owner === c.f.att) return '제쳐졌습니다'
      return null
    },
  },
  {
    id: 'slide', cat: '수비', title: '슬라이딩 → 빨리 일어나기',
    keys: 'A → A', goal: '슬라이딩으로 공을 끊고, A 를 한 번 더 눌러 바로 일어나기',
    tip: '공 쪽으로 A. 미끄러지는 동안(또는 넘어진 뒤) A 를 한 번 더 누르면 0.05 초 만에 일어난다',
    limit: 10,
    setup(st, c) {
      park(st)
      c.f.att = best(st, 1, 'drib')
      put(st, c.f.att, -6, 5, -HALF_L, 0, 4)
      give(st, c.f.att)
      c.me = best(st, 0, 'tck')
      put(st, c.me, -15, 2, 0, 0)
      ourKeeper(st)
      st.teams[0].controlled = c.me
    },
    check(st, c, inp) {
      const me = st.players[c.me]
      if (pressed(c, inp, BTN_A, 'ah') && me.slid && (me.action === ACT_SLIDE || me.action === ACT_FALLEN)) c.f.quick = 1
      if (since(st, c, 'tackle', 0).some((e) => e.player === c.me)) c.f.won = 1
      if (c.f.won && me.action === ACT_RUN) return c.f.quick ? true : '끊었습니다 — 이번엔 미끄러지는 동안 A 를 한 번 더'
      if (st.players[c.f.att].x < -36 && st.ball.owner === c.f.att) return '돌파당했습니다'
      return null
    },
  },
  {
    id: 'switch', cat: '수비', title: '선수 바꾸기 — 방향 지정',
    keys: 'Shift + 방향키', goal: '먼 쪽 수비수로 바로 바꿔 공격수를 막아 공을 뺏기',
    tip: 'Shift 를 누른 채 바꾸고 싶은 동료 쪽 방향키. S 는 공에 가까운 순서라 원하는 선수가 안 나올 수 있다',
    limit: 14,
    setup(st, c) {
      park(st)
      c.f.att = best(st, 1, 'drib')
      put(st, c.f.att, -8, 14, -HALF_L, 0, 4)
      give(st, c.f.att)
      c.me = best(st, 0, 'vmax')
      c.f.other = best(st, 0, 'tck', [c.me])
      put(st, c.me, -30, -14, 0, 0)
      put(st, c.f.other, -24, 9, 0, 0)
      ourKeeper(st)
      st.teams[0].controlled = c.me
    },
    check(st, c, inp) {
      const t = st.teams[0]
      if (t.controlled === c.f.other && (inp.buttons & BTN_PACE)) c.f.sw = 1
      if (ownerTeam(st) === 0) return c.f.sw ? true : '뺏었지만 Shift+방향키로 바꾸지 않았습니다'
      if (since(st, c, 'goal', 1).length > 0) return '실점했습니다'
      if (st.players[c.f.att].x < -38) return '돌파당했습니다'
      return null
    },
  },

  // ---- 골키퍼 ----
  {
    id: 'keeper', cat: '골키퍼', title: '골키퍼 직접 조작 — 1대1',
    keys: '` + 방향키', goal: '` 로 골키퍼를 잡고 앞으로 나가 각을 좁혀 막기',
    tip: '` 를 누르고 있는 동안 골키퍼를 움직인다. 잡기·다이빙은 저절로 — 위치만 잡아 주세요. 박스 밖에서는 손을 못 쓴다',
    limit: 12,
    setup(st, c) {
      park(st)
      c.f.att = best(st, 1, 'fin')
      put(st, c.f.att, -26, 3, -HALF_L, 0, 5)
      give(st, c.f.att)
      c.me = ourKeeper(st, -51)
    },
    check(st, c, inp) {
      if (inp.buttons & BTN_GK) c.f.gk = 1
      const gk = st.teams[0].gk
      if (st.ball.owner === gk || since(st, c, 'save', 0).length > 0) return c.f.gk ? true : '막았지만 직접 조작(`)이 아니었습니다'
      if (since(st, c, 'goal', 1).length > 0) return '실점했습니다'
      return null
    },
  },
  {
    id: 'pksave', cat: '골키퍼', title: 'PK 막기 — 다이빙 방향',
    keys: 'D + 방향키', goal: '키커가 차기 전에 다이빙 방향을 골라 막기',
    tip: '화면 기준 ← → 로 다이빙 쪽을 고른다(D·Shift·Ctrl + 방향키). 차는 순간 그쪽으로 난다. W·A·S·D 만 누르면 방해 동작',
    limit: 8,
    phases: ['penalty'],
    setup(st, c) {
      park(st)
      put(st, best(st, 1, 'pen'), 0, 0, 0, 0)
      c.me = ourKeeper(st)
      setupPenalty(st, 1)
      st.phaseT = 150
    },
    check(st, c) {
      if (st.phase === 'penalty') {
        if (st.teams[0].pkDive) c.f.dive = 1
        return null
      }
      if (!c.f.kick) c.f.kick = st.tick
      if (since(st, c, 'goal', 1).length > 0) return c.f.dive ? '실점 — 반대로 뛰었거나 못 닿았습니다' : '실점 — 다이빙 방향을 고르지 않았습니다'
      if (st.tick - c.f.kick > 150 || (st.phase !== 'play' && st.phase !== 'goal')) {
        return c.f.dive ? true : '막았지만 운이었습니다 — D+방향키로 방향을 고르세요'
      }
      return null
    },
  },
  {
    id: 'call', cat: '골키퍼', title: '선수 부르기 → 배급',
    keys: 'C → S', goal: '공을 든 골키퍼가 C 로 동료를 불러, 받으러 온 동료에게 S 로 주기',
    tip: 'C 를 누르면 방향키 쪽(없으면 가까운) 동료가 받으러 온다. 붙어 있는 상대를 피해 S',
    limit: 12,
    setup(st, c) {
      park(st)
      c.me = ourKeeper(st, -48)
      give(st, c.me)
      // 손에 든 공은 시간이 다 되면 AI 가 배급한다 — 연습 시간보다 길게
      st.players[c.me].holdT = 900
      const m1 = best(st, 0, 'pas')
      put(st, m1, -32, 14, 0, 0)
      put(st, best(st, 0, 'ctl', [m1]), -32, -14, 0, 0)
      // 상대 공격수 둘은 아래쪽을 막고 있다 — 위쪽 동료를 불러 그쪽으로 준다
      const f1 = best(st, 1, 'vmax')
      put(st, f1, -36, -7, -48, 0)
      put(st, best(st, 1, 'sta', [f1]), -31, -1, -48, 0)
    },
    check(st, c) {
      for (const p of st.players) if (p.team === 0 && p.callT > st.tick) c.f.called = p.idx + 1
      if (ownerTeam(st) === 1) return '빼앗겼습니다'
      const o = st.ball.owner
      if (o >= 0 && o !== c.me && ownerTeam(st) === 0) {
        if (!c.f.called) return '줬지만 부르지 않았습니다 — C 로 먼저 부르세요'
        return o === c.f.called - 1 ? true : '부른 선수가 아닌 다른 선수에게 갔습니다'
      }
      return null
    },
  },

  // ---- 세트피스 ----
  {
    id: 'freekick', cat: '세트피스', title: '직접 프리킥 — 벽 넘기기',
    keys: '방향키 + D (Z 감아차기)', goal: '22 m 프리킥을 벽 위로 넘겨 넣기',
    tip: '← → 코너 · ↑ 높이. 높게 겨누면 톱스핀으로 떨어진다. 낮으면 벽에 맞는다 — 점선이 예상 궤적',
    limit: 25,
    phases: ['freekick'],
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'fin')
      put(st, c.me, 29, 5, HALF_L, 0)
      const gk = oppKeeper(st)
      setupFreeKick(st, 0, 30, 5)
      st.phaseT = 99999
      // 벽 넷 — 공과 골문 가운데 사이 9.45 m, 어깨를 맞대고 (ai.setPieceDefend 와 같은 자리)
      const r = st.restart!
      const d = Math.hypot(HALF_L - r.x, r.y)
      const ux = (HALF_L - r.x) / d
      const uy = -r.y / d
      let k = 0
      for (const p of st.players) {
        if (p.team !== 1 || p.idx === gk || k >= 4) continue
        const off = (k - 1.5) * 0.65
        put(st, p.idx, r.x + ux * (CIRCLE_R + 0.3) - uy * off, r.y + uy * (CIRCLE_R + 0.3) + ux * off, r.x, r.y)
        k++
      }
    },
    check(st, c) {
      if (st.phase === 'freekick') return null
      if (!c.f.kick) c.f.kick = st.tick
      trackShot(st, c)
      if (since(st, c, 'goal', 0).length > 0) return true
      if (since(st, c, 'block', 1).length > 0) return '벽에 맞았습니다 — 조금 더 높게(↑)'
      if (ownerTeam(st) === 1) return '골키퍼가 잡았습니다'
      if (st.phase !== 'play' && st.phase !== 'goal') return '빗나갔습니다'
      if (st.tick - c.f.kick > 150) return '골이 안 됐습니다'
      return null
    },
  },
  {
    id: 'panenka', cat: '세트피스', title: '파넨카 PK',
    keys: 'Q + D', goal: '먼저 몸을 날린 골키퍼 위로 가운데에 살짝 띄워 넣기',
    tip: 'Q 를 누른 채 D 를 게이지 절반쯤(1.7~2칸) 모았다 떼기. 너무 모으면 크로스바를 넘는다. 이 연습의 골키퍼는 대부분 먼저 뛴다',
    limit: 25,
    phases: ['penalty'],
    setup(st, c) {
      park(st)
      c.me = best(st, 0, 'pen')
      put(st, c.me, 40, 0, HALF_L, 0)
      oppKeeper(st)
      setupPenalty(st, 0)
      st.phaseT = 99999
    },
    check(st, c) {
      if (st.phase === 'penalty') return null
      if (!c.f.kick) {
        c.f.kick = st.tick
        // 연습 전용 — 골키퍼가 넷 중 셋은 먼저 한쪽으로 몸을 날린다 (경기의 봇 골키퍼는 공을 보고 반응한다)
        const gk = st.players[st.teams[1].gk]
        if (rand(st.botRng) < 0.75 && gk.action === ACT_RUN) {
          gk.action = ACT_DIVE
          gk.actT = 24
          gk.diveHigh = false
          gk.vx = 0
          gk.vy = (rand(st.botRng) < 0.5 ? -1 : 1) * 5
        }
      }
      return shotCheck(st, c, 'panenka', 'Q 를 누른 채 D') ?? (st.phase !== 'play' && st.phase !== 'goal' ? '빗나갔습니다' : st.tick - c.f.kick > 150 ? '골이 안 됐습니다' : null)
    },
  },
  {
    id: 'wall', cat: '세트피스', title: '프리킥 수비 — 벽 점프',
    keys: 'W (차는 순간)', goal: '상대 직접 프리킥을 벽이 뛰어올라 막기',
    tip: '벽 위로 감아 차는 공이다 — 키커가 차는 순간(±0.3 초) W. 너무 일찍 뛰면 내려와 버린다. C/E 좌우 · Z 전진(경고 위험)',
    limit: 10,
    phases: ['freekick'],
    setup(st, c) {
      park(st)
      put(st, best(st, 1, 'fin'), -30, 0, -HALF_L, 0)
      ourKeeper(st)
      setupFreeKick(st, 1, -31, 0)
      st.phaseT = 150
      const r = st.restart!
      let k = 0
      for (const p of st.players) {
        if (p.team !== 0 || p.sk.isGK || k >= 4) continue
        put(st, p.idx, r.x - (CIRCLE_R + 0.3), (k - 1.5) * 0.65, r.x, r.y)
        if (k === 1) c.me = p.idx
        k++
      }
      st.teams[0].controlled = c.me
    },
    check(st, c) {
      if (st.phase === 'freekick') return null
      if (!c.f.kick) c.f.kick = st.tick
      if (since(st, c, 'block', 0).length > 0) return true
      if (since(st, c, 'goal', 1).length > 0) return '실점 — 벽을 넘어갔습니다'
      if (st.tick - c.f.kick > 90 || st.phase !== 'play') return '벽이 막지 못했습니다 — 차는 순간 W'
      return null
    },
  },
]

export function drillById(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id)
}

export function newCtx(st: GameState): DrillCtx {
  return { start: st.tick, evFrom: st.events.length, me: -1, f: {}, kind: '' }
}

/** 연습 상황을 세운다 — 판정 기준(시작 틱·사건 수)은 상황을 다 세운 **뒤**의 것 */
export function startDrill(d: Drill, st: GameState): DrillCtx {
  const c = newCtx(st)
  d.setup(st, c)
  c.start = st.tick
  c.evFrom = st.events.length
  if (c.me >= 0 && st.players[c.me].team === 0 && !st.players[c.me].sk.isGK && st.teams[0].controlled < 0) st.teams[0].controlled = c.me
  return c
}

/**
 * 한 틱 뒤의 판정 — 연습의 판정이 먼저, 그다음 공통 실패(공이 나감·반칙·시간 초과).
 * true 성공 · 문자열 실패 이유 · null 계속
 */
export function judge(d: Drill, st: GameState, c: DrillCtx, inp: Input): true | string | null {
  const r = d.check(st, c, inp)
  if (r !== null) return r
  if (st.phase !== 'play' && !(d.phases ?? []).includes(st.phase)) {
    if (st.phase === 'goal') return since(st, c, 'goal', 0).length > 0 ? '골은 났지만 이 연습의 조건이 아닙니다' : '실점했습니다'
    if (st.phase === 'freekick' || st.phase === 'penalty') return st.callText ? `반칙 — ${st.callText}` : '반칙'
    return '공이 나갔습니다'
  }
  if ((st.tick - c.start) / 60 > d.limit) return '시간 초과'
  return null
}
