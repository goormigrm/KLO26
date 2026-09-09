# HANDOVER — 2026-09-09 (3차)

> **이 문서가 최신입니다.** 단계 3 — **브라우저에서 봇과 한 판이 됩니다** (Three.js 방송 카메라 · 찰흙 선수 · 표준 키보드 · 폰 차단 · 혼자 하기).
> 실제 카드 데이터·온라인 대전·소리는 아직 없습니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-09 |
| 작업 디렉터리 | 이 PC: `C:\Users\tkdrm\OneDrive\Desktop\klo26` · 다른 PC: `C:\Users\tkdrm\Workspace\personal\KLO26` |
| 저장소 | `https://github.com/goormigrm/KLO26` · `main` |
| 배포 | <https://goormigrm.github.io/KLO26/> — push 하면 Actions 가 테스트·빌드·배포 |
| 참고한 곳 | 배도라지덕(bedorage-duck) — 이 PC 에서는 `C:\Users\tkdrm\OneDrive\Desktop\철FPS`, 다른 PC 에서는 `../철FPS/bedorage-duck`. KM26·KMD26 은 `Desktop/km26` · `Desktop/KMD26v1.0` |

두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

---

## 이 세션에서 한 것 (단계 3)

1. **배도라지덕에서 옮겨 온 것** — `src/game/ticker.ts`(Worker 틱 타이머, 그대로) · 세션 루프 구조(틱 누적 + rAF 보간, 한 번에 최대 4틱 따라잡기) · 프리미티브 조립 캐릭터 + 툰 셰이딩 방식 · 로비 CSS 톤. 쿼터뷰 카메라·얼굴 캐리커처·터치는 안 가져왔다 (설계 1.1).
2. **`src/render3d/`** — `camera.ts`(방송 카메라 수학, Three 없이 · 테스트 있음) · `pitch3d.ts`(잔디·라인 캔버스 텍스처 · 골대·네트 · 관중석 · 조명/그림자) · `player3d.ts`(찰흙 리그 · `h/180` · `sqrt(w/75)` · 머리 4종 id 해시 · 등번호 · 코드 애니메이션) · `renderer3d.ts`(보간 · 공 · 조작 표시 · 카메라 스무딩).
3. **`src/game/`** — `localInput.ts`(3.1 표 전부, `e.code`) · `session.ts`(혼자 하기 · Esc 메뉴 · 결과표 · `beforeunload` · 디버그 훅 `window.__klo`).
4. **`src/render/`** — `hud.ts`(DOM 오버레이) · `radar.ts`. **`src/ui/`** — `lobby.ts` · `settings.ts` · `device.ts`(폰 차단). `main.ts` 는 기기 판정 → 로비 ↔ 세션.
5. **코어 한 군데** — 사람 킥커의 리스타트 킥 방향 (`rules.performRestartKick(st, aim)` · `sim.handleInput`). 결정론 테스트 통과.
6. 테스트 16 → **26개** (키 매핑 · 카메라 · 리스타트 킥). `npm run build` 통과.

### 좌표 약속 (렌더·입력이 다 이걸 본다)

sim `(x, y)` → Three `(x, 높이, z = −y)`. 카메라는 Three `+z` 쪽(sim `−y` 사이드라인 바깥)에서 `−z` 를 본다.
그래서 **화면 오른쪽 = sim +x = 전반 홈 공격 방향, 화면 위 = sim +y**. 방향키를 월드 방향 그대로 Input 에 싣는다 (요 회전 없음). 후반은 sim 이 `dir` 을 뒤집으니 화면에서는 진영이 바뀌어 보인다 — 방송처럼.

---

## 단계 3 검토 기준 대조

| 기준 (DESIGN 11장) | 결과 | 어떻게 봤나 |
|---|---|---|
| 사람이 골을 넣을 수 있다 | ✅ | 키 이벤트를 스크립트로 흘려 넣는 조잡한 조종(잡으면 상대 골문 쪽으로 달려 41 m 넘으면 D 0.5초)으로 40초 안에 슛 4 · **골 1**. 진짜 손맛은 사용자가 |
| 3.1 표의 ✅ 전부 동작 | ✅ (매핑) | `tests/input.test.ts` + sim 의 `handleInput` 은 단계 2 부터 있었다. 체감은 사용자가 |
| 키 158 과 197 이 한눈에 다르다 | ⚠ 수치상 | 1.67 m vs 2.08 m (25%). FOV 9° 로 당겨 찍은 스크린샷에서 리그는 좋았다. **넓은 화면에서 차이가 보이는지는 사용자 눈으로** |
| 노트북 내장 GPU 60fps | ❓ 못 잼 | Claude 브라우저 패널이 뒤에 있으면 rAF 가 멈춘다. 드로우콜 약 740(그림자 포함) · 삼각형 13만. **우상단 fps 표시**를 사용자 PC 에서 볼 것. 낮으면 설정에서 그림자 끔·해상도 75% |
| 폰으로 열면 안내만 | ✅ (코드) | `isBlockedDevice()` — 실제 폰은 PREP B-2 |

---

## 다음 단계

### 사용자가 먼저

1. **한 판 직접 해 보기** — 조작감·카메라·선수 크기·fps. 숫자로 못 재는 것들이다. 불편한 것을 적어 주면 다음 세션이 고친다.
2. **DECISIONS 4장 C-1** — Ctrl+W 탭 닫힘. 그대로 둘지 페이스 컨트롤 키를 옮길지.
3. **A-1 원작자 허락 재확인** — 단계 1(실제 카드)이 여기 걸려 있다.

### 다음 세션 (순서는 사용자 답에 따라)

| 순서 | 무엇 | 끝났다의 기준 |
|---|---|---|
| 3-보수 | 사용자 피드백 반영 (카메라·크기·조작감). 소리(`src/audio/sfx.ts` — 킥·휘슬·골·관중, Web Audio 절차 생성, bedorage-duck `sfx.ts` 참고) | 사용자가 "됐다" |
| 2-보수 | 유효슛 79% → 50% 안팎, 골 4.4 → 3 안팎 (슛 오차·GK). 같은 스쿼드끼리 홈/원정 대칭 | `npm run balance -- 100` 평균 골 2.5~3.5 |
| **4** | 오프사이드 · 파울/카드 · PK/프리킥 · 교체 (교체 명령은 Input 의 `BTN_SUB`·a·b) | `tests/rules.test.ts` |
| 1 | (A-1 답이 오면) `tools/build_cards.py` → `src/data/cards.json` · 보호명 · 구단 색 → 킷 (`session.ts` 의 임시 `KITS` 를 데이터로) | DESIGN 11장 1단계 기준 |
| 5 · 6 | 스쿼드 화면 · 네트워크 (bedorage-duck `src/net/room.ts`·`lockstep.ts` 이식) | DESIGN 11장 |

---

## 주의사항 & 교훈

앞 세션 것(1~14)은 그대로 유효하다. 이 세션에서 더한 것:

15. **Claude 브라우저 패널은 뒤에 있으면 `requestAnimationFrame` 이 안 돈다.** fps 계측·rAF 기반 애니메이션 확인은 못 한다. 스크린샷을 찍는 순간만 그린다. sim 은 Worker 티커라 계속 돈다 — 그래서 `window.__klo.state()` 로 상태를 읽고 `KeyboardEvent` 를 `window` 에 dispatch 해 조작을 흘려 넣는 방식은 된다. 패널의 클릭 좌표도 잘 안 맞는다 — `document.querySelector('#btn-solo').click()` 이 확실하다.
16. **키는 `e.code` 로.** 한글 IME 가 켜져 있으면 `e.key` 가 `'ㅅ'` 로 온다. `KeyS`·`ArrowUp`·`BracketRight`·`ControlLeft`.
17. **Ctrl+W 는 못 막는다** (bedorage-duck 2026-09-05 와 같음). `beforeunload` 로 한 번 묻는다. DECISIONS C-1.
18. **`MeshToonMaterial` 의 gradientMap 은 `RedFormat` + `NearestFilter`** 3×1 `DataTexture`. 재질은 색깔별로 캐시해 공유한다(22명 × 십수 개 재질을 새로 만들지 않는다).
19. **렌더 보간 스냅샷은 pose 만** (`capturePose`). 선수마다 능력치 40종이 붙어 있어 상태 전체 JSON 복사는 무겁다.
20. `PCFSoftShadowMap` 은 three 0.185 에서 deprecated 경고가 뜬다 (PCFShadowMap 으로 대체됨). 동작엔 문제 없다 — 다음에 `PCFShadowMap` 으로 바꿔도 된다.
21. 킥 동작은 sim 에서 6틱(0.1초)뿐이라 렌더가 0.32초로 늘려 보여 준다 (`animateRig`). sim 값을 늘리면 결정론 지문이 바뀐다 — 렌더에서만.

---

## 보류 / 백로그

DESIGN 13장 + 이 세션: 키 바인딩 변경 UI(설정 화면 — 3.1 "설정에서 바꿀 수 있다"는 아직 기본값만) · 오프사이드 라인 데칼 · 패스 콘 데칼 · 리그 메시 병합(드로우콜 740 → 200대, fps 가 낮으면) · 소리.

---

## 중요 파일 맵

| 경로 | 역할 |
|---|---|
| `docs/DESIGN.md` | **설계서 정본.** 7.1 카메라 수치는 단계 3 값으로 고쳤다 |
| `docs/DECISIONS.md` | 결정 · 기본안 · **4장 확인 필요 C-1·C-2** |
| `docs/PREP.md` | 사용자가 직접 할 것 |
| `src/core/` | 결정론 시뮬 (단계 2). 이번에 `rules.performRestartKick(st, aim)` 만 늘었다 |
| `src/render3d/camera.ts` | 방송 카메라 수치·수학 (Three 없음) — **카메라를 만지려면 여기** |
| `src/render3d/pitch3d.ts` | 잔디·라인·골대·관중석·조명 |
| `src/render3d/player3d.ts` | 찰흙 리그 조립 · `animateRig` |
| `src/render3d/renderer3d.ts` | 씬 · 보간 · 공 · 조작 표시 · `capturePose` |
| `src/game/localInput.ts` | 키 → Input (`keysToInput` 순수 함수) |
| `src/game/session.ts` | 혼자 하기 루프 · 메뉴 · 결과 · 임시 `KITS` · `window.__klo` |
| `src/render/hud.ts` · `radar.ts` | HUD · 레이더 |
| `src/ui/lobby.ts` · `settings.ts` · `device.ts` | 로비 · 설정 · 폰 차단 |
| `src/main.ts` | 진입점 |
| `tests/input.test.ts` · `camera.test.ts` · `restart.test.ts` | 단계 3 테스트 |

### 재현 명령

```bash
npm install
npm test               # 26개
npm run build
npm run dev            # http://localhost:5175/KLO26/  → 혼자 하기
npm run balance -- 50  # 봇 vs 봇 50판 계측
npm run probe -- 101   # 시드 101 한 경기 진단
```

브라우저 콘솔에서 `__klo.state()` 로 경기 상태, `__klo.info()` 로 드로우콜.

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
