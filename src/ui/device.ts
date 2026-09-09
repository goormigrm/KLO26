// PC 전용 판정 (DESIGN 3.4). 폰·태블릿이면 로비 대신 안내만 보인다.
// 데스크톱 터치스크린 노트북(마우스도 있음)은 `pointer: fine` 이라 통과한다.

export const MIN_WIDTH = 900

export function isBlockedDevice(): boolean {
  const touch = (navigator.maxTouchPoints ?? 0) > 0
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? true
  if (touch && !fine) return true
  return window.innerWidth < MIN_WIDTH
}

export function renderBlocked(root: HTMLElement): void {
  root.innerHTML = `
    <main class="hold">
      <h1>개리그 온라인 2026</h1>
      <p class="stage">🖥 PC 에서 해 주세요</p>
      <p class="sub">이 게임은 PC 키보드 전용입니다. 폰·태블릿 조작은 없고, 창 폭이 ${MIN_WIDTH}px 보다 좁아도 열리지 않습니다.</p>
      <p class="note">PC 키보드 전용 · 게임패드 없음 · 서버 없음 · 광고·결제 없음</p>
    </main>`
}
