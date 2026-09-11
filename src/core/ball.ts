// 공을 다루는 판정 — 소유·드리블·태클·패스·슛·걷어내기·GK·스로인·오프사이드 표시·파울 (DESIGN 4.4~4.9).
// 난수는 전부 st.rng 에서 뽑고, 뽑는 순서를 바꾸지 않는다.
// 반칙은 여기서 판정만 하고 `st.pending` 에 적어 둔다 — 세트피스로 바꾸는 것은 rules.ts(sim 이 부른다).

import { atan2A, clamp, cosA, len, sinA } from './fixedmath'
import { feetX, feetY } from './physics'
import { rand, type Rng } from './rng'
import {
  ACT_DIVE, ACT_KICK, ACT_RUN, ACT_SLIDE, BOX_HALF_W, BOX_L, CONTROL_R, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W,
  THROW_SPEED_MAX, goalX, inBoxOf, ownGoalX, type GameState, type PendingCall, type Player,
} from './state'

/** 각도 단위(1024/360) — 도 → 각도 */
export const DEG = 1024 / 360
export const G = 9.81

/** 균등난수 셋의 합으로 정규분포를 흉내 낸다 (sd ≈ 1) */
export function randN(r: Rng): number {
  return (rand(r) + rand(r) + rand(r) - 1.5) * 2
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return len(bx - ax, by - ay)
}

/** 점 (px,py) 에서 선분 (ax,ay)-(bx,by) 까지 거리 — 빠른 공이 한 틱에 발을 "뚫고" 지나가는 것을 막는다 */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return len(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * 공을 따라잡을 수 있는 가장 이른 지점 — 0.1 s 씩 공을 굴려 보며 선수가 그 시간 안에 닿는 첫 점.
 * 못 따라잡으면 공이 멈추는 자리.
 */
export function interceptPoint(st: GameState, p: Player, out: { x: number; y: number }): void {
  const b = st.ball
  let vx = b.vx
  let vy = b.vy
  let x = b.x
  let y = b.y
  const air = b.z > 0.2
  for (let i = 1; i <= 25; i++) {
    const sp = len(vx, vy)
    if (air) {
      vx *= 1 - 0.25 * 0.1
      vy *= 1 - 0.25 * 0.1
    } else if (sp > 0) {
      const ns = Math.max(0, sp - 4.0 * 0.1)
      vx *= ns / sp
      vy *= ns / sp
    }
    x += vx * 0.1
    y += vy * 0.1
    const t = i * 0.1
    // 반응 시간 — 예측(posn)이 좋을수록 먼저 움직인다 (0.35 → 0.10 s). 짧은 경합은 속도보다 이게 가른다 (2026-09-11)
    const react = 0.35 - 0.25 * p.sk.posn
    if (dist(p.x, p.y, x, y) <= p.sk.vmax * Math.max(0, t - react) * 0.9 + 0.5) {
      out.x = x
      out.y = y
      return
    }
    if (sp < 0.2) break
  }
  out.x = x
  out.y = y
}

/** 가장 가까운 상대 선수까지의 거리 */
export function nearestOppDist(st: GameState, p: Player): number {
  let best = 99
  for (const q of st.players) {
    if (q.team === p.team || q.sentOff) continue
    const d = dist(p.x, p.y, q.x, q.y)
    if (d < best) best = d
  }
  return best
}

/** 상대 GK (퇴장이면 −1) */
export function oppGK(st: GameState, teamIdx: number): Player | null {
  const gk = st.players[st.teams[1 - teamIdx].gk]
  return gk.sentOff ? null : gk
}

/** 공을 발에 붙인다 — v1 드리블 모델: 서 있으면 0.30 m 앞, 달리면 drib 가 낮을수록 멀리 (뺏기기 쉽다) */
export function attachBall(st: GameState, p: Player): void {
  const b = st.ball
  const team = st.teams[p.team]
  if (p.holdT > 0) {
    // GK 가 손에 들고 있다 — 가슴 높이. 아무도 뺏을 수 없다 (tryControl·contestBall·slideContest 가 막는다)
    b.x = feetX(p, 0.2)
    b.y = feetY(p, 0.2)
    b.z = 1.0
    b.vx = p.vx
    b.vy = p.vy
    b.vz = 0
    return
  }
  const sp = len(p.vx, p.vy)
  const spK = clamp(sp / p.sk.vmax, 0, 1)
  let off = 0.3 + spK * (0.35 + (1 - p.sk.drib) * 0.45)
  if (team.human && team.controlled === p.idx && team.slow) off = 0.25
  b.x = feetX(p, off)
  b.y = feetY(p, off)
  b.z = 0
  b.vx = p.vx
  b.vy = p.vy
  b.vz = 0
}

// ---------------------------------------------------------------- 오프사이드

/** 상대 팀에서 골문 쪽으로 두 번째 선수의 x (teamIdx 가 공격하는 방향 기준, 절대 좌표) */
export function offsideLineX(st: GameState, teamIdx: number): number {
  const dir = st.teams[teamIdx].dir
  let m1 = -99
  let m2 = -99
  for (const q of st.players) {
    if (q.team === teamIdx || q.sentOff) continue
    const v = q.x * dir
    if (v > m1) {
      m2 = m1
      m1 = v
    } else if (v > m2) m2 = v
  }
  return m2 * dir
}

/** 오프사이드 표시를 전부 지운다 (스로인·골킥·코너·재개 뒤) */
export function clearOffside(st: GameState): void {
  for (const p of st.players) p.offside = false
}

/**
 * 공이 아군 발을 떠나는 순간, 오프사이드 **위치**에 있는 아군을 표시한다 (DESIGN 4.9).
 * 판정(반칙)은 표시된 선수가 공을 먼저 만졌을 때 난다 — 관여해야 오프사이드다.
 * 세 조건: 상대 진영 · 공보다 앞 · 뒤에서 두 번째 상대보다 앞.
 */
export function markOffside(st: GameState, kicker: Player): void {
  const dir = st.teams[kicker.team].dir
  const line = offsideLineX(st, kicker.team) * dir
  const bx = st.ball.x * dir
  for (const q of st.players) {
    if (q.team !== kicker.team) {
      q.offside = false
      continue
    }
    if (q.idx === kicker.idx || q.sentOff) {
      q.offside = false
      continue
    }
    const v = q.x * dir
    q.offside = v > 0.05 && v > bx + 0.05 && v > line + 0.05
  }
}

// ---------------------------------------------------------------- 소유

function giveBall(st: GameState, p: Player): void {
  const b = st.ball
  const wasLive = b.passLive
  const sameTeam = b.lastTeam === p.team && b.lastTouch !== p.idx
  const fromRestart = b.restartBy
  b.owner = p.idx
  b.lastTouch = p.idx
  b.lastTeam = p.team
  b.shotBy = -1
  b.onTarget = false
  b.passTo = -1
  b.vz = 0
  b.fromThrow = false
  b.passLive = false
  p.gotT = st.tick
  if (wasLive && sameTeam) st.stats[p.team].passOk++
  touchedBall(st, p, fromRestart)
}

/**
 * 누가 공을 만졌다 — 오프사이드와 "두 번 터치"를 여기서 한 곳에서 본다.
 * fromRestart 는 만지기 **직전**의 `ball.restartBy`.
 */
function touchedBall(st: GameState, p: Player, fromRestart: number): void {
  const b = st.ball
  if (fromRestart === p.idx) {
    // 리스타트를 찬 사람이 남이 만지기 전에 또 만졌다 — 상대 프리킥
    b.restartBy = -1
    call(st, { kind: 'twice', team: 1 - p.team, by: p.idx, x: b.x, y: b.y, card: 0, penalty: false })
    return
  }
  b.restartBy = -1
  if (!p.offside) return
  if (b.lastTeam !== p.team) return
  p.offside = false
  st.stats[p.team].offsides++
  call(st, { kind: 'offside', team: 1 - p.team, by: p.idx, x: p.x, y: p.y, card: 0, penalty: false })
}

/** 반칙을 적어 둔다. 한 틱에 하나만 — 먼저 난 것이 이긴다 */
function call(st: GameState, c: PendingCall): void {
  if (st.pending) return
  st.pending = c
}

/**
 * 자유 공 잡기. 자격 있는 선수 중 가장 가까운 한 명만 시도한다 (동률은 idx 가 작은 쪽).
 * 방금 찬 사람은 8틱 동안 자기 공을 다시 못 잡는다.
 */
export function tryControl(st: GameState): void {
  const b = st.ball
  if (b.owner >= 0 || b.z > 2.2) return
  const speed = len(b.vx, b.vy)
  let best: Player | null = null
  let bestD = 99
  // 이번 틱에 공이 지나온 선분 — 빠른 공도 발 옆을 지나면 잡을 기회가 있다
  const px = b.x - b.vx * DT
  const py = b.y - b.vy * DT
  for (const p of st.players) {
    if (p.sentOff) continue
    if (p.action !== ACT_RUN && p.action !== ACT_KICK) continue
    if (st.tick - p.lastKick <= 8) continue
    if (p.sk.isGK && p.holdT > 0) continue
    // 상대 패스를 끊는 것은 위치 선정(posn)이 좋은 수비수가 더 멀리서 한다 (수비 강화 — 2026-09-10)
    const intercept = b.passLive && b.lastTeam !== p.team ? 0.28 * p.sk.posn : 0
    const reach = CONTROL_R + (speed > 8 ? 0.15 : 0) + (b.passTo === p.idx ? 0.35 : 0) + intercept
    const d = distToSegment(feetX(p, 0.25), feetY(p, 0.25), px, py, b.x, b.y)
    if (d < reach && d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return
  const p = best
  // 받으라고 보낸 선수는 공을 **기다리고 있다** — 퍼스트 터치가 훨씬 잘 붙는다.
  // 예전엔 남의 공을 가로채는 것과 같은 확률이라 패스 성공률이 44% 에 머물렀다 (2026-09-09 계측).
  const intended = b.passTo === p.idx
  let chance: number
  if (b.z > 1.2) chance = (intended ? 0.52 : 0.3) + 0.5 * p.sk.head
  else if (intended) {
    // 전력으로 달리며 받는 공은 발에 안 붙는다 — 최고 속도의 60% 넘게 달리는 만큼 최대 −0.18 (2026-09-11)
    const rushK = clamp((len(p.vx, p.vy) / Math.max(1, p.sk.vmax) - 0.6) / 0.4, 0, 1)
    chance = 0.74 + 0.24 * p.sk.ctl - clamp((speed - 16) / 34, 0, 0.28) - 0.18 * rushK
  }
  else {
    chance = 0.6 + 0.4 * p.sk.ctl - clamp((speed - 6) / 30, 0, 0.5)
    // 남의 패스를 가로채는 것은 마크(mark)가 좋을수록 깔끔하다 (0.15 → 0.4 — 2026-09-11 검증에서 mar 가 안 닿았다)
    if (b.lastTeam !== p.team && b.passLive) chance += 0.4 * p.sk.mark - 0.1
  }
  if (rand(st.rng) < chance) {
    giveBall(st, p)
    return
  }
  // 튕김 — 이것도 "만진" 것이다 (오프사이드·두 번 터치가 걸린다)
  const fromRestart = b.restartBy
  const a = atan2A(b.vy, b.vx) + Math.round(randN(st.rng) * 40 * DEG)
  const ns = speed * 0.35 + 1
  b.vx = cosA(a) * ns
  b.vy = sinA(a) * ns
  b.vz = Math.max(b.vz * 0.3, 0)
  const wasTeam = b.lastTeam
  b.lastTouch = p.idx
  b.shotBy = -1
  b.passTo = -1
  p.lastKick = st.tick
  if (wasTeam === p.team) touchedBall(st, p, fromRestart)
  else {
    b.restartBy = -1
    b.passLive = false
    b.fromThrow = false
  }
  b.lastTeam = p.team
}

// ---------------------------------------------------------------- 태클 · 파울

/** 뒤에서 들어갔나 — 0(정면) ~ 1(등 뒤) */
function fromBehind(o: Player, q: Player): number {
  const rel = atan2A(q.y - o.y, q.x - o.x)
  let dd = (rel - o.facing) & 1023
  if (dd > 512) dd = 1024 - dd
  return 1 - dd / 512
}

/** 파울을 선언한다. 박스 안이면 PK. card: 0 없음 · 1 경고 (두 번째 경고면 퇴장으로 올린다) */
function foul(st: GameState, offender: Player, x: number, y: number, cardChance: number, kind: 'foul' | 'gkcharge'): void {
  const victimTeam = 1 - offender.team
  const defTeam = st.teams[offender.team]
  // 반칙한 팀이 지키는 박스 안이면 PK. GK 차징(공격수가 GK 를 덮친 것)은 PK 가 아니다
  const pk = kind === 'foul' && inBoxOf(defTeam, x, y)
  let card = 0
  if (rand(st.rng) < cardChance) card = offender.yellow >= 1 ? 2 : 1
  st.stats[offender.team].fouls++
  call(st, { kind, team: victimTeam, by: offender.idx, x, y, card, penalty: pk })
}

/** 볼 소유자에게 붙은 상대가 뺏으려 한다 — 한 틱에 한 명만 (DESIGN 4.8 압박) */
export function contestBall(st: GameState, o: Player): void {
  const b = st.ball
  const team = st.teams[o.team]
  const slow = team.human && team.controlled === o.idx && team.slow
  const gkHolding = o.holdT > 0
  // 공을 몰고 전력으로 달리면 터치가 길어져 공이 발에서 멀어진다 — 최고 속도의 60% 를 넘는 만큼 최대 +0.3 m
  // (실제 축구에서 빠른 드리블러도 전력 질주하면 태클에 취약하다 · 2026-09-11 속도 지배 완화)
  const oSpd = len(o.vx, o.vy) / Math.max(1, o.sk.vmax)
  const loose = clamp((oSpd - 0.6) / 0.4, 0, 1) * 0.3
  const baseReach = gkHolding ? 1.0 : 0.6 + (1 - o.sk.drib) * 0.5 - (slow ? 0.15 : 0) + loose
  for (const q of st.players) {
    if (q.team === o.team || q.action !== ACT_RUN || q.sentOff) continue
    if (!q.press && q.tackleT <= 0) continue
    const d = dist(feetX(q, 0.3), feetY(q, 0.3), b.x, b.y)
    // 2026-09-11 검증 — 태클(tck)만 올려서는 승률이 안 움직였다(태클이 판에 5번뿐). 잘 하는 수비수는
    // **더 먼 발에서** 공을 건드려 기회 자체가 늘게 한다
    const reach = gkHolding ? baseReach : q.sk.isGK ? 1.1 : baseReach + 0.3 * q.sk.tck
    if (d > reach) continue
    if (gkHolding) {
      // 골키퍼가 손에 들고 있는 공은 뺏을 수 없다 — 도전 자체가 반칙 (DESIGN 4.7)
      foul(st, q, b.x, b.y, 0.18, 'gkcharge')
      return
    }
    const angleF = 0.55 + 0.45 * (1 - fromBehind(o, q))
    if (q.sk.isGK) {
      // 골키퍼가 발 앞 공을 손으로 덮친다 — 핸들링이 좋을수록. 잡으면 손에 든다 (2026-09-11: 드리블 골 막기)
      const pg = 0.03 * (0.5 + q.sk.gkHand) * angleF * (1 + 1.5 * loose)
      const roll = rand(st.rng)
      if (roll < pg) {
        giveBall(st, q)
        q.holdT = 90 + Math.round(rand(st.rng) * 60)
        o.lastKick = st.tick
        st.stats[q.team].tackles++
        st.events.push({ tick: st.tick, type: 'tackle', team: q.team, player: q.idx, x: b.x, y: b.y })
        return
      }
      // 덮치다 사람을 잡으면 파울 (박스 안이라 PK)
      if (roll < pg + 0.006 + 0.02 * fromBehind(o, q)) {
        foul(st, q, b.x, b.y, 0.05, 'foul')
        return
      }
      continue
    }
    // 전력으로 몰고 달리는 공은 닿는 거리도 늘지만(loose) **뺏길 확률도** 오른다 — 사용자 지적 2026-09-11
    let p = 0.05 * (0.3 + 1.3 * q.sk.tck) * (1.4 - 0.8 * o.sk.drib) * angleF * (0.6 + 0.8 * (q.sk.str / (q.sk.str + o.sk.str + 0.0001))) * (1 + 2.0 * loose)
    if (q.tackleT > 0) p *= 3
    if (slow) p *= 0.6
    // 견제(C 홀드) 중인 수비수는 자세를 잡고 있다 — 드리블러가 들이받으면 더 잘 뺏는다 (2026-09-10)
    const qt = st.teams[q.team]
    if (qt.human && qt.controlled === q.idx && qt.jockey) p *= 1.5
    const roll = rand(st.rng)
    if (roll < p) {
      // 뺏겼다 — 공이 태클한 쪽으로 튄다
      const a = atan2A(q.y - o.y, q.x - o.x)
      b.owner = -1
      b.vx = cosA(a) * 2.5 + q.vx * 0.5 + randN(st.rng) * 0.8
      b.vy = sinA(a) * 2.5 + q.vy * 0.5 + randN(st.rng) * 0.8
      b.vz = 0
      b.lastTouch = q.idx
      b.lastTeam = q.team
      b.shotBy = -1
      b.passTo = -1
      b.restartBy = -1
      b.passLive = false
      b.fromThrow = false
      o.lastKick = st.tick
      q.lastKick = st.tick - 6
      st.stats[q.team].tackles++
      st.events.push({ tick: st.tick, type: 'tackle', team: q.team, player: q.idx, x: b.x, y: b.y })
      return
    }
    // 실패 — 뒤에서 밀었으면 파울 (스탠딩 태클은 더 거칠다).
    // 2026-09-11 (사용자 제보 "D 로 수비하면 거의 다 파울") — 예전 계수(틱당 1~6.5%)는 붙어 있는 1초 동안 파울이
    // 거의 확실했고 판당 파울(17.7)이 태클 성공(16.4)보다 많았다. 정면 1/3 · 뒤 2/7 · 성향 1/4 로 (판당 파울 17.7 → 13 · 태클 16 → 26): 정면은 드물고 뒤에서만 위험하다
    const behind = fromBehind(o, q)
    let foulP = 0.003 + 0.010 * behind + 0.005 * q.sk.agg
    if (q.tackleT > 0) foulP *= 2.2
    if (roll < p + foulP) {
      foul(st, q, b.x, b.y, 0.02 + 0.08 * behind, 'foul')
      return
    }
  }
}

/** 슬라이딩 중인 선수가 공에 닿으면 걷어낸다. 못 닿고 사람만 치면 파울 (뒤에서면 카드) */
export function slideContest(st: GameState, q: Player): void {
  const b = st.ball
  if (q.action !== ACT_SLIDE || q.sentOff) return
  const fx = feetX(q, 0.5)
  const fy = feetY(q, 0.5)
  const d = dist(fx, fy, b.x, b.y)
  if (b.owner >= 0) {
    const o = st.players[b.owner]
    if (o.team === q.team) return
    // 골키퍼가 손에 든 공에는 슬라이딩으로 도전할 수 없다 — 반칙 (사용자 지적 2)
    if (o.holdT > 0) {
      if (dist(fx, fy, o.x, o.y) < 1.4) {
        q.actT = 0
        foul(st, q, o.x, o.y, 0.28, 'gkcharge')
      }
      return
    }
    if (d > 0.7 || b.z > 0.8) {
      // 공은 못 건드리고 사람만 쳤다 → 파울
      if (dist(fx, fy, o.x, o.y) < 1.0 && st.tick - q.lastKick > 20) {
        const behind = fromBehind(o, q)
        q.lastKick = st.tick
        foul(st, q, o.x, o.y, 0.08 + 0.22 * behind, 'foul')
      }
      return
    }
    if (rand(st.rng) >= 0.45 + 0.4 * q.sk.tck) {
      // 태클 실패 — 발을 걸었다
      const behind = fromBehind(o, q)
      q.lastKick = st.tick
      foul(st, q, o.x, o.y, 0.06 + 0.20 * behind, 'foul')
      return
    }
    o.lastKick = st.tick
    st.stats[q.team].tackles++
    st.events.push({ tick: st.tick, type: 'tackle', team: q.team, player: q.idx, x: b.x, y: b.y })
  } else if (d > 0.7 || b.z > 0.8) return
  const fromRestart = b.restartBy
  b.owner = -1
  b.vx = cosA(q.facing) * 6 + randN(st.rng)
  b.vy = sinA(q.facing) * 6 + randN(st.rng)
  b.vz = 0.5
  const wasTeam = b.lastTeam
  b.lastTouch = q.idx
  b.shotBy = -1
  b.passTo = -1
  q.lastKick = st.tick
  if (wasTeam === q.team) touchedBall(st, q, fromRestart)
  else {
    b.restartBy = -1
    b.passLive = false
    b.fromThrow = false
  }
  b.lastTeam = q.team
}

// ---------------------------------------------------------------- 차기

function releaseBall(st: GameState, p: Player, markOff = true): void {
  const b = st.ball
  b.owner = -1
  b.kickTick = st.tick
  b.lastTouch = p.idx
  b.lastTeam = p.team
  b.shotBy = -1
  b.passTo = -1
  b.onTarget = false
  b.fromThrow = false
  b.restartBy = -1
  b.passLive = false
  p.lastKick = st.tick
  p.holdT = 0
  p.throwing = false
  p.action = ACT_KICK
  p.actT = 6
  if (markOff) markOffside(st, p)
}

export type PassKind = 'ground' | 'through' | 'lob' | 'lowcross' | 'highcross'

/** 스틱(또는 바라보는 방향) 콘 안에서 가장 좋은 동료. 없으면 −1 */
export function pickPassTarget(st: GameState, p: Player, dx: number, dy: number, through: boolean): number {
  let ang: number
  if (dx === 0 && dy === 0) ang = p.facing
  else ang = atan2A(dy, dx)
  let best = -1
  let bestS = -99
  for (let cone = 45; cone <= 90; cone += 45) {
    for (const q of st.players) {
      if (q.team !== p.team || q.idx === p.idx || q.sentOff) continue
      if (through && q.sk.isGK) continue
      const d = dist(p.x, p.y, q.x, q.y)
      if (d < 2) continue
      const qa = atan2A(q.y - p.y, q.x - p.x)
      let dd = (qa - ang) & 1023
      if (dd > 512) dd = 1024 - dd
      const deg = dd / DEG
      if (deg > cone) continue
      let s = 1 - deg / cone - (d > 40 ? 0.4 : d > 25 ? 0.15 : 0)
      // 오프사이드 위치의 동료에게는 보내지 않는다
      const dir = st.teams[p.team].dir
      const line = offsideLineX(st, p.team) * dir
      if (q.x * dir > line + 0.05 && q.x * dir > 0 && q.x * dir > p.x * dir) s -= 0.8
      if (s > bestS) {
        bestS = s
        best = q.idx
      }
    }
    if (best >= 0) break
  }
  return best
}

/** 로빙 패스·크로스의 속도 — d m 를 띄워 보낼 때. 공기 저항(선형 0.25)이 있어 이론 포물선보다 짧게 떨어지니 보정 계수로 되돌린다. 난수 없음 (렌더 미리보기에도 쓴다) */
export function lobVector(d: number): { speed: number; vz: number } {
  const T = clamp(d / 13, 0.9, 2.6)
  return { speed: (d / T) * (1.08 + 0.13 * T), vz: 0.5 * G * T * 1.06 }
}

/**
 * 패스. target ≥ 0 이면 그 동료에게(AI), −1 이면 (dx,dy) 방향으로 공간에.
 * aim 을 주면 낙하점을 그대로 쓴다(코너킥·골킥).
 */
export function doPass(
  st: GameState,
  p: Player,
  kind: PassKind,
  target: number,
  dx: number,
  dy: number,
  hold: number,
  aim?: { x: number; y: number },
): void {
  const b = st.ball
  const team = st.teams[p.team]
  const dir = team.dir
  let ax: number
  let ay: number
  let d: number
  const bx = b.x
  const by = b.y
  if (aim) {
    ax = aim.x
    ay = aim.y
    d = dist(bx, by, ax, ay)
  } else if (target >= 0) {
    const q = st.players[target]
    d = dist(bx, by, q.x, q.y)
    const t = d / clamp(7 + 0.55 * d, 8, 18)
    ax = q.x + q.vx * t
    ay = q.y + q.vy * t
    if (kind === 'through') {
      ax += dir * (4 + 3 * hold)
      ay += (0 - q.y) * 0.1
    }
    d = dist(bx, by, ax, ay)
  } else {
    let ux = dx
    let uy = dy
    const l = len(ux, uy)
    if (l === 0) {
      ux = cosA(p.facing)
      uy = sinA(p.facing)
    } else {
      ux /= l
      uy /= l
    }
    d = kind === 'through' ? 14 + 10 * hold : 10 + 10 * hold
    ax = bx + ux * d
    ay = by + uy * d
  }
  // 속도
  let speed: number
  let vz = 0
  const aerial = kind === 'lob' || kind === 'highcross'
  if (aerial) {
    const v = lobVector(d)
    speed = v.speed
    vz = v.vz
  } else if (kind === 'lowcross') {
    speed = clamp(12 + 0.6 * d, 14, 24)
    vz = 0.8
  } else {
    // 땅볼: 8~18 m/s (마찰 4 m/s² 로 18 m/s 면 40 m 굴러간다)
    speed = clamp(7 + 0.55 * d, 8, 18) * (1 + hold * 0.2)
    if (kind === 'through') speed *= 1.15
  }
  // 오차
  const acc = aerial || kind === 'lowcross' ? p.sk.crs : p.sk.pas
  // 2026-09-11 검증 — 각도 오차(pas 38→92 에서 3.7°→0.5°)만으로는 패스 성공률이 43% 에서 안 움직였다.
  // 패스가 죽는 이유는 방향보다 **세기**(짧아서 끊기거나 길어서 지나감)라서, 세기 오차를 능력치에 건다.
  let sigma = (1 - acc) * 8
  if (nearestOppDist(st, p) < 1.5) sigma += 2
  if (st.tick - p.gotT < 12) sigma *= 1.3
  if (p.stamina < 0.3) sigma *= 1.25
  if (kind === 'through') sigma *= 1.4
  const a = atan2A(ay - by, ax - bx) + Math.round(randN(st.rng) * sigma * DEG)
  speed *= 1 + randN(st.rng) * (0.03 + 0.16 * (1 - acc))
  releaseBall(st, p)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  b.vz = vz
  b.passTo = target
  b.passLive = true
  st.stats[p.team].passes++
}

/**
 * 스로인 — **손으로 던진다** (사용자 지적 4). 킥이 아니므로:
 * 최대 14 m/s, 반드시 뜬다, 직접 골이 인정되지 않고(`fromThrow`), 던진 사람은 두 번 만질 수 없다.
 */
export function doThrow(st: GameState, p: Player, target: number, dx: number, dy: number, hold: number): void {
  const b = st.ball
  const bx = b.x
  const by = b.y
  let ax: number
  let ay: number
  if (target >= 0) {
    const q = st.players[target]
    ax = q.x + q.vx * 0.35
    ay = q.y + q.vy * 0.35
  } else {
    let ux = dx
    let uy = dy
    const l = len(ux, uy)
    if (l === 0) {
      ux = -Math.sign(bx) || 1
      uy = -Math.sign(by) || 1
    } else {
      ux /= l
      uy /= l
    }
    // 스로인은 **피치 안쪽으로** — 라인과 평행하게(← →) 던지면 공이 라인 밖을 따라 날아 바로 상대 스로인이 됐다
    // (사용자 제보 2026-09-11 "이유 없이 상대 공"). 안쪽 성분을 최소 30° 로 튼다
    const inward = -Math.sign(by) || 1
    if (uy * inward < 0.5) {
      uy = inward * 0.5
      ux = (Math.sign(ux) || 1) * Math.sqrt(0.75)
    }
    const d = 8 + 12 * hold
    ax = bx + ux * d
    ay = by + uy * d
  }
  // 목표가 라인 근처면 안쪽으로 1.5 m 는 들어오게
  {
    const inward = -Math.sign(by) || 1
    if ((ay - by) * inward < 1.5) ay = by + inward * 1.5
  }
  let d = dist(bx, by, ax, ay)
  // 던지기 사거리는 팔심 — str 이 높으면 멀리. 최대 THROW_SPEED_MAX 로 자른다
  const maxD = 14 + 16 * p.sk.str
  if (d > maxD) {
    const k = maxD / d
    ax = bx + (ax - bx) * k
    ay = by + (ay - by) * k
    d = maxD
  }
  const T = clamp(d / 12, 0.55, 1.5)
  const speed = Math.min(THROW_SPEED_MAX, (d / T) * 1.1)
  const sigma = (1 - p.sk.pas) * 7
  const a = atan2A(ay - by, ax - bx) + Math.round(randN(st.rng) * sigma * DEG)
  releaseBall(st, p, false)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  // 머리 위(2.0 m)에서 놓아 **받을 선수 발 근처(0.3 m)에 떨어지게** 한다. 예전엔 vz = ½GT 라 T 초 뒤에도
  // 2 m 높이였고, 거기서 땅까지 떨어지는 0.6 초 동안 8 m 를 더 날아가 상대 발 앞에 떨어졌다 —
  // 스로인 41% 를 상대가 가로챘다 (2026-09-11 계측 `npm run throwin`)
  b.z = 2.0
  b.vz = (0.3 - b.z) / T + 0.5 * G * T
  b.passTo = target
  b.passLive = true
  b.fromThrow = true
  b.restartBy = p.idx
  p.action = ACT_RUN
  p.actT = 0
  st.stats[p.team].passes++
}

/** 슛의 **평균** 궤적 — 조준점·속도·수직 속도·오차 폭. 난수는 없다. doShoot 이 여기에 오차를 얹고, 렌더가 프리킥 궤적 미리보기에 쓴다 (2026-09-11) */
export interface ShotAim {
  /** 골라인에서의 조준 y */
  ty: number
  speed: number
  vz: number
  /** 각도 오차 표준편차 (도) */
  sigma: number
  chip: boolean
}

/** 세트피스 정밀 조준 (키커 뒤 시점, 2026-09-11) — lat: 화면 좌우 −1..1 (코너) · lift: 화면 위아래 −1..1 (높이) */
export interface FineAim {
  lat: number
  lift: number
}

export function aimShot(st: GameState, p: Player, dx: number, dy: number, power: number, chip: boolean, aimSide: number | null, fine?: FineAim): ShotAim {
  const b = st.ball
  const team = st.teams[p.team]
  const gx = goalX(team)
  const bx = b.x
  const by = b.y
  let ty = 0
  let awkward = false
  const gk = oppGK(st, p.team)
  if (fine && fine.lat !== 0) ty = clamp(fine.lat, -1, 1) * 3.1
  else if (aimSide !== null) ty = aimSide * 2.9
  else {
    // 자동 보조 (DESIGN 3.3, 2026-09-10 개정): 슛은 **언제나 골문을 겨눈다**.
    // 방향키의 위/아래(월드 y) 성분이 코너를 고르고, 안 누르면 골키퍼가 비운 코너다.
    // 예전엔 골문 방향에서 35° 를 벗어나면 그 방향 그대로 찼는데, 아래 키를 누르면 골문을 통째로 벗어났다 (사용자 제보).
    const l = len(dx, dy)
    const open = gk ? (gk.y > 0.3 ? -1 : gk.y < -0.3 ? 1 : p.y > 0 ? -1 : 1) : p.y > 0 ? -1 : 1
    let lat = 0
    if (l > 0) {
      lat = clamp(dy / l, -1, 1)
      // 골문 반대쪽으로 밀고 찼다 — 몸을 틀어 차는 것이라 오차만 커진다 (빗나가게 하지는 않는다)
      if ((dx * team.dir) / l < -0.3) awkward = true
    }
    // 비운 코너는 **진짜 코너**(2.7 m)다. 예전 1.6 m 는 골키퍼가 서서 손만 뻗어도 닿는 자리라 12 m 정면 슛이
    // 1~4% 만 들어갔다 (2026-09-11 계측 `npm run shots` — 유효슛 중 골 9%). AI 는 원래 2.9 m 를 겨눴다
    ty = clamp(open * 2.7 * (1 - Math.abs(lat)) + lat * 3.1, -3.1, 3.1)
  }
  const dG = dist(bx, by, gx, 0)
  // 전력으로 달리던 중의 슛은 자세가 불안하다 (사용자 지적 2026-09-11 — 빠른 드리블 뒤 슛은 슈팅 능력이 떨어져야 한다).
  // 최고 속도의 55% 를 넘는 만큼 오차 최대 +90% · 힘 −12% · 공이 뜬다. 결정력이 높으면 절반만 흔들린다
  const spdK = len(p.vx, p.vy) / Math.max(1, p.sk.vmax)
  const rush = clamp((spdK - 0.55) / 0.45, 0, 1) * (1 - 0.4 * p.sk.fin)
  // 결정력이 높을수록 세게 찬다 (0.38 → ×0.98 · 0.92 → ×1.08) — 골키퍼는 빠른 공을 더 못 잡는다
  let speed = (16 + 14 * power) * (0.9 + 0.2 * p.sk.sho) * (1 - 0.15 * rush)
  let sigma = 3.0 * (1.35 - p.sk.sho) * (1 + 1.2 * rush)
  if (awkward) sigma *= 1.6
  if (dG > 25) sigma *= 1.3 - 0.5 * p.sk.lon
  const latK = Math.abs(by) / Math.max(1, Math.abs(gx - bx))
  if (latK > 1) sigma *= 1.3
  if (nearestOppDist(st, p) < 1.5) sigma *= 1.5
  // 약발: 왼발이 오른쪽 코너를 노리거나 그 반대
  const foot = p.spec.foot
  if ((foot === 'R' && ty * team.dir < -1.5) || (foot === 'L' && ty * team.dir > 1.5)) sigma *= 1.4
  if (st.tick - p.gotT < 12) sigma *= 1.3
  if (p.stamina < 0.3) sigma *= 1.25
  let vz: number
  if (chip) {
    speed = 12 + 6 * power
    const T = clamp(dG / speed, 0.6, 1.6)
    vz = 0.5 * G * T * 0.95
  } else if (fine) {
    // 높이를 직접 고른다 — ↓ 깔아서 0.25 m · 가운데 1.2 m · ↑ 크로스바 밑 2.1 m 로 골라인에 닿게 (공기 저항만큼 조금 느리게 잡는다)
    const zT = 0.25 + ((clamp(fine.lift, -1, 1) + 1) / 2) * 1.85
    const t = dG / (speed * 0.9)
    vz = (zT + 0.5 * G * t * t) / t
  } else vz = speed * (0.04 + 0.1 * power) * (1.3 - 0.6 * p.sk.fin) + rush * 0.9
  return { ty, speed, vz, sigma, chip }
}

/**
 * 슛. 사람: (dx,dy) 가 골문 쪽이면 **골키퍼가 비운 코너**를 기본값으로 잡고 스틱 옆 성분으로 옮긴다 (`aimShot`).
 * AI: aimSide(−1·0·1)로 코너를 준다.
 *
 * 옛날에는 스틱을 옆으로 안 밀면 정중앙(=골키퍼 자리)을 겨눠 1대1 이 거의 안 들어갔다 (사용자 제보 2026-09-09).
 */
export function doShoot(st: GameState, p: Player, dx: number, dy: number, power: number, chip: boolean, aimSide: number | null, fine?: FineAim): void {
  const b = st.ball
  const team = st.teams[p.team]
  const gx = goalX(team)
  const bx = b.x
  const by = b.y
  const A = aimShot(st, p, dx, dy, power, chip, aimSide, fine)
  const speed = A.speed
  let a = atan2A(A.ty - by, gx - bx)
  a += Math.round(randN(st.rng) * A.sigma * DEG)
  let vz = A.vz
  if (!chip) {
    vz += randN(st.rng) * 0.5
    if (vz < 0) vz = 0
  }
  releaseBall(st, p)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  b.vz = vz
  b.shotBy = p.idx
  // 이 슛의 질 — 골키퍼가 잡을지 쳐낼지 정할 때 본다
  b.shotQ = p.sk.fin
  const S = st.stats[p.team]
  S.shots++
  // 블록 — 슛 선상 3 m 안에 있는 수비수가 몸으로 막는다. 위치 선정(posn)이 닿는 폭을, 태클(tck)이 성공률을 정한다 (수비 강화 2026-09-10)
  const v2 = speed * speed
  for (const q of st.players) {
    if (q.team === p.team || q.sk.isGK || q.sentOff) continue
    if (q.action !== ACT_RUN && q.action !== ACT_SLIDE) continue
    const dq = dist(bx, by, q.x, q.y)
    if (dq > 3.2 || dq < 0.3) continue
    const t = ((q.x - bx) * b.vx + (q.y - by) * b.vy) / v2
    if (t <= 0) continue
    const lat = dist(q.x, q.y, bx + b.vx * t, by + b.vy * t)
    const reach = 0.45 + 0.35 * q.sk.posn + (q.action === ACT_SLIDE ? 0.4 : 0)
    if (lat > reach) continue
    const zAt = b.vz * t - 0.5 * G * t * t
    if (zAt > 1.6) continue
    if (rand(st.rng) < 0.45 + 0.4 * q.sk.tck) {
      b.vx = -b.vx * 0.25 + randN(st.rng) * 2
      b.vy = b.vy * 0.3 + randN(st.rng) * 2
      b.vz = 1 + rand(st.rng) * 2
      b.shotBy = -1
      b.onTarget = false
      b.lastTouch = q.idx
      b.lastTeam = q.team
      b.passLive = false
      q.lastKick = st.tick
      st.events.push({ tick: st.tick, type: 'block', team: q.team, player: q.idx, x: q.x, y: q.y })
      return
    }
    break
  }
  // 골문 안으로 향하나 (공기 저항 무시)
  const vxg = b.vx * team.dir
  if (vxg > 0.1) {
    const t = Math.abs(gx - bx) / Math.abs(b.vx)
    const yAt = by + b.vy * t
    const zAt = b.vz * t - 0.5 * G * t * t
    if (Math.abs(yAt) < GOAL_HALF && zAt < GOAL_H && zAt > -1) {
      b.onTarget = true
      S.onTarget++
    }
  }
  st.events.push({ tick: st.tick, type: 'shot', team: p.team, player: p.idx, x: bx, y: by })
}

/** 걷어내기 — 상대 골문 쪽, 가까운 터치라인 쪽으로 높게 */
export function doClear(st: GameState, p: Player): void {
  const b = st.ball
  const team = st.teams[p.team]
  const side = p.y > 0 ? 1 : -1
  const a = atan2A(side * 0.6, team.dir) + Math.round(randN(st.rng) * 6 * DEG)
  releaseBall(st, p)
  b.vx = cosA(a) * 22
  b.vy = sinA(a) * 22
  b.vz = 7
}

// ---------------------------------------------------------------- 골키퍼

/**
 * GK 가 자유 공을 잡거나 쳐낸다 (DESIGN 4.7).
 *
 * 닿는 거리는 **반응 시간과 몸을 날릴 시간**으로 정한다. 예전에는 `gkReach`(약 2.2 m) 안이면 무조건
 * 시도할 수 있어서 1대1 이 거의 안 들어갔다 (사용자 제보 2026-09-09) — 가까이서 세게 찬 공은
 * 반응할 시간이 없어야 한다.
 */
export function gkCatch(st: GameState, gk: Player): void {
  const b = st.ball
  if (b.owner >= 0 || gk.holdT > 0 || gk.sentOff) return
  if (gk.action !== ACT_RUN && gk.action !== ACT_DIVE) return
  if (st.tick - gk.lastKick <= 8) return
  if (b.z > 2.6) return
  // 백패스 규칙 — 아군이 발로 준 공(스로인 포함)은 손으로 잡을 수 없다. 발로만 다룬다 (2026-09-10)
  if (b.lastTeam === gk.team && b.lastTouch !== gk.idx && (b.passLive || b.fromThrow)) return
  const d = dist(gk.x, gk.y, b.x, b.y)
  const speed = len(b.vx, b.vy)
  const isShot = b.shotBy >= 0
  const since = (st.tick - b.kickTick) / 60
  /*
   * 2026-09-10 개정 — "가운데 서 있는데 옆으로 찬 공이 손으로 빨려 들어간다" 제보.
   * 예전엔 공이 2 m 밖을 지나가도 `canReach` 안이면 그 자리에서 잡아 공이 순간이동했다.
   * 이제 잡기는 **실제로 손이 닿는 거리**(서서 0.8 m · 날면서 1.0 m)에서만 나고,
   * 옆으로 지나가는 공은 먼저 **몸을 날려**(ACT_DIVE + 속도) 그 경로까지 가야 한다. 못 가면 들어간다.
   */
  const HAND_STAND = 0.8
  const HAND_DIVE = 1.0
  if (gk.action === ACT_RUN) {
    const v2 = b.vx * b.vx + b.vy * b.vy
    const toward = (gk.x - b.x) * b.vx + (gk.y - b.y) * b.vy
    if (v2 > 16 && toward > 0) {
      // 다가오는 공 — 반응 시간이 지났으면 경로 위 가장 가까운 점을 본다
      if (isShot && since < gk.sk.gkReact) return
      const t = toward / v2
      const px = b.x + b.vx * t
      const py = b.y + b.vy * t
      const lat = dist(gk.x, gk.y, px, py)
      if (lat > HAND_STAND) {
        // 손이 안 닿는다 — 도달 거리 근처면 몸을 날린다(시도는 넉넉히, 닿을지는 **실제 거리·시간**으로)
        if (lat > gk.sk.gkReach + 1.0) return
        // 다이브 속도 — 도달(gkReach: 반사·공중장악·민첩·점프·키)이 주, 핸들링이 부
        const diveSpeed = 3.4 + 1.2 * gk.sk.gkReach + 1.2 * gk.sk.gkHand
        gk.action = ACT_DIVE
        gk.actT = 24
        gk.vx = ((px - gk.x) / lat) * diveSpeed
        gk.vy = ((py - gk.y) / lat) * diveSpeed
        return
      }
    } else if (speed > 6) return
  }
  const hand = gk.action === ACT_DIVE ? HAND_DIVE : HAND_STAND
  if (d > hand) return
  if (isShot && since < gk.sk.gkReact) return
  let chance: number
  // 뻗은 정도 0(몸 정면) ~ 1(손끝). 다이브 중 상단(z > 1.8)으로 오는 공은 손이 더 멀다
  let stretch = clamp(d / hand, 0, 1)
  if (gk.action === ACT_DIVE && b.z > 1.8) stretch = Math.min(1, stretch + 0.4)
  const fast = clamp((speed - 14) / 26, 0, 0.36)
  if (speed < 6) chance = 0.95
  else {
    // 멀리 뻗을수록·빠를수록 어렵다 (계수는 2026-09-09 계측 — 1대1 14 m 전환율 39%)
    // 2026-09-11 검증 — 곱(0.88~1.11)으로는 폭이 좁았다. 바탕값에 넣어 LO 0.72 / HI 0.92
    chance = 0.6 + 0.34 * gk.sk.gkHand - 0.46 * stretch - fast
    // 결정력 높은 선수의 슛은 잡기 어렵다 (사용자 지적 2026-09-11) — fin 0.38 → +0.04 · 0.92 → −0.13
    if (isShot) chance -= 0.45 * (b.shotQ - 0.5)
  }
  const S = st.stats[gk.team]
  if (rand(st.rng) < chance) {
    const wasShot = isShot && b.onTarget
    giveBall(st, gk)
    gk.holdT = 90 + Math.round(rand(st.rng) * 60)
    if (gk.action === ACT_DIVE) gk.actT = Math.max(gk.actT, 12)
    if (wasShot) {
      S.saves++
      st.events.push({ tick: st.tick, type: 'save', team: gk.team, player: gk.idx, x: b.x, y: b.y })
    }
    return
  }
  // 쳐내기 — 잡기에 실패한 공을 손으로 밀어내는 것. **몸 정면이면 대부분(0.75), 손끝이면 드물게(0.2)**.
  // 예전엔 뻗은 정도와 상관없이 78% 였다 — 손끝에 스친 공까지 다 막혀 유효슛 중 골이 9% 뿐이었다 (2026-09-11 계측).
  // 잘 찬 공(shotQ)은 손에 맞고도 흘러 들어간다
  let parry = (0.45 + 0.25 * gk.sk.gkHand + 0.25 * gk.sk.gkPunch) * (1 - 0.6 * stretch) - 0.3 * fast
  if (isShot) parry -= 0.3 * (b.shotQ - 0.5)
  if (rand(st.rng) > parry) return
  if (isShot && b.onTarget) {
    S.saves++
    st.events.push({ tick: st.tick, type: 'save', team: gk.team, player: gk.idx, x: b.x, y: b.y })
  }
  const team = st.teams[gk.team]
  b.vx = -b.vx * 0.35 + team.dir * 3 + randN(st.rng) * 3
  b.vy = b.vy * 0.3 + randN(st.rng) * 3
  b.vz = 2 + rand(st.rng) * 2
  b.lastTouch = gk.idx
  b.lastTeam = gk.team
  b.shotBy = -1
  b.onTarget = false
  b.passTo = -1
  b.restartBy = -1
  b.fromThrow = false
  gk.lastKick = st.tick
  if (gk.action !== ACT_DIVE) {
    gk.action = ACT_DIVE
    gk.actT = 20
  }
}

/**
 * GK 펀트 — 손에 든 공을 발로 멀리 찬다 (사용자 지적 3).
 * 로빙 패스와 달리 초기 속도가 크고 체공이 길어 하프라인을 넘긴다.
 */
export function gkPunt(st: GameState, gk: Player, aimY: number): void {
  const b = st.ball
  const team = st.teams[gk.team]
  const dir = team.dir
  // 55~72 m — kic 이 높을수록 멀리
  const d = 55 + 17 * gk.sk.gkKick
  const T = 2.3 + 0.35 * gk.sk.gkKick
  const speed = (d / T) * (1.08 + 0.13 * T)
  const tx = clamp(gk.x + dir * d, -HALF_L + 3, HALF_L - 3)
  const ty = clamp(aimY, -HALF_W + 3, HALF_W - 3)
  const sigma = (1 - gk.sk.gkKick) * 7 + 2
  const a = atan2A(ty - b.y, tx - b.x) + Math.round(randN(st.rng) * sigma * DEG)
  releaseBall(st, gk)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  b.vz = 0.5 * G * T * 1.06
  b.z = 0.3
  b.passLive = true
  st.stats[gk.team].passes++
}

/** GK 가 손에 든 공을 내보낸다 — 열린 수비수에게 짧게, 없으면 **펀트로 멀리** */
export function gkDistribute(st: GameState, gk: Player): void {
  let best = -1
  let bestOpen = 6
  for (const q of st.players) {
    if (q.team !== gk.team || q.idx === gk.idx || q.sentOff) continue
    const d = dist(gk.x, gk.y, q.x, q.y)
    if (d > 28 || d < 4) continue
    const open = nearestOppDist(st, q)
    if (open > bestOpen) {
      bestOpen = open
      best = q.idx
    }
  }
  if (best >= 0) doPass(st, gk, 'ground', best, 0, 0, 0.3)
  else gkPunt(st, gk, (rand(st.rng) - 0.5) * 34)
}

/** 자기 박스 안인가 */
export function inOwnBox(p: Player, dir: number): boolean {
  const own = -dir * HALF_L
  return Math.abs(p.x - own) < BOX_L && Math.abs(p.y) < BOX_HALF_W
}

export { HALF_W as BALL_HALF_W, ownGoalX }
