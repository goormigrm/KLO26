// 2인 결정론 락스텝 (DESIGN 6.4). bedorage-duck `src/net/lockstep.ts` 를 정원 2로 줄여 옮겼다.
//
// 매 틱 내 입력을 미래 틱(t + delay)에 넣고 상대에게 보낸다. 최근 8틱을 한 패킷에 겹쳐 보내
// 패킷 손실을 흡수한다. 상대 입력이 없는 틱은 **진행하지 않는다**(스톨) — 그래야 두 브라우저가 같은 경기를 본다.
// 축구는 한쪽이 비면 성립하지 않으므로 난입·재접속은 없다 (DESIGN 6.6).

import { EMPTY_INPUT, INPUT_BYTES, cloneInput, readInput, writeInput, type Input } from '../core/input'
import type { RoomLink } from './room'

const REDUNDANCY = 8
/** 내 입력은 이만큼 남겨 둔다 — 늦게 붙은 상대에게 몰아 보내기 위해 */
const KEEP_MINE = 900

export class Lockstep {
  private inputs: [Map<number, Input>, Map<number, Input>] = [new Map(), new Map()]
  private droppedOther = false
  private latestLocal = -1
  latestRemoteTick = -1
  /** 상대에게서 패킷을 하나라도 받았나 */
  heard = false

  constructor(
    private link: RoomLink,
    readonly delay: number,
    /** 내 자리 (0 = 방장·홈, 1 = 게스트·원정) */
    private me: 0 | 1,
    private peerId: string,
  ) {
    for (let i = 0; i < 2; i++) for (let t = 0; t < delay; t++) this.inputs[i].set(t, cloneInput(EMPTY_INPUT))
    link.onInput((buf, from) => {
      if (from !== this.peerId) return
      this.receive(buf)
    })
  }

  /** 틱 t 에서 뽑은 입력을 t+delay 에 배정하고 보낸다 */
  pushLocal(t: number, input: Input): void {
    const target = t + this.delay
    const mine = this.inputs[this.me]
    if (!mine.has(target)) mine.set(target, cloneInput(input))
    this.latestLocal = Math.max(this.latestLocal, target)
    this.link.sendInput(this.pack(target, Math.min(REDUNDANCY, target + 1)))
  }

  /** latest 부터 거슬러 count 틱을 한 패킷으로 — [latest u32][count u8][입력…] */
  private pack(latest: number, count: number): Uint8Array {
    const src = this.inputs[this.me]
    const buf = new ArrayBuffer(5 + count * INPUT_BYTES)
    const v = new DataView(buf)
    v.setUint32(0, latest)
    v.setUint8(4, count)
    for (let i = 0; i < count; i++) writeInput(v, 5 + i * INPUT_BYTES, src.get(latest - i) ?? EMPTY_INPUT)
    return new Uint8Array(buf)
  }

  /** 늦게 붙은 상대에게 지난 입력을 몰아 보낸다 (메시가 늦게 완성되면 그 사이 틱이 영영 빈다) */
  resendTo(peerId: string): void {
    if (this.latestLocal < 0) return
    const from = Math.max(0, this.latestLocal - KEEP_MINE + 1)
    let hi = this.latestLocal
    while (hi >= from) {
      const count = Math.min(255, hi - from + 1)
      this.link.sendInput(this.pack(hi, count), peerId)
      hi -= count
    }
  }

  private receive(raw: Uint8Array | ArrayBuffer): void {
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    if (buf.byteLength < 5) return
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const latest = v.getUint32(0)
    const count = v.getUint8(4)
    if (5 + count * INPUT_BYTES > buf.byteLength) return
    this.heard = true
    const m = this.inputs[1 - this.me]
    for (let i = 0; i < count; i++) {
      const t = latest - i
      if (t < 0 || m.has(t)) continue
      m.set(t, readInput(v, 5 + i * INPUT_BYTES))
    }
    if (latest > this.latestRemoteTick) this.latestRemoteTick = latest
  }

  /** 둘 다 입력이 있는가 */
  hasAll(t: number): boolean {
    if (!this.inputs[this.me].has(t)) return false
    if (this.droppedOther) return true
    return this.inputs[1 - this.me].has(t)
  }

  /** 틱 t 의 입력 — [홈, 원정] 순서 */
  get(t: number): [Input, Input] {
    const a = this.inputs[0].get(t) ?? EMPTY_INPUT
    const b = this.inputs[1].get(t) ?? EMPTY_INPUT
    return [this.droppedOther && this.me !== 0 ? EMPTY_INPUT : a, this.droppedOther && this.me !== 1 ? EMPTY_INPUT : b]
  }

  /** 상대가 나갔다 — 더 기다리지 않는다 */
  dropOther(): void {
    this.droppedOther = true
  }

  get otherDropped(): boolean {
    return this.droppedOther
  }

  /** 오래된 입력 정리 */
  prune(currentTick: number): void {
    for (let i = 0; i < 2; i++) {
      const cut = currentTick - (i === this.me ? KEEP_MINE : 600)
      if (cut <= 0) continue
      const m = this.inputs[i]
      for (const k of m.keys()) if (k < cut) m.delete(k)
    }
  }

  /** 리싱크로 되돌린 뒤, 그 틱 이전 입력은 필요 없다 */
  dropBefore(tick: number): void {
    for (const m of this.inputs) for (const k of m.keys()) if (k < tick) m.delete(k)
  }
}
