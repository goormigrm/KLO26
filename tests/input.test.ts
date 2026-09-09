// 키보드 → Input 매핑 (DESIGN 3.1). 순수 함수 keysToInput 만 본다 — DOM 없이.
import { describe, expect, it } from 'vitest'
import { BTN_A, BTN_C, BTN_CTRL, BTN_D, BTN_E, BTN_PRESET_NEXT, BTN_Q, BTN_S, BTN_SPACE, BTN_W, BTN_Z } from '../src/core/input'
import { HOLD_KEYS, isGameKey, keysToInput } from '../src/game/localInput'

describe('키보드 입력', () => {
  it('방향키 → 월드 방향 (오른쪽 +x · 위 +y)', () => {
    expect(keysToInput(new Set(['ArrowRight']), 0)).toMatchObject({ mx: 127, my: 0 })
    expect(keysToInput(new Set(['ArrowLeft']), 0)).toMatchObject({ mx: -127, my: 0 })
    expect(keysToInput(new Set(['ArrowUp']), 0)).toMatchObject({ mx: 0, my: 127 })
    expect(keysToInput(new Set(['ArrowDown']), 0)).toMatchObject({ mx: 0, my: -127 })
    expect(keysToInput(new Set(['ArrowLeft', 'ArrowRight']), 0)).toMatchObject({ mx: 0, my: 0 })
    expect(keysToInput(new Set(['ArrowUp', 'ArrowRight']), 0)).toMatchObject({ mx: 127, my: 127 })
  })

  it('표준 키 배치 — S/W/A/D/E/Ctrl/Space/C/Q/Z 가 각 비트로', () => {
    const one = (code: string): number => keysToInput(new Set([code]), 0).buttons
    expect(one('KeyS')).toBe(BTN_S)
    expect(one('KeyW')).toBe(BTN_W)
    expect(one('KeyA')).toBe(BTN_A)
    expect(one('KeyD')).toBe(BTN_D)
    expect(one('KeyE')).toBe(BTN_E)
    expect(one('ControlLeft')).toBe(BTN_CTRL)
    expect(one('ControlRight')).toBe(BTN_CTRL)
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

  it('edge 비트(프리셋)는 그대로 얹힌다', () => {
    const i = keysToInput(new Set(), BTN_PRESET_NEXT)
    expect(i.buttons).toBe(BTN_PRESET_NEXT)
  })

  it('Input 은 6바이트 규격 안 — buttons 가 16비트를 넘지 않는다', () => {
    let all = 0
    for (const k in HOLD_KEYS) all |= HOLD_KEYS[k]
    expect(all).toBeLessThan(1 << 16)
  })

  it('게임 키 판정 — 방향키·표준 키는 막고, 나머지는 그대로', () => {
    expect(isGameKey('ArrowUp')).toBe(true)
    expect(isGameKey('KeyS')).toBe(true)
    expect(isGameKey('BracketRight')).toBe(true)
    expect(isGameKey('KeyR')).toBe(false)
    expect(isGameKey('F5')).toBe(false)
  })
})
