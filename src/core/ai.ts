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
    // 개인 전술(2026-09-15): 역할 계수로 앵커를 앞뒤(fwd/back)·좌우(wide)로 옮긴다. 자유 공은 둘의 중간
    const rt = p.rt
    const shift = ot === p.team ? rt.fwd : ot < 0 ? (rt.fwd + rt.back) * 0.5 : rt.back
    let ay = tmp.y
    if (rt.wide !== 1) ay = (ay - st.ball.y * 0.3) * rt.wide + st.ball.y * 0.3
    p.ax = clamp(tmp.x + team.dir * shift, -HALF_L + 1, HALF_L - 1)
    p.ay = clamp(ay, -HALF_W + 1, HALF_W - 1)
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

  const tac = team.sliders
  // 잡은 직후엔 (압박이 없으면) 일단 몰고 간다 — 받자마자 되차는 핑퐁을 막는다.
  // 템포(팀 전술 2026-09-15): 침착 0 → 34틱 · 보통 2 → 20틱 · 빠르게 4 → 6틱
  const justGot = st.tick - p.gotT < 34 - 7 * tac.tempo && opD > 2.5
  // 빌드업: 길게(4)는 먼 패스 벌점 ×0.6, 짧게(0)는 ×1.4
  const longK = 1.4 - 0.2 * tac.buildup

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
    let s = 0.2 + 0.3 * gain * fwdK + (0.25 * open + 0.25 * lane) * eye + 0.15 * p.sk.pas - (dq > 35 ? 0.3 : dq > 25 ? 0.1 : 0) * longK + randN(r) * noise * (1.6 - 0.6 * p.sk.vis)
    // 빌드업 — 자기 진영에서 길게(3~4)는 전진 롱볼을, 짧게(0~1)는 가까운 발밑을 더 좋게 본다
    if (p.x * dir < -10) s += gain * 0.08 * (tac.buildup - 2)
    if (tac.buildup <= 1 && dq < 14) s += 0.06
    // 플레이메이커·폴스 나인(drop)은 늘 받을 준비가 돼 있다
    if (q.rt.drop) s += 0.06
    // 침투 중인 동료(P3) — 앞으로 뛰는 선수에게 준다
    const running = st.tick - q.runT < 20 && gain > 0.15
    if (running) s += 0.22
    if (justGot) s -= 0.35
    let kind: PassKind = 'ground'
    // 침투 중인 동료에게는 스루 (P3)
    if (running || (gain > 0.2 && spaceAhead(st, q, dir) > 5)) {
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
  // 템포 — 침착하면 몰고 가고, 빠르면 내보낸다
  drib += 0.06 * (2 - tac.tempo)
  drib += randN(r) * noise

  let clr = -1
  if (p.x * dir < -20 && opD < 3) clr = 0.55 + (inOwnBox(p, dir) ? 0.2 : 0) + randN(r) * noise

  const hold = 0.08 + 0.03 * (2 - tac.tempo)
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

/** 코너·직접 프리킥(골문 36 m 안)인가 — 박스 안 배치를 쓰는 세트피스 */
function boxSetPiece(st: GameState): boolean {
  const r = st.restart
  if (!r) return false
  if (st.phase === 'corner') return true
  if (st.phase !== 'freekick') return false
  const tm = st.teams[r.team]
  return dist(r.x, r.y, goalX(tm), 0) < 36
}

/**
 * 세트피스 공격 배치 (2026-09-15 제보 "코너·프리킥에 박스 안에 아무도 없다") — 킥커를 뺀 아군 중
 * 골문에 가까운 순으로 여섯 명(FW·AM·MF 먼저, 그다음 DF)이 박스 안 여섯 자리(니어·파포스트·PK 스팟·6야드 앞·엣지 둘)로,
 * 나머지는 하프라인 근처에 남는다(역습 대비). 오프사이드 라인은 rules 가 따로 지킨다
 */
function setPieceAttack(st: GameState, p: Player): boolean {
  if (!boxSetPiece(st) || p.sk.isGK) return false
  const r = st.restart!
  const team = st.teams[p.team]
  const dir = team.dir
  const gx = goalX(team)
  const side = r.y >= 0 ? 1 : -1
  const spots: [number, number][] = [
    [gx - dir * 5.5, -side * 3],
    [gx - dir * 6, side * 4],
    [gx - dir * 11, 0],
    [gx - dir * 8.5, -side * 7],
    [gx - dir * 16, side * 6],
    [gx - dir * 18, -side * 8],
    [gx - dir * 13, -side * 4],
  ]
  // 박스 인원 — 멘탈리티(팀 전술): 수비적 5 · 보통 6 · 공격적 7
  const m = team.sliders.mentality
  const nSpots = m >= 3 ? 7 : m <= 1 ? 5 : 6
  // 순위: 밴드(FW/AM/MF 0 · DF/WB 1) → idx. 스테이(hold) 역할은 맨 뒤
  const rankOf = (q: Player): number => ((q.band === 'FW' || q.band === 'AM' || q.band === 'MF' ? 0 : 1) + q.rt.hold * 2) * 100 + q.idx
  let k = 0
  for (const q of st.players) {
    if (q.team !== p.team || q.sk.isGK || q.sentOff || q.idx === r.kicker) continue
    if (rankOf(q) < rankOf(p)) k++
  }
  if (k >= nSpots) {
    // 뒤에 남는다 — 하프라인 근처 자기 자리
    goAnchor(p, -6, dir)
    p.tx = clamp(Math.min(p.tx * dir, 10) * dir, -HALF_L + 1, HALF_L - 1)
    return true
  }
  const [sx, sy] = spots[k]
  p.tx = clamp(sx, -HALF_L + 1, HALF_L - 1)
  p.ty = clamp(sy, -HALF_W + 1, HALF_W - 1)
  return true
}

/**
 * 세트피스 수비 배치 — 프리킥이면 **벽**(공과 골문 사이 9.15 m, 3~4명 어깨를 맞대고), 나머지는 박스 안 상대를 **골사이드에서 대인마크**,
 * 남는 사람은 골문 앞 지대. 골키퍼는 gkDecide 가 따로 본다
 */
function setPieceDefend(st: GameState, p: Player): boolean {
  if (!boxSetPiece(st) || p.sk.isGK) return false
  const r = st.restart!
  const atk = st.teams[r.team]
  const ti = p.team
  const dir = st.teams[ti].dir
  const ownX = -dir * HALF_L // 우리 골문 = 상대가 공격하는 골문
  const dGoal = dist(r.x, r.y, ownX, 0)
  const wallN = st.phase === 'freekick' ? (dGoal < 22 ? 4 : 3) : 0
  // 내 순번 — idx 순 (결정론)
  let k = 0
  for (const q of st.players) {
    if (q.team !== ti || q.sk.isGK || q.sentOff) continue
    if (q.idx < p.idx) k++
  }
  if (k < wallN) {
    // 벽 — 공→골문 선 위 9.15 m, 선에 수직으로 0.65 m 간격
    const ux = (ownX - r.x) / Math.max(1, dGoal)
    const uy = (0 - r.y) / Math.max(1, dGoal)
    const cx = r.x + ux * (CIRCLE_R + 0.3)
    const cy = r.y + uy * (CIRCLE_R + 0.3)
    const off = (k - (wallN - 1) / 2) * 0.65
    p.tx = clamp(cx + -uy * off, -HALF_L + 1, HALF_L - 1)
    p.ty = clamp(cy + ux * off, -HALF_W + 1, HALF_W - 1)
    return true
  }
  // 대인 — 박스 근처 상대(킥커 제외)를 골문 가까운 순으로, 내 순번(벽 제외)에 맞춰
  const targets: Player[] = []
  for (const q of st.players) {
    if (q.team !== r.team || q.sk.isGK || q.sentOff || q.idx === r.kicker) continue
    if (dist(q.x, q.y, ownX, 0) < 30) targets.push(q)
  }
  targets.sort((a, b2) => dist(a.x, a.y, ownX, 0) - dist(b2.x, b2.y, ownX, 0) || a.idx - b2.idx)
  const m = k - wallN
  if (m < targets.length) {
    const q = targets[m]
    const dq = Math.max(1, dist(q.x, q.y, ownX, 0))
    p.tx = clamp(q.x + ((ownX - q.x) / dq) * 1.3, -HALF_L + 1, HALF_L - 1)
    p.ty = clamp(q.y + ((0 - q.y) / dq) * 1.3, -HALF_W + 1, HALF_W - 1)
    return true
  }
  // 남는 사람 — 골문 앞 지대 (6야드 라인 앞, 좌우로 벌려)
  const z = m - targets.length
  p.tx = clamp(ownX + dir * (7 + (z % 2) * 4), -HALF_L + 1, HALF_L - 1)
  p.ty = clamp((z % 3 - 1) * 6, -HALF_W + 1, HALF_W - 1)
  void atk
  return true
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
    if (setPieceDefend(st, p)) return
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
    if (setPieceAttack(st, p)) return
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
    // 박스 침투 (2026-09-15 제보 "크로스 올릴 때 헤딩할 선수가 없다") — 소유자가 사이드 깊숙이(|y| > 16 · 상대 진영 20 m 안)면
    // 공격수·AM 셋이 니어포스트·PK 스팟·파포스트로 달려 들어간다. 오프사이드 라인은 넘지 않는다
    // 누가 뛰는가는 역할 계수 box (기본: FW·AM·MF 1, 포스트형·침투형 CAM 2 = 먼저, 밖으로 윙어·홀딩 0 = 안 감)
    if (p.rt.box > 0 && Math.abs(o.y) > 16 && o.x * dir > 20 && p.idx !== b.owner) {
      const gx = goalX(team)
      const far = o.y > 0 ? -1 : 1
      const spots: [number, number][] = [
        [gx - dir * 5.5, -far * 2.5],
        [gx - dir * 11, 0],
        [gx - dir * 7, far * 5],
      ]
      // 세 자리 — box 가 큰 순, 같으면 idx 순 (같은 자리를 둘이 안 잡게)
      let k = 0
      for (const q of st.players) {
        if (q.team !== ti || q.sk.isGK || q.sentOff || q.idx === b.owner || q.idx === p.idx || q.rt.box === 0) continue
        if (!(q.rt.box > p.rt.box || (q.rt.box === p.rt.box && q.idx < p.idx))) continue
        if (dist(q.x, q.y, gx, 0) < 30) k++
      }
      if (k < 3 && dist(p.x, p.y, gx, 0) < 32) {
        const [sx, sy] = spots[k]
        const line = offsideLineX(st, ti) * dir
        p.tx = clamp(Math.min(sx * dir, line - LINE_MARGIN) * dir, -HALF_L + 1, HALF_L - 1)
        p.ty = clamp(sy, -HALF_W + 1, HALF_W - 1)
        p.sprint = p.stamina > 0.25
        p.runT = st.tick
        return
      }
    }
    // 침투 러닝 (P3, 2026-09-15 — 지원 러닝보다 먼저 본다 · FC 온라인 영상: 받을 선수가 패스 **전에** 빈 공간으로 뛴다).
    // 공격수·공격형 미드필더가 소유자보다 앞에 있고, 소유자가 전진 중이거나 상대 진영이며, 내 앞 7 m 가 비었으면
    // 오프사이드 라인 바로 뒤까지 사선으로 달린다. 소유자 AI 는 `runT` 를 보고 이 선수에게 스루를 선호한다
    // 누가 뛰는가는 역할 계수 run (기본 FW·AM 1 · 침투형 2 = 더 멀리서·더 좁은 틈에도 · 포스트형·홀딩 0)
    const eager = p.rt.run >= 2
    if (p.rt.run > 0 && (o.vx * dir > 1.2 || o.x * dir > 0)) {
      const ahead = (p.x - o.x) * dir
      const gx = goalX(team)
      if (ahead > 2 && ahead < (eager ? 30 : 26) && dist(p.x, p.y, gx, 0) < (eager ? 45 : 40)) {
        let clear = true
        const laneW = eager ? 1.7 : 2.2
        for (const q of st.players) {
          if (q.team === ti || q.sk.isGK || q.sentOff) continue
          const dx = (q.x - p.x) * dir
          if (dx > -0.5 && dx < 7 && Math.abs(q.y - p.y) < laneW) {
            clear = false
            break
          }
        }
        if (clear) {
          const line = offsideLineX(st, ti) * dir
          const want = Math.min(line - LINE_MARGIN, p.x * dir + 9)
          p.tx = clamp(want * dir, -HALF_L + 1, HALF_L - 1)
          p.ty = clamp(p.y + (0 - p.y) * 0.25, -HALF_W + 1, HALF_W - 1)
          p.sprint = p.stamina > 0.3
          p.runT = st.tick
          return
        }
      }
    }
    const n = 2 + (team.sliders.mentality >= 3 ? 1 : 0) + (team.sliders.mentality === 4 ? 1 : 0)
    // 홀딩 MF · 스테이 풀백/CB(hold) 는 지원 러닝에 나서지 않는다
    if (rank < n && !p.rt.hold) {
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
    // 플레이메이커 · 폴스 나인(drop): 소유자보다 앞에 있으면 소유자 쪽으로 내려와 짧은 옵션이 된다
    if (p.rt.drop && (p.x - o.x) * dir > 4 && dist(p.x, p.y, o.x, o.y) < 30) {
      p.tx = clamp(o.x + dir * 5, -HALF_L + 1, HALF_L - 1)
      p.ty = clamp((o.y + p.ay) * 0.5, -HALF_W + 1, HALF_W - 1)
      p.tx = holdLine(st, p, p.tx, dir)
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
    // 커버 — 소유자와 **우리 골문 사이**에 선다 (2026-09-15: 소유자 뒤 5 m 는 빠른 드리블러를 못 따라갔다).
    // 소유자가 우리 진영 35 m 안이면 골문 쪽 8 m, 아니면 6 m
    const ownX = -dir * HALF_L
    const dOwn = dist(c.x, c.y, ownX, 0)
    const back = dOwn < 35 ? 8 : 6
    const ux = (ownX - c.x) / Math.max(1, dOwn)
    const uy = (0 - c.y) / Math.max(1, dOwn)
    p.tx = clamp(c.x + ux * back, -HALF_L + 1, HALF_L - 1)
    p.ty = clamp(c.y + uy * back, -HALF_W + 1, HALF_W - 1)
    p.press = team.assist
    p.sprint = d > 8 && p.stamina > 0.25
    return
  }
  // 대인 마크 (2026-09-15 개정 — "수비수들이 정면으로 달려오는 공격수를 안 막는다"):
  // 상대 필드 선수 중 **우리 골문 쪽으로 달려오거나 우리 진영에 있는** 사람을, 다른 아군이 이미 잡지 않은 순으로 잡아
  // **골사이드**(상대와 우리 골문 사이 1.2~2 m)에 선다. 마크(mark)가 좋을수록 더 멀리서 찾고, 봇 난이도가 높을수록 넓게(press 배수)
  // 수비 방식(팀 전술 2026-09-15): 대인 4 → 찾는 거리 ×1.4 · 지역 0 → ×0.6 이고 위험 지역(우리 골문 30 m) 밖 상대는 안 잡는다
  const ds = team.sliders.defStyle
  let mk = -1
  let mkScore = -1
  const reach = (8 + 4 * p.sk.mark) * params.press * (0.6 + 0.2 * ds)
  for (const q of st.players) {
    if (q.team === ti || q.idx === b.owner || q.sk.isGK || q.sentOff) continue
    const dq = dist(p.x, p.y, q.x, q.y)
    if (dq > reach) continue
    const coming = q.vx * dir < -1.5 // 우리 골문 쪽으로 달린다
    const inOur = q.x * dir < 5
    if (!coming && !inOur) continue
    // 다른 아군이 최근 30틱 안에 잡은 상대는 건너뛴다 (내가 잡은 사람이면 계속)
    let taken = false
    for (const m of st.players) {
      if (m.team !== ti || m.idx === p.idx || m.sentOff) continue
      if (m.markOf === q.idx && st.tick - m.markT < 30) {
        taken = true
        break
      }
    }
    if (taken) continue
    const dangerous = dist(q.x, q.y, -dir * HALF_L, 0) < 30
    if (ds <= 1 && !dangerous) continue
    const sc = (coming ? 2 : 0) + (dangerous ? 1.5 : 0) + (p.markOf === q.idx ? 1 : 0) - dq * 0.08
    if (sc > mkScore) {
      mkScore = sc
      mk = q.idx
    }
  }
  if (mk >= 0) {
    const q = st.players[mk]
    p.markOf = mk
    p.markT = st.tick
    const ownX = -dir * HALF_L
    const dq = Math.max(1, dist(q.x, q.y, ownX, 0))
    const gap = 2.0 - 0.8 * p.sk.mark
    p.tx = clamp(q.x + ((ownX - q.x) / dq) * gap, -HALF_L + 1, HALF_L - 1)
    p.ty = clamp(q.y + ((0 - q.y) / dq) * gap, -HALF_W + 1, HALF_W - 1)
    p.sprint = dist(p.x, p.y, p.tx, p.ty) > 6 && p.stamina > 0.25
    return
  }
  p.markOf = -1
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
