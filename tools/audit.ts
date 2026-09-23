// 요구사항 재검증 — 봇 vs 봇 N 판을 돌리며 "요청했던 동작이 실제로 나오는가"를 **센다** (2026-09-15 저녁, 사용자: "이전 요구사항이 제대로 반영되는지 전부 다시 확인해").
//   npx vite-node tools/audit.ts [판수] [하프초]
//
// 재는 것 (요청 번호는 9/15 저녁 목록):
//   2/8/9  골키퍼 — 공을 잡은 뒤 얼마나 오래 들고 있나(자동 배급), 배급 패스가 상대에게 가는 비율
//   4      공 바라보기 — 서 있는 선수가 공 쪽을 보는 비율
//   6      대인마킹 — 우리 골문 쪽으로 달려오는 상대에게 마커가 붙어 있는 비율
//   7      스루패스 성공률 (종류별 패스 성공률)
//   10     크로스 상황 — 소유자가 사이드 깊숙이 있을 때 박스로 뛰는 동료 수
//   11     세트피스 — 코너·프리킥 때 박스 안 공격·수비 인원, 프리킥 벽
//   (27차) 뒤 태클 — 파울·카드 수
// 목표치는 표에 적혀 있다. 밑돌면 WARN.

import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, step } from '../src/core/sim'
import { synthSquad } from '../src/core/synth'
import { ACT_HEAD, BOX_HALF_W, BOX_L, CIRCLE_R, HALF_L, goalX, type GameState } from '../src/core/state'
import { atan2A } from '../src/core/fixedmath'

const N = Number(process.argv[2] ?? 12)
const HALF = Number(process.argv[3] ?? 180)
const SEED0 = Number(process.argv[4] ?? 3000)
const GK_DETAIL = process.argv.includes('--gk')
const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]

const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by)
const angDiff = (a: number, b: number): number => {
  let d = (a - b) & 1023
  if (d > 512) d = 1024 - d
  return (d / 1024) * 360
}

// ---- 누적 ----
const passK = new Map<string, { n: number; ok: number }>()
let gkPass = 0
let gkPassOk = 0
let gkPunts = 0
let gkHold: number[] = []
let faceN = 0
let faceOk = 0
let markN = 0
let markOk = 0
let crossN = 0
let crossRunners = 0
let crossRunning = 0
let crossNear3 = 0
let crossLine = 0
const foulsPer: number[] = []
let gkGoalKick = 0
let gkGoalKickOk = 0
let spWait: number[] = []
let cornerN = 0
let cornerAtk = 0
let cornerDef = 0
let fkN = 0
let fkWall = 0
let fkAtk = 0
let headers = 0
let goals = 0
let fouls = 0
let yellows = 0
let reds = 0
let throughGoalsChance = 0
// 크로스 (32차) — 사이드(|y| > 14)에서 뜬 공중 패스. 1 초 뒤(떨어질 무렵) 박스 안 동료 수 · 2 초 안에 그 팀 슛(헤딩 포함)으로 이어졌나.
// 슛이 1 초 전에 나오면 박스 인원은 안 센다(분모는 크로스 수 그대로 — 보수적)
let crossesN = 0
let crossBox = 0
let crossShot = 0
const gkLog: { m: number; tick: number; kind: string; d: number; open: number; to: number; res: string }[] = []

for (let m = 0; m < N; m++) {
  const st = createState({ seed: SEED0 + m, halfSec: HALF, squads: [home, away] })
  const b = st.ball
  let live = false
  let kind = ''
  let passer = -1
  let passTeam = -1
  let isRestart = false
  let crossPend: { t: number; team: number; shots: number; gx: number; counted: boolean } | null = null
  let lastRestartTick = -100
  let gkSince = -1
  let gkIdx = -1
  let prevPhase = ''
  let phaseTicks = 0
  let restartCounted = false
  let spLast: { kind: 'corner' | 'fk'; a: number; d: number; wall: number } | null = null
  const prevAct = new Array<number>(st.players.length).fill(0)
  while (!st.done) {
    step(st, idle)
    // 리스타트 킥 판별용 — 국면이 play 로 바뀐 틱 (패스 추적보다 먼저 봐야 같은 틱의 킥이 잡힌다)
    if (st.phase === 'play' && prevPhase !== 'play' && prevPhase !== 'goal' && prevPhase !== 'halftime' && prevPhase !== '') lastRestartTick = st.tick
    // ---- 패스 추적 ----
    if (!live && b.passLive && b.passTo >= 0 && b.lastTouch >= 0) {
      live = true
      kind = b.passKind
      if ((kind === 'highcross' || kind === 'lob' || kind === 'lowcross') && Math.abs(b.y) > 14) {
        const pt = st.players[b.lastTouch].team
        const gx = goalX(st.teams[pt])
        if (Math.abs(b.x - gx) < 40) {
          crossesN++
          crossPend = { t: st.tick, team: pt, shots: st.stats[pt].shots, gx, counted: false }
        }
      }
      passer = b.lastTouch
      passTeam = st.players[passer].team
      isRestart = st.tick - lastRestartTick < 4
      if (GK_DETAIL && st.players[passer].sk.isGK) {
        const q = st.players[b.passTo]
        let open = 99
        for (const o of st.players) if (o.team !== passTeam && !o.sentOff) open = Math.min(open, dist(o.x, o.y, q.x, q.y))
        gkLog.push({ m, tick: st.tick, kind, d: dist(b.x, b.y, q.x, q.y), open, to: b.passTo, res: '' })
      }
    } else if (live && (!b.passLive || b.owner >= 0)) {
      live = false
      const ok = b.owner >= 0 && st.players[b.owner].team === passTeam
      const e = passK.get(kind) ?? { n: 0, ok: 0 }
      e.n++
      if (ok) e.ok++
      passK.set(kind, e)
      if (passer >= 0 && st.players[passer].sk.isGK && isRestart) {
        gkGoalKick++
        if (ok) gkGoalKickOk++
      } else if (passer >= 0 && st.players[passer].sk.isGK) {
        gkPass++
        if (ok) gkPassOk++
        if (GK_DETAIL && gkLog.length) {
          const g = gkLog[gkLog.length - 1]
          g.res = ok ? 'ok' : b.owner >= 0 ? `lost→${st.players[b.owner].spec.name}(${(dist(b.x, b.y, st.players[g.to].x, st.players[g.to].y)).toFixed(1)} m 에서)` : 'out'
        }
      }
    }
    // ---- 골키퍼 보유 시간 ----
    if (b.owner >= 0 && st.players[b.owner].sk.isGK) {
      if (gkIdx !== b.owner) {
        gkIdx = b.owner
        gkSince = st.tick
      }
    } else if (gkIdx >= 0) {
      gkHold.push(st.tick - gkSince)
      // 펀트 = 배급 뒤 공이 높이 떴다
      if (b.vz > 5) gkPunts++
      gkIdx = -1
    }
    if (crossPend) {
      // 1 초 뒤(공이 떨어질 무렵) 박스 안 동료 수
      if (!crossPend.counted && st.tick - crossPend.t >= 60) {
        crossPend.counted = true
        for (const q of st.players) if (q.team === crossPend.team && !q.sk.isGK && !q.sentOff && Math.abs(q.x - crossPend.gx) < 16 && Math.abs(q.y) < 12) crossBox++
      }
      if (st.stats[crossPend.team].shots > crossPend.shots) {
        crossShot++
        crossPend = null
      } else if (st.tick - crossPend.t > 120) crossPend = null
    }
    // ---- 헤딩 ----
    for (const p of st.players) {
      if (p.action === ACT_HEAD && prevAct[p.idx] !== ACT_HEAD) headers++
      prevAct[p.idx] = p.action
    }
    // ---- 세트피스 (국면 진입 후 120틱 = 2 초 뒤 한 번 잰다) ----
    if (st.phase !== prevPhase) {
      // 국면이 끝났다 — 직전 세트피스의 마지막 측정을 기록
      if (spLast) {
        spWait.push(phaseTicks)
        if (spLast.kind === 'corner') {
          cornerN++
          cornerAtk += spLast.a
          cornerDef += spLast.d
        } else {
          fkN++
          fkAtk += spLast.a
          fkWall += spLast.wall
        }
        spLast = null
      }
      prevPhase = st.phase
      phaseTicks = 0
      restartCounted = false
    } else phaseTicks++
    void restartCounted
    if (phaseTicks % 10 === 0 && phaseTicks >= 30 && st.restart && (st.phase === 'corner' || st.phase === 'freekick')) {
      const r = st.restart
      const atk = st.teams[r.team]
      const gx = goalX(atk)
      const dGoal = dist(r.x, r.y, gx, 0)
      const inBox = (x: number, y: number): boolean => Math.abs(x - gx) < BOX_L && Math.abs(y) < BOX_HALF_W
      let a = 0
      let d = 0
      for (const p of st.players) {
        if (p.sk.isGK || p.sentOff || p.idx === r.kicker) continue
        if (!inBox(p.x, p.y)) continue
        if (p.team === r.team) a++
        else d++
      }
      if (st.phase === 'corner') spLast = { kind: 'corner', a, d, wall: 0 }
      else if (dGoal < 30) {
        const ux = (gx - r.x) / Math.max(1, dGoal)
        const uy = (0 - r.y) / Math.max(1, dGoal)
        const wx = r.x + ux * (CIRCLE_R + 0.3)
        const wy = r.y + uy * (CIRCLE_R + 0.3)
        let wall = 0
        for (const p of st.players) if (p.team !== r.team && !p.sk.isGK && dist(p.x, p.y, wx, wy) < 2.2) wall++
        spLast = { kind: 'fk', a, d, wall }
      }
    }
    // ---- 30틱마다 표본 ----
    if (st.tick % 30 !== 0 || st.phase !== 'play') continue
    const owner = b.owner >= 0 ? st.players[b.owner] : null
    for (const p of st.players) {
      if (p.sentOff || (owner && owner.idx === p.idx)) continue
      const spd = Math.hypot(p.vx, p.vy)
      if (spd > 0.9) continue
      faceN++
      if (angDiff(p.facing, atan2A(b.y - p.y, b.x - p.x)) <= 45) faceOk++
    }
    for (let t = 0; t < 2; t++) {
      const team = st.teams[t]
      const dir = team.dir
      const ownX = -dir * HALF_L
      for (const q of st.players) {
        if (q.team === t || q.sk.isGK || q.sentOff || (owner && owner.idx === q.idx)) continue
        if (!(q.vx * dir < -1.5) || dist(q.x, q.y, ownX, 0) > 35) continue
        markN++
        let marked = false
        for (const p of st.players) {
          if (p.team !== t || p.sk.isGK || p.sentOff) continue
          if (p.markOf === q.idx && dist(p.x, p.y, q.x, q.y) < 5) marked = true
          // 압박·커버로 붙어 있는 것도 마크로 친다
          if (dist(p.x, p.y, q.x, q.y) < 2.5) marked = true
        }
        if (marked) markOk++
      }
    }
    if (owner && !owner.sk.isGK) {
      const team = st.teams[owner.team]
      const dir = team.dir
      // 깊은 사이드(바이라인 20 m 안)에서만 — 32 m 밖에서는 수비 라인이 높아 박스가 비어 있는 게 맞다
      if (Math.abs(owner.y) > 16 && owner.x * dir > 33) {
        crossN++
        const gx = goalX(team)
        let runners = 0
        let running = 0
        const ds: number[] = []
        for (const q of st.players) {
          if (q.team !== owner.team || q.idx === owner.idx || q.sk.isGK || q.sentOff) continue
          if (dist(q.x, q.y, gx, 0) < 22 && Math.abs(q.y) < 14) runners++
          if (st.tick - q.runT < 20) running++
          ds.push(dist(q.x, q.y, gx, 0))
        }
        ds.sort((a, c) => a - c)
        crossRunners += runners
        crossRunning += running
        crossNear3 += (ds[0] + ds[1] + ds[2]) / 3
        // 수비 라인(뒤에서 두 번째 수비수)이 자기 골문에서 몇 m 인가
        const defs = st.players.filter((q) => q.team !== owner.team && !q.sentOff).map((q) => dist(q.x, 0, gx, 0)).sort((a, c) => a - c)
        crossLine += defs[1] ?? 0
      }
    }
  }
  if (gkIdx >= 0) gkHold.push(st.tick - gkSince)
  goals += st.teams[0].goals + st.teams[1].goals
  fouls += st.stats[0].fouls + st.stats[1].fouls
  foulsPer.push(st.stats[0].fouls + st.stats[1].fouls)
  yellows += st.stats[0].yellows + st.stats[1].yellows
  reds += st.stats[0].reds + st.stats[1].reds
}

// ---- 표 ----
gkHold = gkHold.sort((a, c) => a - c)
const pct = (a: number, n: number): string => (n ? `${((a / n) * 100).toFixed(0)}%` : '-')
const med = gkHold.length ? gkHold[Math.floor(gkHold.length / 2)] : 0
const p90 = gkHold.length ? gkHold[Math.floor(gkHold.length * 0.9)] : 0
const rows: [string, string, string, boolean][] = []
const add = (what: string, got: string, target: string, ok: boolean): void => {
  rows.push([what, got, target, ok])
}
for (const [k, e] of [...passK.entries()].sort()) add(`패스 성공 · ${k || '?'} (${e.n}회)`, pct(e.ok, e.n), k === 'through' ? '≥ 40%' : k === 'highcross' || k === 'lowcross' ? '≥ 30%' : '≥ 50%', e.n === 0 || e.ok / e.n >= (k === 'through' ? 0.4 : k === 'highcross' || k === 'lowcross' ? 0.3 : 0.5))
add(`GK 배급 패스 성공 (${gkPass}회 · 펀트 ${gkPunts})`, pct(gkPassOk, gkPass), '≥ 80%', gkPass === 0 || gkPassOk / gkPass >= 0.8)
add(`GK 보유 시간 중앙값 / 90% (틱)`, `${med} / ${p90}`, '≤ 130 / ≤ 220', med <= 130 && p90 <= 220)
add(`서 있는 선수가 공을 본다 (${faceN} 표본)`, pct(faceOk, faceN), '≥ 85%', faceOk / Math.max(1, faceN) >= 0.85)
add(`골문 쪽으로 달려오는 상대에 마커 (${markN} 표본)`, pct(markOk, markN), '≥ 60%', markN === 0 || markOk / markN >= 0.6)
add(`사이드 깊숙이 소유 때 박스 안 동료 수 (${crossN} 표본)`, (crossRunners / Math.max(1, crossN)).toFixed(2), '≥ 2.0', crossN === 0 || crossRunners / crossN >= 2)
add(`크로스 (판당 · ${crossesN}회) — 1초 뒤 박스 안 동료 · 2초 안 슛`, `${(crossesN / N).toFixed(1)} · ${(crossBox / Math.max(1, crossesN)).toFixed(2)} · ${pct(crossShot, crossesN)}`, '≥ 1 · ≥ 1.5 · ≥ 20%', crossesN / N >= 1 && crossBox / Math.max(1, crossesN) >= 1.5 && crossShot / Math.max(1, crossesN) >= 0.2)
add(`  └ 그때 박스로 뛰는 중(runT) 동료 · 가까운 셋의 골문 거리 · 수비 라인`, `${(crossRunning / Math.max(1, crossN)).toFixed(2)} · ${(crossNear3 / Math.max(1, crossN)).toFixed(0)} m · ${(crossLine / Math.max(1, crossN)).toFixed(0)} m`, '(진단)', true)
add(`GK 골킥 성공 (${gkGoalKick}회)`, pct(gkGoalKickOk, gkGoalKick), '≥ 60%', gkGoalKick === 0 || gkGoalKickOk / gkGoalKick >= 0.6)
spWait.sort((a, c) => a - c)
add(`세트피스 킥까지 기다린 틱 (중앙값)`, String(spWait.length ? spWait[Math.floor(spWait.length / 2)] : 0), '(진단)', true)
add(`판별 파울`, foulsPer.join(' '), '(진단)', true)
add(`코너 — 박스 안 공격 / 수비 (${cornerN}회)`, `${(cornerAtk / Math.max(1, cornerN)).toFixed(1)} / ${(cornerDef / Math.max(1, cornerN)).toFixed(1)}`, '≥ 4 / ≥ 6', cornerN === 0 || (cornerAtk / cornerN >= 4 && cornerDef / cornerN >= 6))
add(`직접 프리킥(30 m 안) — 벽 / 박스 안 공격 (${fkN}회)`, `${(fkWall / Math.max(1, fkN)).toFixed(1)} / ${(fkAtk / Math.max(1, fkN)).toFixed(1)}`, '≥ 3 / ≥ 3', fkN === 0 || (fkWall / fkN >= 3 && fkAtk / fkN >= 3))
add(`헤딩 (판당)`, (headers / N).toFixed(1), '≥ 2', headers / N >= 2)
add(`파울 · 경고 · 퇴장 (판당)`, `${(fouls / N).toFixed(1)} · ${(yellows / N).toFixed(2)} · ${(reds / N).toFixed(2)}`, '≤ 10 · ≤ 2 · ≤ 0.1', fouls / N <= 10 && yellows / N <= 2 && reds / N <= 0.1)
add(`골 (판당)`, (goals / N).toFixed(2), '2 ~ 5', goals / N >= 2 && goals / N <= 5)
void throughGoalsChance

console.log(`재검증 — 봇 vs 봇 ${N}판 · 하프 ${HALF}s · 시드 ${SEED0}+`)
if (GK_DETAIL) for (const g of gkLog) console.log(`  GK 배급 ${g.kind} ${g.d.toFixed(0)} m · 받을 선수 주변 상대 ${g.open.toFixed(1)} m → ${g.res}`)
const w0 = Math.max(...rows.map((r) => r[0].length))
for (const [what, got, target, ok] of rows) console.log(`${ok ? 'OK  ' : 'WARN'} ${what.padEnd(w0 + 2)} ${got.padEnd(14)} 목표 ${target}`)
