// 키보드 → Input (DESIGN 3.1 표준 키 배치). 한 틱에 한 번 sample() 한다.
//
// - 키는 `e.code`(물리 키)로 읽는다. 한글 IME 가 켜져 있으면 `e.key` 가 'ㅅ' 처럼 나와 's' 와 안 맞는다.
// - 방향키는 sim 월드 방향 그대로다 — 카메라가 사이드라인에 고정(요 0)이라 화면 오른쪽 = +x, 위 = +y (camera.ts).
// - `[` `]` 는 눌린 순간만 한 번 보낸다(프리셋 전환). 나머지는 홀드.
// - 페이스 컨트롤은 **Shift** 다. 설계 3.1 의 Ctrl 은 Ctrl+W 가 크롬 탭을 닫아 사용자 결정으로 옮겼다 (DECISIONS C-1).
// - 같은 키가 공수에서 뜻이 바뀌는 것은 여기서 가르지 않는다 — sim 이 "우리 팀이 공을 갖고 있나"로 가른다.

import {
  BTN_A, BTN_C, BTN_D, BTN_E, BTN_PACE, BTN_PRESET_NEXT, BTN_PRESET_PREV, BTN_Q, BTN_S, BTN_SPACE, BTN_W, BTN_Z, type Input,
} from '../core/input'

/** 홀드 키 (e.code → 비트) */
export const HOLD_KEYS: Readonly<Record<string, number>> = {
  KeyS: BTN_S,
  KeyW: BTN_W,
  KeyA: BTN_A,
  KeyD: BTN_D,
  KeyE: BTN_E,
  ShiftLeft: BTN_PACE,
  ShiftRight: BTN_PACE,
  Space: BTN_SPACE,
  KeyC: BTN_C,
  KeyQ: BTN_Q,
  KeyZ: BTN_Z,
}

/** 눌린 순간만 보내는 키 */
export const EDGE_KEYS: Readonly<Record<string, number>> = {
  BracketRight: BTN_PRESET_NEXT,
  BracketLeft: BTN_PRESET_PREV,
}

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** 게임이 먹는 키인가 (브라우저 기본 동작을 막을 것) */
export function isGameKey(code: string): boolean {
  return ARROWS.has(code) || code in HOLD_KEYS || code in EDGE_KEYS
}

/** 눌린 키 집합 + 이번 틱의 edge 비트 → Input. 순수 함수 — 테스트가 이걸 본다 */
export function keysToInput(down: ReadonlySet<string>, edges: number): Input {
  let mx = 0
  let my = 0
  if (down.has('ArrowLeft')) mx -= 127
  if (down.has('ArrowRight')) mx += 127
  if (down.has('ArrowUp')) my += 127
  if (down.has('ArrowDown')) my -= 127
  let buttons = edges
  for (const code in HOLD_KEYS) if (down.has(code)) buttons |= HOLD_KEYS[code]
  return { mx, my, buttons, a: 0, b: 0 }
}

export class LocalInput {
  private down = new Set<string>()
  private edges = 0
  private detach: (() => void) | null = null
  /** Esc 가 눌리면 세션이 메뉴를 연다 */
  onEscape: (() => void) | null = null

  attach(): void {
    const kd = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        this.onEscape?.()
        e.preventDefault()
        return
      }
      if (!isGameKey(e.code)) return
      // Ctrl+S(저장)·Ctrl+D(북마크)·Space(스크롤)·방향키(스크롤)를 막는다.
      // Ctrl+W(탭 닫기)는 브라우저가 먼저 먹어 막을 수 없다 — 세션이 beforeunload 로 한 번 묻는다.
      e.preventDefault()
      if (e.repeat) return
      this.down.add(e.code)
      const edge = EDGE_KEYS[e.code]
      if (edge) this.edges |= edge
    }
    const ku = (e: KeyboardEvent): void => {
      this.down.delete(e.code)
    }
    const blur = (): void => this.down.clear()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    this.detach = () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }

  dispose(): void {
    this.detach?.()
    this.detach = null
    this.down.clear()
  }

  /** 한 틱치 입력. edge 비트는 한 번 나가면 지운다 */
  sample(): Input {
    const inp = keysToInput(this.down, this.edges)
    this.edges = 0
    return inp
  }

  /** 지금 눌려 있는가 (HUD 힌트용) */
  isDown(code: string): boolean {
    return this.down.has(code)
  }
}
