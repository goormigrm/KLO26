// 🤖 조작 연습 시범 (2026-09-23, 사용자 "AI 가 먼저 키를 누르며 성공하는 시범을 보이도록").
//
// 연습마다 **사람 키보드와 똑같은 입력**(방향키는 8방향 · 버튼 비트)을 한 틱씩 내는 대본이 있다. 사람이 그대로 따라 할 수 있게
// 방향키는 −127·0·127 만 쓴다. 대본은 상태를 보고 반응한다(수비수가 7 m 안이면 녹온 · 공이 오면 헤딩 …).
//
// **시범은 반드시 성공해야 한다** — sim 이 결정론이므로 화면 없이 시드 몇 개를 먼저 돌려(`findDemoSeed`) 성공한 시드를 찾고,
// 그 시드를 같은 대본으로 화면에서 다시 돌리면 똑같이 성공한다. 스쿼드(내 선수들)가 바뀌면 결과가 바뀌므로 시드는 그때그때 찾는다.
// DOM 을 모른다 — tests/practice.test.ts 가 연습마다 시범이 성공하는 시드가 있는지 본다.

import {
  BTN_A, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_F, BTN_GK, BTN_PACE, BTN_Q, BTN_S, BTN_SPACE, BTN_W, BTN_Z, EMPTY_INPUT, type Input,
} from '../core/input'
import { step } from '../core/sim'
import { HALF_L, type GameState } from '../core/state'
import { judge, startDrill, type Drill, type DrillCtx } from './drills'

/** 대본 — k: 시도 시작 뒤 틱 · m: 대본이 쓰는 메모 (시도마다 새로) */
export type DemoFn = (k: number, st: GameState, c: DrillCtx, m: Record<string, number>) => Input

function I(buttons: number, mx = 0, my = 0): Input {
  return { mx, my, buttons, a: 0, b: 0 }
}

/** 8방향 방향키 — 사람 키보드가 낼 수 있는 값만 (±127 · 0) */
function dir8(dx: number, dy: number): { mx: number; my: number } {
  const l = Math.hypot(dx, dy)
  if (l < 1e-6) return { mx: 0, my: 0 }
  const ux = dx / l
  const uy = dy / l
  return { mx: ux > 0.38 ? 127 : ux < -0.38 ? -127 : 0, my: uy > 0.38 ? 127 : uy < -0.38 ? -127 : 0 }
}

/** buttons 를 누른 채 (fx,fy) → (tx,ty) 쪽 방향키 */
function go(buttons: number, fx: number, fy: number, tx: number, ty: number): Input {
  const d = dir8(tx - fx, ty - fy)
  return I(buttons, d.mx, d.my)
}

function gap(st: GameState, a: number, b: number): number {
  const p = st.players[a]
  const q = st.players[b]
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** 공이 발에서 떠 있으면 쫓아가고, 가지고 있으면 (mx,my) 로 */
function chaseOr(st: GameState, me: number, buttons: number, mx: number, my: number): Input {
  const p = st.players[me]
  const b = st.ball
  if (b.owner !== me) return go(buttons, p.x, p.y, b.x, b.y)
  return I(buttons, mx, my)
}

export const DEMOS: Record<string, DemoFn> = {
  // ---- 드리블 ----
  knock(k, st, c, m) {
    // 전력질주로 달리다 수비수 7 m 앞에서 Shift 톡 — 대각선으로 차 놓고 쫓아간다
    if (!m.t && st.ball.owner === c.me && gap(st, c.me, c.f.def) < 7) {
      m.t = k
      return I(BTN_E | BTN_PACE, 127, 127)
    }
    if (m.t && k - m.t < 30) return chaseOr(st, c.me, BTN_E, 127, 127)
    return chaseOr(st, c.me, BTN_E, 127, 0)
  },
  qknock(k, st, c, m) {
    // E 를 뗐다 두 번 톡톡 (0.25 초 안) — 퀵 녹온
    if (!m.t && st.ball.owner === c.me && gap(st, c.me, c.f.def) < 7.5) m.t = k
    if (m.t) {
      const j = k - m.t
      if (j === 0 || j === 2) return I(0, 127, 127)
      if (j === 1 || j === 3) return I(BTN_E, 127, 127)
      return chaseOr(st, c.me, BTN_E, 127, j < 30 ? 127 : 0)
    }
    return I(BTN_E, 127, 0)
  },
  firsttouch(_k, st, c, m) {
    // 공이 오기 전부터 Ctrl + ↑ — 받는 순간 위로 친다. 그다음 쫓아가 잡는다
    const b = st.ball
    if (!m.done && b.passKind === 'knock' && b.lastTouch === c.me) m.done = 1
    if (!m.done) return I(BTN_CTRL, 0, 127)
    return chaseOr(st, c.me, BTN_E, 0, 127)
  },
  heel(k) {
    // → 로 몰다가 Shift+Q 를 누른 채 → 다음 ← (앞 → 뒤) — 돌아서서 반대로 몬다
    if (k < 8) return I(0, 127, 0)
    if (k === 8) return I(BTN_PACE | BTN_Q, 127, 0)
    if (k === 9) return I(BTN_PACE | BTN_Q, -127, 0)
    return I(k < 30 ? 0 : BTN_E, -127, 0)
  },

  // ---- 패스 ----
  dink(k) {
    // S 를 짧게(0.1 초) 눌렀다 떼고, 바로 S 한 번 더
    if (k < 6) return I(BTN_S, 127, 0)
    if (k === 7) return I(BTN_S, 127, 0)
    return I(0)
  },
  cutback(k) {
    // Z 를 누른 채 S — 박스 옆 깊은 곳이라 뒤쪽 동료에게
    if (k < 6) return I(BTN_Z | BTN_S)
    if (k < 10) return I(BTN_Z)
    return I(0)
  },
  lobthrough(k) {
    // Q 를 누른 채 W — 달리는 동료 앞, 수비 라인 뒤로
    if (k < 3) return I(BTN_Q, 127, 127)
    if (k === 3) return I(BTN_Q | BTN_W, 127, 127)
    return I(0)
  },
  onetwo(k, st, c, m) {
    // Q+S 로 주고(나는 앞으로 뛴다) → 받은 동료로 W 스루를 뛰는 나에게
    const me = st.players[c.me]
    const mate = st.players[c.f.mate]
    if (k < 4) return go(BTN_Q | BTN_S, me.x, me.y, mate.x, mate.y)
    if (k === 4) return I(BTN_Q)
    if (st.ball.owner === c.f.mate && !m.w && me.x >= mate.x - 3) {
      // 뛰는 내가 동료와 나란해지면 — 내 앞 공간으로
      m.w = 1
      return go(BTN_W, mate.x, mate.y, me.x + 8, me.y + 2)
    }
    return I(0)
  },
  lowcross(k) {
    // A 로 띄운 직후 A 한 번 더 — 낮게 깔린다
    if (k === 0) return I(BTN_A, 127, -127)
    if (k === 2) return I(BTN_A)
    return I(0)
  },

  // ---- 슛 ----
  finesse(k) {
    // Z 를 누른 채 D 를 모았다 떼기 — 가까운 포스트(↗) 쪽 구석으로, 바깥에서 안으로 휘어 붙는다
    if (k < 28) return I(BTN_Z | BTN_D, 127, 127)
    if (k < 32) return I(BTN_Z, 127, 127)
    return I(0)
  },
  driven(k) {
    // D 를 모았다 떼고 곧바로 D 한 번 더
    if (k < 16) return I(BTN_D, 127, 127)
    if (k === 18) return I(BTN_D)
    return I(0)
  },
  power(k, st) {
    // F 를 누른 채 D 를 모았다 떼면 준비 0.5 초 — 게이지 초록(19~24틱)에서 D
    if (k < 18) return I(BTN_F | BTN_D, 127, -127)
    if (k === 18) return I(BTN_F, 127, -127)
    const t = st.teams[0]
    if (t.powerT >= 0 && st.tick - t.powerT === 21) return I(BTN_D)
    return I(0)
  },
  chip(k) {
    // Q 를 누른 채 D 를 조금만 모았다 떼기 — 나온 골키퍼 머리 위로
    if (k < 8) return I(BTN_Q | BTN_D, 127, 0)
    if (k < 11) return I(BTN_Q)
    return I(0)
  },
  fake(k, st, c, m) {
    // 수비수에게 몰고 가다 4 m 앞에서 Z+C 를 누른 채 D — 차는 척. 굳은 수비수 옆(↗)으로 지나가 빈 쪽으로 슛
    if (!m.f) {
      if (st.ball.owner === c.me && gap(st, c.me, c.f.def) < 4.2) m.f = k
      else return I(0, 127, 0)
    }
    const j = k - m.f
    if (j === 0) return I(BTN_Z | BTN_C, 127, 0)
    if (j === 1) return I(BTN_Z | BTN_C | BTN_D, 127, 0)
    if (j === 2) return I(BTN_Z | BTN_C, 127, 0)
    // 굳은 수비수 **옆을 지나칠 때까지** ↗ 전력질주 → 지나치면 곧장 골문 쪽으로 몰아 16 m 안에서 D 를 모아 슛.
    // (32차: 지나치기 전에 차면 공이 수비수 발 앞에서 출발해 막힌다 — 드리블 터치가 생긴 뒤 수비수 코앞의 터치가 짧아졌다.
    //  20 m 밖 슛은 골키퍼가 거의 다 잡는다 — `tools/demovar.ts` 로 조준·파워·거리를 쟀다)
    if (!m.p) {
      const dir = st.teams[0].dir
      const me = st.players[c.me]
      const df = st.players[c.f.def]
      const passed = (me.x - df.x) * dir > 0.8
      if ((passed && Math.abs(me.x - dir * HALF_L) < 16) || j > 120) m.p = k
      else return passed ? I(BTN_E, 127, 0) : I(BTN_E, 127, 127)
    }
    const q = k - m.p
    if (q < 14) return I(BTN_D, 127, 127)
    return I(0)
  },
  header() {
    // 크로스가 오면 받을 선수가 저절로 공 쪽으로 간다 — D 를 누르고 있으면 머리에 닿는 순간 헤딩 슛
    return I(BTN_D)
  },

  // ---- 수비 ----
  barge(k, st, c, m) {
    // 옆에 붙어 나란히 달리다, 1.25 m 안이면 D 톡 (어깨)
    const me = st.players[c.me]
    const att = st.players[c.f.att]
    if (gap(st, c.me, c.f.att) < 1.25 && k - (m.last ?? -99) > 12) {
      m.last = k
      return go(BTN_D | BTN_E, me.x, me.y, att.x, att.y)
    }
    return go(BTN_E, me.x, me.y, att.x - 0.6, att.y + 0.9)
  },
  jockey(_k, st, c) {
    // C 를 누른 채 상대 쪽 방향키 — 견제 자세로 붙어서 다툰다
    const me = st.players[c.me]
    const att = st.players[c.f.att]
    return go(BTN_C, me.x, me.y, att.x, att.y)
  },
  slide(k, st, c, m) {
    // 공이 오는 줄(같은 높이)에 먼저 서고, 2.8 m 안으로 오면 공 쪽 방향키 + A — 공을 먼저 친다(비스듬히 들어가면 사람을 친다).
    // 미끄러지는 중에 A 한 번 더
    // 공이 올 길(0.8 초 뒤 자리)로 먼저 간다 → 4 m 안이면 방향키를 놓고 → 2.8 m 안이면 방향키 없이 A = 공이 올 자리로 눕는다
    // 공격수가 등을 돌리면 뒤에서 들어가는 것이 된다(반칙) — 나를 향해 오고 있을 때만 눕는다
    const me = st.players[c.me]
    const att = st.players[c.f.att]
    const b = st.ball
    if (m.s) return k === m.s + 3 ? I(BTN_A) : I(0)
    const d = Math.hypot(b.x - me.x, b.y - me.y)
    const coming = (att.vx * (me.x - att.x) + att.vy * (me.y - att.y)) / Math.max(0.1, gap(st, c.me, c.f.att)) > 1.5
    if (d > 4) return go(BTN_E, me.x, me.y, b.x + b.vx * 0.8, b.y + b.vy * 0.8)
    if (d < 2.8 && coming) {
      m.s = k
      return I(BTN_A)
    }
    return I(0)
  },
  switch(k, st, c) {
    // Shift + ↑ 로 먼 쪽 동료로 바꾸고, 그 선수로 D 압박
    const t = st.teams[0]
    const me = st.players[c.me]
    const other = st.players[c.f.other]
    const att = st.players[c.f.att]
    if (k === 0 || t.controlled === c.me) return go(BTN_PACE, me.x, me.y, other.x, other.y)
    return go(BTN_D, other.x, other.y, att.x, att.y)
  },

  // ---- 골키퍼 ----
  keeper(_k, st) {
    // ` 를 누른 채 공과 골문 가운데를 잇는 선 위로 나가 각을 좁힌다 (잡기·다이빙은 저절로)
    const gk = st.players[st.teams[0].gk]
    const b = st.ball
    const gx = -HALF_L
    const dx = b.x - gx
    const dy = b.y
    const l = Math.hypot(dx, dy) || 1
    const r = Math.min(9, l * 0.45)
    const tx = gx + (dx / l) * r
    const ty = (dy / l) * r
    if (Math.hypot(tx - gk.x, ty - gk.y) < 0.4) return I(BTN_GK)
    return go(BTN_GK, gk.x, gk.y, tx, ty)
  },
  pksave(k) {
    // 키커가 차기 전에 D + → (화면 오른쪽으로 다이빙)
    return k === 20 ? I(BTN_D, 127, 0) : I(0)
  },
  call(k, st, c, m) {
    // C 를 누르며 ↗ — 위쪽 동료가 받으러 온다. 가까이 오면 그 쪽으로 S
    const gk = st.players[c.me]
    if (k === 5) return go(BTN_C, gk.x, gk.y, gk.x + 16, gk.y + 14)
    const called = c.f.called ? st.players[c.f.called - 1] : null
    if (called && k >= 55 && !m.s) {
      m.s = k
      return go(BTN_S, gk.x, gk.y, called.x, called.y)
    }
    return I(0)
  },

  // ---- 세트피스 ----
  freekick(k) {
    // 화면 기준 → (먼 코너) + ↑ (높게) 를 누른 채 D 를 모았다 떼기
    if (k < 26) return I(BTN_D, 127, 127)
    return I(0)
  },
  panenka(k) {
    // Q 를 누른 채 D 를 게이지 절반쯤 모았다 떼기
    if (k < 17) return I(BTN_Q | BTN_D)
    if (k < 19) return I(BTN_Q)
    return I(0)
  },
  wall(_k, st) {
    // 키커가 차기 0.13 초 전에 W — 벽이 뛰어올라 있을 때 공이 닿는다
    return st.phase === 'freekick' && st.phaseT === 8 ? I(BTN_W) : I(0)
  },
}

/** 한 틱의 시범 입력 */
export function demoInput(d: Drill, k: number, st: GameState, c: DrillCtx, m: Record<string, number>): Input {
  const f = DEMOS[d.id]
  return f ? f(k, st, c, m) : EMPTY_INPUT
}

/** 화면 없이 한 번 끝까지 — 시범이 성공하면 true */
export function runDemo(d: Drill, st: GameState): boolean {
  const c = startDrill(d, st)
  const m: Record<string, number> = {}
  for (let k = 0; k < d.limit * 60 + 120; k++) {
    const i = demoInput(d, k, st, c, m)
    step(st, [i, EMPTY_INPUT])
    const r = judge(d, st, c, i)
    if (r !== null) return r === true
  }
  return false
}

/**
 * 시범이 성공하는 시드를 찾는다 — seeds 순서대로 화면 없이 돌려 본다. makeState 는 그 시드의 새 경기(연습 화면과 같은 스쿼드).
 * 못 찾으면 −1. `budgetMs` 를 넘기면 거기서 멈추고 −1 (느린 PC 에서 화면이 굳지 않게 — 부르는 쪽이 조금씩 나눠 부른다)
 */
export function findDemoSeed(d: Drill, makeState: (seed: number) => GameState, seeds: number[], budgetMs = Infinity): number {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  for (const s of seeds) {
    if (runDemo(d, makeState(s))) return s
    if (typeof performance !== 'undefined' && performance.now() - t0 > budgetMs) break
  }
  return -1
}

/** 입력 → 누른 물리 키 이름 (시범 때 입력 키 표시·키캡에 불을 켠다 — 렌더 전용) */
export function inputCodes(i: Input): string[] {
  const out: string[] = []
  if (i.mx > 0) out.push('ArrowRight')
  if (i.mx < 0) out.push('ArrowLeft')
  if (i.my > 0) out.push('ArrowUp')
  if (i.my < 0) out.push('ArrowDown')
  const map: [number, string][] = [
    [BTN_S, 'KeyS'], [BTN_W, 'KeyW'], [BTN_A, 'KeyA'], [BTN_D, 'KeyD'], [BTN_E, 'KeyE'], [BTN_PACE, 'ShiftLeft'],
    [BTN_SPACE, 'Space'], [BTN_C, 'KeyC'], [BTN_Q, 'KeyQ'], [BTN_Z, 'KeyZ'], [BTN_F, 'KeyF'], [BTN_CTRL, 'ControlLeft'], [BTN_GK, 'Backquote'],
  ]
  for (const [bit, code] of map) if (i.buttons & bit) out.push(code)
  return out
}
