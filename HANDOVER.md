# HANDOVER — 2026-09-08 (2차)

> **이 문서가 최신입니다.** 같은 날 두 번째 핸드오버 — 설계 + **단계 2 시뮬 코어가 돌아갑니다**(봇 vs 봇 · 결정론 · 성능 통과). 화면·네트워크는 아직 없습니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-08 |
| 작업 디렉터리 | `C:\Users\tkdrm\Workspace\personal\KLO26` |
| 저장소 | `https://github.com/goormigrm/KLO26` · `main` · **첫 커밋 푸시됨** (2026-09-08) |
| 배포 | <https://goormigrm.github.io/KLO26/> — Pages(Actions) 켜짐, 첫 배포 성공 (2026-09-08). `<title>개리그 온라인 2026</title>` curl 확인 |
| 참고한 곳 | `../km`(KM26 원본 + docs 9종) · `../KMD26v1.0`(데이터·코드 규격·문서 체계) · `../철FPS/bedorage-duck`(P2P·락스텝·결정론·배포) |

이 세션의 산출물은 전부 첫 커밋에 들어갔습니다. 두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

---

## 이 세션에서 한 것

**설계.** 사용자 요청 — "개리그 매니저 같은 개리그 온라인. 카드형 축구 게임 형식, 2026 K리그 선수만, 철FPS 처럼 방 만들어 P2P, 서버·DB 없음, 팬 게임(광고·결제 없음)".

1. 세 프로젝트를 읽고 무엇을 가져올지 갈랐다 (DESIGN 1장).
2. 사용자에게 갈림길 셋을 물었고 답을 받았다 (DECISIONS 1장):
   **직접 조작(액션)** · **전원 개방 + 급여 상한** · **KLO26**.
3. `docs/DESIGN.md` 설계서 v0.1 (13장) · `DECISIONS.md` · `PREP.md` · README · CHANGELOG · 공지글 틀.
4. 스캐폴드 — Vite + TypeScript + vitest + Pages 워크플로. `src/core/rng.ts`·`fixedmath.ts` 는 bedorage-duck 에서 그대로 복사(결정론의 바닥). `npm install` · `npm test` · `npm run build` 통과 확인.
5. 추가 결정 9건 반영 (DECISIONS 3장) — **보호명** · 기본 3분 · **게임패드 계획 제외** · 급여 상한 조건 **K리그2 포함** · 공개 채널 보류 · **Three.js 방송 카메라**(찰흙 선수·키 반영·피부색 안 함) · **PC 전용**(폰 차단) · **축구 게임 표준 키 배치**(방향키·S/W/A/D/E·Space·C·Q·Ctrl) · **제3자 거명 고지 문구 전부 삭제**(NOTICE.md 삭제). `three` 의존성 추가. 첫 커밋·푸시, Pages 배포.
6. **단계 2 — 시뮬 코어** (`src/core/` 9 파일, 약 1,900줄). 피치·공·선수 물리 · 소유/드리블(붙임 모델)·태클·패스·슛·걷어내기·GK · 팀 AI(앵커·지원 러닝·압박/커버/마크·볼 소유 효용 판단·요격) · 규칙(시계·하프·킥오프·골·스로인/골킥/코너) · 사람 입력 해석(3.1 키 배치 전부) · 해시/스냅샷. 합성 스쿼드(`synth.ts`)로 검증 — 실제 카드 데이터는 아직 없다(PREP A-1).

---

## 주요 결정 사항

| 결정 | 근거 | 반영 위치 |
|---|---|---|
| **직접 조작** — KM26 매치엔진 안 씀 | 사용자 답 (Q1). 감독 모드는 백로그 | DESIGN 1·4장, DECISIONS Q1 |
| **카드 전원 개방 · 급여 상한 · 강화 예산제 · 팀컬러** | 서버 없이 "상대가 검증할 수 있는 규칙"만 남긴다 | DESIGN 5장 |
| **Three.js 방송 카메라 · 찰흙 선수 · 키 반영** | 사용자 결정. 피부색은 데이터가 없어 안 함, 생김새는 닮게 그리지 않음 | DESIGN 7.1, DECISIONS 3장 6 |
| **PC 전용 — 폰 차단** | 사용자 결정. 터치 조작 없음 | DESIGN 3.4, DECISIONS 3장 7 |
| **선수 이름 보호명** (빌드 단계 적용) | 사용자 결정. 저장소에 실명 0건이 단계 1 기준 | DESIGN 10.2 |
| **제3자 거명 고지 문구 전부 삭제** | 사용자 결정 — "문구 자체가 문제". NOTICE.md 삭제, README 고지 절 삭제, 타 게임·회사 이름 문서에서 제거 | DESIGN 10.2, DECISIONS 3장 9 |
| **키보드만 검증** | 검증할 패드가 없다 | DESIGN 3.2 |
| **60Hz 락스텝 · 정원 2 · 난입/재접속 없음** | bedorage-duck 검증값. 축구는 한쪽이 비면 성립 안 함 | DESIGN 6장 |
| **급여 상한은 도구가 데이터로** | 손으로 정한 숫자를 믿지 않는다 (KLD26·KMD26 교훈) | DESIGN 5.4, D-9 |
| **데이터는 허락 재확인 전에 저장소에 넣지 않는다** | KMD26 허락은 KMD26 것 | PREP A-1 |

---

## 단계 2 실측 (2026-09-08 · 합성 스쿼드 66 · 4-3-3 vs 4-4-2 · 3분 하프)

| 항목 | 값 | 기준 | 판정 |
|---|---|---|---|
| 같은 시드 두 번 → 60틱마다 해시 | **100% 일치** | 100% | ✅ |
| 틱당 시간 (봇 vs 봇) | **0.017 ms** (테스트 PC) | < 0.5 ms | ✅ (예산의 3%) |
| 90분 완주 · kickoff/half/end 사건 | 전부 | — | ✅ |
| 평균 총득점 (20판) | **4.4** · 0:0 0% · 5골+ 5% | 2~4 (단계 2) / 2.5~3.5 (단계 7) | ⚠ 많다 |
| 판당 슛 · 유효슛 | 16.1 · **12.7 (79%)** | — | ⚠ 슛이 너무 정확 — GK 약함/오차 작음 |
| 패스 성공률 | **40%** | — | ⚠ 낮다 |
| 점유 (홈) | 52% · 홈 12승 4무 4패 | 47~53% (같은 스쿼드끼리) | 스쿼드가 달라 아직 못 잰다 |
| 루즈볼 시간 | 58~63% | — | ⚠ 여전히 높다 (공이 날아다니는 시간) |

**단계 2 의 세 기준(결정론·성능·골이 남)은 통과.** 밸런스 수치는 단계 7 에서 `tools/balance.ts` 500판으로 다시 잰다.

## 다음 단계

### 사용자가 먼저 (PREP A)

1. **A-1 원작자 허락 재확인** — 단계 1 이 여기 걸려 있다. (A-2 저장소 · A-3 Pages 는 끝났다)

### 다음 세션

| 순서 | 무엇 | 끝났다의 기준 |
|---|---|---|
| 2-보수 | (선택) 슛 오차·GK 반응을 올려 유효슛 비율 79% → 50% 안팎, 골 4.4 → 3 안팎. 같은 스쿼드끼리 붙여 홈/원정 대칭 확인 | `npm run balance -- 100` 에서 평균 골 2.5~3.5 |
| **3** | Three.js 방송 카메라 · 찰흙 선수(키 `h/180`) · 피치 · 키보드(3.1 표) · 폰 차단 · 혼자 하기 | DESIGN 11장 3단계 기준. bedorage-duck `src/render3d`(카메라·프리미티브 조립·툰)·`src/game/session.ts`·`ticker.ts` 를 옮겨 오는 것부터 |
| 1 | (A-1 답이 오면) `tools/build_cards.py` (KMD26 `data/players.json` → `src/data/cards.json` · 보호명) · `tools/calibrate.py` | DESIGN 11장 1단계 기준 |
| 4 | 오프사이드 · 파울/카드 · PK/프리킥 · 교체 | `tests/rules.test.ts` |

**단계 3 은 사람이 직접 해 봐야 안다.** 조작감·카메라는 숫자로 못 잰다 — 브라우저에서 봇과 한 판 돌려 보고 정한다.

---

## 주의사항 & 교훈 (앞 프로젝트에서 가져온 것)

1. **추정은 숫자로 판정한다.** 문턱을 못 넘으면 멈추는 것이 결론이다 (KLD26 을 이걸로 끝냈다).
2. **적은 표본으로 판정 금지.** "3판 보고 결론"으로 두 번 틀렸다. 봇전은 500판.
3. **슬라이더가 연결됐는지는 지문으로.** 같은 시드로 값만 바꿔 지문이 같으면 안 읽는 것이다 (KMD26 "패스 길이 미반영").
4. **문서는 소스와 같은 커밋에.** CHANGELOG · README · DESIGN. 화면이 바뀌면 README 반드시.
5. **`src/core` 결정론 규칙** (DESIGN 4.12) — `Math.sin/cos/atan2/random/pow/exp`·시간 함수 금지, 22명 순회 인덱스 순, 정렬 동률 금지.
6. **브라우저 콘솔에 무거운 스크립트 돌리지 말 것** — 클로드 앱이 죽은 적 있다. 계측은 vitest·`tools/` 로.
7. **Python·Go 편집에 heredoc 금지** — 백슬래시가 먹힌다. Write/Edit 도구로.
8. **`.cmd` 는 CRLF** (`.gitattributes` 에 있다). LF 면 cmd 가 괄호 블록을 잘못 읽는다.
9. 개발 서버와 배포본이 **같은 릴레이·같은 APP_ID** 면 방 목록이 섞인다 — 개발 중엔 `APP_ID` 에 `-dev`.
10. Vite 가 파일명에 해시를 붙이므로 KMD26 의 `stamp_version.py` 는 필요 없다. 대신 **`vite.config.ts` 의 `base` 가 저장소 이름과 같아야** Pages 에서 경로가 풀린다 (`/KLO26/`).
11. **빠른 공은 한 틱에 발을 뚫고 지나간다** (단계 2 에서 겪음). 20 m/s 공은 틱당 0.33 m 라 점 거리로는 못 잡는다 — `tryControl` 은 **이번 틱에 공이 지나온 선분**까지의 거리로 본다. 받는 선수도 공 위치가 아니라 **요격 지점**(`interceptPoint`)으로 달린다. 고치기 전엔 패스 성공률 25%, 루즈볼 77% 였다.
12. **AI 가 공을 잡자마자 되차면 공이 늘 날아다닌다** — 잡은 뒤 20틱은 압박이 없으면 패스 점수를 깎는다(`justGot`). 이걸로 골 0.5 → 4.4.
13. 새 저장소는 **Pages 를 먼저 켜고** 푸시한다. 안 켜면 첫 deploy 가 404 로 실패한다.
14. **테스트를 실패한 채로 푸시하지 않는다** — `deploy.yml` 이 `npm test` 를 돌리므로 배포가 막힌다.

---

## 보류 / 백로그

DESIGN 13장. 큰 것만 — 감독 모드(KMD26 엔진) · 2v2 · 3D 렌더 · KM26 세이브 카드 · 특성 반영 · 승부차기 · 로컬 전적 · 스핀 · 관전/리플레이.

---

## 중요 파일 맵

| 경로 | 역할 |
|---|---|
| `docs/DESIGN.md` | **설계서 정본.** 고치기 전에 볼 것 |
| `docs/DECISIONS.md` | 사용자 결정 3건 · 기본안 17건 · 확인 필요 5건 |
| `docs/PREP.md` | 사용자가 직접 할 것 — 허락·저장소·Pages·기기 |
| `src/core/rng.ts` · `fixedmath.ts` | 결정론 바닥 (bedorage-duck 복사) |
| `src/core/state.ts` | 상수·타입 (GameState · Player · Ball · Team · MatchConfig) |
| `src/core/input.ts` | Input 6바이트 · 키 비트(BTN_S·W·A·D·E·CTRL·SPACE·C·Q·Z·PRESET·SUB) |
| `src/core/formation.ts` | 포메이션 12종 · SLOT_XY · 앵커 계산 (KM26 이식) |
| `src/core/skills.ts` | 능력치 → 경기 스킬 · 능숙도 페널티 |
| `src/core/synth.ts` | 합성 스쿼드 (실제 데이터 전까지) |
| `src/core/physics.ts` | 선수 이동/회전/체력 · 공 물리 · 골대 · 충돌 |
| `src/core/ball.ts` | 소유·드리블(붙임)·태클·슬라이딩·패스·슛·걷어내기·GK·요격 지점 |
| `src/core/ai.ts` | 팀 AI · 볼 소유 효용 판단 · GK 위치 · 사람 조작 대상 선택 |
| `src/core/rules.ts` | 시계·하프·킥오프·골·아웃·리스타트 |
| `src/core/sim.ts` | **createState / step / hashState / snapshot** · 사람 입력 해석 |
| `src/main.ts` | 설계 단계 안내 페이지 (단계 3 에서 로비로 바뀐다) |
| `tests/helpers.ts` | 합성 스쿼드 경기 만들기·끝까지 돌리기 |
| `tests/determinism.test.ts` · `perf.test.ts` · `match.test.ts` | 단계 2 검토 기준 |
| `tools/balance.ts` · `tools/probe.ts` | 대량 계측 · 한 경기 진단 (`npm run balance -- 50` · `npm run probe -- 101`) |
| `.github/workflows/deploy.yml` | push → 테스트·빌드 → Pages |
| `.claude/launch.json` | `dev` 서버 (5175) |

### 재현 명령

```bash
npm install
npm test               # 결정론 · 성능 · 경기 · 기본 수학 (10개)
npm run build
npm run dev            # http://localhost:5175/KLO26/
npm run balance -- 50  # 봇 vs 봇 50판 계측
npm run probe -- 101   # 시드 101 한 경기 진단
```

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
