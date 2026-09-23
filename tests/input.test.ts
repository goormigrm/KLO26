// 키보드 → Input 매핑 (DESIGN 3.1). 순수 함수 keysToInput 만 본다 — DOM 없이.
import { describe, expect, it } from 'vitest'
import {
  BTN_A, BTN_BAL_UP, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_F, BTN_GK, BTN_PACE, BTN_Q, BTN_S, BTN_SPACE, BTN_SUB, BTN_TAC4, BTN_W, BTN_Z,
  INPUT_BYTES, PRESET_SHIFT, presetPick, readInput, writeInput,
} from '../src/core/input'
import { EDGE_KEYS, HOLD_KEYS, PRESET_KEYS, isGameKey, keysToInput } from '../src/game/localInput'

describe('키보드 입력', () => {
  it('방향키 → 월드 방향 (오른쪽 +x · 위 +y)', () => {
    expect(keysToInput(new Set(['ArrowRight']), 0)).toMatchObject({ mx: 127, my: 0 })
    expect(keysToInput(new Set(['ArrowLeft']), 0)).toMatchObject({ mx: -127, my: 0 })
    expect(keysToInput(new Set(['ArrowUp']), 0)).toMatchObject({ mx: 0, my: 127 })
    expect(keysToInput(new Set(['ArrowDown']), 0)).toMatchObject({ mx: 0, my: -127 })
    expect(keysToInput(new Set(['ArrowLeft', 'ArrowRight']), 0)).toMatchObject({ mx: 0, my: 0 })
    expect(keysToInput(new Set(['ArrowUp', 'ArrowRight']), 0)).toMatchObject({ mx: 127, my: 127 })
  })

  it('표준 키 배치 — S/W/A/D/E/Shift/Space/C/Q/Z 가 각 비트로', () => {
    const one = (code: string): number => keysToInput(new Set([code]), 0).buttons
    expect(one('KeyS')).toBe(BTN_S)
    expect(one('KeyW')).toBe(BTN_W)
    expect(one('KeyA')).toBe(BTN_A)
    expect(one('KeyD')).toBe(BTN_D)
    expect(one('KeyE')).toBe(BTN_E)
    // 페이스 컨트롤은 Shift — Ctrl+W 가 크롬 탭을 닫아 사용자 결정으로 옮겼다 (DECISIONS C-1)
    expect(one('ShiftLeft')).toBe(BTN_PACE)
    expect(one('ShiftRight')).toBe(BTN_PACE)
    // Ctrl 은 2026-09-23 FC 온라인 조작으로 퍼스트 터치 녹온이 됐다 (Ctrl+W 는 여전히 브라우저가 먹는다 — 세션이 한 번 묻는다)
    expect(one('ControlLeft')).toBe(BTN_CTRL)
    expect(one('KeyF')).toBe(BTN_F)
    expect(one('Backquote')).toBe(BTN_GK)
    expect(one('Space')).toBe(BTN_SPACE)
    expect(one('KeyC')).toBe(BTN_C)
    expect(one('KeyQ')).toBe(BTN_Q)
    expect(one('KeyZ')).toBe(BTN_Z)
  })

  it('조합 — Q+D 는 두 비트가 같이 실린다', () => {
    const i = keysToInput(new Set(['KeyQ', 'KeyD']), 0)
    expect(i.buttons & BTN_Q).toBeTruthy()
    expect(i.buttons & BTN_D).toBeTruthy()
  })

  it('edge 비트(공수 밸런스)는 그대로 얹힌다', () => {
    const i = keysToInput(new Set(), BTN_BAL_UP)
    expect(i.buttons).toBe(BTN_BAL_UP)
    expect(EDGE_KEYS.F4).toBe(BTN_TAC4)
  })

  it('숫자 1~0 은 4비트 값으로 — 0 키가 10번째 전술', () => {
    expect(presetPick(PRESET_KEYS.Digit1 << PRESET_SHIFT)).toBe(0)
    expect(presetPick(PRESET_KEYS.Digit0 << PRESET_SHIFT)).toBe(9)
    expect(presetPick(0)).toBe(-1)
  })

  it('Input 은 8바이트 — 32비트 buttons 가 그대로 오간다', () => {
    let all = 0
    for (const k in HOLD_KEYS) all |= HOLD_KEYS[k]
    for (const k in EDGE_KEYS) all |= EDGE_KEYS[k]
    all |= BTN_SUB | (10 << PRESET_SHIFT)
    expect(all).toBeLessThan(2 ** 31)
    const view = new DataView(new ArrayBuffer(INPUT_BYTES * 2))
    const inp = { mx: -127, my: 127, buttons: all, a: 7, b: 3 }
    writeInput(view, INPUT_BYTES, inp)
    expect(readInput(view, INPUT_BYTES)).toEqual(inp)
    expect(INPUT_BYTES).toBe(8)
  })

  it('게임 키 판정 — 방향키·표준 키는 막고, 나머지는 그대로', () => {
    expect(isGameKey('ArrowUp')).toBe(true)
    expect(isGameKey('KeyS')).toBe(true)
    expect(isGameKey('BracketRight')).toBe(true)
    expect(isGameKey('KeyR')).toBe(false)
    expect(isGameKey('F5')).toBe(false)
    expect(isGameKey('F1')).toBe(true)
    expect(isGameKey('Digit0')).toBe(true)
    expect(isGameKey('Minus')).toBe(true)
  })
})
