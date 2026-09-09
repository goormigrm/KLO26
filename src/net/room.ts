// Trystero 기반 방 목록·방 만들기·참가 (DESIGN 6). 서버 없이 공개 Nostr 릴레이로 시그널링한다.
// bedorage-duck `src/net/room.ts` 를 **정원 2·난입 없음**으로 줄여 옮겼다.
//
// - 로비 방('lobby'): 접속한 모두가 모인다. 방장이 방 정보를 2초마다 방송하고 나머지는 목록으로 본다.
// - 경기 방(code): 방장 + 게스트 하나. 방 상태의 정본은 방장이 보내는 'room' 메시지다.
// 게임 로직은 모른다 — 메시지와 피어 이벤트만 다룬다.

import { joinRoom, selfId, type Room } from 'trystero'

/**
 * 프로토콜이 바뀌면 올린다. 개발 서버와 배포본이 같은 릴레이·같은 APP_ID 면 방 목록이 섞이므로
 * 개발 중에는 `-dev` 를 붙인다 (HANDOVER 교훈 9).
 */
export const APP_ID = `klo26-v1${import.meta.env?.DEV ? '-dev' : ''}`
const LOBBY_ID = 'lobby'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** TURN 은 쓰지 않는다 — 카드 등록이 필요한 서비스는 무료 티어라도 배제 (DESIGN 10.1) */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

export const ROOM_MAX = 2

export function makeRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return s
}

// ---------------------------------------------------------------- 로비

/** 목록에 보이는 것 (DESIGN 6.2) */
export interface RoomInfo {
  code: string
  hostName: string
  /** 전후반 실시간 초 */
  halfSec: number
  offside: boolean
  count: number
  max: number
  state: 'open' | 'full' | 'playing' | 'closed'
  seenAt: number
  peerId: string
}

export type RoomAnnounce = Omit<RoomInfo, 'seenAt' | 'peerId'>

export interface LobbyLink {
  onRooms(cb: (rooms: RoomInfo[]) => void): void
  announce(info: RoomAnnounce | null): void
  onlineCount(): number
  leave(): void
}

/**
 * 공용 로비 통로는 **페이지가 사는 동안 하나만** 연다 (bedorage-duck 2026-09-06 교훈:
 * 세션이 끝날 때 닫고 다시 열면 Trystero 가 캐시한 방 때문에 늦게 도는 leave 가 새 통로까지 죽인다).
 */
export function openLobby(): LobbyLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, LOBBY_ID)
  const [sendRoom, onRoom] = room.makeAction('room') as unknown as [
    (m: RoomAnnounce | null) => Promise<unknown>,
    (cb: (m: RoomAnnounce | null, from: string) => void) => void,
  ]
  const rooms = new Map<string, RoomInfo>()
  let mine: RoomAnnounce | null = null
  let cb: ((rooms: RoomInfo[]) => void) | null = null
  let peers = 0

  const emit = (): void => {
    const now = performance.now()
    for (const [k, r] of rooms) if (now - r.seenAt > 7000 || r.state === 'closed') rooms.delete(k)
    cb?.([...rooms.values()].sort((a, b) => a.code.localeCompare(b.code)))
  }
  onRoom((info, peerId) => {
    if (!info) rooms.delete(peerId)
    else rooms.set(peerId, { ...info, seenAt: performance.now(), peerId })
    emit()
  })
  room.onPeerJoin(() => {
    peers++
    if (mine) void sendRoom(mine)
  })
  room.onPeerLeave((id) => {
    peers = Math.max(0, peers - 1)
    rooms.delete(id)
    emit()
  })
  const timer = setInterval(() => {
    if (mine) void sendRoom(mine)
    emit()
  }, 2000)

  return {
    onRooms(f) {
      cb = f
      emit()
    },
    announce(info) {
      mine = info
      void sendRoom(info)
    },
    onlineCount() {
      return peers + 1
    },
    leave() {
      clearInterval(timer)
      if (mine) void sendRoom(null)
      setTimeout(() => void room.leave(), 200)
    },
  }
}

// ---------------------------------------------------------------- 경기 방

/** Trystero 는 JSON 으로만 보낸다 — 인덱스 시그니처가 있어야 타입이 맞는다 */
export interface Member {
  [k: string]: string | boolean
  id: string
  name: string
  ready: boolean
  /** 스쿼드 코드 — 받는 쪽이 검사한다 (DESIGN 5.8) */
  squadCode: string
}

export type CtlMessage =
  /** 내 상태 (닉네임·준비·스쿼드 코드). 모두에게 */
  | { t: 'hello'; name: string; ready: boolean; squadCode: string }
  /** 방장 → 모두: 방 상태 정본 */
  | { t: 'room'; members: Member[]; halfSec: number; offside: boolean }
  /** 방장 → 정원 초과로 들어온 피어 */
  | { t: 'full' }
  /** 방장 → 게스트: 시작 */
  | { t: 'start'; seed: number; delay: number; halfSec: number; offside: boolean; members: Member[] }
  | { t: 'ping'; s: number }
  | { t: 'pong'; s: number }
  /** 게스트 → 방장: 60틱마다 상태 해시 */
  | { t: 'hash'; tick: number; h: number }
  /** 방장 → 게스트: 어긋났다, 이 상태로 되돌려라 (판 전체 JSON) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { t: 'resync'; tick: number; state: any }
  /** 상대가 나갔다 */
  | { t: 'leave' }
  /** 한 판 더 */
  | { t: 'rematch'; seed: number }

export interface RoomLink {
  code: string
  role: 'host' | 'guest'
  selfId: string
  peers: Set<string>
  rtts: Map<string, number>
  readonly rtt: number
  sendCtl(m: CtlMessage, to?: string): void
  sendInput(buf: Uint8Array, to?: string): void
  onCtl(cb: (m: CtlMessage, from: string) => void): void
  onInput(cb: (buf: Uint8Array, from: string) => void): void
  onPeerJoin(cb: (id: string) => void): void
  onPeerLeave(cb: (id: string) => void): void
  leave(): void
}

const leftRooms = new WeakSet<Room>()

export function openRoom(code: string, role: 'host' | 'guest'): RoomLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, `room-${code}`)
  if (leftRooms.has(room)) leftRooms.delete(room)
  // Trystero 의 DataPayload 제약을 우회한다 — 우리 메시지는 전부 JSON 으로 안전하다
  const [sendCtlRaw, onCtlRaw] = room.makeAction('ctl') as unknown as [
    (m: CtlMessage, to?: string) => Promise<unknown>,
    (cb: (m: CtlMessage, from: string) => void) => void,
  ]
  const [sendInRaw, onInRaw] = room.makeAction<Uint8Array>('in')
  const peers = new Set<string>()
  const rtts = new Map<string, number>()
  // Trystero 는 훅마다 리스너를 하나만 갖는다 — 여기서 한 번만 등록하고 나눠 준다
  const joinCbs: ((id: string) => void)[] = []
  const leaveCbs: ((id: string) => void)[] = []
  const ctlCbs: ((m: CtlMessage, from: string) => void)[] = []
  const inCbs: ((buf: Uint8Array, from: string) => void)[] = []

  const link: RoomLink = {
    code,
    role,
    selfId,
    peers,
    rtts,
    get rtt() {
      let m = 0
      for (const v of rtts.values()) m = Math.max(m, v)
      return m
    },
    sendCtl(m, to) {
      if (to !== undefined) {
        if (peers.has(to)) void sendCtlRaw(m, to)
      } else if (peers.size > 0) void sendCtlRaw(m)
    },
    sendInput(buf, to) {
      if (to !== undefined) {
        if (peers.has(to)) void sendInRaw(buf, to)
      } else if (peers.size > 0) void sendInRaw(buf)
    },
    onCtl(cb) {
      ctlCbs.push(cb)
    },
    onInput(cb) {
      inCbs.push(cb)
    },
    onPeerJoin(cb) {
      joinCbs.push(cb)
    },
    onPeerLeave(cb) {
      leaveCbs.push(cb)
    },
    leave() {
      clearInterval(pingTimer)
      joinCbs.length = 0
      leaveCbs.length = 0
      ctlCbs.length = 0
      inCbs.length = 0
      leftRooms.add(room)
      const conns = Object.values(room.getPeers())
      ;(room.leave() as Promise<void>).catch(() => {})
      // 나가기 메시지가 나갈 짬을 주고 연결을 **직접** 끊는다 (bedorage-duck 2026-09-06 교훈)
      setTimeout(() => {
        for (const pc of conns) {
          try {
            if (pc.connectionState !== 'closed') pc.close()
          } catch {
            // 이미 닫혔다
          }
        }
      }, 500)
    },
  }

  // Trystero 가 캐시한 방이면 이미 붙어 있는 피어를 "방금 들어온 것"으로 알려 준다
  setTimeout(() => {
    for (const [id, pc] of Object.entries(room.getPeers())) {
      if (peers.has(id) || pc.connectionState !== 'connected') continue
      peers.add(id)
      for (const cb of [...joinCbs]) cb(id)
    }
  }, 0)
  room.onPeerJoin((id) => {
    peers.add(id)
    for (const cb of [...joinCbs]) cb(id)
  })
  room.onPeerLeave((id) => {
    peers.delete(id)
    rtts.delete(id)
    for (const cb of [...leaveCbs]) cb(id)
  })
  onCtlRaw((m, from) => {
    if (m.t === 'ping') {
      link.sendCtl({ t: 'pong', s: m.s }, from)
      return
    }
    if (m.t === 'pong') {
      rtts.set(from, Math.round(performance.now() - m.s))
      return
    }
    for (const cb of [...ctlCbs]) cb(m, from)
  })
  onInRaw((buf, from) => {
    for (const cb of [...inCbs]) cb(buf as Uint8Array, from)
  })
  const pingTimer = setInterval(() => {
    if (peers.size === 0) return
    link.sendCtl({ t: 'ping', s: performance.now() })
  }, 1000)
  return link
}

/**
 * 경기 시드 — `FNV-1a(스쿼드코드A | 스쿼드코드B | 방코드)`.
 * 누구도 시드를 고를 수 없다 (DESIGN 4.11 · KMD26 원칙).
 */
export function matchSeed(codeA: string, codeB: string, room: string): number {
  const s = `${codeA}|${codeB}|${room}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (s.charCodeAt(i) >> 8) & 0xff
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** RTT 로 락스텝 지연 틱을 정한다 — 편도의 1.5배 + 2틱, 2~10틱 (DESIGN 6.4) */
export function delayForRtt(rtt: number): number {
  const oneWayTicks = (rtt / 2 / 1000) * 60
  return Math.max(2, Math.min(10, Math.ceil(oneWayTicks * 1.5) + 2))
}
