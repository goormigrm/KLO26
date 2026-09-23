// 스쿼드 확정 — 대기실의 **준비** 버튼이 하는 판단만 떼어 낸 순수 함수 (2026-09-23).
//
// 대기실(`ui/waitroom.ts`)은 DOM 과 연결을 들고 있어서 테스트에서 못 띄운다. 그런데 G-62 의 핵심 약속
// — "스쿼드는 방을 만들 때가 아니라 **준비를 누를 때** 확정된다" — 은 이 판단 하나에 다 들어 있다.
// 그래서 여기로 뺐다 (HANDOVER 교훈 55: 배선은 순수 함수로 빼면 테스트가 잡는다).

import { checkSquad, type Squad } from './squad'
import { encodeSquad } from './squadcode'

export interface ReadyState {
  ready: boolean
  /** 상대에게 보내는 스쿼드 코드 — 확정 전에는 빈 문자열 */
  squadCode: string
  /** 확정한 스쿼드 — 확정 전에는 null */
  squad: Squad | null
}

export const NOT_READY: ReadyState = { ready: false, squadCode: '', squad: null }

/**
 * 준비 버튼을 한 번 눌렀을 때의 다음 상태.
 * - 준비 중이었으면 → 풀린다 (코드도 비운다 — 나가서 고치고 다시 올 수 있게)
 * - 아니면 → **지금** `getSquad()` 를 읽어 규칙을 보고, 통과하면 코드로 굳힌다. 어기면 그대로 두고 까닭을 돌려준다
 */
export function toggleReady(cur: ReadyState, getSquad: () => Squad, cap: number): ReadyState & { msg: string } {
  if (cur.ready) return { ...NOT_READY, msg: '' }
  const sq = getSquad()
  const c = checkSquad(sq, cap)
  if (!c.ok) return { ...cur, msg: `내 스쿼드가 규칙을 어겼습니다 — ${c.errors[0]}` }
  return { ready: true, squadCode: encodeSquad(sq), squad: sq, msg: '' }
}
