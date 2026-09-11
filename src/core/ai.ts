// 팀 AI — 조작하지 않는 20명과 봇 팀 22명 (DESIGN 4.10).
// 자리(앵커) · 지원 러닝 · 압박/커버/마크 · 볼 소유자의 효용 판단 · GK 위치. 난수는 봇 전용 st.botRng 만 쓴다.

import { atan2A, clamp, cosA, len, sinA } from './fixedmath'
import { anchorOf, type Band } from './formation'
import { rand } from './rng'
import {
  dist, doClear, doPass, doShoot, inOwnBox, interceptPoint, nearestOppDist, offsideLineX, randN, type PassKind,
} from './ball'
import { CIRCLE_R, HALF_L, HALF_W, THROWIN_CLEAR, goalX, type GameState, type Player, GOAL_TICKS } from './state'

const tmp = { x: 0, y: 0 }

/** 봇 난이도별 손잡이 — 판단 잡음 · 압박 거리 배수 */
const BOT: Record<number, { noise: number; press: number }> = {
  1: { noise: 0.25, press: 0.7 },
  2: { noise: 0.12, press: 1.0 },
  3: { noise: 0.05, press: 1.25 },
}

export function ballOwnerTeam(st: GameState): number {
  const o = st.ball.owner
  return o < 0 ? -1 : st.players[o].team
}

/** 22명의 자리를 다시 계산한다 (매 틱, 싸다) */
export function updateAnchors(st: GameState): void {
  const ot = ballOwnerTeam(st)
  for (const p of st.players) {
    const team = st.teams[p.team]
    anchorOf(p.slot, p.band as Band, team.dir, team.sliders, st.ball.x, st.ball.y, ot === p.team, tmp)
    p.ax = tmp.x
    p.ay = tmp.y
  }
}

/** (x,y) 에 p 보다 가까운 같은 팀 선수 수 (동률은 idx 로) */
function rankByDist(st: GameState, teamIdx: number, x: number, y: number, p: Player, excludeGK: boolean, exclude = -1): number {
  const dp = dist(p.x, p.y, x, y)
  let rank = 0
  for (const q of st.players) {
    if (q.team !== teamIdx || q.idx === p.idx || q.idx === exclude || q.sentOff) continue
    if (excludeGK && q.sk.isGK) continue
    const dq = dist(q.x, q.y, x, y)
    if (dq < dp || (dq === dp && q.idx < p.idx)) rank++
  }
  return rank
}

function goAnchor(p: Player, fwd: number, dir: number): void {
  p.tx = clamp(p.ax + dir * fwd, -HALF_L + 1, HALF_L - 1)
  p.ty = p.ay
}

/**
 * 오프사이드 라인을 넘지 않게 목표 x 를 자른다.
 * 여유를 1.5 m 두는 것은 선수가 목표를 지나쳐 달리기 때문이다 — 0.5 m 였을 때 판당 오프사이드가 11.5회였다(2026-09-09 계측).
 */
const LINE_MARGIN = 1.5
function holdLine(st: GameState, p: Player, tx: number, dir: number): number {
  const line = offsideLineX(st, p.team) * dir
  const t = tx * dir
  return t > line - LINE_MARGIN ? (line - LINE_MARGIN) * dir : tx
}

/** 지금 오프사이드 위치인가 (달려 나가도 되는지 AI 가 스스로 본다) */
function inOffsidePosition(st: GameState, p: Player): boolean {
  const dir = st.teams[p.team].dir
  const v = p.x * dir
  return v > 0 && v > st.ball.x * dir && v > offsideLineX(st, p.team) * dir
}

/** q 앞(공격 방향 ±40°, 8 m) 가장 가까운 상대까지 거리. 없으면 99 */
function spaceAhead(st: GameState, q: Player, dir: number): number {
  let best = 99
  for (const o of st.players) {
    if (o.team === q.team || o.sentOff) continue
    const dx = (o.x - q.x) * dir
    if (dx <= 0 || dx > 8) continue
    const dy = Math.abs(o.y - q.y)
    if (dy > dx * 0.84) continue
    const d = len(dx, dy)
    if (d < best) best = d
  }
  return best
}

/** p→q 패스 길에 가장 가까운 상대까지 거리 (상한 3) */
function laneClear(st: GameState, p: Player, q: Player): number {
  const ax = p.x
  const ay = p.y
  const bx = q.x - ax
  const by = q.y - ay
  const l2 = bx * bx + by * by
  let best = 3
  for (const o of st.players) {
    if (o.team === p.team || o.sentOff) continue
    let t = l2 > 0 ? ((o.x - ax) * bx + (o.y - ay) * by) / l2 : 0
    t = clamp(t, 0, 1)
    const d = dist(ax + bx * t, ay + by * t, o.x, o.y)
    if (d < best) best = d
  }
  return best
}

function gkDecide(st: GameState, gk: Player): void {
  const ti = gk.team
  const team = st.teams[ti]
  const dir = team.dir
  const ownGoalX = -dir * HALF_L
  const b = st.ball
  gk.sprint = false
  if (gk.holdT > 0) {
    gk.tx = gk.x
    gk.ty = gk.y
    return
  }
  // 페널티킥을 막는 쪽 — 킥 순간까지 **골라인 위 가운데** (사용자 지적 2026-09-11: 5 m 앞으로 나와 있었다)
  if (st.phase === 'penalty' && st.restart && st.restart.team !== ti) {
    gk.tx = ownGoalX + dir * 0.35
    gk.ty = 0
    return
  }
  const ot = ballOwnerTeam(st)
  if (ot < 0 && Math.abs(b.x - ownGoalX) < 16.5 && Math.abs(b.y) < 20) {
    interceptPoint(st, gk, tmp)
    if (rankByDist(st, ti, tmp.x, tmp.y, gk, false) === 0 && dist(gk.x, gk.y, tmp.x, tmp.y) < 12) {
      gk.tx = tmp.x
      gk.ty = tmp.y
      gk.sprint = true
      return
    }
  }
  let d = 1.0 + 1.5 * gk.sk.gkPos
  if (ot === 1 - ti) {
    const c = st.players[b.owner]
    const dc = dist(c.x, c.y, ownGoalX, 0)
    if (dc < 14) {
      let between = 0
      for (const q of st.players) if (q.team === ti && !q.sk.isGK && !q.sentOff && dist(q.x, q.y, c.x, c.y) < 3) between++
      if (between === 0) d = clamp(dc * 0.5, 2, 7)
      // 코앞까지 몰고 온 공은 **손으로 덮친다** (contestBall 이 press 를 본다). 예전엔 골키퍼가 절대 뺏지 않아
      // 드리블로 옆을 지나 골문까지 걸어 들어갈 수 있었다 (사용자 제보 2026-09-11)
      if (dist(gk.x, gk.y, b.x, b.y) < 3) gk.press = true
    }
    // 골키퍼 돌진 (수비 W, 2026-09-10) — 1.5초 동안 볼 소유자에게 나간다
    if (team.gkRush > st.tick && dc < 30) {
      d = clamp(dc * 0.85, 2, 16)
      gk.sprint = true
    }
  }
  let ux = b.x - ownGoalX
  let uy = b.y
  const l = len(ux, uy)
  if (l > 0) {
    ux /= l
    uy /= l
  } else {
    ux = dir
    uy = 0
  }
  gk.tx = ownGoalX + ux * d
  gk.ty = clamp(uy * d, -4, 4)
}

function carrierDecide(st: GameState, p: Player, noise: number): void {
  const ti = p.team
  const team = st.teams[ti]
  const dir = team.dir
  const gx = goalX(team)
  const r = st.botRng
  const dG = dist(p.x, p.y, gx, 0)
  const opD = nearestOppDist(st, p)

  // 잡은 직후엔 (압박이 없으면) 일단 몰고 간다 — 받자마자 되차는 핑퐁을 막는다
  const justGot = st.tick - p.gotT < 20 && opD > 2.5

  let shoot = -1
  if (dG < 34) {
    const lat = Math.abs(p.y) / Math.max(1, Math.abs(gx - p.x))
    const angF = 1 / (1 + lat * 1.2)
    shoot = (1 - dG / 34) * (0.5 + 0.5 * p.sk.sho) * angF * 2.3 + (dG < 16 ? 0.35 : 0)
    if (opD < 1.5) shoot *= 0.7
    shoot += randN(r) * noise
  }

  let bestPass = -1
  let bestScore = -1
  let bestKind: PassKind = 'ground'
  for (const q of st.players) {
    if (q.team !== ti || q.idx === p.idx || q.sentOff) continue
    if (q.sk.isGK && !(p.x * dir < -10 && opD < 3)) continue
    const dq = dist(p.x, p.y, q.x, q.y)
    if (dq < 3) continue
    // 오프사이드 위치의 동료에게는 보내지 않는다 — 보내면 심판이 끊는다
    if (inOffsidePosition(st, q)) continue
    const gain = clamp(((q.x - p.x) * dir) / 30, -1, 1)
    // 멘탈리티가 높으면 전진 패스를 더 좋게 본다 (0 → ×0.6 · 4 → ×1.4)
    const fwdK = 0.6 + team.sliders.mentality * 0.2
    const open = Math.min(8, nearestOppDist(st, q)) / 8
    const lane = laneClear(st, p, q) / 3
    // 시야(vis)가 좋을수록 "열린 동료"를 정확히 본다 — 낮으면 open·lane 판단에 잡음이 는다 (2026-09-11)
    const eye = 0.6 + 0.4 * p.sk.vis
    let s = 0.2 + 0.3 * gain * fwdK + (0.25 * open + 0.25 * lane) * eye + 0.15 * p.sk.pas - (dq > 35 ? 0.3 : dq > 25 ? 0.1 : 0) + randN(r) * noise * (1.6 - 0.6 * p.sk.vis)
    if (justGot) s -= 0.35
    let kind: PassKind = 'ground'
    if (gain > 0.2 && spaceAhead(st, q, dir) > 5) {
      s += 0.12
      kind = 'through'
    }
    if (Math.abs(p.y) > 18 && p.x * dir > 30 && Math.abs(q.x - gx) < 20 && Math.abs(q.y) < 20) {
      s += 0.15
      kind = 'lob'
    }
    if (s > bestScore) {
      bestScore = s
      bestPass = q.idx
      bestKind = kind
    }
  }

  const ahead = spaceAhead(st, p, dir)
  let drib = ahead > 8 ? 0.55 + 0.25 * p.sk.drib + (dG > 40 ? 0.1 : 0) : 0.25 + 0.15 * p.sk.drib
  if (p.x * dir < -20 && opD < 2.5) drib = 0.05
  drib += randN(r) * noise

  let clr = -1
  if (p.x * dir < -20 && opD < 3) clr = 0.55 + (inOwnBox(p, dir) ? 0.2 : 0) + randN(r) * noise

  const hold = 0.08
  const top = Math.max(shoot, bestScore, drib, clr, hold)
  p.sprint = false
  if (top === shoot) {
    const power = clamp(0.5 + dG / 40, 0.5, 1)
    let gkY = 0
    let gkFar = false
    for (const q of st.players) {
      if (q.team === ti || !q.sk.isGK || q.sentOff) continue
      gkY = q.y
      gkFar = dist(q.x, q.y, gx, 0) > 8
    }
    let side = gkY > 0.5 ? -1 : gkY < -0.5 ? 1 : rand(r) < 0.5 ? -1 : 1
    doShoot(st, p, 0, 0, power, gkFar && dG < 25, side)
    return
  }
  if (top === bestScore && bestPass >= 0) {
    doPass(st, p, bestKind, bestPass, 0, 0, bestKind === 'through' ? 0.5 : 0.2)
    return
  }
  if (top === clr) {
    doClear(st, p)
    return
  }
  if (top === drib) {
    let ux = gx - p.x
    let uy = -p.y * 0.3
    const l = len(ux, uy)
    if (l > 0) {
      ux /= l
      uy /= l
    }
    if (ahead <= 8) {
      // 앞에 있는 가장 가까운 상대를 피해 옆으로
      let ox = 0
      let oy = 0
      let od = 99
      for (const o of st.players) {
        if (o.team === ti || o.sentOff) continue
        const d = dist(p.x, p.y, o.x, o.y)
        if (d < od && (o.x - p.x) * dir > 0) {
          od = d
          ox = o.x
          oy = o.y
        }
      }
      void ox
      const side = p.y >= oy ? 1 : -1
      ux += -uy * side * 0.8
      uy += ux * side * 0.8
      const l2 = len(ux, uy)
      if (l2 > 0) {
        ux /= l2
        uy /= l2
      }
    }
    p.tx = clamp(p.x + ux * 6, -HALF_L + 1, HALF_L - 1)
    p.ty = clamp(p.y + uy * 6, -HALF_W + 1, HALF_W - 1)
    p.sprint = ahead > 8 && p.stamina > 0.3
    return
  }
  // hold: 상대 반대쪽으로 몸을 돌려 지킨다
  p.tx = p.x - dir * 1
  p.ty = p.y
}

/** 선수 하나의 다음 목표·행동을 정한다. DECIDE_TICKS 마다 한 번 */
/**
 * 골 세레모니 (2026-09-11) — 넣은 팀은 득점자에게 모이고, 득점자는 코너 쪽으로 달려간다.
 * 먹은 팀은 고개 숙이고 자기 진영으로 걸어간다. 골키퍼는 제자리. 전부 idx 기반이라 결정론이다.
 */
function celebrate(st: GameState, p: Player): void {
  const ti = p.team
  const dir = st.teams[ti].dir
  const t = GOAL_TICKS - st.phaseT // 세레모니 경과 틱
  if (p.sk.isGK || ti !== st.goalTeam || st.goalScorer < 0) {
    // 골키퍼 · 먹은 팀 · 자책골: 자기 진영 앵커로 천천히
    goAnchor(p, -3, dir)
    p.sprint = false
    return
  }
  const s = st.players[st.goalScorer]
  if (p.idx === st.goalScorer) {
    // 득점자: 처음 2.5 초는 가까운 코너 깃발 쪽으로 달리고, 그 뒤엔 멈춰 선다
    if (t < 150) {
      const cy = s.y >= 0 ? HALF_W - 3 : -HALF_W + 3
      p.tx = clamp(s.x - dir * 6, -HALF_L + 2, HALF_L - 2)
      p.ty = cy
      p.sprint = true
    } else {
      p.tx = p.x
      p.ty = p.y
      p.sprint = false
    }
    return
  }
  // 동료: 득점자 둘레에 idx 로 정한 자리 (반지름 1.3 m) — 서로 겹치지 않게
  const ang = ((p.idx * 137) % 360) * (Math.PI / 180)
  const r = 1.3 + ((p.idx * 7) % 3) * 0.35
  p.tx = clamp(s.x + Math.cos(ang) * r, -HALF_L + 1, HALF_L - 1)
  p.ty = clamp(s.y + Math.sin(ang) * r, -HALF_W + 1, HALF_W - 1)
  p.sprint = t < 240 && dist(p.x, p.y, s.x, s.y) > 6
}

export function aiDecide(st: GameState, p: Player): void {
  const ti = p.team
  const team = st.teams[ti]
  const dir = team.dir
  const b = st.ball
  const params = BOT[team.bot || 2]
  p.press = false
  p.sprint = false
  if (p.sentOff) {
    // 퇴장 — 터치라인 밖에 서 있는다
    p.tx = p.x
    p.ty = p.y
    return
  }
  if (st.phase === 'goal') {
    celebrate(st, p)
    return
  }
  if (p.sk.isGK) {
    gkDecide(st, p)
    return
  }
  // 리스타트 중 상대 팀: 자리로 가되 규정 거리만큼 떨어진다 (스로인 2 m · 나머지 9.15 m)
  if (st.phase !== 'play' && st.restart && st.restart.team !== ti) {
    goAnchor(p, -2, dir)
    const clear = st.phase === 'throwin' ? THROWIN_CLEAR + 0.5 : CIRCLE_R + 0.5
    const d = dist(p.x, p.y, b.x, b.y)
    if (d < clear && d > 0) {
      p.tx = clamp(p.x + ((p.x - b.x) / d) * (clear + 1), -HALF_L + 1, HALF_L - 1)
      p.ty = clamp(p.y + ((p.y - b.y) / d) * (clear + 1), -HALF_W + 1, HALF_W - 1)
    }
    return
  }
  // 우리 팀 리스타트인데 내가 킥커가 아니면 자리로 (킥오프는 자기 진영·서클 밖을 rules 가 강제한다)
  if (st.phase !== 'play' && st.restart && st.restart.kicker !== p.idx) {
    goAnchor(p, st.phase === 'corner' || st.phase === 'freekick' ? 4 : 0, dir)
    if (st.phase === 'kickoff') {
      if (p.tx * dir > -1.5) p.tx = -dir * 1.5
    }
    return
  }
  if (b.owner === p.idx) {
    if (st.phase === 'play') carrierDecide(st, p, params.noise)
    else {
      p.tx = p.x
      p.ty = p.y
    }
    return
  }
  const ot = ballOwnerTeam(st)
  if (ot < 0) {
    // 자유 공: 받으라고 보낸 사람과 가장 가까운 둘이 요격 지점으로 달린다
    interceptPoint(st, p, tmp)
    // 아군이 찬 공을 오프사이드 위치에서 쫓으면 판정이 난다 — 물러선다
    if (p.offside && b.lastTeam === ti) {
      goAnchor(p, -1, dir)
      p.tx = holdLine(st, p, p.tx, dir)
      return
    }
    const rank = rankByDist(st, ti, tmp.x, tmp.y, p, true)
    if (rank < 2 || b.passTo === p.idx) {
      p.tx = clamp(tmp.x, -HALF_L - 1, HALF_L + 1)
      p.ty = clamp(tmp.y, -HALF_W - 1, HALF_W + 1)
      p.sprint = dist(p.x, p.y, p.tx, p.ty) > 6 && p.stamina > 0.2
      p.press = true
      return
    }
    goAnchor(p, 0, dir)
    return
  }
  if (ot === ti) {
    const o = st.players[b.owner]
    const rank = rankByDist(st, ti, o.x, o.y, p, true, b.owner)
    const n = 2 + (team.sliders.mentality >= 3 ? 1 : 0) + (team.sliders.mentality === 4 ? 1 : 0)
    if (rank < n) {
      const side = p.y >= o.y ? 1 : -1
      let tx: number
      let ty: number
      if (rank === 0) {
        tx = o.x + dir * 8
        ty = o.y + side * 7
      } else if (rank === 1) {
        tx = o.x + dir * 14
        ty = o.y * 0.5
      } else if (rank === 2) {
        tx = o.x - dir * 7
        ty = o.y * 0.7
      } else {
        tx = o.x + dir * 4
        ty = o.y - side * 12
      }
      const line = offsideLineX(st, ti)
      if ((tx - line) * dir > -LINE_MARGIN) tx = line - dir * LINE_MARGIN
      p.tx = clamp(tx, -HALF_L + 1, HALF_L - 1)
      p.ty = clamp(ty, -HALF_W + 1, HALF_W - 1)
      p.sprint = dist(p.x, p.y, p.tx, p.ty) > 8 && p.stamina > 0.25
      return
    }
    goAnchor(p, 3, dir)
    p.tx = holdLine(st, p, p.tx, dir)
    return
  }
  // 상대가 공을 가졌다
  //
  // ⚠ 압박 슬라이더는 **여기서만** 뜻이 생긴다. 예전에는 `d < dPress + 10` 이라 0 이든 4 든 늘 참이어서
  // 슬라이더가 사실상 연결돼 있지 않았다 (2026-09-09 지문 검사에서 5시드 중 1시드만 달라졌다).
  // 이제 세 가지를 함께 움직인다: 붙는 거리 · 압박에 나서는 인원 · 태클을 시도할지(p.press).
  const c = st.players[b.owner]
  const inOwnHalf = c.x * dir < 0
  const sl = team.sliders.press
  // 0 → 9 m 안에서만 붙는다 · 4 → 30 m 밖에서도 쫓아간다
  const dPress = (9 + sl * 5 + (inOwnHalf ? 5 : 0)) * params.press
  // 압박에 나서는 인원 — 0~1 은 한 명, 2~3 은 두 명, 4 는 세 명
  const pressN = sl >= 4 ? 3 : sl >= 2 ? 2 : 1
  const rank = rankByDist(st, ti, c.x, c.y, p, true)
  const d = dist(p.x, p.y, c.x, c.y)
  if (rank === 0) {
    if (d < dPress) {
      // 위치 선정(posn)이 좋을수록 소유자의 다음 자리를 앞서 읽는다 (수비 강화 2026-09-10)
      const lead = 0.3 + 0.3 * p.sk.posn
      p.tx = c.x + c.vx * lead
      p.ty = c.y + c.vy * lead
      // 낮은 압박은 붙어도 덤비지 않는다 — 지연 수비 (태클 시도는 p.press 가 연다)
      p.press = sl >= 1 || d < 2.5
      p.sprint = d > 4 && p.stamina > 0.2 && sl >= 2
      return
    }
    // 너무 멀면 물러나 자리를 지킨다 (낮은 압박)
    p.tx = clamp((c.x + p.ax) / 2, -HALF_L + 1, HALF_L - 1)
    p.ty = (c.y + p.ay) / 2
    return
  }
  if (rank < pressN && d < dPress) {
    // 두·세 번째도 함께 간다 (Q 팀 지원 요청은 슬라이더와 무관하게 한 명 더 붙인다)
    p.tx = c.x - dir * 2 + c.vx * 0.2
    p.ty = c.y + (p.y >= c.y ? 2.5 : -2.5)
    p.press = true
    p.sprint = d > 6 && p.stamina > 0.25
    return
  }
  if (rank === 1) {
    p.tx = clamp(c.x - dir * 5, -HALF_L + 1, HALF_L - 1)
    p.ty = c.y * 0.8
    p.press = team.assist
    p.sprint = d > 10 && p.stamina > 0.25
    return
  }
  // 대인 마크 — 마크(mark)가 좋을수록 더 멀리서 찾아 더 바짝 붙는다 (수비 강화 2026-09-10)
  let mk = -1
  let mkd = 8 + 4 * p.sk.mark
  for (const q of st.players) {
    if (q.team === ti || q.idx === b.owner || q.sk.isGK || q.sentOff) continue
    const dq = dist(p.x, p.y, q.x, q.y)
    if (dq < mkd && q.x * dir < 5) {
      mkd = dq
      mk = q.idx
    }
  }
  if (mk >= 0) {
    const q = st.players[mk]
    p.tx = clamp(q.x - dir * (1.8 - 0.8 * p.sk.mark), -HALF_L + 1, HALF_L - 1)
    p.ty = q.y
    return
  }
  goAnchor(p, -2, dir)
}

/** 사람이 조작할 다음 선수 — 공에 가장 가까운 필드 선수. exclude 를 주면 그 다음 */
export function nearestToBall(st: GameState, teamIdx: number, exclude: number): number {
  const b = st.ball
  let best = -1
  let bestD = 999
  for (const q of st.players) {
    if (q.team !== teamIdx || q.sk.isGK || q.idx === exclude || q.sentOff) continue
    const d = dist(q.x, q.y, b.x + b.vx * 0.3, b.y + b.vy * 0.3)
    if (d < bestD) {
      bestD = d
      best = q.idx
    }
  }
  return best
}

/** 각도 단위 → 방향 벡터 (렌더가 아니라 sim 안에서 쓰는 보조) */
export function dirOf(a: number): { x: number; y: number } {
  return { x: cosA(a), y: sinA(a) }
}

export { atan2A as aiAtan2 }
