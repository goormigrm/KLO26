// 공을 다루는 판정 — 소유·드리블·태클·패스·슛·걷어내기·GK (DESIGN 4.4~4.8).
// 난수는 전부 st.rng 에서 뽑고, 뽑는 순서를 바꾸지 않는다.

import { atan2A, clamp, cosA, len, sinA } from './fixedmath'
import { feetX, feetY } from './physics'
import { rand, type Rng } from './rng'
import {
  ACT_DIVE, ACT_KICK, ACT_RUN, ACT_SLIDE, BOX_HALF_W, BOX_L, CONTROL_R, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W,
  goalX, type GameState, type Player,
} from './state'

/** 각도 단위(1024/360) — 도 → 각도 */
export const DEG = 1024 / 360
const G = 9.81

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
    if (dist(p.x, p.y, x, y) <= p.sk.vmax * t * 0.9 + 0.5) {
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
    if (q.team === p.team) continue
    const d = dist(p.x, p.y, q.x, q.y)
    if (d < best) best = d
  }
  return best
}

/** 공을 발에 붙인다 — v1 드리블 모델: 서 있으면 0.30 m 앞, 달리면 drib 가 낮을수록 멀리 (뺏기기 쉽다) */
export function attachBall(st: GameState, p: Player): void {
  const b = st.ball
  const team = st.teams[p.team]
  if (p.holdT > 0) {
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

function giveBall(st: GameState, p: Player): void {
  const b = st.ball
  const wasPassTo = b.passTo
  const sameTeam = b.lastTeam === p.team && b.lastTouch !== p.idx
  b.owner = p.idx
  b.lastTouch = p.idx
  b.lastTeam = p.team
  b.shotBy = -1
  b.onTarget = false
  b.passTo = -1
  b.vz = 0
  p.gotT = st.tick
  if (wasPassTo >= 0 && sameTeam) st.stats[p.team].passOk++
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
    if (p.action !== ACT_RUN && p.action !== ACT_KICK) continue
    if (st.tick - p.lastKick <= 8) continue
    if (p.sk.isGK && p.holdT > 0) continue
    const reach = CONTROL_R + (speed > 8 ? 0.15 : 0) + (b.passTo === p.idx ? 0.35 : 0)
    const d = distToSegment(feetX(p, 0.25), feetY(p, 0.25), px, py, b.x, b.y)
    if (d < reach && d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return
  const p = best
  let chance: number
  if (b.z > 1.2) chance = 0.3 + 0.5 * p.sk.head
  else chance = 0.6 + 0.4 * p.sk.ctl - clamp((speed - 6) / 30, 0, 0.5)
  if (b.passTo === p.idx) chance += 0.15
  if (rand(st.rng) < chance) {
    giveBall(st, p)
    return
  }
  // 튕김
  const a = atan2A(b.vy, b.vx) + Math.round(randN(st.rng) * 40 * DEG)
  const ns = speed * 0.35 + 1
  b.vx = cosA(a) * ns
  b.vy = sinA(a) * ns
  b.vz = Math.max(b.vz * 0.3, 0)
  b.lastTouch = p.idx
  b.lastTeam = p.team
  b.shotBy = -1
  b.passTo = -1
  p.lastKick = st.tick
}

/** 볼 소유자에게 붙은 상대가 뺏으려 한다 — 한 틱에 한 명만 (DESIGN 4.8 압박) */
export function contestBall(st: GameState, o: Player): void {
  if (o.holdT > 0) return
  const b = st.ball
  const team = st.teams[o.team]
  const slow = team.human && team.controlled === o.idx && team.slow
  const reach = 0.6 + (1 - o.sk.drib) * 0.5 - (slow ? 0.15 : 0)
  for (const q of st.players) {
    if (q.team === o.team || q.action !== ACT_RUN) continue
    if (!q.press && q.tackleT <= 0) continue
    const d = dist(feetX(q, 0.3), feetY(q, 0.3), b.x, b.y)
    if (d > reach) continue
    // 정면이면 1.0, 뒤에서면 0.55
    const rel = atan2A(q.y - o.y, q.x - o.x)
    let dd = (rel - o.facing) & 1023
    if (dd > 512) dd = 1024 - dd
    const angleF = 0.55 + 0.45 * (dd / 512)
    let p = 0.05 * (0.5 + q.sk.tck) * (1.4 - 0.8 * o.sk.drib) * angleF * (0.6 + 0.8 * (q.sk.str / (q.sk.str + o.sk.str + 0.0001)))
    if (q.tackleT > 0) p *= 3
    if (slow) p *= 0.6
    if (rand(st.rng) < p) {
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
      o.lastKick = st.tick
      q.lastKick = st.tick - 6
      st.stats[q.team].tackles++
      st.events.push({ tick: st.tick, type: 'tackle', team: q.team, player: q.idx, x: b.x, y: b.y })
      return
    }
  }
}

/** 슬라이딩 중인 선수가 공(자유 또는 상대 소유)에 닿으면 걷어낸다. 늦으면 파울 — 단계 4. v1 은 실패하면 그냥 지나간다 */
export function slideContest(st: GameState, q: Player): void {
  const b = st.ball
  if (q.action !== ACT_SLIDE) return
  const d = dist(feetX(q, 0.5), feetY(q, 0.5), b.x, b.y)
  if (d > 0.7 || b.z > 0.8) return
  if (b.owner >= 0) {
    const o = st.players[b.owner]
    if (o.team === q.team) return
    if (rand(st.rng) >= 0.45 + 0.4 * q.sk.tck) return
    o.lastKick = st.tick
    st.stats[q.team].tackles++
    st.events.push({ tick: st.tick, type: 'tackle', team: q.team, player: q.idx, x: b.x, y: b.y })
  }
  b.owner = -1
  b.vx = cosA(q.facing) * 6 + randN(st.rng)
  b.vy = sinA(q.facing) * 6 + randN(st.rng)
  b.vz = 0.5
  b.lastTouch = q.idx
  b.lastTeam = q.team
  b.shotBy = -1
  b.passTo = -1
  q.lastKick = st.tick
}

function releaseBall(st: GameState, p: Player): void {
  const b = st.ball
  b.owner = -1
  b.kickTick = st.tick
  b.lastTouch = p.idx
  b.lastTeam = p.team
  b.shotBy = -1
  b.passTo = -1
  b.onTarget = false
  p.lastKick = st.tick
  p.holdT = 0
  p.action = ACT_KICK
  p.actT = 6
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
      if (q.team !== p.team || q.idx === p.idx) continue
      if (through && q.sk.isGK) continue
      const d = dist(p.x, p.y, q.x, q.y)
      if (d < 2) continue
      const qa = atan2A(q.y - p.y, q.x - p.x)
      let dd = (qa - ang) & 1023
      if (dd > 512) dd = 1024 - dd
      const deg = dd / DEG
      if (deg > cone) continue
      const s = 1 - deg / cone - (d > 40 ? 0.4 : d > 25 ? 0.15 : 0)
      if (s > bestS) {
        bestS = s
        best = q.idx
      }
    }
    if (best >= 0) break
  }
  return best
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
    const T = clamp(d / 14, 0.9, 2.2)
    speed = (d / T) * 1.08
    vz = 0.5 * G * T
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
  let sigma = (1 - acc) * 6
  if (nearestOppDist(st, p) < 1.5) sigma += 2
  if (st.tick - p.gotT < 12) sigma *= 1.3
  if (p.stamina < 0.3) sigma *= 1.25
  if (kind === 'through') sigma *= 1.4
  const a = atan2A(ay - by, ax - bx) + Math.round(randN(st.rng) * sigma * DEG)
  speed *= 1 + randN(st.rng) * 0.05
  releaseBall(st, p)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  b.vz = vz
  b.passTo = target
  st.stats[p.team].passes++
}

/**
 * 슛. 사람: (dx,dy) 가 골문 쪽 ±35° 안이면 옆 성분으로 코너를 고르고, 밖이면 그 방향 그대로(빗나감).
 * AI: aimSide(−1·0·1)로 코너를 준다.
 */
export function doShoot(st: GameState, p: Player, dx: number, dy: number, power: number, chip: boolean, aimSide: number | null): void {
  const b = st.ball
  const team = st.teams[p.team]
  const gx = goalX(team)
  const bx = b.x
  const by = b.y
  const toGoal = atan2A(0 - by, gx - bx)
  let ty = 0
  let straight = false
  if (aimSide !== null) ty = aimSide * 2.9
  else {
    const l = len(dx, dy)
    if (l > 0) {
      const ia = atan2A(dy, dx)
      let dd = (ia - toGoal) & 1023
      if (dd > 512) dd -= 1024
      if (Math.abs(dd) <= 35 * DEG) {
        // 옆 성분: 골문 방향에 수직인 만큼 코너로
        const lat = (dd / (35 * DEG)) * 3.0
        ty = clamp(lat, -3, 3)
      } else straight = true
    }
  }
  const dG = dist(bx, by, gx, 0)
  let speed = 16 + 14 * power
  let sigma = 3.0 * (1.35 - p.sk.sho)
  if (dG > 25) sigma *= 1.3 - 0.5 * p.sk.lon
  const lat = Math.abs(by) / Math.max(1, Math.abs(gx - bx))
  if (lat > 1) sigma *= 1.3
  if (nearestOppDist(st, p) < 1.5) sigma *= 1.5
  // 약발: 왼발이 오른쪽 코너를 노리거나 그 반대
  const foot = p.spec.foot
  if ((foot === 'R' && ty * team.dir < -1.5) || (foot === 'L' && ty * team.dir > 1.5)) sigma *= 1.4
  if (st.tick - p.gotT < 12) sigma *= 1.3
  if (p.stamina < 0.3) sigma *= 1.25
  let a: number
  if (straight) a = atan2A(dy, dx)
  else a = atan2A(ty - by, gx - bx)
  a += Math.round(randN(st.rng) * sigma * DEG)
  let vz: number
  if (chip) {
    speed = 12 + 6 * power
    const T = clamp(dG / speed, 0.6, 1.6)
    vz = 0.5 * G * T * 0.95
  } else {
    vz = speed * (0.04 + 0.1 * power) * (1.3 - 0.6 * p.sk.fin) + randN(st.rng) * 0.5
    if (vz < 0) vz = 0
  }
  releaseBall(st, p)
  b.vx = cosA(a) * speed
  b.vy = sinA(a) * speed
  b.vz = vz
  b.shotBy = p.idx
  const S = st.stats[p.team]
  S.shots++
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

/** GK 가 자유 공을 잡거나 쳐낸다 (DESIGN 4.7) */
export function gkCatch(st: GameState, gk: Player): void {
  const b = st.ball
  if (b.owner >= 0 || gk.holdT > 0) return
  if (gk.action !== ACT_RUN) return
  if (st.tick - gk.lastKick <= 8) return
  const d = dist(gk.x, gk.y, b.x, b.y)
  const reach = gk.sk.gkReach
  if (d > reach + 0.3 || b.z > 2.6) return
  const speed = len(b.vx, b.vy)
  const isShot = b.shotBy >= 0
  if (isShot && st.tick - b.kickTick < gk.sk.gkReact * 60) return
  let chance: number
  if (speed < 6) chance = 0.95
  else chance = 0.35 + 0.55 * gk.sk.gkHand - clamp((speed - 15) / 40, 0, 0.35) - (d > reach * 0.6 ? 0.15 : 0)
  const S = st.stats[gk.team]
  if (rand(st.rng) < chance) {
    const wasShot = isShot && b.onTarget
    giveBall(st, gk)
    gk.holdT = 90 + Math.round(rand(st.rng) * 60)
    if (d > 0.8) {
      gk.action = ACT_DIVE
      gk.actT = 20
    }
    if (wasShot) {
      S.saves++
      st.events.push({ tick: st.tick, type: 'save', team: gk.team, player: gk.idx, x: b.x, y: b.y })
    }
    return
  }
  // 쳐내기
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
  gk.lastKick = st.tick
  gk.action = ACT_DIVE
  gk.actT = 20
}

/** GK 가 손에 든 공을 내보낸다 — 열린 수비수에게 짧게, 없으면 멀리 */
export function gkDistribute(st: GameState, gk: Player): void {
  const team = st.teams[gk.team]
  let best = -1
  let bestOpen = 6
  for (const q of st.players) {
    if (q.team !== gk.team || q.idx === gk.idx) continue
    const d = dist(gk.x, gk.y, q.x, q.y)
    if (d > 28 || d < 4) continue
    const open = nearestOppDist(st, q)
    if (open > bestOpen) {
      bestOpen = open
      best = q.idx
    }
  }
  if (best >= 0) doPass(st, gk, 'ground', best, 0, 0, 0.3)
  else doPass(st, gk, 'lob', -1, team.dir, 0, 1, { x: clamp(gk.x + team.dir * 48, -HALF_L + 5, HALF_L - 5), y: (rand(st.rng) - 0.5) * 30 })
}

/** 자기 박스 안인가 */
export function inOwnBox(p: Player, dir: number): boolean {
  const ownGoal = -dir * HALF_L
  return Math.abs(p.x - ownGoal) < BOX_L && Math.abs(p.y) < BOX_HALF_W
}

export { HALF_W as BALL_HALF_W }
