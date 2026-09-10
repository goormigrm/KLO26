// 스크린샷·GIF 를 **개발 서버**로 보내 `docs/img/` 에 저장한다 (공지글 첨부용 · 2026-09-11).
//
// 배포 번들에는 들어가지 않는다 — `import.meta.env.DEV` 안에서 동적 import 로만 불린다.
// 브라우저에서 파일을 내려받는 대신 Vite 개발 서버의 `/__snap` 로 POST 한다 (`vite.config.ts` 플러그인).
// 그림 파일은 저장소에 넣지 않는다 (`.gitignore` 의 `docs/img/`) — 게시판에 올릴 때만 쓴다.

/** 개발 서버로 보낸다. `name` 은 `docs/img/` 아래 파일 이름 */
export async function postSnap(name: string, bytes: Uint8Array | string): Promise<string> {
  const body = typeof bytes === 'string' ? bytes : new Blob([bytes as BlobPart])
  const res = await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: 'POST', body })
  return res.text()
}

/** data:image/png;base64,… → 바이트 */
export function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * 화면 전체(DOM + WebGL 캔버스)를 PNG 로. 로비·스쿼드 화면처럼 캔버스가 아닌 화면도 찍는다.
 *
 * 방법 — 같은 출처 스타일시트를 전부 <style> 로 넣고, 캔버스는 그 순간의 그림(data URL)으로 바꾼 뒤
 * SVG <foreignObject> 에 담아 <img> 로 그린다. 외부 출처(글꼴 CDN 등)는 캔버스를 더럽혀 toDataURL 이
 * 막히므로 **빼고** 그린다 — 글꼴은 시스템 글꼴로 떨어진다.
 */
export async function snapDom(scale = 1): Promise<string> {
  const w = window.innerWidth
  const h = window.innerHeight
  let css = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(sheet.cssRules)) {
        const t = r.cssText
        if (t.startsWith('@import') || t.startsWith('@font-face')) continue
        css += t + '\n'
      }
    } catch {
      // 다른 출처 시트 — 건너뛴다
    }
  }
  const clone = document.body.cloneNode(true) as HTMLElement
  // 캔버스는 복제되면 비어 있다 — 지금 그림으로 바꿔 넣는다
  const live = Array.from(document.querySelectorAll('canvas'))
  const copies = Array.from(clone.querySelectorAll('canvas'))
  for (let i = 0; i < copies.length && i < live.length; i++) {
    const src = live[i]
    const img = document.createElement('img')
    try {
      img.src = src.toDataURL('image/png')
    } catch {
      continue
    }
    const r = src.getBoundingClientRect()
    img.style.cssText = src.style.cssText
    img.setAttribute('class', src.getAttribute('class') ?? '')
    img.style.width = `${r.width}px`
    img.style.height = `${r.height}px`
    copies[i].replaceWith(img)
  }
  // 외부 그림은 뺀다 (더럽힘 방지)
  for (const im of Array.from(clone.querySelectorAll('img'))) {
    if (!im.src.startsWith('data:')) im.remove()
  }
  const xhtml = new XMLSerializer().serializeToString(clone)
  const bg = getComputedStyle(document.body).backgroundColor || '#0d1117'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:${bg};overflow:hidden">` +
    `<style>${css}</style>${xhtml}</div></foreignObject></svg>`
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((ok, no) => {
    img.onload = () => ok()
    img.onerror = () => no(new Error('svg 그리기 실패'))
    img.src = url
  })
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round(h * scale)
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------- GIF (GIF89a · 전역 팔레트 · LZW)

/** RGB → 6×7×6 단계 균등 팔레트 인덱스 (252색). 게임 화면은 평면색이 많아 이 정도로 충분하다 */
function quant(r: number, g: number, b: number): number {
  const ri = Math.min(5, (r * 6) >> 8)
  const gi = Math.min(6, (g * 7) >> 8)
  const bi = Math.min(5, (b * 6) >> 8)
  return ri * 42 + gi * 6 + bi
}

function palette(): Uint8Array {
  const p = new Uint8Array(256 * 3)
  let k = 0
  for (let ri = 0; ri < 6; ri++)
    for (let gi = 0; gi < 7; gi++)
      for (let bi = 0; bi < 6; bi++) {
        p[k++] = Math.round((ri * 255) / 5)
        p[k++] = Math.round((gi * 255) / 6)
        p[k++] = Math.round((bi * 255) / 5)
      }
  return p
}

/** LZW 압축 — GIF 규격 그대로 (최소 코드 8비트) */
function lzw(indices: Uint8Array): Uint8Array {
  const MIN = 8
  const CLEAR = 1 << MIN
  const EOI = CLEAR + 1
  const out: number[] = []
  let cur = 0
  let curBits = 0
  const emit = (code: number, bits: number): void => {
    cur |= code << curBits
    curBits += bits
    while (curBits >= 8) {
      out.push(cur & 0xff)
      cur >>= 8
      curBits -= 8
    }
  }
  let dict = new Map<number, number>()
  let next = EOI + 1
  let bits = MIN + 1
  emit(CLEAR, bits)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]
    const key = (prefix << 8) | c
    const hit = dict.get(key)
    if (hit !== undefined) {
      prefix = hit
      continue
    }
    emit(prefix, bits)
    if (next < 4096) {
      dict.set(key, next++)
      if (next > 1 << bits && bits < 12) bits++
    } else {
      emit(CLEAR, bits)
      dict = new Map()
      next = EOI + 1
      bits = MIN + 1
    }
    prefix = c
  }
  emit(prefix, bits)
  emit(EOI, bits)
  if (curBits > 0) out.push(cur & 0xff)
  return Uint8Array.from(out)
}

/** 프레임(RGBA · 같은 크기)들을 GIF 바이트로. `delayCs` 는 프레임 간격(1/100 초) */
export function encodeGif(frames: Uint8ClampedArray[], w: number, h: number, delayCs: number): Uint8Array {
  const parts: number[] = []
  const push = (...b: number[]): void => {
    for (const x of b) parts.push(x & 0xff)
  }
  const u16 = (v: number): void => push(v & 0xff, (v >> 8) & 0xff)
  // 헤더 · 논리 화면
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  u16(w)
  u16(h)
  push(0xf7, 0, 0) // 전역 팔레트 256색 8비트
  const pal = palette()
  for (const v of pal) push(v)
  // 무한 반복
  push(0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0, 0, 0)
  const idx = new Uint8Array(w * h)
  for (const f of frames) {
    for (let i = 0, j = 0; i < idx.length; i++, j += 4) idx[i] = quant(f[j], f[j + 1], f[j + 2])
    // 그래픽 제어 (지연)
    push(0x21, 0xf9, 0x04, 0x00)
    u16(delayCs)
    push(0, 0)
    // 이미지
    push(0x2c)
    u16(0)
    u16(0)
    u16(w)
    u16(h)
    push(0)
    push(8)
    const data = lzw(idx)
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i)
      push(n)
      for (let k = 0; k < n; k++) parts.push(data[i + k])
    }
    push(0)
  }
  push(0x3b)
  return Uint8Array.from(parts)
}

/** 캔버스를 줄여 RGBA 로 뽑는다 (GIF 프레임용) */
export function frameOf(src: HTMLCanvasElement, w: number, h: number): Uint8ClampedArray {
  const c = frameOf.tmp ?? (frameOf.tmp = document.createElement('canvas'))
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, w, h)
  return g.getImageData(0, 0, w, h).data
}
frameOf.tmp = null as HTMLCanvasElement | null

/** PNG data URL 을 w×h 로 줄여 RGBA 프레임으로 (DOM 이 섞인 화면의 GIF 용) */
export async function frameFromDataUrl(url: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const img = new Image()
  await new Promise<void>((ok, no) => {
    img.onload = () => ok()
    img.onerror = () => no(new Error('png 읽기 실패'))
    img.src = url
  })
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, w, h)
  return g.getImageData(0, 0, w, h).data
}
