// 2026-09-16 (G-62) 방 흐름 — "방을 열어 두고 로비에 남는다 · 스쿼드는 준비를 눌러야 확정" 을 지킨다.
//
// 그 작업은 두 탭으로 손으로만 확인했고 테스트가 없었다(2026-09-23 에 채움). 두 가지를 본다.
//  1. 준비 버튼의 판단 (`cards/confirm.ts toggleReady`) — 스쿼드를 **누르는 순간** 읽는다
//  2. 방장 연결 (`net/hostroom.ts HostRoom`) — 대기실에 넘긴 뒤에는 손대지 않는다.
//     `openRoom` 은 콜백을 배열로 쌓아서, 안 막으면 HostRoom 이 계속 "스쿼드 없음" hello 를 보내
//     대기실이 확정한 스쿼드를 덮어쓴다. G-62 에서 실제로 났던 버그다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CtlMessage, RoomAnnounce } from '../src/net/room'

// ---- 가짜 연결 — Trystero 없이 HostRoom 을 띄운다 ----
const fake = vi.hoisted(() => {
  const s = {
    sent: [] as { m: CtlMessage; to?: string }[],
    join: [] as ((id: string) => void)[],
    leave: [] as ((id: string) => void)[],
    ctl: [] as ((m: CtlMessage, from: string) => void)[],
    left: false,
  }
  const link = {
    code: 'TEST01',
    role: 'host' as const,
    selfId: 'me',
    peers: new Set<string>(),
    rtts: new Map<string, number>(),
    rtt: 0,
    sendCtl(m: CtlMessage, to?: string) {
      s.sent.push({ m, to })
    },
    sendInput() {},
    onCtl(cb: (m: CtlMessage, from: string) => void) {
      s.ctl.push(cb)
    },
    onInput() {},
    onPeerJoin(cb: (id: string) => void) {
      s.join.push(cb)
    },
    onPeerLeave(cb: (id: string) => void) {
      s.leave.push(cb)
    },
    leave() {
      s.left = true
    },
  }
  return { s, link }
})
vi.mock('../src/net/room', () => ({ openRoom: () => fake.link }))

import { HostRoom } from '../src/net/hostroom'
import { NOT_READY, toggleReady } from '../src/cards/confirm'
import { clubSquad, computeCap, type Squad } from '../src/cards/squad'
import { decodeSquad } from '../src/cards/squadcode'
import { CLUBS } from '../src/data/pool'

const CAP = computeCap().cap

// ---------------------------------------------------------------- 1. 준비 = 확정

describe('스쿼드는 준비를 누를 때 확정된다 (toggleReady)', () => {
  const a = clubSquad(CLUBS[0].id)
  const b = clubSquad(CLUBS[5].id)

  it('**누르는 순간**의 스쿼드를 읽는다 — 방을 만든 뒤에 고친 것이 들어간다', () => {
    // 대기실을 연 때는 A 였는데, 나가서 B 로 고치고 와서 준비를 눌렀다
    let saved: Squad = a
    const getSquad = (): Squad => saved
    saved = b
    const next = toggleReady(NOT_READY, getSquad, CAP)
    expect(next.ready).toBe(true)
    expect(next.msg).toBe('')
    const back = decodeSquad(next.squadCode)
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.squad.ids).toEqual(b.ids)
    expect(next.squad?.ids).toEqual(b.ids)
  })

  it('준비 전에는 상대에게 빈 코드가 간다 · 준비를 취소하면 다시 비운다', () => {
    expect(NOT_READY.squadCode).toBe('')
    const on = toggleReady(NOT_READY, () => a, CAP)
    expect(on.squadCode).not.toBe('')
    const off = toggleReady(on, () => a, CAP)
    expect(off.ready).toBe(false)
    expect(off.squadCode).toBe('')
    expect(off.squad).toBeNull()
  })

  it('규칙을 어긴 스쿼드로는 준비가 안 된다 — 까닭을 돌려주고 상태는 그대로', () => {
    const broken: Squad = { ...a, ids: a.ids.slice(0, 10), enh: a.enh.slice(0, 10) }
    const next = toggleReady(NOT_READY, () => broken, CAP)
    expect(next.ready).toBe(false)
    expect(next.squadCode).toBe('')
    expect(next.msg).toMatch(/규칙/)
  })
})

// ---------------------------------------------------------------- 2. 방장 연결

describe('방을 열어 두고 로비에 남는다 (HostRoom)', () => {
  let announced: (RoomAnnounce | null)[]
  let guests: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    fake.s.sent.length = 0
    fake.s.join.length = 0
    fake.s.leave.length = 0
    fake.s.ctl.length = 0
    fake.s.left = false
    announced = []
    guests = []
  })

  // 앞 테스트의 close() 가 걸어 둔 leave 타이머(120 ms)가 다음 테스트의 advanceTimersByTime 에서 터지지 않게
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const open = (): HostRoom =>
    new HostRoom({
      code: 'TEST01',
      name: '방장',
      halfSec: 180,
      announce: (i) => announced.push(i),
      onGuest: (n) => guests.push(n),
    })
  const join = (id: string): void => fake.s.join.forEach((f) => f(id))
  const hello = (from: string, name: string, squadCode = ''): void =>
    fake.s.ctl.forEach((f) => f({ t: 'hello', name, ready: false, squadCode }, from))
  const hellos = (): { m: CtlMessage; to?: string }[] => fake.s.sent.filter((x) => x.m.t === 'hello')

  it('만들자마자 로비 목록에 1/2 로 알린다', () => {
    const r = open()
    expect(announced.at(-1)).toMatchObject({ code: 'TEST01', hostName: '방장', count: 1, state: 'open' })
    r.close()
  })

  it('상대가 들어오면 이름만 알리고 스쿼드 코드는 비운다 · 알림은 한 번', () => {
    const r = open()
    join('guest')
    hello('guest', '게스트')
    hello('guest', '게스트') // 같은 사람이 다시 인사해도 알림이 또 뜨면 안 된다
    expect(guests).toEqual(['게스트'])
    expect(r.guestName).toBe('게스트')
    for (const x of hellos()) {
      expect(x.m).toMatchObject({ name: '방장', ready: false, squadCode: '' })
    }
    expect(announced.at(-1)).toMatchObject({ count: 2, state: 'full' })
    r.close()
  })

  it('대기실에 넘긴 뒤에는 hello 에 답하지 않는다 — 확정한 스쿼드를 빈 코드로 덮어쓰지 않게', () => {
    const r = open()
    join('guest')
    hello('guest', '게스트')
    const link = r.handOver()
    expect(link).toBe(fake.link)
    const before = hellos().length
    const annBefore = announced.length
    // 대기실이 연결을 이어받은 뒤 상대가 준비를 눌러 hello 가 다시 온다
    hello('guest', '게스트', 'SOMECODE')
    join('guest')
    vi.advanceTimersByTime(5000)
    expect(hellos().length).toBe(before)
    expect(announced.length).toBe(annBefore)
    expect(guests).toEqual(['게스트'])
    // 넘긴 연결은 끊지 않는다 — 대기실이 쓴다
    expect(fake.s.left).toBe(false)
  })

  it('정원 2 — 세 번째 사람은 full 로 돌려보낸다', () => {
    const r = open()
    join('guest')
    join('third')
    expect(fake.s.sent.some((x) => x.m.t === 'full' && x.to === 'third')).toBe(true)
    expect(r.guestId).toBe('guest')
    r.close()
  })

  it('방을 닫으면 목록에서 지우고 연결을 끊는다', () => {
    const r = open()
    r.close()
    expect(announced.at(-1)).toBeNull()
    expect(fake.s.sent.some((x) => x.m.t === 'leave')).toBe(true)
    vi.advanceTimersByTime(200)
    expect(fake.s.left).toBe(true)
  })
})
