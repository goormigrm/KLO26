// 공·선수 물리 (DESIGN 4.2 · 4.3). 결정론 — 삼각함수는 fixedmath, 난수는 여기서 안 쓴다.

import { angleDiff, atan2A, clamp, cosA, len, sinA } from './fixedmath'
import { BALL_R, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W, POST_R, type Ball, type Player } from './state'

const GRAVITY = 9.81
const AIR_DRAG = 0.25
const GROUND_FRICTION = 4.0
const BOUNCE = 0.55
const BOUNCE_SLOW = 0.85

/** 선수를 목표 속도 쪽으로 가속·회전시키고 옮긴다. speedK 는 상황 배수(스프린트·볼 소유·체력·견제) */
export function movePlayer(p: Player, dvx: number, dvy: number, speedK: number): void {
  const sk = p.sk
  const vmax = sk.vmax * speedK
  // 목표 속도의 크기를 vmax 로 제한
  let dl = len(dvx, dvy)
  if (dl > vmax) {
    const f = vmax / dl
    dvx *= f
    dvy *= f
    dl = vmax
  }
  // 가속 (감속은 1.6배 빠르다 — 멈추는 게 출발보다 쉽다)
  let ax = dvx - p.vx
  let ay = dvy - p.vy
  const al = len(ax, ay)
  const cur = len(p.vx, p.vy)
  const maxA = (dl < cur ? sk.accel * 1.6 : sk.accel) * DT
  if (al > maxA) {
    const f = maxA / al
    ax *= f
    ay *= f
  }
  p.vx += ax
  p.vy += ay
  // 회전 — 빠를수록 둔하다
  const sp = len(p.vx, p.vy)
  if (sp > 0.3) {
    const want = atan2A(p.vy, p.vx)
    const d = angleDiff(want, p.facing)
    const maxT = sk.turn * (1 - 0.5 * Math.min(1, sp / sk.vmax))
    p.facing = (p.facing + clamp(d, -maxT, maxT)) & 1023
  }
  p.x += p.vx * DT
  p.y += p.vy * DT
  // 피치 밖으로 2 m 이상은 못 나간다
  if (p.x < -HALF_L - 2) { p.x = -HALF_L - 2; p.vx = 0 }
  else if (p.x > HALF_L + 2) { p.x = HALF_L + 2; p.vx = 0 }
  if (p.y < -HALF_W - 2) { p.y = -HALF_W - 2; p.vy = 0 }
  else if (p.y > HALF_W + 2) { p.y = HALF_W + 2; p.vy = 0 }
}

/** 체력 — 스프린트 소모, 걷기 회복 */
export function drainStamina(p: Player, sprinting: boolean): void {
  const sp = len(p.vx, p.vy)
  if (sprinting && sp > 2) p.stamina -= 0.03 * (1.3 - 0.6 * p.sk.sta) * DT
  else if (sp > 2) p.stamina -= 0.006 * (1.3 - 0.6 * p.sk.sta) * DT
  else p.stamina += 0.01 * DT
  p.stamina = clamp(p.stamina, 0, 1)
}

/** 선수 앞 발 위치 */
export function feetX(p: Player, off: number): number {
  return p.x + cosA(p.facing) * off
}
export function feetY(p: Player, off: number): number {
  return p.y + sinA(p.facing) * off
}

/** 자유 상태의 공을 한 틱 옮긴다 (중력·선형 공기 저항·지면 마찰·반발·골대) */
export function moveBall(b: Ball): boolean {
  const hitBefore = false
  void hitBefore
  if (b.z > 0 || b.vz > 0) {
    b.vz -= GRAVITY * DT
    b.vx *= 1 - AIR_DRAG * DT
    b.vy *= 1 - AIR_DRAG * DT
  } else {
    const sp = len(b.vx, b.vy)
    if (sp > 0) {
      const ns = Math.max(0, sp - GROUND_FRICTION * DT)
      const f = ns / sp
      b.vx *= f
      b.vy *= f
    }
  }
  const px = b.x
  b.x += b.vx * DT
  b.y += b.vy * DT
  b.z += b.vz * DT
  if (b.z <= 0) {
    b.z = 0
    if (b.vz < 0) {
      if (-b.vz > 0.8) {
        b.vz = -b.vz * BOUNCE
        b.vx *= BOUNCE_SLOW
        b.vy *= BOUNCE_SLOW
      } else b.vz = 0
    }
  }
  return hitPosts(b, px)
}

/** 골포스트(원기둥)·크로스바 충돌. 맞았으면 true (소리·연출용) */
function hitPosts(b: Ball, prevX: number): boolean {
  const gx = b.x > 0 ? HALF_L : -HALF_L
  if (Math.abs(b.x - gx) > 0.6) return false
  for (let s = -1; s <= 1; s += 2) {
    const py = s * GOAL_HALF
    const dx = b.x - gx
    const dy = b.y - py
    const d = len(dx, dy)
    if (d < BALL_R + POST_R && d > 0 && b.z < GOAL_H + 0.1) {
      const nx = dx / d
      const ny = dy / d
      const vn = b.vx * nx + b.vy * ny
      if (vn < 0) {
        b.vx -= 2 * vn * nx * 0.7
        b.vy -= 2 * vn * ny * 0.7
        b.vx *= 0.7
        b.vy *= 0.7
      }
      b.x = gx + nx * (BALL_R + POST_R)
      b.y = py + ny * (BALL_R + POST_R)
      return true
    }
  }
  // 크로스바: 골라인을 지나는 순간 높이가 바 근처면 튕긴다
  const crossed = (prevX - gx) * (b.x - gx) <= 0
  if (crossed && Math.abs(b.y) < GOAL_HALF && Math.abs(b.z - GOAL_H) < BALL_R + POST_R) {
    b.vz = -Math.abs(b.vz) * 0.6 - 1
    b.vx = -b.vx * 0.5
    b.x = prevX
    return true
  }
  return false
}

/** 선수끼리 겹치면 밀어낸다 — 몸싸움(str)이 센 쪽이 덜 밀린다 */
export function resolveCollisions(players: Player[], r: number): void {
  const n = players.length
  const d2 = r * r * 4
  for (let i = 0; i < n; i++) {
    const a = players[i]
    for (let j = i + 1; j < n; j++) {
      const b = players[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dd = dx * dx + dy * dy
      if (dd >= d2 || dd === 0) continue
      const d = Math.sqrt(dd)
      const overlap = r * 2 - d
      const nx = dx / d
      const ny = dy / d
      const wa = b.sk.str / (a.sk.str + b.sk.str + 0.0001) // a 가 밀리는 몫
      a.x -= nx * overlap * wa
      a.y -= ny * overlap * wa
      b.x += nx * overlap * (1 - wa)
      b.y += ny * overlap * (1 - wa)
    }
  }
}

/** 공이 골문 안으로 들어갔나 (골라인을 이번 틱에 넘었고 골대 안·바 아래) — 넘어간 쪽 x 부호를 돌려준다 (0 = 아니다) */
export function crossedGoalLine(prevX: number, b: Ball): number {
  if (Math.abs(b.y) >= GOAL_HALF || b.z >= GOAL_H) return 0
  if (prevX < HALF_L && b.x >= HALF_L) return 1
  if (prevX > -HALF_L && b.x <= -HALF_L) return -1
  return 0
}

export { HALF_W as PITCH_HALF_W }
