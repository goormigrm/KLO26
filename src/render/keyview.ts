// 키 입력 표시 — **테스트용**이다 (DESIGN 에 없다. 사용자 요청 2026-09-09).
//
// 지금 눌린 물리 키와, 그 결과로 sim 에 들어가는 `Input` 비트를 화면에 띄운다.
// 키가 안 먹는지 / 조합이 잡히는지 / edge(한 번만) 키가 제대로 나가는지를 눈으로 본다.
// 배포에서는 테스트 모드를 안 켜면 나오지 않는다.

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

const ARROWS: [string, string][] = [
  ['↑', 'ArrowUp'],
  ['←', 'ArrowLeft'],
  ['↓', 'ArrowDown'],
  ['→', 'ArrowRight'],
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
    const pad = ARROWS.map(([label, code]) => `<b data-k="${code}" class="ar ${code}">${label}</b>`).join('')
    const rows = ROWS.map(
      (r) => `<div class="kv-row">${r.map(([label, code]) => `<b data-k="${code}">${label}</b>`).join('')}</div>`,
    ).join('')
    this.root.innerHTML = `
      <div class="kv-title">키 입력 <small>테스트</small></div>
      <div class="kv-body">
        <div class="kv-pad">${pad}</div>
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
    const meta = `mx ${v.input.mx} · my ${v.input.my} · ${v.hasBall ? '공격' : '수비'} · ${v.controlled >= 0 ? v.name : '조작 없음'}`
    if (meta !== this.lastMeta) {
      this.lastMeta = meta
      this.meta.textContent = meta
    }
  }

  dispose(): void {
    this.root.remove()
  }
}
