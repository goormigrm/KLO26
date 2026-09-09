// 스쿼드 코드 — 공유·검증 규격 (DESIGN 5.9). `KLO26-<Base64url>`.
//
// 비트 배치 (KMD26 대전 코드와 같은 방식):
//   버전 6 · 데이터 해시 16 · 포메이션 4 · 18명 × (id 11 + 강화 3) = 252 ·
//   프리셋 3 × 슬라이더 4 × 3 = 36 · 키커 3 × 5 = 15 · 체크섬 10  → 339비트 = 43바이트
//
// **체크섬이 핵심이다.** 잘린 코드가 조용히 "다른 스쿼드"로 해석되는 것이 최악이다 (KMD26 4-2).

import { FORMATION_LIST } from '../core/formation'
import type { Sliders } from '../core/state'
import { POOL_HASH } from '../data/pool'
import { SQUAD_SIZE, type Squad } from './squad'

export const CODE_VERSION = 1
export const CODE_PREFIX = 'KLO26-'
const TOTAL_BITS = 6 + 16 + 4 + SQUAD_SIZE * 14 + 36 + 15 + 10
const BYTES = Math.ceil(TOTAL_BITS / 8)

class BitWriter {
  private bytes = new Uint8Array(BYTES)
  private pos = 0
  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1
      if (bit) this.bytes[this.pos >> 3] |= 0x80 >> (this.pos & 7)
      this.pos++
    }
  }
  get length(): number {
    return this.pos
  }
  bytesSoFar(): Uint8Array {
    return this.bytes.subarray(0, Math.ceil(this.pos / 8))
  }
  finish(): Uint8Array {
    return this.bytes
  }
}

class BitReader {
  private pos = 0
  constructor(private bytes: Uint8Array) {}
  read(bits: number): number {
    let v = 0
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3] ?? 0
      const bit = (byte >> (7 - (this.pos & 7))) & 1
      v = (v << 1) | bit
      this.pos++
    }
    return v >>> 0
  }
  get at(): number {
    return this.pos
  }
}

/** FNV-1a 10비트 — 체크섬 */
function checksum(bytes: Uint8Array, bitLen: number): number {
  let h = 0x811c9dc5
  const full = bitLen >> 3
  for (let i = 0; i < full; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  const rem = bitLen & 7
  if (rem) {
    h ^= bytes[full] & (0xff << (8 - rem))
    h = Math.imul(h, 0x01000193)
  }
  h ^= bitLen
  h = Math.imul(h, 0x01000193)
  return (h >>> 0) & 0x3ff
}

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array | null {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  try {
    if (typeof atob === 'function') {
      const raw = atob(b64 + pad)
      const out = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
      return out
    }
    return new Uint8Array(Buffer.from(b64 + pad, 'base64'))
  } catch {
    return null
  }
}

const SL: (keyof Sliders)[] = ['line', 'press', 'width', 'mentality']

export function encodeSquad(sq: Squad): string {
  const fi = FORMATION_LIST.indexOf(sq.formation)
  if (fi < 0) throw new Error(`포메이션이 없습니다: ${sq.formation}`)
  const w = new BitWriter()
  w.write(CODE_VERSION, 6)
  w.write(POOL_HASH & 0xffff, 16)
  w.write(fi, 4)
  for (let i = 0; i < SQUAD_SIZE; i++) {
    w.write((sq.ids[i] ?? 0) & 0x7ff, 11)
    w.write(Math.max(0, Math.min(7, sq.enh[i] ?? 0)), 3)
  }
  for (const p of sq.presets) for (const k of SL) w.write(Math.max(0, Math.min(7, p[k])), 3)
  for (const k of sq.kickers) w.write((k < 0 ? 31 : k) & 31, 5)
  const bits = w.length
  const sum = checksum(w.bytesSoFar(), bits)
  w.write(sum, 10)
  return CODE_PREFIX + toBase64Url(w.finish())
}

export type DecodeError =
  | { ok: false; reason: 'format' | 'checksum' | 'version' | 'data' | 'formation'; message: string }

export type DecodeResult = { ok: true; squad: Squad } | DecodeError

export function decodeSquad(text: string): DecodeResult {
  const t = text.trim()
  if (!t.toUpperCase().startsWith(CODE_PREFIX)) {
    return { ok: false, reason: 'format', message: '코드는 KLO26- 으로 시작해야 합니다.' }
  }
  const bytes = fromBase64Url(t.slice(CODE_PREFIX.length))
  if (!bytes || bytes.length < BYTES) {
    return { ok: false, reason: 'format', message: '코드가 잘렸거나 손상되었습니다.' }
  }
  const r = new BitReader(bytes)
  const version = r.read(6)
  if (version !== CODE_VERSION) {
    return { ok: false, reason: 'version', message: `코드 규격이 다릅니다 (v${version} ≠ v${CODE_VERSION}).` }
  }
  const hash = r.read(16)
  const fi = r.read(4)
  const ids: number[] = []
  const enh: number[] = []
  for (let i = 0; i < SQUAD_SIZE; i++) {
    ids.push(r.read(11))
    enh.push(r.read(3))
  }
  const presets = [] as unknown as [Sliders, Sliders, Sliders]
  for (let p = 0; p < 3; p++) {
    const s = {} as Sliders
    for (const k of SL) s[k] = r.read(3)
    presets.push(s)
  }
  const kickers = [0, 0, 0].map(() => {
    const v = r.read(5)
    return v === 31 ? -1 : v
  }) as [number, number, number]
  const bits = r.at
  const want = checksum(bytes, bits)
  const got = r.read(10)
  if (want !== got) {
    return { ok: false, reason: 'checksum', message: '코드가 잘렸거나 손상되었습니다.' }
  }
  if (hash !== (POOL_HASH & 0xffff)) {
    return { ok: false, reason: 'data', message: '선수 데이터 버전이 다릅니다 — 새로고침해 주세요.' }
  }
  const formation = FORMATION_LIST[fi]
  if (!formation) {
    return { ok: false, reason: 'formation', message: '포메이션 값이 잘못되었습니다.' }
  }
  return { ok: true, squad: { name: '받은 스쿼드', formation, ids, enh, presets, kickers } }
}

/** 코드 길이 (문자) — 문서·테스트가 본다 */
export const CODE_BODY_CHARS = Math.ceil((BYTES * 4) / 3)
export const CODE_BITS = TOTAL_BITS
export const CODE_BYTES = BYTES
