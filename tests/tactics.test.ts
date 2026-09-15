// 팀 전술 7종 · 개인 전술(역할) — 2026-09-15 사용자 12번 (DESIGN 4.10a · HANDOVER 0-d).
//
// - 역할 계수(roleTraits)는 "기본 = 변화 없음" 이고, 자리군마다 4개.
// - 계수가 실제로 AI 에 닿는가: 앵커(오버랩 vs 스테이) · 지원 러닝(홀딩) · 대인마킹(수비 방식) · 골키퍼 배급(빌드업).
// - 스쿼드 코드 v2 왕복 · 옛 v1 코드 거부 · 검증 · 정규화.
// - 결정론: 같은 전술 → 같은 해시, 다른 역할 → 다른 해시(역할이 sim 에 닿는다).

import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, type Input } from '../src/core/input'
import { createState, hashState, step } from '../src/core/sim'
import { aiDecide, updateAnchors } from '../src/core/ai'
import { gkDistribute } from '../src/core/ball'
import { synthSquad } from '../src/core/synth'
import { HALF_L, SLIDER_KEYS, type GameState, type SquadConfig } from '../src/core/state'
import { ROLES, ROLE_MAX, TEAM_TACTICS, defaultPresets, normalizeSliders, roleGroupOf, roleTraits } from '../src/core/tactics'
import { CODE_BITS, decodeSquad, encodeSquad } from '../src/cards/squadcode'
import { START_SIZE, checkSquad, computeCap, normalizeSquad, starterSquad, toSquadConfig, type Squad } from '../src/cards/squad'
import { makeRng, rand } from '../src/core/rng'

const idle: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT]
const CAP = computeCap().cap

function squads(homeRoles?: number[], preset = 1): [SquadConfig, SquadConfig] {
  const home = synthSquad(11, { name: '홈', short: '홈', formation: '4-3-3', quality: 66 })
  const away = synthSquad(22, { name: '원정', short: '원정', formation: '4-4-2', quality: 66 })
  const p = defaultPresets()
  return [{ ...home, roles: homeRoles, presets: [p[preset], p[preset], p[preset]] }, away]
}

/** 경기 상태를 만들고 킥오프가 끝난 'play' 로 둔 뒤, 22명을 멀리 치운다 (테스트가 자리를 직접 놓는다) */
function playState(homeRoles?: number[]): GameState {
  const st = createState({ seed: 7, halfSec: 180, squads: squads(homeRoles) })
  let guard = 0
  while (st.phase !== 'play' && guard++ < 2000) step(st, idle)
  st.phase = 'play'
  st.restart = null
  for (const p of st.players) {
    p.x = p.team === 0 ? -40 : 40
    p.y = (p.idx % 11) * 4 - 20
    p.vx = 0
    p.vy = 0
    p.markOf = -1
    p.markT = -1000
  }
  return st
}

function put(st: GameState, idx: number, x: number, y: number, vx = 0, vy = 0): void {
  const p = st.players[idx]
  p.x = x
  p.y = y
  p.vx = vx
  p.vy = vy
}

describe('역할 계수 (core/tactics.ts)', () => {
  it('기본 역할은 아무것도 바꾸지 않고, 자리군마다 역할이 4개다 (골키퍼 1)', () => {
    for (const slot of ['ST', 'LW', 'CAM', 'CM', 'LB', 'CB']) {
      const g = roleGroupOf(slot)
      expect(ROLES[g].length).toBe(ROLE_MAX + 1)
      const t = roleTraits(g === 'ST' || g === 'WING' ? 'FW' : g === 'CB' || g === 'FB' ? 'DF' : 'MF', slot, 0)
      expect(t.fwd).toBe(0)
      expect(t.back).toBe(0)
      expect(t.wide).toBe(1)
      expect(t.hold).toBe(0)
      expect(t.drop).toBe(0)
    }
    expect(ROLES.GK.length).toBe(1)
    expect(roleGroupOf('RWB')).toBe('FB')
    expect(roleGroupOf('LAM')).toBe('WING')
    expect(roleGroupOf('LDM')).toBe('CM')
  })

  it('침투형 ST 는 run 2, 홀딩 CM 은 hold 1, 오버랩 풀백은 앞으로 8 m, 범위 밖 역할은 기본', () => {
    expect(roleTraits('FW', 'ST', 1).run).toBe(2)
    expect(roleTraits('MF', 'CM', 2).hold).toBe(1)
    expect(roleTraits('DF', 'LB', 1).fwd).toBe(8)
    expect(roleTraits('DF', 'LB', 9)).toEqual(roleTraits('DF', 'LB', 0))
  })

  it('팀 전술 메타는 슬라이더 키 7개와 같고, 정규화는 빠진 키를 2 로 채운다', () => {
    expect(TEAM_TACTICS.map((t) => t.key)).toEqual([...SLIDER_KEYS])
    const s = normalizeSliders({ line: 4, press: 9 as number })
    expect(s.line).toBe(4)
    expect(s.press).toBe(4)
    expect(s.tempo).toBe(2)
    expect(s.defStyle).toBe(2)
    const d = defaultPresets()
    expect(d[0].defStyle).toBeGreaterThan(d[2].defStyle)
    expect(d[2].tempo).toBeGreaterThan(d[0].tempo)
  })
})

describe('역할이 AI 에 닿는다', () => {
  it('오버랩 풀백은 우리 소유 때 스테이 풀백보다 10 m 넘게 앞에 선다 (앵커)', () => {
    // 4-3-3: [1] LB · [4] RB
    const roles = new Array(START_SIZE).fill(0)
    roles[1] = 1 // 오버랩
    roles[4] = 2 // 스테이
    const st = playState(roles)
    const dir = st.teams[0].dir
    st.ball.owner = 9 // 홈 ST
    put(st, 9, dir * 10, 0)
    st.ball.x = dir * 10
    st.ball.y = 0
    updateAnchors(st)
    const lb = st.players[1]
    const rb = st.players[4]
    expect(lb.ax * dir - rb.ax * dir).toBeGreaterThan(10)
    // 상대 소유로 바뀌면 둘 다 뒤로 — 오버랩 풀백도 fwd 를 잃는다
    st.ball.owner = 20
    updateAnchors(st)
    expect(lb.ax * dir - rb.ax * dir).toBeLessThan(2)
  })

  it('홀딩 CM 은 소유자 곁이라도 지원 러닝(앞으로 8 m)에 나서지 않는다', () => {
    const run = (role: number): { cmTx: number; ox: number } => {
      const roles = new Array(START_SIZE).fill(0)
      roles[6] = role // 4-3-3 CM
      const st = playState(roles)
      const dir = st.teams[0].dir
      const o = st.players[9] // ST 가 공을 가졌다
      put(st, 9, dir * 20, 0, dir * 2, 0)
      st.ball.owner = 9
      st.ball.x = o.x
      st.ball.y = o.y
      const cm = st.players[6]
      put(st, 6, dir * 17, 1)
      updateAnchors(st)
      aiDecide(st, cm)
      return { cmTx: cm.tx * dir, ox: o.x * dir }
    }
    const base = run(0)
    const hold = run(2)
    expect(base.cmTx).toBeGreaterThanOrEqual(base.ox + 6) // 기본: rank 0 지원 = 소유자 앞 8 m
    expect(hold.cmTx).toBeLessThan(hold.ox + 4) // 홀딩: 자리(앵커)로
  })

  it('수비 방식 — 대인(4)은 10 m 밖 상대도 잡고, 지역(0)은 위험 지역 밖 상대를 놔둔다', () => {
    const run = (defStyle: number): number => {
      const st = playState()
      const dir = st.teams[0].dir // 홈 +1, 우리 골문 x = −52.5
      st.teams[0].sliders.defStyle = defStyle
      // 원정 소유자는 중앙선 근처
      const c = st.players[20]
      put(st, 20, dir * 5, 0)
      st.ball.owner = 20
      st.ball.x = c.x
      st.ball.y = c.y
      // 홈 압박 rank 0·1 을 소유자 곁에 둔다 → 수비수는 마킹 분기로 간다
      put(st, 5, dir * 8, 0)
      put(st, 7, dir * 11, 0)
      // 우리 골문 쪽으로 달려오는 상대 (골문에서 48 m — 위험 지역 밖) · 수비수와 10.3 m
      put(st, 15, dir * -4, 6.5, dir * -3, 0)
      const d = st.players[3] // RCB
      put(st, 3, dir * -12, 0)
      updateAnchors(st)
      aiDecide(st, d)
      return d.markOf
    }
    expect(run(4)).toBe(15)
    expect(run(0)).toBe(-1)
  })

  it('빌드업 — 짧게(0)는 덜 열린 동료에게 발밑 패스, 길게(4)는 펀트', () => {
    const run = (buildup: number): { passTo: number; vz: number } => {
      const st = playState()
      const dir = st.teams[0].dir
      st.teams[0].sliders.buildup = buildup
      const gk = st.players[0]
      put(st, 0, dir * -50, 0)
      st.ball.owner = 0
      st.ball.x = gk.x
      st.ball.y = gk.y
      st.ball.z = 0
      gk.holdT = 0
      // 다른 홈 선수는 중앙선(50 m) — 배급 후보 밖. 받을 동료 14 m · 상대가 7 m 곁에 (패스 길 밖)
      for (const p of st.players) if (p.team === 0 && p.idx !== 0 && p.idx !== 2) p.x = 0
      put(st, 2, dir * -38, 8)
      put(st, 16, dir * -38, 15)
      gkDistribute(st, gk)
      return { passTo: st.ball.passTo, vz: st.ball.vz }
    }
    const short = run(0)
    expect(short.passTo).toBe(2)
    expect(short.vz).toBeLessThan(3)
    const long = run(4)
    expect(long.passTo).not.toBe(2)
    expect(long.vz).toBeGreaterThan(5)
  })
})

describe('스쿼드 코드 v2 · 검증 · 정규화', () => {
  it('386 비트 · 역할과 슬라이더 7종이 그대로 왕복한다 (300건)', () => {
    expect(CODE_BITS).toBe(386)
    const r = makeRng(99)
    const base = starterSquad('4-2-3-1')
    for (let t = 0; t < 300; t++) {
      const s: Squad = JSON.parse(JSON.stringify(base)) as Squad
      for (const p of s.presets) for (const k of SLIDER_KEYS) p[k] = Math.floor(rand(r) * 5)
      s.roles = new Array(START_SIZE).fill(0).map((_, i) => (i === 0 ? 0 : Math.floor(rand(r) * 4)))
      const back = decodeSquad(encodeSquad(s))
      expect(back.ok).toBe(true)
      if (!back.ok) return
      expect(back.squad.presets).toEqual(s.presets)
      expect(back.squad.roles).toEqual(s.roles)
    }
  })

  it('옛 규격(v1) 코드는 "규격이 다릅니다"로 거부한다', () => {
    const code = encodeSquad(starterSquad('4-3-3'))
    // 앞 6비트(버전)를 1 로 — Base64url 첫 글자 두 개를 다시 쓴다
    const body = code.slice('KLO26-'.length).replace(/-/g, '+').replace(/_/g, '/')
    const raw = Uint8Array.from(atob(body + '='.repeat((4 - (body.length % 4)) % 4)), (c) => c.charCodeAt(0))
    raw[0] = (raw[0] & 0x03) | (1 << 2)
    let s = ''
    for (const b of raw) s += String.fromCharCode(b)
    const v1 = 'KLO26-' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const res = decodeSquad(v1)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('version')
  })

  it('역할이 0~3 밖이면 거절, 슬라이더 4종만 있는 옛 저장본은 정규화로 채워진다', () => {
    const s = starterSquad('4-3-3')
    s.roles = new Array(START_SIZE).fill(0)
    s.roles[3] = 5
    expect(checkSquad(s, CAP).ok).toBe(false)
    const old = JSON.parse(JSON.stringify(starterSquad('4-4-2'))) as Squad
    for (const p of old.presets) {
      delete (p as Partial<typeof p>).tempo
      delete (p as Partial<typeof p>).buildup
      delete (p as Partial<typeof p>).defStyle
    }
    delete old.roles
    expect(checkSquad(old, CAP).ok).toBe(true)
    const n = normalizeSquad(old)
    expect(n.presets[1].tempo).toBe(2)
    expect(n.roles).toHaveLength(START_SIZE)
    expect(n.roles!.every((r) => r === 0)).toBe(true)
    const cfg = toSquadConfig(n, '팀', '팀')
    expect(cfg.roles).toHaveLength(START_SIZE)
    expect(cfg.presets[0].defStyle).toBeDefined()
  })
})

describe('결정론', () => {
  function run(homeRoles: number[] | undefined, preset: number, secs = 40): number {
    const st = createState({ seed: 31, halfSec: 180, squads: squads(homeRoles, preset) })
    const n = secs * 60
    for (let i = 0; i < n; i++) step(st, idle)
    return hashState(st)
  }

  it('같은 전술은 같은 해시, 역할·프리셋이 다르면 해시가 다르다 (전술이 sim 에 닿는다)', () => {
    const roles = [0, 1, 1, 1, 1, 1, 2, 3, 1, 2, 3]
    expect(run(roles, 2)).toBe(run(roles, 2))
    expect(run(roles, 2)).not.toBe(run(undefined, 2))
    expect(run(undefined, 0)).not.toBe(run(undefined, 2))
    void HALF_L
  })
})
