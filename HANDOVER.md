# HANDOVER — 2026-09-23 (30차)

> **이 문서가 최신입니다.** 단계 1~7 이 전부 들어가 있고, 2026-09-10~11 에 사용자가 직접 해 보고 낸 **제보·요청 42건**을 반영했습니다.
> 14차(11일 오후)는 **골키퍼 선방 현실화 → 교체 5명/3회 전술판 → 체력 → 스로인 → 프리킥 오프사이드·조준·궤적 → D 압박 파울** 이었습니다. 체력 완화로 속도 A/B 가 다시 올라간 것(79.8)도 **속도 폭 재축소**로 잡았습니다. 이제부터 **커밋·push 는 자동**입니다(사용자 지시).
> **9/15 (16~25차)**: FC 온라인 벤치마크 계획서 → **실사 캐릭터 파이프라인**(glTF 스킨드 메시, `npm run char:build`, 사용자가 받은 Mixamo Ch38 적용) → P0 화면 인상 → P3 엔진 움직임 → 헤딩 → 락 음악 2곡 → P4 연출 → 저녁 제보 11건(GK 조작·시선·세트피스 배치·마킹·스루·크로스) → **25차: 팀 전술 7종 · 개인 전술(역할) · 세레모니 3종**(사용자 12·3번 — 저녁 목록 13건 전부 끝) → 26차 실사 T포즈·루트 모션 수정 → **27차: 실사 그래픽 삭제(사용자 결정, 찰흙만) · 뒤에서 오는 태클 규칙 · 요구사항 재검증**.
> **9/16 (28차, 노트북)**: 15차 [미반영] 네 줄 전부 닫음 · **공격 프리셋 뒤집힘 수정**(템포 분리·빌드업/수비 방식 2 → 슛 4.8 → 9.1) · 계측 셋(봇 120판 · 전술 변형 · **대칭 180판 홈 41%** — 새 조사 항목 0-e).
> **9/16 (29차, 노트북)**: **홈/원정 기울기 원인 찾아 수정** — 좌표·킥오프가 아니라 `step` 의 **팀 번호에 붙은 순서 셋**(결정이 이동 루프 안 · 팀 0 이 늘 먼저 결정 · 결정 주기 오프셋이 idx). 결정 → 이동 두 단계, 결정은 공 가진 팀부터, 주기는 자리 번호로. **2,000판 47.1% → 50.5%**(골 1.91 · 1.91). `tools/asymprobe.ts` · `tests/asym_order.test.ts`. G-54.
> **9/23 (30차, 노트북)**: **💬 대기실·경기 중 채팅**(bedorage-rpg 에서 옮김 · 경기 중은 T) · 남은 할 일 재측정 — **강화는 이미 값을 한다**(고르게 +10.8%p, G-64) · 파울 6.3/판 · 대칭 500판 49.9% · 방 흐름 테스트 8개.
> 남은 것은 **다른 회선 두 대 실제 대전**(PREP B-1 — 이때 채팅도 본다), 2차 피드백, 그리고 공개입니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-16 (28차 오전 · 29차 홈/원정 — 직전 27차: 09-15 실사 삭제·뒤 태클·재검증 / 14~26차: 09-11~15 메인 PC) |
| 저장소 · 브랜치 | `https://github.com/goormigrm/KLO26` · `main` |
| 마지막 커밋 | 29차 — 홈/원정 기울기 원인·수정 (`git log -1`). 그 앞 `8f479fe` 28차 HANDOVER 정정 · `b18f94d` 28차 |
| git 상태 | **클린** (`main...origin/main`) — 사용자 지시(2026-09-11): **작업이 끝나면 묻지 말고 자동으로 커밋·push** |
| 배포 | <https://goormigrm.github.io/KLO26/> — 이번 세션 커밋 14건, 확인한 것 전부 Actions success (동시 푸시로 하나가 cancelled 된 것은 다음 것이 덮었다) |
| 작업 디렉터리 | 노트북: `C:\Users\tkdrm\Workspace\personal\KLO26` · 메인 PC: `C:\Users\tkdrm\OneDrive\Desktop\klo26` |
| 테스트 | `npm test` — **28 파일 · 179개** 전부 통과 (skip 0). 계측을 같이 돌리는 중엔 5초 기본 타임아웃에 걸리는 테스트가 있어 긴 것들은 60초를 줬다 |

두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

### 이번 세션 커밋 (git log 참조 — 여기 중복 작성 안 함)

7~13차(9/11 노트북): `bd901c5` 코인토스 … `8b86abb` PK 골키퍼 → `8ae6fa3` HANDOVER 13차.
14~27차(9/11~15 메인 PC): `0112eb0` GK 선방·교체·프리킥 → `d6a9684` 15차 중간 → `ecd52b7` 계획서 → `21df3b7`·`fc485e9` 실사 파이프라인 → `57f4546` P0 화면 → `7cd0add`·`782d89d` P3 움직임 → `71afc3e` 헤딩 → `949340b` 락 음악 → `a76b4a8` P4 연출 → `cf408fa` GK 키·마킹·크로스 → `e76c1bb` 팀·개인 전술 → `c1a8f27` 실사 수정 → `959d20e` 실사 삭제 → `cdda5c1` 뒤 태클 → `e73579d` 재검증.
28차(9/16 노트북): `b18f94d` 15차 마무리·프리셋·계측 → `8f479fe` HANDOVER 정정.
29차(9/16 노트북): 홈/원정 기울기 원인·수정 (`git log -1`).

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

## 이번 세션에서 한 것 (7~28차)

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
| 15 | **패스 방향** — 방향키 놓은 뒤 0.25초는 마지막 방향(`Team.aimX/aimY/aimT`) · 후보 점수 각도 절반 + 거리 −0.035/m | `core/sim.ts handleInput` · `core/ball.ts pickPassTarget` | G-43 · CHANGELOG (DESIGN 4.5 미반영) |
| 15 | **D 압박** — 소유자 0.35초 뒤 자리 · 방향키 25% · 자동 전력질주 | `core/sim.ts step` | G-44 (DESIGN 3.1 미반영) |
| 15 | **전력질주 모션** `AnimInput.sprint` | `render3d/player3d.ts` · `renderer3d.ts animOf(p, fr, st)` | G-45 (브라우저 미확인) |
| 15 | **GK 다이브 뒤 `ACT_FALLEN` 30틱** — 못 잡고 몸에 맞은 공만 튕김 · 렌더 `rig.wasDive` | `core/sim.ts` · `core/ball.ts gkCatch` · `player3d.ts` | G-46 (DESIGN 4.7 미반영 · 브라우저 미확인) |
| 16 (9/15) | **개발 계획서** — FC 온라인 대회 영상(FSL SUMMER wonder08 vs Exito) 정지 화면 분석 → 엔진·화면 차이표·로드맵·실사 캐릭터 옵션(Mixamo 권장)·라이선스 확인 | `docs/개발계획-FC온라인-벤치마크.md` | CHANGELOG 9/15 |
| 27 (9/15) | **실사 그래픽 삭제** (G-49) · **뒤에서 오는 태클**(G-50, `fromBehind` 뒤집힘 버그) · **요구사항 재검증** `npm run audit`(G-51): 세트피스 5초 대기(`BOX_SETPIECE_TICKS`), 하프타임 GK 차징 통계 버그, 크로스 박스 침투(45 m·4자리·마커 후퇴·수비 전력 복귀), 시선 회전 ×0.9 | `core/ball.ts` · `core/ai.ts` · `core/rules.ts` · `core/sim.ts` · `tools/audit.ts` · `tools/foulprobe.ts` · `tools/crossprobe.ts` · `tests/tackle_behind.test.ts` | CHANGELOG 9/15 ×3 · DESIGN 4.8 · 4.9 · 7.2 · DECISIONS G-49~51 · 가이드 |
| 28 (9/16) | **15차 [미반영] 마무리**(D 압박 테스트 켬 — 원인은 가속 · 전력질주/GK FALLEN 브라우저 확인 · DESIGN 4.8e·가이드) · **공격 프리셋 뒤집힘 수정**(템포 세 벌 2, 공격 빌드업·수비 방식 2 — 슛 4.8 → 9.1) · `tools/tactics.ts` 임의 프리셋 인자 · 계측(봇 120판 · 대칭 180판 홈 41%) | `core/tactics.ts defaultPresets` · `tools/tactics.ts` · `tests/feedback_0911b.test.ts` · `tests/tactics.test.ts` | CHANGELOG 9/16 · DESIGN 4.8e · 4.10b · DECISIONS G-52/G-53 |
| 30 (9/23) | **💬 채팅** — 대기실 붙박이(다시 그리는 상자 밖) · 경기 중 T(Enter 는 건너뛰기라서) · 대기실 대화가 경기로 이어짐 · 피어 id 로 보낸 사람 가림 · `cleanChat`. **재측정** — 강화 이미 목표 안(`enhcheck` 새 도구) · 파울 6.3 · 대칭 49.9% · `balance swap`(75:19 는 전력 차). **방 흐름 테스트** 8개(준비 판단을 `cards/confirm.ts` 순수 함수로 · HostRoom 인계 뒤 무응답) | `ui/chat.ts` · `ui/waitroom.ts` · `game/session.ts` · `net/room.ts` · `cards/confirm.ts` · `tools/enhcheck.ts` · `tools/balance.ts` · `tests/chat.test.ts` · `tests/room_flow.test.ts` | CHANGELOG 9/23 · DESIGN 6.3 · 12장 · DECISIONS G-63·G-64 · 가이드 2·5장 |
| 29 (9/16, 밤) | **🚪 방을 열어 두고 로비에 남는다** — 방 만들기가 연결만 열고(`HostRoom`, 화면 밖에 두어 스쿼드 수정 중에도 유지), 내 방이 목록 아래 카드로 보이고, 상대가 들어오면 알림("저장하고 대기실로 / 조금 더 준비하기"). **스쿼드는 준비를 누를 때 확정**(대기실이 `getSquad()` 를 받는다). 대기실은 열린 연결을 이어받고 `HostRoom` 은 넘긴 뒤 콜백을 무시한다. 두 탭에서 1500틱까지 해시 일치 | `net/hostroom.ts` · `ui/waitroom.ts` · `main.ts` · `ui/lobby.ts setHosting` · `ui/squad.ts save` | CHANGELOG 9/16 🚪 · DESIGN 6.3 · DECISIONS G-62 · 가이드 5장 |
| 29 (9/16, 저녁) | **🗣 중계 음성**(브라우저 내장 TTS · 하이라이트만 · 남성 없으면 피치 0.55) · **🏟 경기 중 음악 제거**(관중 층: 함성·숨쉬기·박수·휘파람·탄성·응원가) · **🎥 세트피스 카메라**(차는 순간 즉시 복귀 · 13~14 m 뒤·5.2 m 높이·화각 44/36) · **🖥 설정/Esc 메뉴 세로 배치**(창 폭·스크롤·z-index) · **🎬 영상에 UI 합성**(투명 DOM 한 장을 0.2초마다) · 첨부 1080p 재촬영 · 공지글을 게임 소개 글로 | `audio/tts.ts` · `audio/sfx.ts` · `render3d/renderer3d.ts` · `ui/settings.ts` · `ui/style.css` · `debug/shot.ts` · `game/session.ts` | CHANGELOG 9/16 🗣 · DESIGN 7.2a · 7.3 · DECISIONS G-56~G-60 · 가이드 6장 |
| 29 (9/16, 오후) | **💸 급여 비우기**(사용자: 센 팀이 자기 선수를 팔고 영입할 수 있나 → 판매 개념 없이 빼면 급여가 돌아옴을 버튼으로: 후보 급여 비우기 · 싼 선수로 바꾸기, 울산 239 → 211/252) · **공지글 1차 문안을 패치노트 꼴로 다시 씀**(큰 제목 이모지·한 줄 설명·`*` 항목, 14~29차 반영) · **webm 녹화**(`__klo.webm`, vite `/__snap` 이 webm·mp4 허용) · 첨부 캡처를 1920×1080 으로 다시 뜸(아래 0장) · 원본 명단 확인(갱신 없음) | `ui/squad.ts cheapBench/cheapReplace/cheapestFor` · `debug/shot.ts recordCanvas` · `game/session.ts startWebm` · `vite.config.ts` · `docs/공지글-모음.md` | CHANGELOG 9/16 · DECISIONS G-55 · DESIGN 5.6a · 가이드 4장 |
| 29 (9/16) | **홈/원정 기울기 (0-e) 원인·수정** — `asymprobe` 로 진영·킥오프를 바꿔도 팀 1 이 이겨 **팀 번호 편향**으로 확정 → `step` 을 **결정(공 가진 팀부터 · 자리 번호 주기) → 이동** 두 단계로. 2,000판 47.1% → 50.5%. 체력 테스트 다섯 시드 합산 · 긴 테스트 60초 타임아웃 | `core/sim.ts step` · `core/state.ts DECIDE_TICKS` · `tools/asymprobe.ts` · `tests/asym_order.test.ts` · `tests/feedback_0911.test.ts` | CHANGELOG 9/16 ⚖️ · DESIGN 4.10 결정 순서 · 4.12-5 · 4.14 · 12장 · DECISIONS G-54 · README 도구 표 |
| 26 (9/15) | **실사 캐릭터 "난리" 수정** — T포즈(같은 클립 두 액션 → run 복제), 루트 모션 제거(`stripRootMotion`, 빌드 도구도), 뼈 이름 정규식(`mixamorig5…`), 킥·패스 클립을 차는 순간(`strikeTime`) 앞에서 제 속도로. `__klo.renderer()` · `tools/char/inspect.mjs` | `render3d/playerReal.ts` · `tools/char/build.mjs` · `tools/char/inspect.mjs` · `game/session.ts` | CHANGELOG 9/15 · 캐릭터-교체-절차 2·4 · DESIGN 7.2 |
| 25 (9/15) | **팀 전술 7종 · 개인 전술 · 세레모니 3종** — `core/tactics.ts`(TEAM_TACTICS · ROLES · roleTraits · defaultPresets · normalizeSliders), `Sliders` 에 tempo/buildup/defStyle, `Player.role/rt`, `SquadConfig.roles`, ai.ts(앵커 fwd/back/wide · run · box · hold · drop · 템포 · 빌드업 · 수비 방식 · 세트피스 인원), ball.ts gkDistribute(빌드업), 스쿼드 코드 v2(386비트), 스쿼드 화면 전술 패널·역할 상자, 세레모니 `celeStyle` + 리플레이 억제 | `core/tactics.ts` · `core/state.ts` · `core/sim.ts` · `core/ai.ts` · `core/ball.ts` · `cards/squad.ts` · `cards/squadcode.ts` · `ui/squad.ts` · `ui/style.css` · `render3d/renderer3d.ts` · `player3d.ts` · `playerReal.ts` · `tests/tactics.test.ts` | CHANGELOG 9/15 · DESIGN 4.10a · 5.8 · 5.9 · DECISIONS G-47·48 · 가이드 3·4 |
| 24 (9/15) | **저녁 제보 11건** — GK 전용 키(D 펀트·A 던지기·S 패스·0.5 s 자동 배급), GK 배급 패스 길 검사, 공 바라보기, 광고판 회전 순서, 스루 목표·세기·오차, 박스 침투(사이드 크로스), 하이 크로스 머리 위 낙하, 대인마킹 골사이드(`markOf`)·커버 골문 쪽, 세트피스 배치(`setPieceAttack/Defend` — 박스 여섯 자리·벽·대인), Ch38 캐릭터(부위별 킷·킥/패스 클립·walk 대체) | `core/sim.ts` · `core/ball.ts` · `core/ai.ts` · `core/state.ts` · `render3d/pitch3d.ts` · `playerReal.ts` · `tools/char/build.mjs` · `public/models/player.glb` | CHANGELOG 9/15 · DESIGN 3.1 · 4.5 · 4.7 · 4.10 · 가이드 |
| 23 (9/15) | **P4 연출** — 리플레이 골문 뒤 → 측면 컷(`ViewInfo.replayCam`), 골망 출렁임(`Pitch3D.netHit/update`), 하프타임 통계(`session.showHalfStats/statsTable`), 세레모니 FOV 19 | `render3d/renderer3d.ts` · `pitch3d.ts` · `game/session.ts` | CHANGELOG 9/15 · DESIGN 4.8b |
| 22 (9/15) | **락 배경음악 2곡 + 관중 응원** — `Sfx.startMusic('lobby'|'match')` 16분음표 시퀀서(드럼·베이스·디스토션 파워코드·리드), `chant()` 북·박수, 슛 swell. 경기 중에도 음악(작게) | `audio/sfx.ts` · `game/session.ts` | CHANGELOG 9/15 · DESIGN 7.3 |
| 21 (9/15) | **헤딩** — `ACT_HEAD`, `ball.ts tryHeader`(사람 D/S/A · AI 위치), 공중볼 머리 판정(2.45 m, 몸 중심 반경), `markOnTarget` 공유, 렌더 점프 | `core/state.ts` · `core/sim.ts` · `core/ball.ts` · `player3d.ts` · `playerReal.ts` · `render/hud.ts` · `tests/header.test.ts` | CHANGELOG 9/15 · DESIGN 3.1 · 4.6 |
| 20 (9/15) | **P3 엔진 움직임** — 침투 러닝(`ai.ts` `ot === ti` 분기, 지원 러닝보다 먼저 · `Player.runT` · 소유자 스루 선호), GK 다이브 2종(`gkCatch` 경로 높이 예측 → `diveHigh`, 뻗음 보정), 태클 넘어짐(`contestBall` 확률 · `slideContest` 항상). 봇 30판 골 3.7 · 파울 8.2 · 태클 21.3 · 패스 44% (넘어짐 완화 뒤 — 항상 넘어지게 했을 땐 파울 19.7) | `core/ai.ts` · `core/ball.ts` · `core/state.ts` · `core/sim.ts` · `player3d.ts` · `playerReal.ts` · `tests/p3_movement.test.ts` | CHANGELOG 9/15 · DESIGN 4.7 · 4.8 · 4.10 |
| 19 (9/15) | **P0 화면 인상** — 카메라 32/24 + 낮은 컷(`CamTarget.near`), 그림자 공 주변, 잔디 격자, 광고판·2단 관중석(카메라 쪽 1단), 팀색 삼각형+이름, 도움 표시 설정, 발밑 파워 바, 스코어보드 좌상단, 레이더 반투명, 배너 접기. 실사 모션: 모델 180°, 뼈 월드 겨누기(`aimBone`), 세레모니 | `render3d/camera.ts` · `pitch3d.ts` · `renderer3d.ts` · `playerReal.ts` · `player3d.ts` · `render/hud.ts` · `radar.ts` · `ui/settings.ts` · `style.css` | CHANGELOG 9/15 · DESIGN 7.1 |
| 18 (9/15) | **P1-b 변환 도구** `tools/char/build.mjs` — fbx2gltf + @gltf-transform, 파일 이름 = 클립 이름, 뼈 이름 이식, 스킨 보존 양자화. Samba 샘플 검증 | `tools/char/build.mjs` · `package.json char:build` · devDeps | `docs/캐릭터-교체-절차.md` 3장 |
| 17 (9/15) | **실사 선수 그래픽 P1-a** — `Rig` 인터페이스로 찰흙/실사 통일, `playerReal.ts`(GLTF · SkeletonUtils.clone · AnimationMixer · 유니폼 텍스처 물들이기 · 절차적 덧씌우기), 설정 "선수 그래픽", 로비 preload, 그림자맵 2048. 임시 캐릭터 Soldier | `src/render3d/playerReal.ts` · `player3d.ts Rig` · `renderer3d.ts makeRig/setCharacterLib/setGraphics` · `ui/settings.ts` · `game/session.ts ensureCharacter` · `ui/lobby.ts` · `public/models/player.glb` | CHANGELOG 9/15 · DESIGN 7.1 · `docs/캐릭터-교체-절차.md` |

### 스크린샷·GIF 다시 뜨기

개발 서버(`npm run dev`)를 켜고 브라우저 콘솔에서:

| 화면 | 명령 |
|---|---|
| 로비·스쿼드·구단 고르기 (세션 밖) | 그 화면을 띄운 뒤 `await __shot('shot_lobby.png')` |
| 경기 한 장 (HUD 포함) | 경기 중 `__klo.snap('shot_match.png')` |
| 경기 GIF (캔버스만 · 빠름) | `__klo.gif('gif_play.gif', 6, 10, 560)` 뒤 6초 동안 조작 |
| **경기 영상 webm (UI 포함 · 2026-09-16)** | `__klo.webm('vid_play.webm', 15, 30, 6)` — 초 · fps · Mbps · ui(기본 true). 게시판이 mp4·webm 을 파일당 40 MB 까지 받아 움직이는 장면은 GIF 대신 이걸로. **UI 는 투명하게 뜬 DOM 한 장(약 25 ms)을 0.2초마다 갱신해 얹는다** — 다섯 번째 인자를 `false` 로 주면 캔버스만. 완료는 `[webm]` 로그 |
| 코인토스처럼 DOM 이 든 GIF | 경기 시작 직후 `__klo.gifDom('gif_toss.gif', 4, 4, 640)` |
| 세트피스·골 장면을 억지로 | 콘솔에서 `const R = await import('/KLO26/src/core/rules.ts')` 뒤 `R.setupFreeKick(__klo.state(), 팀, x, y)` · `R.setupPenalty(__klo.state(), 팀)` — 개발 서버는 같은 모듈 인스턴스를 준다 |

- 파일은 `docs/img/` 에 떨어진다(저장소엔 안 넣는다 — `.gitignore`). 완료는 콘솔 `[snap]`/`[gif]`/`[webm]` 또는 `window.__snapLog`.
- **(29차, 2026-09-16) 브라우저 도구로 전부 다시 뜬 절차** — 개발 서버는 `/KLO26/` 밑이라 모듈은 `import(location.pathname.replace(/[^/]*$/,'') + 'src/core/rules.ts')`. 뷰포트를 1920×1080 으로(`resize_window`) 두면 PNG·webm 이 1080p 로 나온다. 화면 클릭은 좌표가 어긋나므로 **`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('…')).click()`** 로.
  - 로비·스쿼드·구단·팀 전술: `await __shot('이름.png', 1)` (스쿼드에서 선발 자리 버튼을 누르면 역할 상자가 뜬다).
  - 코인토스: 혼자 하기 `경기 시작` 클릭 직후 같은 호출 안에서 `__klo` 를 기다렸다가 `gifDom('gif_toss.gif',4,4,640)` + 1.2 초 뒤 `snap`.
  - 교체판: `Escape` 키 → 오버레이 `🔁 교체` 클릭 → `snap` → `돌아가기` → `계속`.
  - **키커 뒤 시점·궤적은 프레임을 직접 돌려야 나온다** — 패널이 가려져 rAF 가 0회면 카메라 블렌드(`spBlend`)가 안 움직인다. `setupFreeKick/Penalty` → `phaseT=99999` → 키 `keydown` → `for(100){ __klo.frameNow(); await sleep(16) }` → `snap` → `keyup`. **프리킥 미리보기는 방향키도 눌러야**(`previewRestartKick` 은 stick 이 0 이면 null) — `ArrowUp`+`KeyD`. PK 는 D 만.
  - 리플레이·세레모니: 골 직후 `frameNow` 루프로 프레임을 돌리며 `phaseT` 를 보고 찍는다 — 리플레이는 `phaseT` 540~250(골문 뒤 → 측면), 세레모니는 190 아래. 툴 호출 사이의 지연(수 초)을 믿지 말고 **한 호출 안에서** 루프로 맞춘다.
  - 영상: `__klo.webm('vid_goal.webm', 12, 30, 5)` 를 킥 직전에, 플레이 영상은 테스트 모드(`?test=1` → `TEST` → `시작`, AI 대 AI)에서 `__klo.webm('vid_play.webm', 15, 30, 5)`. 1080p 30fps 5 Mbps 로 12초 5.2 MB · 15초 5.9 MB.
  - 골 강제: 상대 GK 를 `dir*38, 20` 으로 치우고 공을 `dir*40` 에서 `vx = dir*22` 로 (shotBy·lastTouch 를 우리 FW 로).
  - 결과 목록·크기·캡션은 `docs/공지글-모음.md` 0장 표. 첨부 규칙(총 50 MB · 영상 12개·40 MB)도 거기.
- **(29차 저녁) 1080p 로 찍으려면 뷰포트를 1920×1080 으로 바꾼 뒤 `window.dispatchEvent(new Event('resize'))`** — 뷰포트 에뮬레이션만으로는 WebGL 버퍼가 1024×768 에 머문다(CSS 만 커진다).
- **(29차 저녁) 장면을 만들어 찍는다** — 소개용 사진은 우연을 기다리지 않는다. 공격 상황(소유자·동료·수비 좌표를 한 번에 배치)을 1초마다 다시 깔면 16초 내내 박스 앞 장면이 이어진다. 코너킥은 `setupRestart(st,'corner',…)` 뒤 **5초**(배치가 서는 시간)를 기다린 다음 `phaseT = 99999`. 골키퍼 다이브는 16 m 코너 강슛을 여러 번 쏘며 `gk.action === ACT_DIVE` 를 폴링해 그 순간 찍는다.
- **(29차 저녁) 영상 검증은 파일을 `public/` 에 복사해 `<video>` 로 되읽는다** — `docs/` 는 개발 서버가 안 준다. 한 프레임을 캔버스에 그려 PNG 로 저장하면 UI 가 실제로 들어갔는지 눈으로 확인된다(끝나면 복사본 삭제).
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
- **(29차) 기울기는 "어느 축에 붙었나"부터 갈랐다.** 코드를 뒤지는 대신 `asymprobe` 로 진영만·킥오프만·둘 다 바꿔 200판씩 돌렸다 — 네 변형 모두 팀 1 이 이겨 좌표 조건은 지웠고, 순회를 거꾸로 돌려 같은 시드에서 뒤집히는 것으로 `step` 순서를 잡았다. 그 뒤 후보 셋을 worktree 셋에 넣어 2,000판씩 동시에 쟀다(16코어 · 5분).

### 실패했거나 되돌린 것

| 시도 | 왜 실패했나 | 교훈 |
|---|---|---|
| 캡처를 `frame()`(rAF) 뒤에 붙임 | 브라우저 패널이 숨겨지면 rAF 가 0회라 영영 안 불렸다 | 워커 틱에서 직접 `frame()` (교훈 61) |
| 캡처를 틱 루프 안, `paused` 검사 뒤에 둠 | 혼자 하기 코인토스는 `paused` 라 연출이 끝난 뒤에야 찍혔다 | `paused` 이른 반환 **앞**에 (교훈 66) |
| 결정력 테스트를 GK 코앞 1.6 m 로 차는 14 m 슛으로 | 누가 차도 거의 다 막혀 결과가 거꾸로 났다 | 코너를 노리는 16 m 슛 (교훈 65) |
| 속도 폭만 현실 수준으로 축소 | 81% — 아직 지배적 | 어디서 이기는지를 막아야 (교훈 63) |
| 세레모니 카메라가 공을 따라감 | 공은 골망 속, 모임은 20 m 밖이라 화면 밖 | 득점자를 따라간다 |
| 브라우저 도구의 `key` 액션으로 Esc/방향키 | 페이지에 안 닿았다 | `window.dispatchEvent(new KeyboardEvent)` (교훈 62) |
| 실사 리그가 `this.kits` 를 읽는데 `setMatch` 가 킷을 나중에 저장 | 첫 경기에서 null → 검은 화면 | 킷 저장을 리그 생성 **앞**으로 |
| 유니폼 물들이기를 원본 밝기 그대로 곱함 | 군복처럼 어두운 텍스처는 팀색이 갈색으로 죽었다 | 옷 픽셀 평균 밝기로 정규화 |
| 뼈에 `rotation.x += 각도` 로 팔·다리 오버레이 | Mixamo 뼈 로컬 축이 가정과 달라 스로인·킥 모션이 안 나왔다 | 뼈의 +y 가 **월드 방향**을 향하게 쿼터니언(`aimBone`) |
| 2단 관중석·지붕을 네 면 모두에 | 카메라 쪽(가까운 사이드) 지붕이 화면 아래 절반을 가렸다 | 카메라 쪽은 1단만 |
| bash heredoc 으로 큰 python 패치 | 따옴표 파싱이 깨졌다 | 스크립트는 **Write 도구로 파일에** 쓰고 실행 |
| 궤적 미리보기를 1 px `LineDashedMaterial` 로만 | 키커 뒤 시점에서 잔디에 묻혀 안 보였다 | 구슬(`InstancedMesh` 28개)을 등간격으로 얹었다 |
| 브라우저 검증 중 src 를 고침 | vite 가 전체 리로드해 `__klo` 가 사라지고 경기가 날아갔다 | 검증을 다 끝낸 뒤 src 를 만진다 |
| 스크린샷이 세 장 연속 같아서 리플레이 버그로 의심 | 브라우저 패널이 가려져 **rAF 가 0회** — sim(워커 틱)은 돌고 그리기만 멈춘 것 | `requestAnimationFrame` 횟수·`document.hasFocus()` 부터 재고 판단한다 |
| 세트피스 배치가 안 되는 줄 알았다 | 코너를 JS 로 강제한 순간 선수들이 반대편(90 m)에 있어 3.5 초로는 못 온 것 | 목표 좌표(`p.tx/ty`)부터 찍고, 선수를 근처에 옮겨 놓고 본다 |
| sharp 로 Mixamo 텍스처 축소 | 16비트 PNG 에서 libvips `colourspace` 오류 — 단독 테스트는 됐다 | 순수 JS(pngjs·jpeg-js·박스 다운샘플)로 바꿨다. 네이티브 의존은 피한다 |
| npm install 중 브라우저 검증 | vite 가 리로드해 경기가 날아갔다 | 설치는 검증 전후로 |
| 프리킥 재현 뒤 응답 사이에 시간이 흐름 | 사람 킥커 대기(6.8초)가 지나 AI 가 대신 찼다 | `st.phaseT = 99999` 로 붙잡고 한 배치 안에서 찍는다 |
| 스로인 테스트에서 공을 라인 밖(34.4)에 놓음 | 첫 틱에 아웃 판정 | 손에 든 공은 라인 안쪽(33.9)에 |
| 골 강제 재현 (공만 골라인 앞에 놓기) | 골키퍼가 잡았다 | 골키퍼를 14 m 치우고 22 m/s 로 |
| (29차) 대칭을 100~300판으로 판정 | ±4%p 노이즈 — 같은 코드가 41 · 45.6 · 48.3 · 51.7% 로 나왔다 | **500판 이상**, 원인 가르기는 2,000판씩 |
| (29차) 결정·이동 두 단계만 고침 | 2,000판 44.0% — 오히려 나빠졌다. 팀 0 이 먼저 정하는 순서와 idx 주기 오프셋이 남아 있었다 (두 단계+공 가진 팀 먼저 47.2% · 두 단계+자리 번호 주기 45.0%) | 팀 번호에 붙은 순서를 **셋 다** 없애야 50.5% |
| (29차) worktree 를 프로젝트 밖(scratchpad)에 두고 `vite-node` | 프로젝트 root 밖 파일은 못 읽는다 · node_modules 가 없다 | worktree 안에서 실행하고 `node_modules` 는 정션(`New-Item -ItemType Junction`) |

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

### [미반영] — 없음 (28차에서 15차 네 줄을 전부 닫았다)

| 15차 항목 | 28차 결과 |
|---|---|
| D 압박 테스트 skip | **켬.** 원인은 세팅이 아니라 가속(10차 5.5+3.0·acc) — 반대 방향키 25% 를 섞은 채 8 m 는 1초에 못 간다(1초 뒤 4.4 m). 1초 뒤 5 m 안 · 1.7초 뒤 3 m 안으로 |
| 브라우저 검증 | E 홀드 `team.sprint=true` + 사진(`docs/img/shot_sprint.png`) · 프리킥 슛 뒤 GK 다이브 7틱 → FALLEN 31틱 실측 |
| DESIGN·가이드 | 4.8e 절 · 3.1 S/D 행 · 가이드 S/D 행 |
| 봇 120판 | 골 3.75 · 파울 **6.5**(27차 통계 버그 수정 뒤라 14차 13 과 비교 불가) · 경고 0.61 · 퇴장 0.01 · 슛 13.1 · 패스 성공 51% |

**28차에서 새로 연 0-e(홈/원정 기울기)는 29차에서 닫았다** — 아래 표.

### 사용자가 먼저

1. **다시 한 판** — 14차 8건(골키퍼 선방 · 교체 전술판 · 프리킥 ← → ↑ ↓ 조준과 궤적 · 체력 · 스로인 · D 파울 · 속도 폭)이 손에 맞는지. 앞선 34건도: 특히 **속도·결정력 균형(공을 몰고 전력 질주하면 뺏기는가 · 잘 찬 슛이 들어가는가)** · 세레모니/리플레이 흐름 · 세트피스 시점 · A 홀드 롱볼 · **수비가 너무 단단한가**(A/B 83%).
2. **B-1 다른 회선 두 대로 대전** — 로컬 두 탭은 통과. NAT 는 같은 PC 로 못 잡는다. (PREP B-1) 온라인에서 세레모니 양쪽 동의 흐름도 이때 본다.
3. **공개 채널 정하기** — `docs/공지글-모음.md` 문안·첨부(사진 9·GIF 2) 준비됨.

### 다음 세션

| 순위 | 작업 | 끝났다의 기준 |
|---|---|---|
| 0 | **15차 마무리** — 위 [미반영] 표 네 줄 | skip 해제 · 스크린샷 · DESIGN 4.8e · 가이드 |
| 0-b | ~~캐릭터 1순위~~ → **실사 그래픽은 27차에 뺐다** (사용자 결정 9/15 저녁, G-49). 찰흙이 유일한 리그. 다시 하려면 `git show c1a8f27:src/render3d/playerReal.ts` (마지막 동작 버전 — T포즈·루트 모션·뼈 접두어 수정 포함) | — |
| 0-d | ✅ 팀 전술·개인 전술 끝(25차) · ✅ **프리셋 기본값 재측정 끝(28차, G-52)** — 공격이 뒤집혀 있어 템포·빌드업·수비 방식을 고쳤다(슛 4.8 → 9.1). 남은 것: 사용자 체감(역할이 눈에 띄는가: 오버랩 풀백·홀딩 MF·포스트형 ST) | 사용자 피드백 |
| 0-e | ✅ **홈/원정 기울기 — 29차에서 닫음** (G-54). 30차 공개 전 확인 `asym 500` **49.9%** (203승 93무 204패) | ✅ |
| 0-c | 로드맵 — P0 화면 인상 ✅ · P3 엔진 움직임 ✅ · **P4 연출 ✅**(리플레이 2 앵글 · 골망 · 하프타임 통계 · 클로즈업 — 9/15) · 헤딩 ✅ · 락 음악 ✅. 남은 것: **P2 캐릭터 전면**(Mixamo FBX 가 와야 한다 — 0-b), **드리블 터치 간격**(P3 잔여 — 균형 재측정 필요), **리플레이 측면 컷 눈으로 확인**(브라우저 패널 rAF 정지로 못 봤다 — 골 넣고 리플레이 뒤 절반이 측면 낮은 카메라인지), 봇 120판 파울·골 재확인 | 단계마다 커밋·스크린샷 |
| 1 | 2차 피드백 반영 | 사용자가 "됐다" |
| 2 | ✅ **강화 — 30차 재측정으로 닫음** (G-64). `npm run enhcheck 200 even 1`: 고르게 **+10.8%p** · 공격 5명 +15.8 · 수비 5명 +7.0 · 기준 팀워크 +4 +12.8. 기록된 +2~3%p 는 13차 이전 값이었다. 단계 ×2 는 +19~23 으로 넘쳐 그대로 둔다 | ✅ |
| 3 | ✅ **파울 — 30차 봇 120판 6.3/판** (목표 ≤ 11). 사용자 체감이 많다면 그때 | ✅ |
| 4 | 수비 묶음 83% 가 과한지 — 경합 반응 시간 폭 `0.35−0.25·posn` 을 `0.30−0.18·posn` 으로 줄여 재 본다 | `npm run attrcheck 100 def,pace,shoot` 에서 수비 ≤ 78 · 속도 ≤ 슈팅 유지 |
| 5 | 단계 8 공개 — 공지 올리기 · README 배포 상태 갱신. `docs/공지글-모음.md` 1차 문안은 **29차에 14~29차 상태로 다시 썼다**(개리그 매니저 패치노트 꼴 — 큰 제목에만 이모지, 한 줄 설명, `*` 항목) | 공지 게시 |

---

## 보류 / 백로그

| 항목 | 보류 사유 + 재개 조건 |
|---|---|
| **재검증 WARN** (`npm run audit`) — 롭 크로스 성공 17~33%(표본 3~10) · 스로인 성공 34~56%(`npm run throwin` 가로채기 31%, 14차 24%) · 마커 55~57%(목표 60) · 사이드 깊숙이 때 박스 안 동료 0.5~0.9(목표 2 — 뛰는 중 4.5명이 닿기 전에 크로스가 올라간다: 크로서가 1~2 초 기다리게 하는 안) · 시선 82%(목표 85) | 표본이 작거나 목표에 근접. 사용자 체감 제보가 오면 그때 |
| ~~홈/원정 기울기~~ | 29차에서 원인(`step` 팀 번호 순서 셋)을 고쳐 2,000판 50.5%. `tests/asym_order.test.ts` 가 구조를 지키고, 통계는 공개 전 `asym 500` |
| 수비 프리셋 실점이 균형보다 낮지 않다 (1.56 vs 1.38, 16판) | 시험한 변형 4종이 전부 더 나빴다. 깊은 블록의 수비 효율(박스 안 근접 마크·클리어)을 볼 때 |
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

- **(27차) `fromBehind` 가 처음부터 뒤집혀 있었다** — "뒤에서 뺏는다"는 제보의 원인. 각도·방향 함수는 만들 때 **정면/뒤 두 케이스 단위 테스트**를 같이 넣을 것(`tests/tackle_behind.test.ts` 가 이제 지킨다). 이런 함수 하나가 파울·카드·AI 압박 전부를 뒤집는다.
- **(27차) 규칙을 세게 하면 AI 가 먼저 그 규칙을 지켜야 한다** — 뒤 태클을 카드로 만들자 봇끼리 퇴장 2.3/판. 봇은 아예 뒤에서 덤비지 않게(골사이드로 앞지르기) 하고 사람만 도전할 수 있게 했다.

- **(26차) three.js `mixer.clipAction(clip)` 은 같은 클립이면 같은 액션을 돌려준다** — 한 클립을 두 속도로 쓰려면 `clip.clone()`. 안 그러면 가중치가 서로 덮여 합이 0 이 되는 순간 **바인드 포즈(T포즈)** 가 나온다. 실사가 "난리"였던 첫째 원인.
- **(26차) Mixamo 는 "In Place" 를 켜서 받거나, 못 켰으면 Hips x·z 를 지운다** — 자리는 sim 이 정하므로 클립에 전진이 있으면 되돌아오는 순간 순간이동처럼 보인다. `tools/char/inspect.mjs` 가 Hips 이동 폭을 찍어 준다(run 2.5 m · kick 2.8 m 였다).
- **(26차) 뼈 이름은 정확 일치로 찾지 말 것** — `mixamorig`, `mixamorig:`, `mixamorig5` 다 나온다. 못 찾으면 오버레이가 **조용히** 꺼지니 로더에서 못 찾은 뼈는 콘솔에 남긴다.
- **(26차) 브라우저 패널이 가려져 있으면 rAF 가 멈춰 리그 상태가 옛것** — 측정 전에 `__klo.frameNow()` 를 몇 번 돌려 프레임을 강제로 그린다. 스크린샷도 5초 타임아웃이 잦다.

- **(25차) 유튜브 영상은 이 환경에서 못 본다** — 자동 자막 트랙이 빈 응답, 스크립트 패널 0줄, 브라우저 패널 캡처는 창이 가려지면 5초 타임아웃. 영상을 근거로 삼아야 하면 사용자에게 **캡처 몇 장**을 부탁하는 것이 빠르다.
- **(25차) 역할은 "이름"이 아니라 "계수"로 sim 에 넣는다** — `RoleTraits` 7개 숫자만 `ai.ts` 가 본다. 자리군마다 역할 뜻이 달라도 AI 분기가 안 는다. 역할 번호는 **자리**에 붙고, 포메이션을 바꾸면 전부 0 (같은 숫자가 다른 뜻이 되는 것을 막는다).
- **(25차) 스쿼드 코드 규격을 바꿀 때** — `CODE_VERSION` 올리고 `TOTAL_BITS` 를 `SLIDER_KEYS.length` 로 계산하게 두면 슬라이더가 늘어도 다시 안 센다. 옛 코드는 버전에서 거부되고(체크섬보다 먼저 본다), 로컬 저장본은 `normalizeSquad` 로 채운다 — `tests/tactics.test.ts` 가 둘 다 확인.

- **(28차) 프리셋은 축을 섞지 말 것** — "공격 = 빠른 템포·짧은 빌드업"처럼 이름에 어울려 보이는 값을 묶으면 실측이 뒤집힌다. 프리셋을 바꾸면 반드시 `npm run tactics` 로 슛·골·실점을 재고, 슬라이더 하나씩 되돌려 보는 인자로 원인을 가른다.
- **(28차) 옛 실패 테스트는 세팅보다 "그 사이 바뀐 물리"를 먼저 의심** — 15차 D 압박 테스트는 10차의 가속 축소 때문에 못 간 것이었다. 틱마다 위치를 찍는 10줄 프로브가 가장 빨랐다.
- **(28차) 대칭 계측은 세션마다 다시 돈다** — 13차에 닫은 홈/원정이 17개 커밋 뒤 41% 로 돌아왔다. `asym` 은 공개 전 필수.
- **(30차) 작업 목록의 수치는 고치기 전에 다시 잰다.** "강화 +2~3%p" 는 17개 차수 전 값이었고, 그 사이 엔진 수정으로 이미 +10.8%p 였다. 그대로 믿고 단계를 ×2 로 올렸다면 +19~23 으로 넘쳤다.
- **(30차) 서로 다른 두 스쿼드의 "홈 승 : 원정 승" 은 홈 이점이 아니다.** `balance` 의 75:19 는 스쿼드 전력 차였다 — 자리를 바꿔(`swap`) 같은 쪽이 이기면 전력, 따라 뒤집히면 홈 편향. 홈 편향 자체는 `asym`(같은 스쿼드끼리).
- **(30차) `vi.useFakeTimers()` 를 테스트마다 켜면 `afterEach` 에서 `clearAllTimers()`** — 앞 테스트가 걸어 둔 타이머(여기선 `close()` 의 120 ms leave)가 다음 테스트의 `advanceTimersByTime` 에서 터져 엉뚱한 단언이 깨진다.
- **(30차) 1초마다 `innerHTML` 로 다시 그리는 화면에 입력칸을 넣지 않는다** — 대기실 채팅을 그 안에 두면 쓰던 글이 1초마다 날아간다. 다시 그리는 부분과 유지되는 부분을 형제로 나눈다.
- **(30차) 이 노트북에서는 localhost 확인을 하지 않는다** (사용자 요청 9/23 — 사양이 낮다). 테스트·빌드 → 커밋·푸시 → 배포 사이트에서 확인. 내장 브라우저가 github.io 에서 막히면 배포 번들을 curl 로 확인하고 눈 확인은 사용자에게.
- **(29차) 팀 번호에 붙은 순서는 전부 편향이다.** "22명 인덱스 순 고정"은 결정론을 위한 것이지 공정성을 주지 않는다 — 팀 0 이 먼저 보거나(결정이 이동 루프 안), 먼저 정하거나(팀 0 의 패스만 같은 틱에 들킴), 주기 오프셋이 idx(마주 보는 선수의 반응 시차)면 2,000판에서 3~6%p 기운다. 팀을 가르는 코드는 **공 가진 팀·자리 번호** 같은 상태 기준으로 순서를 정한다.
- **(29차) 기울기 판정은 표본부터** — 200판은 ±4%p. 13차의 "51.7% 로 닫음"은 노이즈였다. 500판 아래로는 대칭을 말하지 않는다.

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
| `src/core/sim.ts` | createState / step / hashState · 사람 입력(받을 선수 자동 달리기 · 드리블 속도 상한 · A/D 홀드 · `BTN_SKIP`) · **step = 결정(공 가진 팀부터 · 자리 번호 주기) → 이동 두 단계 (29차)** |
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
| `tools/asym.ts` · `tools/asymprobe.ts` | 홈/원정 대칭 (하프별) · **원인 가르기**(`base`·`swapdir`·`ko1`·`both` 변형, 시드 시작 인자, 하프별 전체 통계) |
| `tests/asym_order.test.ts` | 결정 순서 세 성질(결정 시점에 아무도 안 움직임 · 공 가진 팀 먼저 · 자리 번호 주기) + 결정론 |
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
npm run asym 500       # 홈/원정 대칭 (500판 아래로는 판정하지 않는다 — ±4%p)
npm run asymprobe 400 base 10000   # 기울면 원인 가르기: swapdir(진영) · ko1(킥오프) · both
npm run balance -- 120
npm run oneone 400 14  # 1대1 전환율
npm run cards          # 카드 OVR 보정 · 급여 상한
npm run clubs 90       # 실제 구단끼리 계측
npm run build:cards    # 원본 명단 → src/data/cards.json (원본은 저장소 밖 · CLUB_NAME 표가 구단명)
```

### 원본 명단 갱신 절차 (29차에 노트북에서 재현 — 2026-09-16)

업스트림은 `github.com/KleagueM2026/KM26v2.0` — 파일이 `index.html` 하나뿐이고 갱신은 늘 "Delete index.html → Add files via upload" 두 커밋이다.
**갱신 여부는 blob 으로 본다**: `gh api repos/KleagueM2026/KM26v2.0/git/trees/<sha> --jq '.tree[]|.path+" "+.sha'`. 9/9 반영본 `547f422` 의 blob `1f2e9998d7` 이 9/16 최신 `0ff4aff` 까지 그대로였다(중간 커밋 8개는 같은 파일 재업로드).

재현(전부 scratchpad 에서, 저장소는 안 건드린다):

```bash
curl -sL -o idx.html https://raw.githubusercontent.com/KleagueM2026/KM26v2.0/<sha>/index.html
cp ../KMD26v1.0/tools/{extract_data,jsclosure}.py <scratch>/kmdtools/   # 복사본에 함정 둘 적용 (아래)
PYTHONIOENCODING=utf-8 python <scratch>/kmdtools/extract_data.py idx.html <scratch>/kmdroot/src/data/gen.js
(cd ../KMD26v1.0/tools/gendata && go run . -root <scratch>/kmdroot)   # → <scratch>/kmdroot/data/*.json · 데이터 해시 출력
PYTHONIOENCODING=utf-8 python tools/build_cards.py <scratch>/kmdroot/data <scratch>/cards_new.json
md5sum <scratch>/cards_new.json src/data/cards.json   # 같으면 갱신 없음
```

- 함정 둘(CHANGELOG 9/9): **GK-01 패치 0곳**(원작자가 같은 고침을 넣음 → PATCHES 에서 빼야 중단 안 됨) · **`UID_GEN is not defined`**(한 줄 다중 선언은 첫 이름만 색인 → ROOTS 에 `UID_CLUB` 추가). KMD26 저장소(`7f8a0ea`, 8/18)에는 이 고침이 **없다** — 복사본에 적용한다. 9/16 은 python 스크립트로 자동 적용했다.
- `build_cards.py` 기본 입력 `../KMD26v1.0/KMD26v1.0/data` 는 이 노트북에 없다 — 인자로 준다. `../KMD26v1.0/data` 는 8/14 의 1,024명 옛 스냅샷이니 쓰지 말 것.
- 콘솔이 cp949 라 두 파이썬 도구 다 `PYTHONIOENCODING=utf-8` 없이는 마지막 출력에서 죽는다(파일은 이미 써진 뒤).
- 바뀌었으면: `POOL_HASH` 가 바뀌어 저장 스쿼드·코드가 전부 버려진다 → CHANGELOG 9/9 v0.7.0 항목처럼 인원·구단 색·급여 상한·OVR 보정 변화를 적고 `npm test`(pool) · `npm run cards` · `npm run clubs 90` 을 다시 잰다. README 의 인원 숫자는 `POOL_SIZE` 에서 읽으므로 손댈 곳 없음.
- **9/16 결과**: 최신 `0ff4aff` → dataHash `b53cd9ed65ffe691` · 1,056명 · 29구단 · `cards.json` md5 동일. **반영할 것 없음.**

브라우저 콘솔에서 `__klo.state()` · `__klo.hashes()` · `__klo.net()` · `__klo.snd()` · `__klo.frameNow()`(숨겨진 패널에서 한 장 그리기) · 캡처는 위 "스크린샷·GIF 다시 뜨기".
**테스트 모드**: `http://localhost:5175/KLO26/?test=1` (AI 대 AI 관전 · 키 입력 표시).

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
