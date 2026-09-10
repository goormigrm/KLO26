// 입력 키 표시 — 왼쪽 아래에 **지금 누르는 키**(방향키 제외)와 sim 에 들어간 조합을 띄운다.
//
// 처음엔 테스트 모드 전용이었는데(2026-09-09), "Q+D · A+A 가 실제로 들어가는지 궁금하다"는 요청으로
// 설정에서 켜고 끄는 일반 기능이 됐다 (2026-09-11). 내 화면에만 보이고 상대에겐 안 간다.

import {
  BTN_A, BTN_C, BTN_D, BTN_E, BTN_PACE, BTN_PRESET_NEXT, BTN_PRESET_PREV, BTN_Q, BTN_S, BTN_SPACE, BTN_SUB, BTN_W, BTN_Z,
  type Input,
} from '../core/input'

/** 화면에 그릴 키 — [표시, e.code, 비트(0 = 방향키)] */
const ROWS: [string, string, number][][] = [
  [
    ['Q', 'KeyQ', BTN_Q],
    ['W', 'KeyW', BTN_W],
    ['E', 'KeyE', BTN_E],
    ['[', 'BracketLeft', BTN_PRESET_PREV],
    [']', 'BracketRight', BTN_PRESET_NEXT],
  ],
  [
    ['A', 'KeyA', BTN_A],
    ['S', 'KeyS', BTN_S],
    ['D', 'KeyD', BTN_D],
    ['Z', 'KeyZ', BTN_Z],
    ['C', 'KeyC', BTN_C],
  ],
  [
    ['Shift', 'ShiftLeft', BTN_PACE],
    ['Space', 'Space', BTN_SPACE],
  ],
]

const BIT_NAMES: [number, string][] = [
  [BTN_S, 'S'], [BTN_W, 'W'], [BTN_A, 'A'], [BTN_D, 'D'], [BTN_E, 'E'],
  [BTN_PACE, 'PACE'], [BTN_SPACE, 'SPACE'], [BTN_C, 'C'], [BTN_Q, 'Q'], [BTN_Z, 'Z'],
  [BTN_PRESET_NEXT, ']'], [BTN_PRESET_PREV, '['], [BTN_SUB, 'SUB'],
]

export interface KeyViewInfo {
  /** 지금 눌려 있는 물리 키 */
  down: ReadonlySet<string>
  /** 이번 틱에 sim 으로 나간 입력 */
  input: Input
  /** 조작 중인 선수 (없으면 −1) */
  controlled: number
  /** 조작 선수 이름 */
  name: string
  /** 우리 팀이 공을 갖고 있나 — 같은 키가 뜻이 바뀌므로 (DESIGN 3.1) */
  hasBall: boolean
}

export class KeyView {
  readonly root: HTMLElement
  private keyEls = new Map<string, HTMLElement>()
  private bits: HTMLElement
  private meta: HTMLElement
  private lastBits = -1
  private lastMeta = ''

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'keyview'
    const rows = ROWS.map(
      (r) => `<div class="kv-row">${r.map(([label, code]) => `<b data-k="${code}">${label}</b>`).join('')}</div>`,
    ).join('')
    // 방향키는 안 그린다 — 화면의 › 표시가 이미 보여 준다 (사용자 요청 2026-09-11)
    this.root.innerHTML = `
      <div class="kv-title">입력 키 <small>내 화면에만</small></div>
      <div class="kv-body">
        <div class="kv-keys">${rows}</div>
      </div>
      <div class="kv-bits" data-b></div>
      <div class="kv-meta" data-m></div>`
    parent.appendChild(this.root)
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => this.keyEls.set(e.dataset.k!, e))
    this.bits = this.root.querySelector('[data-b]') as HTMLElement
    this.meta = this.root.querySelector('[data-m]') as HTMLElement
  }

  update(v: KeyViewInfo): void {
    for (const [code, el] of this.keyEls) {
      // Shift 는 좌우 둘 다 본다
      const on = v.down.has(code) || (code === 'ShiftLeft' && v.down.has('ShiftRight'))
      el.classList.toggle('on', on)
    }
    const b = v.input.buttons
    if (b !== this.lastBits) {
      this.lastBits = b
      const names = BIT_NAMES.filter(([bit]) => (b & bit) !== 0).map(([, n]) => n)
      this.bits.textContent = names.length ? names.join(' + ') : '—'
      this.bits.classList.toggle('none', names.length === 0)
    }
    const meta = `${v.hasBall ? '공격' : '수비'} 키 · ${v.controlled >= 0 ? v.name : '조작 없음'}`
    if (meta !== this.lastMeta) {
      this.lastMeta = meta
      this.meta.textContent = meta
    }
  }

  dispose(): void {
    this.root.remove()
  }
}
