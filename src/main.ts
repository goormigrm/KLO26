// 진입점. 지금은 설계 단계 안내만 띄운다 — 단계 3 에서 로비(src/ui/lobby.ts)로 바뀐다.
// 설계서: docs/DESIGN.md · 다음 할 일: HANDOVER.md

const app = document.getElementById('app')!
app.innerHTML = `
  <main class="hold">
    <h1>개리그 온라인 2026</h1>
    <p class="sub">K리그 2026 선수 1,024명으로 스쿼드를 짜서 P2P 로 붙는 1:1 실시간 조작 축구</p>
    <p class="stage">🚧 설계 단계 — 게임은 아직 없습니다.</p>
    <p class="note">PC 전용 · 비공식 팬 프로젝트 · 비상업 · 서버 없음 · 광고·결제 없음</p>
  </main>
`
