// 사람 입력. 한 틱에 한 개. 네트워크 패킷(락스텝)이 실어 나르는 것도 이 6바이트다 (DESIGN 6.4).
// 키 배치는 축구 게임의 표준 키보드 배치를 따른다 (DESIGN 3.1). 같은 키가 공격/수비에서 뜻이 바뀌는 것은
// 여기서가 아니라 sim 이 "우리 팀이 공을 갖고 있나"로 가른다 — 그래서 비트 이름은 키 이름이 아니라 동작 묶음이다.

/** S — 공격: 그라운드 패스 / 수비: 선수 변경 */
export const BTN_S = 1 << 0
/** W — 스루 패스 */
export const BTN_W = 1 << 1
/** A — 공격: 로빙 패스·크로스 / 수비: 슬라이딩 태클 */
export const BTN_A = 1 << 2
/** D — 공격: 슛(홀드 = 파워) / 수비: 압박(홀드)·걷어내기 */
export const BTN_D = 1 << 3
/** E — 전력질주 (홀드) */
export const BTN_E = 1 << 4
/** Ctrl — 페이스 컨트롤 (천천히 드리블, 볼을 붙인다) */
export const BTN_CTRL = 1 << 5
/** Space — 태클/밀치기 (스탠딩) */
export const BTN_SPACE = 1 << 6
/** C — 견제 (홀드 — 마주 보며 천천히) */
export const BTN_C = 1 << 7
/** Q — 홀드: 팀 지원 요청(두 번째 수비수 압박). 조합: Q+D 칩슛 · Q+A 하이 크로스 */
export const BTN_Q = 1 << 8
/** Z — 조합키 예약 (Z+D 감아차기 — 스핀이 없어 v1 은 강슛으로 본다) */
export const BTN_Z = 1 << 9
/** ] — 전술 프리셋 다음 (수비 → 균형 → 공격) */
export const BTN_PRESET_NEXT = 1 << 10
/** [ — 전술 프리셋 이전 */
export const BTN_PRESET_PREV = 1 << 11
/** 교체 명령 — a = 나가는 선발 인덱스, b = 들어오는 벤치 인덱스 (단계 4) */
export const BTN_SUB = 1 << 12

export interface Input {
  /** 방향키 −127..127 (대각선은 둘 다) */
  mx: number
  my: number
  /** BTN_* 비트 */
  buttons: number
  a: number
  b: number
}

export const EMPTY_INPUT: Input = { mx: 0, my: 0, buttons: 0, a: 0, b: 0 }

export function cloneInput(i: Input): Input {
  return { mx: i.mx, my: i.my, buttons: i.buttons, a: i.a, b: i.b }
}

export function inputEquals(a: Input, b: Input): boolean {
  return a.mx === b.mx && a.my === b.my && a.buttons === b.buttons && a.a === b.a && a.b === b.b
}

export const INPUT_BYTES = 6

export function writeInput(view: DataView, offset: number, i: Input): void {
  view.setInt8(offset, i.mx)
  view.setInt8(offset + 1, i.my)
  view.setUint16(offset + 2, i.buttons & 0xffff)
  view.setUint8(offset + 4, i.a & 255)
  view.setUint8(offset + 5, i.b & 255)
}

export function readInput(view: DataView, offset: number): Input {
  return {
    mx: view.getInt8(offset),
    my: view.getInt8(offset + 1),
    buttons: view.getUint16(offset + 2),
    a: view.getUint8(offset + 4),
    b: view.getUint8(offset + 5),
  }
}
