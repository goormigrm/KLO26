# CHANGELOG

## 2026-09-08 — v0.0.1 설계

- 설계서 `docs/DESIGN.md` v0.1 (13장) — 정체성·규칙·조작·결정론 시뮬·카드/스쿼드·네트워크·화면·구조·배포·비용/법적·개발 단계·검증·백로그.
- `docs/DECISIONS.md` — 사용자 결정 3건(직접 조작 · 전원 개방+급여 상한 · KLO26) · 기본안 17건 · 확인 필요 5건.
- `docs/PREP.md` — 원작자 허락 재확인 · 저장소 · Pages · 기기 · 비용 원칙.
- README · NOTICE · HANDOVER · 공지글 틀.
- 스캐폴드 — Vite + TypeScript + vitest + GitHub Pages 워크플로. `src/core/rng.ts`·`fixedmath.ts` (bedorage-duck 복사) + 테스트. 게임 코드 없음.
- 추가 결정 5건 반영 — **선수 이름 보호명**(빌드 단계 적용, 저장소에 실명 0건) · 경기 기본 3분 · **키보드만 검증**(패드 미검증) · 급여 상한 조건에 **K리그2 포함** · 공개 채널은 공개 시점에.
- 시점·렌더를 **Three.js 방송 카메라**로 (사용자 결정) — 찰흙 선수 · 키 `h/180` 반영 · 피부색 안 함(데이터 없음) · 닮게 그리지 않음. DESIGN 7.1 다시 씀, `package.json` 에 `three`.
- **PC 전용** (사용자 결정) — 터치 조작 없음, 폰·태블릿은 안내 화면만.
- 저장소 `goormigrm/KLO26` 첫 커밋·푸시.
