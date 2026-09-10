# HANDOVER — 2026-09-11 (7차)

> **이 문서가 최신입니다.** 단계 1~7 이 전부 들어가 있고, 2026-09-10~11 에 **사용자가 직접 해 보고 낸 제보·요청 24건**을 반영했습니다.
> 엔진(골키퍼·슛 보조·킥오프·추가시간·수비)과 스쿼드 화면(세로 전술판·명단 한 통·별점·JSON)이 이번에 크게 바뀌었습니다.
> 남은 것은 **다른 회선 두 대 실제 대전**(PREP B-1), **강화 효과 키우기**, **파울 빈도**, 그리고 공개입니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-10 ~ 09-11 (직전 6차: 09-11 코인토스, 5차: 09-10) |
| 저장소 · 브랜치 | `https://github.com/goormigrm/KLO26` · `main` |
| 마지막 커밋 | ⚙ 경기 중 설정 분리 · 공지글 재작성 (해시는 `git log -1`) |
| git 상태 | **클린** (`main...origin/main` — 미커밋 변경 0) |
| 배포 | <https://goormigrm.github.io/KLO26/> — 이번 세션 커밋 9건, 확인한 것 전부 Actions success |
| 작업 디렉터리 | 노트북: `C:\Users\tkdrm\Workspace\personal\KLO26` · 메인 PC: `C:\Users\tkdrm\OneDrive\Desktop\klo26` |

두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

### 이번 세션 커밋 (git log 참조 — 여기 중복 작성 안 함)

`0d21f22` v0.8.0 제보 11건 → `a92f677` verify 결과·asym 도구 → `bccfa94` v0.8.1 스쿼드 6건 →
`1cbc9f9` 급여 게이지 고침 → `9f6033b` 세로 전술판 4건 → `29450a0` 명단 배치 → `17ea693` 구단 필터·문서 정정 → `37439ca` HANDOVER 6차 → **코인토스·홈 컬러**

---

## 지금 되는 것

| 단계 | 무엇 | 상태 |
|---|---|---|
| 1 | 실제 K리그 2026 선수 데이터 (보호명 · 1,056명 · 29구단) | ✅ |
| 2 | 결정론 시뮬 코어 | ✅ 해시 100/100 |
| 3 | Three.js 방송 카메라 · 찰흙 선수 · 표준 키보드 · 폰 차단 | ✅ |
| 4 | 오프사이드 · 파울/카드 · 프리킥/PK · 교체 · 세트피스 · 심판 3명 · **추가시간** · **백패스 룰** | ✅ |
| 5 | 카드·스쿼드 (급여 상한 252 · 팀컬러 · 강화 예산 · **별점 표시** · **JSON 저장/불러오기**) | ✅ |
| 6 | Trystero 로비·방 · 2인 락스텝 · 해시/리싱크 · 대기실 | ✅ 로컬 두 탭까지 |
| 7 | 밸런스 계측 (`verify` · `asym` · `balance` · `oneone` · `clubs`) | ✅ |
| — | 소리 · 테스트 모드(`?test=1`) | ✅ |

**흐름**: 로비 → (스쿼드 수정 | 구단 바꾸기) → (혼자 하기 | 방 만들기/참가 → 대기실) → 경기 → 결과.

---

## 이번 세션에서 한 것

정본은 **DECISIONS 9장(F-1~F-11) · 10장(G-1~G-13)** 이다. 여기엔 다음 사람이 알아야 할 구조만 적는다.

### 엔진 (9/10)

| 무엇 | 핵심 |
|---|---|
| **GK 잡기 모델** | 잡기는 **손 거리**(서서 0.8 · 날면서 1.0 m)에서만. 경로가 손 밖이면 반응 뒤 `ACT_DIVE` + 속도로 **실제로 날아간다**(앞 12틱 비행 — `sim.ts` 가 다이브 앞부분은 감속하지 않는다). 못 닿으면 골. `tests/feedback.test.ts` 가 "자유 공 한 틱 이동 0.6 m 이하"로 순간이동을 막는다 |
| **슛 보조** | `doShoot` 의 사람 분기에 "빗나감" 경로가 없다 — **언제나 골문을 겨눈다.** 방향키 y 성분이 코너, 없으면 GK 가 비운 코너. 뒤로 밀고 차면 σ×1.6 만 |
| **킥오프** | `performRestartKick` 맨 앞 `kickoffTarget` — 자기 진영 아군에게 땅볼만. `whistle` 사건 + `callText`. AI 킥오프 분기는 삭제 |
| **추가시간** | `advanceClock`: `stoppage`(데드볼 초) → 정규 종료 때 `added`(1~5분, `ADDED_MAX_MIN`) 발표 → `halfSec + added×4초` 뒤 **공이 죽었을 때** 종료. 공격 중이면 `END_GRACE_SEC`(20초) 유예. `switchSides` 가 둘 다 리셋. 시계 `45'+2` 는 `addedMinute` |
| **수비 키** | `sim.ts` step — 조작 선수가 `press`/`tackleT` 면 **공 쪽으로 자동 이동**(방향키 45% 블렌드). `handleInput` — A 는 방향키 없으면 공 쪽 슬라이딩, **W = `team.gkRush`**, C = `faceBall` |
| **수비 강화** | `tryControl` 가로채기 반경 `+0.28·posn` · 성공 `+0.15·mark`; `doShoot` **블록**(`block` 사건); `aiDecide` 마크 거리·압박 예측 |
| **백패스 룰** | 아군이 발로 준 공(스로인 포함)은 GK 가 손으로 못 잡는다 |

### 🪙 홈·원정 동전 던지기 (9/11 — 가장 최근)

| 무엇 | 핵심 |
|---|---|
| **홈이 방장 고정이 아니다** | `game/toss.ts tossHostHome(seed)` — 결과를 **시드에서 유도**한다(그 자리에서 난수를 뽑으면 두 브라우저가 다른 홈을 본다). `waitroom.begin` 이 `(role==='host')===hostHome ? 0 : 1` 로 `me` 와 스쿼드 순서를 함께 뒤집어 저절로 일치 |
| **혼자 하기도 원정 가능** | `session.newState` 가 `squads`·`human`·`bots` 를 함께 뒤집는다. **`this.meTeam`** 이 내 팀 — 예전의 `this.cfg.net ? net.me : 0` 을 전부 이걸로 바꿨다 |
| **코인토스 연출** | `session.showToss()` — 3초 오버레이. **렌더 전용**이라 온라인 락스텝을 멈추지 않는다(혼자 하기만 `paused`). `tossing` 플래그가 Esc 메뉴를 막고, `clearTossTimers()` 가 dispose·restart 에서 타이머를 정리 |
| **경기장 홈 컬러** | `pitch3d.setHomeColor(hex)` — 관중 절반을 홈 색으로 다시 그리고 스탠드 옆면도 어둡게. `renderer.setMatch` 가 `kits[0].shirt` 로 부른다. **clone 텍스처는 각자 `needsUpdate`** 를 켜야 반영된다 |
| 검증 | `tests/toss.test.ts` 4개 — 같은 시드 = 같은 결과 · 방장/게스트가 서로 다른 팀 · 2,000판 40~60% · 구단(`seed % CLUBS.length`)과 상관없음 |

### ⚙ 설정 분리 (9/11 — 가장 최근)

사용자 요청: "철FPS 처럼 경기 중에 로비로 버튼과 설정을 나누고, 설정을 대기실에서 한 것처럼 편하게".

| 무엇 | 핵심 |
|---|---|
| **설정 패널을 로비와 공유** | `ui/settings.ts` 에 `settingsPanelHtml(s, muted)` + `bindSettingsPanel(root, s, hooks)` + `SettingsHooks`. 로비 팝업과 경기 중 창이 **같은 함수**를 부르므로 한 곳만 고치면 둘 다 바뀐다. 항목은 소리 · 그림자 · 렌더 해상도 · 조작 안내 띠 |
| **오른쪽 위 세 버튼** | `session.ts` 상단이 `btn-lobby`(로비로) · `btn-settings`(⚙ 설정) · `btn-menu`(메뉴 Esc). 예전엔 Esc 메뉴 안에 다 섞여 있었다 |
| **Esc 메뉴는 행동만** | 계속 · 🔁 교체 · ⚙ 설정 · 로비로. 소리/조작 안내 토글은 설정 창으로 옮겼다. `showSettings(fromMenu)` 가 `settingsFromMenu` 를 기억해 닫을 때 메뉴로 돌아간다 |
| **로비로는 한 번 묻는다** | `confirmQuit()` — 경기가 끝났으면(`state.done`) 바로 나간다. 온라인이면 "상대 화면에서도 그 시점 스코어로 종료" 라고 알린다 |
| **경기 중 그림자·해상도 변경** | `renderer3d.setShadows(on)` — `gl.shadowMap.enabled` 와 `sun.castShadow` 를 바꾼 뒤 **`scene.traverse` 로 모든 재질에 `needsUpdate`**. 안 하면 셰이더가 다시 컴파일되지 않아 화면이 그대로다. `setResScale(v)` 는 `resize()` |
| 버그 정정 | Esc 가 **온라인에서 메뉴를 닫지 못했다** — `toggleMenu` 가 `paused` 로 판단했는데 온라인은 락스텝이라 언제나 `false`. `!this.overlay.hidden` 으로 바꿨다 |
| 확인 | 브라우저에서 로비 팝업 · 경기 중 창 · 그림자/조작 안내 즉시 반영 · 메뉴 → 설정 → 닫기 → 메뉴 복귀 · 로비로 확인창 → 나가기까지 **눈으로 확인**. `npm test` 94개 통과 |

### 화면 (9/10~11)

| 무엇 | 핵심 |
|---|---|
| **방향 표시** | `renderer3d.ts` 의 `chev` — `team.inX/inY` 를 읽는 **렌더 전용**(sim 무관). 공격 노랑 · 슛 파워 붉음 · 수비 흰색 |
| **별점** | `cards.ts ovrStars/statStars` + `ui/stars.ts starHtml/pipsHtml`. **숫자로 보이는 것은 급여·능숙도뿐** |
| **세로 전술판** | `.pitch.vertical` — 내 골문 아래, 공격 위. 칩은 이름·별·자리 세 줄(86px), 가운데 자리(CM·ST·CB·CAM·DM)는 **7% 아래로 어긋남**(4% 는 18px 겹쳤다) |
| **명단 한 통** (KM26 `fmSquadTable`) | `rosterHead()` + `slotRow(i)` 로 **선발 11(자리순) → 후보 7**, 그 아래 `cardRow()` 로 **그 외 명단**. 셋 다 `.rrow` 로 같은 열. **전술판 아래 벤치 칩은 없앴다** |
| **그 외 명단** | `filtered()` 가 스쿼드 18명을 빼므로 진짜 나머지. 내 구단/전 구단 · **구단 셀렉트**(전 구단일 때만) · 이름 · 포지션 · 정렬 |
| **자동 채우기** | `autoFill('xi'|'bench')` + 기준 `autoBy`('fam' = `fam×2+ovr` / 'ovr' = `ovr×2+fam×0.3`, localStorage) |
| **JSON 저장/불러오기** | 파일 `klo26-구단-포메이션.json`(지문 포함). 코드 UI 는 제거 — `squadcode` 는 **P2P 대기실 내부용**으로만 산다 |
| **저장 안 하고 돌아가기** | `original` 스냅샷 → `cancel()`. "이 스쿼드로 (저장)"과 짝 |
| **유니폼** | `kits.ts` — 홈 `col` **단색**, 원정 **전신 흰색**(GK 제외). 홈이 거의 흰색일 때만 원정이 자기 색. `col2` 는 데이터에만 남고 안 쓴다 |

---

## 성공/실패 기록

### 통한 접근

- **버그를 재현 테스트로 못 박았다.** GK 순간이동은 "자유 공은 한 틱에 0.6 m 넘게 못 움직인다"로, 슛 보조는 "아래 키를 눌러도 낙하점 |y| < 7 m"로 잡았다 (`tests/feedback.test.ts` 7개). 계수를 만지다 되돌아가는 일이 없다.
- **원인을 숫자로 찾았다.** 홈/원정 42.5% 가 편향인지 잡음인지 가르려고 `tools/asym.ts`(하프별 분해)를 만들었다 — 전·후반 점유 50.0/49.8% 로 갈리지 않아 **잡음**으로 판정했다. 눈으로 봤으면 계수를 잘못 만졌을 것이다.
- **KM26 원본을 실제로 읽고 옮겼다.** 명단 배치는 `fmSquadTable` 을 grep 해서 "한 표에 구분선으로 선발→교체→그 외" 구조를 확인한 뒤 옮겼다. 문서(06장)의 줄 번호는 우리 `index.html` 과 다르니 **함수 이름으로 grep** 해야 한다.

### 실패했거나 되돌린 것

| 시도 | 왜 실패했나 | 교훈 |
|---|---|---|
| 별점을 그리드 칸(1fr)에 그대로 넣기 | 덮개(`width: %`)가 늘어난 span 폭 기준이라 **별 다섯을 다 덮어 전부 만점**으로 보였다 | `width: max-content` 를 별 자체에 건다 |
| 목록 능력치 막대에 `.mini` 클래스 재사용 | 로비 급여 게이지가 같은 이름을 쓰고 있어 **24px 격자에 갇혀 5%처럼** 보였다 | 짧은 CSS 이름은 짓기 전에 grep |
| 세로 전술판에서 가운데 자리 4% 어긋남 | 여전히 13×18px 겹쳤다 | 7% — 겹침 0건을 브라우저에서 실측해 확인 |
| 킥오프에서 D 홀드 = 길게 차기 | 사용자가 "상대 진영으로 차는 건 규칙 위반" 이라 지적 | 킥오프는 아군 짧은 패스만. `restart.test.ts` 의 옛 기대값도 함께 바꿨다 |

---

## 주요 결정 사항 (반영 위치)

| 결정 | 반영 위치 |
|---|---|
| GK 는 손 거리에서만 잡고, 그 밖은 몸을 날린다 | `ball.ts gkCatch` · `sim.ts`(다이브 비행) · `DESIGN 4.7` · `tests/feedback.test.ts` |
| 슛은 언제나 골문을 겨눈다 | `ball.ts doShoot` · `DESIGN 3.3` |
| 킥오프는 아군 짧은 패스만 | `rules.ts kickoffTarget` · `DESIGN 2장` · `tests/restart.test.ts` |
| 추가시간 1~5분 · 공이 죽었을 때 종료 | `rules.ts advanceClock` · `state.ts ADDED_MAX_MIN/END_GRACE_SEC` · `DESIGN 2장` · `hud.ts` |
| 능력치는 별점만 (급여·능숙도는 숫자) | `cards.ts` · `ui/stars.ts` · `squad.ts` · `waitroom.ts` · `DESIGN 7.2` · 플레이 가이드 |
| 스쿼드는 JSON 파일로 주고받고, 코드는 P2P 전용 | `squad.ts` · **`DESIGN 5.10`(이번에 정정)** · `DECISIONS G-4` |
| 유니폼 단색 · 원정 전신 흰색 | `kits.ts` · `DESIGN 7.1` · **`DECISIONS N-4`(이번에 정정)** · `player3d.ts` 주석 |
| 명단은 KM26 배치(선발→후보→그 외 한 통), 전술판 아래 벤치 제거 | `squad.ts` · `style.css .rrow` · **`DESIGN 7.2`(이번에 정정)** · `DECISIONS G-11` |
| 저장 슬롯 5 (10 에서) | `squad.ts SLOT_COUNT` · **`DESIGN 5.10`(이번에 정정)** |
| 경기 중 로비로/설정 분리 · 설정 패널을 로비와 공유 | `ui/settings.ts` · `session.ts showSettings/confirmQuit` · `renderer3d.ts setShadows/setResScale` · `lobby.ts` · `DESIGN 7.2` · `DECISIONS G-14` · 플레이 가이드 |
| Esc 는 `overlay.hidden` 으로 판단 (`paused` 아님) | `session.ts toggleMenu` · `DECISIONS G-15` |
| 공지글은 코드 블록 안에 둔다 (줄바꿈 보존) | `docs/공지글-모음.md` — 문안 · 짧은 문안 · 댓글 상투구 · 2차 틀 · "고치기 전 확인" 표 |
| 게임패드 개발 안 함 (백로그에도 없음) | `DESIGN 1.3 · 3.2 · 13장` · README · 첫 화면 · 공지글 — **전 문서 일관 확인** |

> **결정 전파 검증 (2026-09-11)** — 위 항목을 grep 으로 전 범위 검색했다.
> 잔재 4건(`DESIGN 5.10` 슬롯 10·코드 복사 / `DECISIONS N-4` col2 / `DESIGN 7.2` 옛 배치 / `player3d.ts` 주석)과
> 용어 2건(사용자 문서의 "벤치 7" → "후보 7")을 **모두 이번 커밋에서 정정**했다.
> `CHANGELOG` 의 옛 차수 기록(슬롯 10, 테스트 81개 등)은 **과거 기록이므로 그대로 둔다** (KLD26 에서 정한 규칙).

---

## 다음 단계

### [미반영] — 없음

2026-09-11 검증에서 나온 잔재는 전부 정정해 커밋했다(`17ea693`). 그 뒤 코인토스(G-13)도 DESIGN 2·6.1·6.3·7.1·7.2 · DECISIONS · CHANGELOG · 플레이 가이드에 함께 넣었다.

**7차 검증에서 새로 찾아 고친 잔재 2건** (공지글을 다시 쓰며 공개 문구를 전부 훑다가 나왔다):

| 잔재 | 정본 | 고침 |
|---|---|---|
| `index.html` `<meta name="description">` 이 **선수 1,024명** (2026-09-09 명단 갱신 전 숫자) | `src/data/cards.json` = **1,056명 · 29구단** (`dataHash b53cd9ed65ffe691`) | 1,056 으로 |
| `README.md` 의 "선발↔**벤치**" | 사용자 문서 용어는 **후보** (6차에서 통일) | 후보로 |

`CHANGELOG` 의 옛 차수에 남은 1,024 는 **과거 기록이라 그대로 둔다**. 그 밖에 남은 구버전 표기 없음.

### 사용자가 먼저

1. **다시 한 판** — 24건이 손에 맞는지: GK 다이브 · `›` 방향 표시 · D 홀드 자동 추격 · 슛 코너 고르기 · 추가시간 자막/휘슬 · 세로 전술판 · 명단 표 · **코인토스와 홈 컬러 관중석**.
2. **B-1 다른 회선 두 대로 대전** — 로컬 두 탭은 통과. NAT 는 같은 PC 로 못 잡는다. (PREP B-1)
3. **공개 채널 정하기** — `docs/공지글-모음.md` 1차 문안 준비됨. 스크린샷 셋(스쿼드 · 골 · 방향 표시).

### 다음 세션

| 순위 | 작업 | 끝났다의 기준 |
|---|---|---|
| 1 | 2차 피드백 반영 | 사용자가 "됐다" |
| 2 | **강화가 값을 하게** — 지금 수비 +2.7%p · 공격 +2.0%p (목표 8~15). 강화 +1 = 능력치 40종 +1 인데 경기 스킬 곱셈 안에서 묻힌다. **강화분을 스킬에 직접 얹는 방법**(예: 레벨당 ×1.02)을 재 볼 것 | `npm run verify 200` 에서 +8%p 이상 |
| 3 | 파울 빈도 — 합성 40판에서 17.5/판(많다). Space 돌진 태클이 늘렸을 수 있다 | `npm run balance -- 120` 에서 10~13 |
| 4 | 단계 8 공개 — 공지 올리기 · README 배포 상태 갱신 | 공지 게시 |

---

## 보류 / 백로그

| 항목 | 보류 사유 + 재개 조건 |
|---|---|
| **홈/원정 42.5%** (verify 200, 시드 5000+) | `npm run asym 100`(시드 7000+)에서 51.7% · 하프별 기울기 없음 → **잡음으로 판단**. `npm run asym 200` 이 47~53% 면 닫는다. 원정 슛이 두 하프 모두 +10% 인 것만 지켜볼 것 |
| `verify 200` 이 20분 넘게 걸린다 | 효과 크기만 따로 재는 옵션이 있으면 강화 튜닝이 빨라진다. 강화 작업을 시작할 때 |
| 감아차기(Z+D) · 개인기(C) · 강슈팅(F+D+D) | 스핀·개인기 애니메이션이 없다. v1 은 강슛으로 대체. 스핀이 들어오면 |
| 게임패드 | **하지 않는다** — 백로그가 아니라 계획 제외 (사용자 결정) |
| 폰 지원 | **하지 않는다** — PC 전용 (사용자 결정) |
| 감독 모드 · 2v2 · 재접속/난입 · 연장·승부차기 · 로컬 전적 | DESIGN 13장 그대로 |
| Nostr 릴레이 2곳이 늘 실패 | `relay.agorist.space` · `relay.oldenburg.cool` 이 로컬 개발 내내 WebSocket 실패(콘솔 오류 대부분이 이것). 다른 릴레이로 방은 잡히므로 급하지 않다. **B-1 다른 회선 대전에서 방이 안 잡히면** 목록에서 빼고 살아 있는 릴레이로 교체 |
| `.bench` / `.bchip` CSS | 2026-09-11 부터 아무도 안 쓴다(전술판 아래 벤치 제거). 지워도 되지만 위험 없어 남겨 뒀다 — CSS 정리할 때 함께 |

---

## 주의사항 & 교훈

앞 세션 것(1~41)은 그대로 유효하다. 이번에 더한 것:

42. **짧은 CSS 클래스 이름은 반드시 `grep` 하고 짓는다.** `.mini` 를 로비 급여 게이지에 쓴 다음 날 선수 목록 막대에도 붙여 게이지가 24px 로 쪼그라들었다(2026-09-11 제보). KMD26 의 `slot` 과 같은 실수 — 화면 접두어(`sq-`·`lobby-`)를 붙이는 편이 안전하다.
43. **`width: %` 로 덮는 별점은 span 폭이 글자 폭이어야 한다.** 그리드/플렉스 칸에서 늘어나면 덮개가 별 다섯을 다 덮어 전부 만점처럼 보인다. `.stars { width: max-content }`.
44. **"닿을 수 있는 거리"와 "손이 닿는 거리"는 다르다.** 도달 가능 반경 안이면 그 자리에서 잡게 하면 공이 순간이동한다. 몸을 **먼저 옮기고** 손 거리에서만 잡아야 한다 — 같은 함정이 태클·압박에도 있다.
45. **사람 조작 보조는 "절대 골문 밖을 조준하지 않는다"가 기본값**이어야 한다. 방향키는 코너 선택으로만 쓴다. "빗나가기"로 해석되면 사용자는 버그로 느낀다.
46. **하프 종료는 시계가 아니라 데드볼로 끝낸다.** 시계만 보면 슛 직전에 끊긴다. 유예(20초)를 두되 무한히 기다리지 않는다.
47. **KM26 문서(`../km/docs`)의 줄 번호는 우리 `index.html` 과 다르다.** 문서는 33,407줄 기준, 우리 사본은 92,030줄 — **함수 이름으로 grep** 할 것.
48. **Read 도구가 "unchanged since last Read" 라고 잘못 볼 때가 있다** (다른 PC 커밋을 pull 한 직후). `cat -n` 으로 읽으면 된다 — Edit 는 디스크 기준이라 그대로 동작한다.
49. **PowerShell 에서 python heredoc 은 한글·이모지에서 깨진다** (`cp949`). 스크립트를 **파일로 써서** 실행할 것 (메모리의 "heredoc 금지"와 같은 이유).
50. 입력을 화면에 보여 주는 것(방향 표시)은 **렌더가 `team.inX/inY` 를 읽으면 된다** — sim 에 아무것도 더하지 않는다(결정론 무관).
55. **팀이 뒤집힐 수 있게 만들었으면 "팀 번호를 박아 둔 곳"을 전부 grep 한다.** 코인토스(G-13)에서 `meTeam` 을 도입하고도 `inputs = [inp, EMPTY_INPUT]` 한 줄이 0번 칸에 고정돼 있어 원정이면 선수가 얼어붙었다(G-16). **배선은 순수 함수로 빼면 테스트가 잡는다** (`soloInputs`).
51. **온라인에서는 `paused` 로 "창이 떠 있나"를 판단하면 안 된다.** 락스텝이라 온라인은 언제나 `paused === false` 다. 창 상태는 `overlay.hidden` 처럼 **화면 자체**에서 읽는다.
52. **Three.js 에서 `shadowMap.enabled` 를 껐다 켜면 재질을 전부 `needsUpdate` 해야 한다.** 셰이더가 컴파일된 채로 남아 화면이 안 바뀐다 — 텍스처 `clone` 때와 같은 함정(교훈 6차).
53. **로비와 경기 중처럼 같은 설정을 두 곳에서 보여 줄 때는 HTML 생성 함수를 공유한다.** 따로 쓰면 한쪽만 고쳐진다. 반영은 `hooks` 로 주입해 로비(렌더러 없음)와 경기(렌더러 있음)가 같은 코드를 쓰게 했다.
54. **마크다운 문서에 붙여 넣을 문안을 쓸 때는 코드 블록에 넣는다.** 줄바꿈 하나는 렌더링에서 공백이 되어 문단이 한 덩어리로 뭉친다 — 사용자가 "줄바꿈 제대로" 라고 지적한 원인.

---

## 중요 파일 맵

| 경로 | 역할 |
|---|---|
| `docs/DESIGN.md` | **설계서 정본** (2·3.1·3.3·4.7·4.8·5.10·7.1·7.2 가 이번에 바뀜) |
| `docs/DECISIONS.md` | **9장 F-1~F-11**(엔진 제보) · **10장 G-1~G-15**(스쿼드 화면·유니폼·코인토스·설정 분리) |
| `docs/PREP.md` | 사용자가 직접 할 것 — **B-1 다른 회선 대전**만 남음 |
| `docs/플레이-가이드.md` | 처음 하는 사람용 (조작·명단·JSON·구단 필터) |
| `docs/공지글-모음.md` | 공개 문안 — 1차 긴 문안 · 짧은 문안 · 댓글 상투구 · 2차 틀 · **고치기 전 확인 표**(문안의 숫자마다 정본 경로) |
| `src/core/ball.ts` | 소유·태클·파울·패스·스로인·슛(**블록**)·**GK 세이브/펀트**·오프사이드 |
| `src/core/rules.ts` | 킥오프(**kickoffTarget**)·아웃·프리킥·PK·카드·교체·**advanceClock(추가시간)** |
| `src/core/sim.ts` | createState / step / hashState · **사람 입력 해석**(수비 자동 추격·다이브 비행) |
| `src/core/ai.ts` | 팀 AI · 압박 슬라이더 · 라인 지키기 · **gkRush** |
| `src/core/state.ts` | 상수·타입 (`ADDED_MAX_MIN 5` · `END_GRACE_SEC 20` · `gkRush` · `stoppage`/`added`) |
| `src/ui/squad.ts` | **스쿼드 화면 전부** — 세로 전술판 · 명단 표(`rosterHead`/`slotRow`/`cardRow`) · `autoFill` · `pinToBench` · JSON · `cancel` |
| `src/ui/settings.ts` | 설정 값(localStorage) + **로비·경기 공용 패널** `settingsPanelHtml`/`bindSettingsPanel` |
| `src/game/session.ts` | 경기 진행 · 오버레이 전부 (`showMenu`/`showSettings`/`confirmQuit`/`showSubs`/`showToss`) |
| `src/ui/stars.ts` | 별점 `starHtml` · 능력치 눈금 `pipsHtml` (숫자를 안 보여 준다) |
| `src/cards/cards.ts` | 6스탯 · OVR · 급여 · **ovrStars/statStars** · `SIX_FIELD`/`SIX_GK` |
| `src/render3d/kits.ts` | 유니폼 — **홈 단색 · 원정 전신 흰색**(GK 제외) |
| `src/render3d/player3d.ts` | 찰흙 선수 (`SLIM 0.8` — 몸통·팔다리 굵기) |
| `src/render3d/renderer3d.ts` | 방송 카메라 · **방향 표시 `chev`** |
| `src/render/hud.ts` | 전광판(`45'+2`) · 배너(킥오프·추가시간 자막) |
| `tests/feedback.test.ts` | **2026-09-10 제보 회귀 테스트** (GK 순간이동 · 백패스 · 슛 보조 · 추가시간 · 수비 키) |
| `tools/asym.ts` | 홈/원정 비대칭 진단 (같은 스쿼드 · 하프별) |

### 재현 명령

```bash
npm install
npm test               # 12 파일 · 94개
npm run build
npm run dev            # http://localhost:5175/KLO26/
npm run verify 200     # 단계 7 검증 (20분 이상 — 표본을 줄이지 말 것)
npm run asym 100       # 홈/원정 비대칭 진단
npm run balance -- 120
npm run oneone 400 14  # 1대1 전환율
npm run cards          # 카드 OVR 보정 · 급여 상한
npm run clubs 90       # 실제 구단끼리 계측
npm run build:cards    # 원본 명단 → src/data/cards.json (원본은 저장소 밖)
```

원본 명단 갱신 절차(KM26 → KMD26 도구 → `build_cards.py`)와 그때 걸리는 함정 둘은 **CHANGELOG 2026-09-09 항목**에 그대로 있다.

브라우저 콘솔에서 `__klo.state()` · `__klo.hashes()` · `__klo.net()` · `__klo.snd()`.
**테스트 모드**: `http://localhost:5175/KLO26/?test=1` (AI 대 AI 관전 · 키 입력 표시).

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
