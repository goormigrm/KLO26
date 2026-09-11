# HANDOVER — 2026-09-11 (14차)

> **이 문서가 최신입니다.** 단계 1~7 이 전부 들어가 있고, 2026-09-10~11 에 사용자가 직접 해 보고 낸 **제보·요청 42건**을 반영했습니다.
> 14차(11일 오후)는 **골키퍼 선방 현실화 → 교체 5명/3회 전술판 → 체력 → 스로인 → 프리킥 오프사이드·조준·궤적 → D 압박 파울** 이었습니다. 체력 완화로 속도 A/B 가 다시 올라간 것(79.8)도 **속도 폭 재축소**로 잡았습니다. 이제부터 **커밋·push 는 자동**입니다(사용자 지시).
> 남은 것은 **다른 회선 두 대 실제 대전**(PREP B-1), **강화 효과 키우기**, 그리고 공개입니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-10 ~ 09-11 (직전 12차: 09-11 세트피스, 6차: 09-11 코인토스) |
| 저장소 · 브랜치 | `https://github.com/goormigrm/KLO26` · `main` |
| 마지막 커밋 | 14차 (골키퍼·교체·체력·스로인·프리킥·파울·속도 폭) — `git log -1` |
| git 상태 | **클린** (`main...origin/main`) — 사용자 지시(2026-09-11): **작업이 끝나면 묻지 말고 자동으로 커밋·push** |
| 배포 | <https://goormigrm.github.io/KLO26/> — 이번 세션 커밋 14건, 확인한 것 전부 Actions success (동시 푸시로 하나가 cancelled 된 것은 다음 것이 덮었다) |
| 작업 디렉터리 | 노트북: `C:\Users\tkdrm\Workspace\personal\KLO26` · 메인 PC: `C:\Users\tkdrm\OneDrive\Desktop\klo26` |
| 테스트 | `npm test` — **20 파일 · 136개** 통과 |

두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

### 이번 세션 커밋 (git log 참조 — 여기 중복 작성 안 함)

`bd901c5` 코인토스 → `3de4ab7` 설정 분리·공지글 → `6948e69` 원정 버그 → `241bfb3` 팀워크·영입·구단명 → `ae11a7a` 능력치 검증·패스 받기·공지 사진 → `6692898` 캡처 → `9511b99` 속도·세레모니·리플레이 → `a6f4ad9` 세레모니 카메라 → `4eb9aed` 결정력 vs GK → `09a2a98` 세트피스 시점·롱볼 → `8a03ccb` 카메라 다듬기 → `8b86abb` PK 골키퍼

---

## 지금 되는 것

| 단계 | 무엇 | 상태 |
|---|---|---|
| 1 | 실제 K리그 2026 선수 데이터 (보호명 · 1,056명 · 29구단 · **구단명은 KM26 가상 이름**) | ✅ |
| 2 | 결정론 시뮬 코어 | ✅ 해시 100/100 |
| 3 | Three.js 방송 카메라 · 찰흙 선수 · 표준 키보드 · 폰 차단 · **세트피스 키커 뒤 카메라** · **골 리플레이** | ✅ |
| 4 | 오프사이드 · 파울/카드 · 프리킥/PK · 교체 · 세트피스(**A 홀드 롱볼**) · 심판 3명 · 추가시간 · 백패스 룰 · **골 세레모니 9초(Enter 건너뛰기)** | ✅ |
| 5 | 카드·스쿼드 (급여 상한 252 · **타 구단 영입 선발 5·후보 2 · 웃돈 ×1.5** · **팀워크(뭉침+약체 가산)** · 강화 예산 · 별점 · JSON) | ✅ |
| 6 | Trystero 로비·방 · 2인 락스텝 · 해시/리싱크 · 대기실 · 홈/원정 동전 던지기 | ✅ 로컬 두 탭까지 |
| 7 | 밸런스 계측 (`verify` · `asym` · `balance` · `oneone` · `clubs` · `attrcheck` · `tactics` · `economy` · `power` · **`shots` · `stamina` · `throwin`**) | ✅ |
| — | 소리 · 테스트 모드(`?test=1`) · 입력 키 표시(설정) · 공지 사진·GIF 파이프(DEV) | ✅ |

**흐름**: 로비 → (스쿼드 수정 | 구단 바꾸기) → (혼자 하기 | 방 만들기/참가 → 대기실) → 코인토스 → 경기 → 결과.

**능력치 A/B** — 13차(200경기): 수비 83.0 · 드리블 78.8 · 슈팅 72.8 · 속도 72.3 · 골키퍼 64.3 · 패스 ~58. **14차 뒤**: 40판에서 수비 85.6 · 속도 82.5 · 드리블 73.1 · 슈팅 71.3 · 골키퍼 66.9 · 패스 51.2 · 대조군 50.0. 속도 재상승을 100판으로 확인(79.8 > 슈팅 75.3)하고 **속도 폭을 한 번 더 좁혀** 속도 74.8% · 슈팅 73.5% (DESIGN 4.8d 끝). 수비 85.6 은 13차 백로그(반응 시간 폭) 그대로. 처음엔 속도 89.8 · 태클/마크/패스/GK 49~51(안 닿음) 이었다. 표는 DESIGN 4.5a.

---

## 이번 세션에서 한 것 (7~13차)

정본은 **DECISIONS 10장 G-14 ~ G-34** 와 DESIGN 의 해당 절이다. 여기엔 다음 사람이 알아야 할 구조와 함정만 적는다.

| 차수 | 무엇 | 구조 (파일) | 정본 |
|---|---|---|---|
| 7 | 경기 중 **로비로 · ⚙ 설정 · 메뉴** 분리, 설정 패널을 로비와 공유 | `ui/settings.ts settingsPanelHtml/bindSettingsPanel` · `session.ts showSettings/confirmQuit` · `renderer3d.setShadows/setResScale` | DESIGN 7.2 · G-14/15 |
| 7 | 공지글 재작성 — 문안은 코드 블록에 (줄바꿈 보존) | `docs/공지글-모음.md` | — |
| 8 | **원정이면 선수가 안 움직이던 버그** — 입력이 0번 칸에 고정돼 있었다 | `core/input.ts soloInputs` · `tests/away_control.test.ts` | G-16 |
| 8 | 스쿼드 경제 — 영입 선발 5·후보 2, 웃돈 ×1.5, 주력 구단은 **선발 최다로 센다**(선언값 불신) | `cards/squad.ts OUT_XI_MAX/OUT_BENCH_MAX/TRANSFER_PREMIUM/homeClubOf/countOutside/payOf` · `SquadCheck.hard`(고칠 수 있는 오류는 저장 스쿼드를 안 버린다) | DESIGN 5.6a · G-17 |
| 8 | 팀컬러 → **팀워크** = 뭉침(5·7·9·11 → +1~4) + 약체 가산(전력 구간 → +0~3, 뭉쳤을 때만) | `cards/squad.ts teamworkBonus/clubHandicap` · `SquadCheck.teamwork` | DESIGN 5.6 · G-18 |
| 8 | 구단 이름 KM26 가상 이름(29개) · 구단 고르기 1부/2부 · 교체·영입 뒤 선택 해제 | `tools/build_cards.py CLUB_NAME` · `src/data/cards.json` · `ui/squad.ts drawClubs` | G-19/20/21 |
| 9 | **능력치 A/B 도구**로 검증 — 태클·마크·패스·GK 가 안 닿았다 → 넷 다 손질. 안 읽히던 wor·vis·aer·pun 도 이었다 | `tools/attrcheck.ts` · `core/ball.ts` · `core/skills.ts` · `core/ai.ts` | DESIGN 4.5a · G-22 |
| 9 | 전술 실측(라인 44→53 m) · "전술 균형" 라벨 뜻 보이게 | `tools/tactics.ts` · `render/hud.ts` | G-23 |
| 9 | 패스 받을 선수는 잡을 때까지 공 쪽으로(조작도 그 선수로, S 로 풀림) | `core/sim.ts handleInput/step` · `tests/receiver.test.ts` | DESIGN 4.8a · G-24 |
| 9 | 공 가진 선수 링+이름 · 입력 키 표시(설정 `keyView`) | `render3d/renderer3d.ts ownerRing` · `render/keyview.ts` | G-25/26 |
| 9 | 공지 사진·GIF 파이프 — DEV 서버 `/__snap` → `docs/img/`(저장소 밖). **패널이 숨겨지면 rAF 0회** → 틱에서 직접 그린다 · **paused(코인토스) 중에도** 뜬다 | `vite.config.ts snapPlugin` · `src/debug/shot.ts` · `session.ts captureTick/captureAfterDraw` | G-27 · 아래 "스크린샷 다시 뜨기" |
| 10 | **속도 지배 완화** — 폭 축소 · 드리블 속도 상한 · 체력 연속 감속 · 전력 드리블 터치 | `core/skills.ts` · `core/sim.ts` · `core/physics.ts` · `core/ball.ts` | DESIGN 4.3a · G-28 |
| 10 | **골 세레모니** 9초(`GOAL_TICKS 540`) · Enter=`BTN_SKIP`(비트 13) · 온라인은 양쪽 동의 · 세레모니 중 사람도 AI 이동 | `core/rules.ts tickPhase` · `core/ai.ts celebrate` · `Team.skipCele` · `GameState.goalScorer/goalTeam` · `tests/celebration.test.ts` | DESIGN 4.8b · G-29 |
| 10 | **골 리플레이** — 렌더 전용 링 버퍼(8초) → 직전 4.5초 0.9배속 · FOV 20. 세레모니 카메라는 **득점자**를 따라간다 | `session.ts poseBuf/recordFrame/startReplay/drawReplay` · `ViewInfo.replay` | DESIGN 4.8b · G-30 |
| 11 | **결정력이 GK 를 이기고 속도는 값을 치른다** — `ball.shotQ` · 전력 질주 슛 `rush` · 전력 드리블 뺏김 · 퍼스트 터치 · 경합 반응 시간(posn) | `core/ball.ts doShoot/gkCatch/contestBall/tryControl/interceptPoint` · `tests/finishing.test.ts` | DESIGN 4.3b · G-31 |
| 12 | **세트피스** — 직접 프리킥(골문 36 m 안)·PK 키커 뒤 카메라 · 프리킥·골킥 **A 홀드 롱볼**(18~50 m) · 배너에 골문 거리 | `renderer3d.ts spAnchor/spBlend/spHold` · `core/sim.ts`(A 홀드) · `core/rules.ts performRestartKick` · `tests/setpiece.test.ts` | DESIGN 4.8c · G-32/33 |
| 12 | PK 골키퍼는 킥 순간까지 **골라인 가운데** | `core/ai.ts gkDecide` · `core/rules.ts enforceRestartPositions` | G-34 |
| 14 | **골키퍼 선방 현실화** — 유효슛 중 골 9% → 37%. 사람 조준 2.7 m · 쳐내기를 뻗음·속도·결정력에 · 다이브 gkReach · 코앞 드리블러 공 덮치기 | `core/ball.ts aimShot/gkCatch/contestBall` · `core/ai.ts gkDecide` · `tools/shots.ts` | DESIGN 4.7 · 4.8d · G-35 |
| 14 | **교체 기회 3번 · 최대 5명 · 전술판** — `pendingSubs[]`·`subWindows`, Input 한 틱 한 명 + `SUB_CLEAR`, 데드볼에 한꺼번에(하프타임 무료). 세션 큐는 **틱당 한 번만** 꺼낸다(락스텝 첫 값) | `core/state.ts` · `core/sim.ts` · `core/rules.ts applyPendingSubs` · `game/session.ts showSubs/subQueue` · `render/hud.ts` · `tests/subs.test.ts` | DESIGN 2장 · 4.8d · G-36 |
| 14 | **체력** 경기 길이 배율 `90/halfSec` + sta 폭 — 하프타임 15 → 51% | `core/physics.ts drainStamina` · `core/sim.ts` · `tools/stamina.ts` | DESIGN 4.3 표 · G-37 |
| 14 | **스로인** 발 근처에 떨어지게(가로채기 41 → 24%) · 안쪽 30° | `core/ball.ts doThrow` · `tools/throwin.ts` | G-38 |
| 14 | 프리킥 대기 중 공격수 **오프사이드 위치 금지** | `core/rules.ts enforceRestartPositions` | DESIGN 4.9 · G-39 |
| 14 | **직접 프리킥·PK 조준 + 궤적 미리보기** — `kickerView` 가 시점 정본, `restartStick` 화면 기준(← → 코너 · ↑ ↓ 높이), `aimShot(fine)` 난수 없음 → `previewRestartKick` 이 같은 계산, 렌더 `flightPath` + 구슬 | `core/rules.ts` · `core/ball.ts` · `core/sim.ts` · `render3d/renderer3d.ts` · `game/session.ts previewAim` · `render/hud.ts` | DESIGN 3장 · 4.8d · G-40 |
| 14 | **D 압박 파울** 계수 1/3~1/4 — 파울 17.7 → 13 · 태클 16 → 26 | `core/ball.ts contestBall` | G-41 |
| 14 | **속도 폭 재축소** — 체력 완화로 속도 A/B 79.8 > 슈팅. 스프린트 소모 상향은 효과 없음(되돌림). `vmax 7.0+1.6·PAC` · `accel 5.8+2.4·acc` → 속도 74.8% | `core/skills.ts` | DESIGN 4.3 표 · 4.8d · G-42 |

### 스크린샷·GIF 다시 뜨기

개발 서버(`npm run dev`)를 켜고 브라우저 콘솔에서:

| 화면 | 명령 |
|---|---|
| 로비·스쿼드·구단 고르기 (세션 밖) | 그 화면을 띄운 뒤 `await __shot('shot_lobby.png')` |
| 경기 한 장 (HUD 포함) | 경기 중 `__klo.snap('shot_match.png')` |
| 경기 GIF (캔버스만 · 빠름) | `__klo.gif('gif_play.gif', 6, 10, 560)` 뒤 6초 동안 조작 |
| 코인토스처럼 DOM 이 든 GIF | 경기 시작 직후 `__klo.gifDom('gif_toss.gif', 4, 4, 640)` |
| 세트피스·골 장면을 억지로 | 콘솔에서 `const R = await import('/KLO26/src/core/rules.ts')` 뒤 `R.setupFreeKick(__klo.state(), 팀, x, y)` · `R.setupPenalty(__klo.state(), 팀)` — 개발 서버는 같은 모듈 인스턴스를 준다 |

- 파일은 `docs/img/` 에 떨어진다(저장소엔 안 넣는다 — `.gitignore`). 완료는 콘솔 `[snap]`/`[gif]` 또는 `window.__snapLog`.
- 브라우저 패널이 숨겨져 있어도 된다 — 틱 루프가 직접 그린다. **일시정지(코인토스) 중에도 뜬다**(`captureTick` 이 `paused` 이른 반환 **앞**). GIF 간격은 실시간(ms).
- 숨겨진 패널에선 `setTimeout` 이 1초로 늦어진다 — 캡처 모듈을 미리 `import` 해 두고, 짧은 연출은 **한 번의 콘솔 호출 안에서** 찍는다.
- 글꼴은 시스템 글꼴로 떨어진다(외부 글꼴 CDN 은 캔버스를 더럽혀 뺀다). 이모지는 그대로.
- 지금 `docs/img/` 에 사진 9장 + GIF 2개 (공지글 0장에 목록). 다른 PC 에서는 위 절차로 다시 뜬다.

---

## 성공/실패 기록

### 통한 접근

- **"반영되나"는 코드가 아니라 A/B 로 답했다.** `tools/attrcheck.ts` — 같은 두 스쿼드에서 한 묶음만 92/38, 홈원정 교대, 대조군 정확히 50%. 계수가 코드에 있어도 승률 50% 면 안 닿는 것(태클·마크·패스·GK 가 그랬다). 200경기면 3%p 를 가른다.
- **버그를 재현 테스트로 못 박았다.** 원정 정지(0.00 m → 4.38 m) · 받을 선수 도망 · 세레모니 동의 · 결정력 vs GK · 롱볼 거리 · PK 골키퍼 골라인 — 전부 `tests/` 에 있다. 계수를 만지다 되돌아가는 일이 없다.
- **연출은 시뮬에, 카메라는 렌더에.** 세레모니(모임·동의)는 두 브라우저가 같아야 하니 시뮬, 리플레이·세트피스 카메라는 화면마다 달라도 되니 렌더. 락스텝·해시를 안 건드린다.
- **실제 축구의 제동 장치를 옮겼다.** 속도는 폭을 좁혀도 81% 였고, 드리블 속도 상한·체력·전력 드리블 뺏김·불안한 슛까지 넣어야 72% 로 내려왔다.

### 실패했거나 되돌린 것

| 시도 | 왜 실패했나 | 교훈 |
|---|---|---|
| 캡처를 `frame()`(rAF) 뒤에 붙임 | 브라우저 패널이 숨겨지면 rAF 가 0회라 영영 안 불렸다 | 워커 틱에서 직접 `frame()` (교훈 61) |
| 캡처를 틱 루프 안, `paused` 검사 뒤에 둠 | 혼자 하기 코인토스는 `paused` 라 연출이 끝난 뒤에야 찍혔다 | `paused` 이른 반환 **앞**에 (교훈 66) |
| 결정력 테스트를 GK 코앞 1.6 m 로 차는 14 m 슛으로 | 누가 차도 거의 다 막혀 결과가 거꾸로 났다 | 코너를 노리는 16 m 슛 (교훈 65) |
| 속도 폭만 현실 수준으로 축소 | 81% — 아직 지배적 | 어디서 이기는지를 막아야 (교훈 63) |
| 세레모니 카메라가 공을 따라감 | 공은 골망 속, 모임은 20 m 밖이라 화면 밖 | 득점자를 따라간다 |
| 브라우저 도구의 `key` 액션으로 Esc/방향키 | 페이지에 안 닿았다 | `window.dispatchEvent(new KeyboardEvent)` (교훈 62) |
| bash heredoc 으로 큰 python 패치 | 따옴표 파싱이 깨졌다 | 스크립트는 **Write 도구로 파일에** 쓰고 실행 |
| 궤적 미리보기를 1 px `LineDashedMaterial` 로만 | 키커 뒤 시점에서 잔디에 묻혀 안 보였다 | 구슬(`InstancedMesh` 28개)을 등간격으로 얹었다 |
| 브라우저 검증 중 src 를 고침 | vite 가 전체 리로드해 `__klo` 가 사라지고 경기가 날아갔다 | 검증을 다 끝낸 뒤 src 를 만진다 |
| 프리킥 재현 뒤 응답 사이에 시간이 흐름 | 사람 킥커 대기(6.8초)가 지나 AI 가 대신 찼다 | `st.phaseT = 99999` 로 붙잡고 한 배치 안에서 찍는다 |
| 스로인 테스트에서 공을 라인 밖(34.4)에 놓음 | 첫 틱에 아웃 판정 | 손에 든 공은 라인 안쪽(33.9)에 |
| 골 강제 재현 (공만 골라인 앞에 놓기) | 골키퍼가 잡았다 | 골키퍼를 14 m 치우고 22 m/s 로 |

---

## 주요 결정 사항 (반영 위치)

| 결정 | 반영 위치 |
|---|---|
| GK 는 손 거리에서만 잡고, 그 밖은 몸을 날린다 | `ball.ts gkCatch` · `sim.ts` · `DESIGN 4.7` · `tests/feedback.test.ts` |
| 슛은 언제나 골문을 겨눈다 | `ball.ts doShoot` · `DESIGN 3.3` |
| 킥오프는 아군 짧은 패스만 | `rules.ts kickoffTarget` · `DESIGN 2장` · `tests/restart.test.ts` |
| 추가시간 1~5분 · 공이 죽었을 때 종료 | `rules.ts advanceClock` · `state.ts` · `DESIGN 2장` · `hud.ts` |
| 능력치는 별점만 (급여·능숙도는 숫자) | `cards.ts` · `ui/stars.ts` · `squad.ts` · `DESIGN 7.2` |
| 스쿼드는 JSON 파일, 코드는 P2P 전용 · 저장 슬롯 5 | `squad.ts` · `DESIGN 5.10` · `DECISIONS G-4` |
| 유니폼 단색 · 원정 전신 흰색 | `kits.ts` · `DESIGN 7.1` · `DECISIONS N-4` |
| 홈/원정은 시드에서 유도한 동전 던지기 · 경기장 홈 색 | `game/toss.ts` · `session.ts` · `waitroom.ts` · `pitch3d.ts` · `DESIGN 2·7` · `G-13` |
| 경기 중 로비로/설정 분리 · 설정 패널 공유 · Esc 는 `overlay.hidden` | `ui/settings.ts` · `session.ts` · `DESIGN 7.2` · `G-14/15` |
| 내 입력은 내 팀 칸에 (`soloInputs`) | `core/input.ts` · `session.ts` · `G-16` · `tests/away_control.test.ts` |
| 영입 선발 5·후보 2 · 웃돈 ×1.5 · 주력 구단은 선발 최다 · 고칠 수 있는 오류는 스쿼드를 안 버림 | `cards/squad.ts` · `ui/squad.ts` · `DESIGN 5.6a` · `G-17` · README · 가이드 · 공지글 |
| 팀컬러 → 팀워크(뭉침 + 약체 가산) | `cards/squad.ts` · `DESIGN 5.6` · `G-18` · 전 문서 |
| 구단 이름은 KM26 가상 이름 | `tools/build_cards.py CLUB_NAME` · `cards.json` · `G-19` · **README(13차 정정)** |
| 태클·마크·패스·GK 계수 손질 · wor/vis/aer/pun 연결 | `core/ball.ts` · `core/skills.ts` · `core/ai.ts` · `DESIGN 4.5a` · `G-22` |
| 패스 받을 선수는 공 쪽으로, S 로 풀림 | `core/sim.ts` · `DESIGN 4.8a` · `G-24` · 가이드 |
| 공지 사진·GIF 는 DEV 서버 `/__snap` → `docs/img/` (저장소 밖) | `vite.config.ts` · `src/debug/shot.ts` · `G-27` · 공지글 0장 |
| 속도 폭 +14%/+25% · 드리블 상한 6.4+0.9·drib · 체력 연속 감속 | `core/skills.ts` · `core/sim.ts` · `core/physics.ts` · **`DESIGN 4.3 표(13차 정정)` · 4.3a** · `G-28` |
| 세레모니 9초 · Enter 건너뛰기 · 온라인 양쪽 동의 | `core/rules.ts` · `core/ai.ts` · `core/state.ts` · `DESIGN 4.8b` · `G-29` · 가이드 · 공지글 |
| 리플레이는 렌더 전용 | `session.ts` · `renderer3d.ts` · `DESIGN 4.8b` · `G-30` |
| 결정력이 GK 를 이기고 속도는 값을 치른다 (`shotQ`·`rush`·반응 시간) | `core/ball.ts` · `core/state.ts` · `DESIGN 4.3b` · `G-31` · `tests/finishing.test.ts` |
| 프리킥·골킥 A 홀드 롱볼 · 직접 프리킥/PK 키커 뒤 카메라 | `core/sim.ts` · `core/rules.ts` · `renderer3d.ts` · `hud.ts` · `DESIGN 4.8c` · **`DESIGN 3장 세트피스 줄(13차 정정)`** · `G-32/33` · 가이드 |
| PK 골키퍼는 골라인 가운데 | `core/ai.ts` · `core/rules.ts` · `G-34` |
| 골키퍼 조준 2.7 m · 쳐내기 뻗음·속도·결정력 · 덮치기 | `core/ball.ts` · `core/ai.ts` · `DESIGN 4.7 · 4.8d` · `G-35` · 가이드 |
| 교체 기회 3 · 최대 5 · 전술판 · 데드볼 일괄(하프타임 무료) | `core/state.ts` · `core/sim.ts` · `core/rules.ts` · `session.ts` · `hud.ts` · `DESIGN 2장 · 4.8d` · `G-36` · README · 가이드 |
| 체력 경기 길이 배율 | `core/physics.ts` · `core/sim.ts` · `DESIGN 4.3 표` · `G-37` · 가이드 |
| 스로인 발 근처 · 안쪽 30° | `core/ball.ts` · `DESIGN 4.8d` · `G-38` |
| 프리킥 대기 중 오프사이드 위치 금지 | `core/rules.ts` · `DESIGN 4.9` · `G-39` |
| 키커 뒤 시점 화면 기준 조준 · 궤적 미리보기 (시점 정본 `kickerView`) | `core/rules.ts` · `core/ball.ts` · `renderer3d.ts` · `session.ts` · `hud.ts` · `DESIGN 3장 · 4.8d` · `G-40` · README · 가이드 |
| D 압박 파울 계수 | `core/ball.ts` · `DESIGN 4.8d` · `G-41` |
| 게임패드 개발 안 함 (백로그에도 없음) · 폰 지원 안 함 | `DESIGN 1.3 · 3.2 · 13장` · README · 첫 화면 · 공지글 |

> **결정 전파 검증 (13차 · 2026-09-11)** — 위 항목의 수치·이름을 grep 으로 전 범위 검색했다.
> 잔재 4건을 이 커밋에서 정정했다: `DESIGN 4.3 표`(옛 속도·가속 공식) · `DESIGN 3장 세트피스 줄`(A 홀드 롱볼·키커 뒤 시점 누락) · `README`(구단명 "지역명만" → 가상 이름) · `플레이 가이드 키 표`(Enter 누락). `DECISIONS N-3` 에는 G-19 로 대체됐다는 표시만 달았다(결정 기록은 과거 그대로).
> `CHANGELOG` 의 옛 차수 숫자(1,024 · 슬롯 10 · 테스트 94 등)는 **과거 기록이므로 그대로 둔다**.

---

## 다음 단계

### [미반영] — 없음

13차 검증에서 나온 잔재 4건은 이 커밋에서 정정했다. 남은 구버전 표기 없음.

### 사용자가 먼저

1. **다시 한 판** — 14차 8건(골키퍼 선방 · 교체 전술판 · 프리킥 ← → ↑ ↓ 조준과 궤적 · 체력 · 스로인 · D 파울 · 속도 폭)이 손에 맞는지. 앞선 34건도: 특히 **속도·결정력 균형(공을 몰고 전력 질주하면 뺏기는가 · 잘 찬 슛이 들어가는가)** · 세레모니/리플레이 흐름 · 세트피스 시점 · A 홀드 롱볼 · **수비가 너무 단단한가**(A/B 83%).
2. **B-1 다른 회선 두 대로 대전** — 로컬 두 탭은 통과. NAT 는 같은 PC 로 못 잡는다. (PREP B-1) 온라인에서 세레모니 양쪽 동의 흐름도 이때 본다.
3. **공개 채널 정하기** — `docs/공지글-모음.md` 문안·첨부(사진 9·GIF 2) 준비됨.

### 다음 세션

| 순위 | 작업 | 끝났다의 기준 |
|---|---|---|
| 1 | 2차 피드백 반영 | 사용자가 "됐다" |
| 2 | **강화가 값을 하게** — 수비 +2.7%p · 공격 +2.0%p (목표 8~15). 강화 +1 = 능력치 40종 +1 인데 스킬 곱셈에 묻힌다. 강화분을 스킬에 직접 얹는 안(레벨당 ×1.02)을 `attrcheck` 방식으로 재 볼 것 | `npm run verify 200` 또는 attrcheck 류에서 +8%p 이상 |
| 3 | 파울 빈도 — 14차에서 13/판(태클 26)까지 내렸다. 남은 것은 봇의 슬라이딩(`slideContest`)·GK 차징 몫. 사용자 체감이 아직 많으면 그쪽 | `npm run balance -- 120` 에서 ≤ 11 |
| 4 | 수비 묶음 83% 가 과한지 — 경합 반응 시간 폭 `0.35−0.25·posn` 을 `0.30−0.18·posn` 으로 줄여 재 본다 | `npm run attrcheck 100 def,pace,shoot` 에서 수비 ≤ 78 · 속도 ≤ 슈팅 유지 |
| 5 | 단계 8 공개 — 공지 올리기 · README 배포 상태 갱신. `docs/공지글-모음.md` 에 14차(골키퍼·교체·프리킥 조준) 문안은 **아직 없다** | 공지 게시 |

---

## 보류 / 백로그

| 항목 | 보류 사유 + 재개 조건 |
|---|---|
| **홈/원정 42.5%** (verify 200) | `asym 100` 에서 51.7% · 하프별 기울기 없음 → 잡음으로 판단. `asym 200` 이 47~53% 면 닫는다 |
| `verify 200` 이 20분 넘게 걸린다 | `attrcheck` 가 묶음별 효과를 4~5분에 잰다 — 강화 튜닝은 그쪽으로. `verify` 는 공개 전 한 번 |
| 수비 묶음 A/B 83% | 반응 시간을 posn 에 걸어 올라갔다. "조직된 수비가 이긴다"로 두었다 — 사용자가 수비가 너무 단단하다고 하면 다음 단계 4 |
| 감아차기(Z+D) · 개인기(C) · 강슈팅(F+D+D) | 스핀·개인기 애니메이션이 없다. v1 은 강슛으로 대체 |
| 게임패드 · 폰 | **하지 않는다** — 계획 제외 (사용자 결정) |
| 감독 모드 · 2v2 · 재접속/난입 · 연장·승부차기 · 로컬 전적 | DESIGN 13장 그대로 |
| Nostr 릴레이 2곳이 늘 실패 | `relay.agorist.space` · `relay.oldenburg.cool`. 다른 릴레이로 방은 잡힌다. **B-1 에서 방이 안 잡히면** 목록에서 빼고 교체 |
| `.bench` / `.bchip` CSS | 아무도 안 쓴다. CSS 정리할 때 함께 |
| 리플레이 각도 하나뿐 | 방송 카메라를 바짝 당긴 것. 골 뒤 카메라 등은 렌더 전용이라 언제든 더할 수 있다 — 사용자가 원하면 |
| 세레모니 동작 | 모이기만 한다(팔 들기 등 애니메이션 없음). 리그 애니메이션이 생기면 |

---

## 주의사항 & 교훈

앞 세션 것(1~41)은 그대로 유효하다. 이번 세션에 더한 것 (42~66):

42. **짧은 CSS 클래스 이름은 반드시 `grep` 하고 짓는다.** `.mini` 를 로비 급여 게이지에 쓴 다음 날 선수 목록 막대에도 붙여 게이지가 24px 로 쪼그라들었다. 화면 접두어(`sq-`·`lobby-`)를 붙이는 편이 안전하다.
43. **`width: %` 로 덮는 별점은 span 폭이 글자 폭이어야 한다.** 그리드/플렉스 칸에서 늘어나면 덮개가 별 다섯을 다 덮어 전부 만점처럼 보인다. `.stars { width: max-content }`.
44. **"닿을 수 있는 거리"와 "손이 닿는 거리"는 다르다.** 도달 가능 반경 안이면 그 자리에서 잡게 하면 공이 순간이동한다. 몸을 **먼저 옮기고** 손 거리에서만 잡아야 한다.
45. **사람 조작 보조는 "절대 골문 밖을 조준하지 않는다"가 기본값**이어야 한다. 방향키는 코너 선택으로만 쓴다.
46. **하프 종료는 시계가 아니라 데드볼로 끝낸다.** 유예(20초)를 두되 무한히 기다리지 않는다.
47. **KM26 문서(`../km/docs`)의 줄 번호는 우리 `index.html` 과 다르다.** **함수 이름으로 grep** 할 것.
48. **Read 도구가 "unchanged since last Read" 라고 잘못 볼 때가 있다** (다른 PC 커밋을 pull 한 직후). `cat -n` 으로 읽으면 된다.
49. **PowerShell 에서 python heredoc 은 한글·이모지에서 깨진다** (`cp949`). 스크립트를 **파일로 써서** 실행할 것. bash heredoc 도 큰 스크립트는 따옴표 파싱이 깨진다 — **Write 도구로 파일에 쓰고 실행**.
50. 입력을 화면에 보여 주는 것(방향 표시)은 **렌더가 `team.inX/inY` 를 읽으면 된다** — sim 에 아무것도 더하지 않는다.
51. **온라인에서는 `paused` 로 "창이 떠 있나"를 판단하면 안 된다.** 락스텝이라 온라인은 언제나 `paused === false`. 창 상태는 `overlay.hidden` 처럼 화면 자체에서 읽는다.
52. **Three.js 에서 `shadowMap.enabled` 를 껐다 켜면 재질을 전부 `needsUpdate` 해야 한다.**
53. **같은 설정을 두 곳에서 보여 줄 때는 HTML 생성 함수를 공유하고, 반영은 `hooks` 로 주입한다.**
54. **마크다운 문서에 붙여 넣을 문안은 코드 블록에 넣는다.** 줄바꿈 하나는 렌더링에서 공백이 된다.
55. **팀이 뒤집힐 수 있게 만들었으면 "팀 번호를 박아 둔 곳"을 전부 grep 한다.** `meTeam` 을 도입하고도 `inputs = [inp, EMPTY_INPUT]` 한 줄이 남아 원정이면 선수가 얼어붙었다. **배선은 순수 함수로 빼면 테스트가 잡는다**.
56. **"상한 하나로 두 가지 일을 시킬 수 없다."** 급여 상한은 약한 구단도 자기 팀을 짤 수 있게 낮으면 안 되고, 올스타 팀을 못 사게 높으면 안 된다. 부딪히면 **다른 축**(인원 제한·웃돈)을 만든다.
57. **P2P 에서 상대가 보낸 값으로 규칙을 재지 않는다.** 주력 구단은 선언값이 아니라 **세어서**(선발 최다) 정한다.
58. **규칙을 새로 넣을 때 저장된 데이터를 말없이 버리지 않는다.** 고칠 수 있는 문제(soft)와 못 고치는 문제(hard)를 나눈다.
59. **"능력치가 반영되나"는 코드를 읽어서 답하지 말고 A/B 로 잰다.** 같은 스쿼드·홈원정 교대·대조군이면 200경기로 3%p 를 가른다.
60. **"닿는다"를 만들려면 빈도부터 본다.** 태클 성공식을 키워도 판에 5번이면 승률이 안 움직인다 — 기회(닿는 거리)를 늘린다. 패스는 각도가 아니라 세기가 죽는 이유였다.
61. **브라우저 패널이 숨겨지면 rAF 가 0회다.** 그리기 뒤에 붙인 캡처·계측은 영영 안 불린다(시뮬은 워커 타이머라 계속 돈다). 워커 틱에서 직접 `frame()` 을 부른다.
62. **자동화 환경에서 게임 키는 `window.dispatchEvent(new KeyboardEvent)` 로 넣는다.** 브라우저 도구의 `key` 액션은 페이지에 안 닿았다.
63. **"너무 세다"는 폭을 줄이는 것만으로 안 끝난다.** 속도가 **어디서** 이기는지(공 몰고 달리기·지치지 않음)를 막아야 했다. 실제 축구의 제동 장치를 옮겨 오는 게 답이었다.
64. **연출은 시뮬에, 카메라는 렌더에.** 두 브라우저가 같아야 하는 것(세레모니·동의)만 시뮬에, 화면마다 달라도 되는 것(리플레이·세트피스 카메라)은 렌더에.
65. **"검증 장면"은 능력치가 갈릴 자리에 놓는다.** 골키퍼 코앞 1.6 m 로 차는 슛은 누가 차도 막힌다. 코너를 노리는 16 m 슛으로 바꾸니 결정력 차이가 그대로 드러났다.
66. **숨겨진 패널에서는 `setTimeout` 이 1초 단위로 늦어진다.** 짧은 연출(코인토스 3초)은 툴 호출 사이에 지나가 버린다 — 캡처 모듈을 미리 불러 두고 **한 번의 콘솔 호출 안에서** 시작부터 찍기까지 끝낸다. 캡처는 `paused` 이른 반환 **앞**에.

---

## 중요 파일 맵

| 경로 | 역할 |
|---|---|
| `docs/DESIGN.md` | **설계서 정본** — 이번 세션에 4.3a/4.3b(속도·결정력) · 4.5a(능력치 A/B 표) · 4.8a/b/c(패스 받기·세레모니/리플레이·세트피스) · 5.6/5.6a(팀워크·영입) · 7.2 가 바뀜 |
| `docs/DECISIONS.md` | **9장 F-1~F-11**(엔진 제보) · **10장 G-1~G-34**(스쿼드 화면·유니폼·코인토스·설정·영입·팀워크·구단명·검증·세레모니·리플레이·속도·결정력·세트피스) |
| `docs/PREP.md` | 사용자가 직접 할 것 — **B-1 다른 회선 대전**만 남음 |
| `docs/플레이-가이드.md` | 처음 하는 사람용 (키 표 · 세트피스 키 · 세레모니 · 스쿼드 · 온라인) |
| `docs/공지글-모음.md` | 공개 문안 — 0장 첨부(사진 9·GIF 2) · 긴 문안 · 짧은 문안 · 댓글 상투구 · 2차 틀 · **고치기 전 확인 표** |
| `src/core/skills.ts` | 능력치 → 경기 스킬. **속도 `6.8+2.0·PAC` · 가속 `5.5+3.0·acc`** · GK 반응/도달 폭 · `gkPunch` |
| `src/core/ball.ts` | 소유·태클(`loose`)·패스(세기 오차)·슛(`rush`·`shotQ`)·GK(`shotQ` 반영)·요격(반응 시간) |
| `src/core/rules.ts` | 킥오프·아웃·프리킥·PK(골키퍼 골라인)·리스타트 킥(**A 홀드 롱볼**)·`tickPhase`(세레모니 동의)·추가시간 |
| `src/core/sim.ts` | createState / step / hashState · 사람 입력(받을 선수 자동 달리기 · 드리블 속도 상한 · A/D 홀드 · `BTN_SKIP`) |
| `src/core/ai.ts` | 팀 AI · `celebrate` · `gkDecide`(PK 골라인) · 시야(vis) 패스 상대 고르기 |
| `src/core/state.ts` | 상수·타입 (`GOAL_TICKS 540` · `GOAL_SKIP_TICKS 30` · `Ball.shotQ` · `Team.skipCele` · `goalScorer/goalTeam`) |
| `src/core/input.ts` | 입력 비트(`BTN_SKIP = 1<<13`) · `soloInputs` |
| `src/cards/squad.ts` | 급여 상한 · **영입 제한·웃돈·주력 구단** · **팀워크·약체 가산** · `SquadCheck.hard` |
| `src/ui/squad.ts` | 스쿼드 화면 전부 (게이지 4개 · 명단 표 · 자동 채우기 · JSON · 구단 고르기 1부/2부) |
| `src/ui/settings.ts` | 설정 값 + 로비·경기 공용 패널 (`keyView` 포함) |
| `src/game/session.ts` | 경기 진행 · 오버레이 · **리플레이 링 버퍼** · **캡처 훅**(`__klo.snap/gif/gifDom/frameNow`) |
| `src/render3d/renderer3d.ts` | 방송 카메라 · 방향 표시 · 공 가진 선수 링 · **세레모니 카메라(득점자)** · **세트피스 카메라** · 리플레이 FOV |
| `src/render/hud.ts` | 전광판 · 배너(골 세레모니/리플레이/상대 대기 · 프리킥 골문 거리) · 전술 라벨 |
| `src/render/keyview.ts` | 입력 키 표시 (설정으로 켜고 끔 · Enter 포함) |
| `src/debug/shot.ts` | 공지 사진·GIF — DOM+캔버스 PNG · GIF89a 인코더 (DEV 전용, 배포 번들 없음) |
| `vite.config.ts` | `snapPlugin`(`POST /__snap` → `docs/img/`) · `watch.ignored docs/img` |
| `tools/attrcheck.ts` | **능력치 묶음별 A/B** (`npm run attrcheck [N] [묶음,…]`) |
| `tools/tactics.ts` · `tools/economy.ts` · `tools/power.ts` | 전술 실측 · 급여/영입 경제 · 구단 전력 |
| `tests/*.test.ts` | 18 파일 121개 — 이번 세션: `away_control` · `signings` · `receiver` · `celebration` · `finishing` · `setpiece` |

### 재현 명령

```bash
npm install
npm test               # 18 파일 · 121개
npm run build
npm run dev            # http://localhost:5175/KLO26/
npm run attrcheck 100 pace,shoot,def,drib,gk   # 능력치 묶음별 A/B (묶음 생략 = 전부, 약 10분)
npm run tactics        # 전술 프리셋별 라인 높이
npm run economy        # 구단별 최강 선발·영입 경제
npm run power          # 구단 전력 (약체 가산 구간)
npm run verify 200     # 단계 7 검증 (20분 이상 — 표본을 줄이지 말 것)
npm run asym 100       # 홈/원정 비대칭 진단
npm run balance -- 120
npm run oneone 400 14  # 1대1 전환율
npm run cards          # 카드 OVR 보정 · 급여 상한
npm run clubs 90       # 실제 구단끼리 계측
npm run build:cards    # 원본 명단 → src/data/cards.json (원본은 저장소 밖 · CLUB_NAME 표가 구단명)
```

원본 명단 갱신 절차(KM26 → KMD26 도구 → `build_cards.py`)와 그때 걸리는 함정 둘은 **CHANGELOG 2026-09-09 항목**에 그대로 있다.

브라우저 콘솔에서 `__klo.state()` · `__klo.hashes()` · `__klo.net()` · `__klo.snd()` · `__klo.frameNow()`(숨겨진 패널에서 한 장 그리기) · 캡처는 위 "스크린샷·GIF 다시 뜨기".
**테스트 모드**: `http://localhost:5175/KLO26/?test=1` (AI 대 AI 관전 · 키 입력 표시).

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
