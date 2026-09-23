// 방을 만들어 두고 **로비에 남아 있는 동안**의 연결 (2026-09-16, 사용자 요청).
//
// 예전에는 `방 만들기` 를 누르는 순간 대기실로 들어갔다. 그래서 다른 방이 있는지 볼 수도, 스쿼드를 더 고칠 수도 없었고
// 스쿼드가 그 순간 확정됐다. 이제 방만 열어 놓고 로비에 남는다:
//   · 내가 만든 방이 방 목록 아래에 보인다
//   · 스쿼드 수정에 들어갔다 나올 수 있다
//   · 상대가 들어오면 알림이 떠서 "들어가기 / 조금 더 준비하기" 를 고른다
//   · 스쿼드는 **대기실에서 준비를 누를 때** 확정된다 (`waitroom.ts`)
//
// 여기서는 경기 로직을 돌리지 않는다 — 방을 열어 두고, 들어온 사람에게 내 이름만 알려 주고, 로비 목록에 알린다.

import { openRoom, type CtlMessage, type RoomAnnounce, type RoomLink } from './room'

export interface HostRoomOptions {
  code: string
  /** 내 닉네임 — 들어온 사람이 대기실에서 볼 이름 */
  name: string
  halfSec: number
  /** 로비 목록에 알린다 (없으면 알리지 않는다) */
  announce?: (info: RoomAnnounce | null) => void
  /** 누가 들어왔다 */
  onGuest?: (name: string) => void
  /** 들어왔던 사람이 나갔다 */
  onGuestLeave?: () => void
}

export class HostRoom {
  readonly link: RoomLink
  readonly code: string
  /** 들어온 상대 — 없으면 빈 문자열 */
  guestId = ''
  guestName = ''
  private timer: number
  private closed = false

  constructor(private opts: HostRoomOptions) {
    this.code = opts.code
    this.link = openRoom(opts.code, 'host')
    this.link.onPeerJoin((id) => {
      // 대기실에 넘긴 뒤에는 손대지 않는다 — 연결의 콜백은 쌓이므로 (openRoom 이 배열로 들고 있다)
      // 여기가 계속 hello(스쿼드 없음)를 보내면 대기실이 확정한 스쿼드를 덮어 쓴다
      if (this.closed) return
      // 정원 2 — 이미 한 명이 있으면 돌려보낸다 (대기실과 같은 규칙)
      if (this.guestId && this.guestId !== id) {
        this.link.sendCtl({ t: 'full' }, id)
        return
      }
      this.guestId = id
      this.sayHello(id)
      this.publish()
    })
    this.link.onPeerLeave((id) => {
      if (this.closed || id !== this.guestId) return
      this.guestId = ''
      this.guestName = ''
      this.publish()
      this.opts.onGuestLeave?.()
    })
    this.link.onCtl((m, from) => this.onCtl(m, from))
    // `window.` 을 붙이지 않는다 — 테스트(Node)에서도 돈다
    this.timer = setInterval(() => this.publish(), 2000) as unknown as number
    this.publish()
  }

  /**
   * 들어온 사람에게 내 이름만 알린다. **스쿼드 코드는 빈 문자열** — 아직 확정하지 않았다는 뜻이고,
   * 대기실이 그것을 "스쿼드 확정 전" 으로 보여 준다.
   */
  private sayHello(to: string): void {
    this.link.sendCtl({ t: 'hello', name: this.opts.name, ready: false, squadCode: '' }, to)
  }

  private onCtl(m: CtlMessage, from: string): void {
    if (this.closed || m.t !== 'hello') return
    if (this.guestId && this.guestId !== from) return
    const fresh = this.guestId !== from || !this.guestName
    this.guestId = from
    this.guestName = m.name
    this.sayHello(from)
    this.publish()
    if (fresh) this.opts.onGuest?.(m.name)
  }

  /** 로비 목록에 지금 상태를 알린다 */
  private publish(): void {
    if (this.closed) return
    this.opts.announce?.({
      code: this.code,
      hostName: this.opts.name,
      halfSec: this.opts.halfSec,
      offside: true,
      count: this.guestId ? 2 : 1,
      max: 2,
      state: this.guestId ? 'full' : 'open',
    })
  }

  /** 대기실로 넘길 때 — 타이머만 멈추고 **연결은 살려 둔다** (대기실이 그대로 이어받는다) */
  handOver(): RoomLink {
    clearInterval(this.timer)
    this.closed = true
    return this.link
  }

  /** 방을 닫는다 — 목록에서 지우고 연결을 끊는다 */
  close(): void {
    if (this.closed) {
      clearInterval(this.timer)
      return
    }
    this.closed = true
    clearInterval(this.timer)
    this.opts.announce?.(null)
    this.link.sendCtl({ t: 'leave' })
    setTimeout(() => this.link.leave(), 120)
  }
}
