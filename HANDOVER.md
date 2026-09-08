# HANDOVER — 2026-09-08

> **이 문서가 최신입니다.** 새 프로젝트의 첫 핸드오버 — 설계만 있고 게임 코드는 없습니다.

## 세션 메타데이터

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-08 |
| 작업 디렉터리 | `C:\Users\tkdrm\Workspace\personal\KLO26` |
| 저장소 | `https://github.com/goormigrm/KLO26` · `main` · **첫 커밋 푸시됨** (2026-09-08) |
| 배포 | 아직 — Pages 를 Actions 로 켜야 한다 (PREP A-3). 켜면 `https://goormigrm.github.io/KLO26/` |
| 참고한 곳 | `../km`(KM26 원본 + docs 9종) · `../KMD26v1.0`(데이터·코드 규격·문서 체계) · `../철FPS/bedorage-duck`(P2P·락스텝·결정론·배포) |

이 세션의 산출물은 전부 첫 커밋에 들어갔습니다. 두 PC 를 오가므로 다음 세션은 `git fetch origin && git status -sb` 부터.

---

## 이 세션에서 한 것

**설계.** 사용자 요청 — "개리그 매니저 같은 개리그 온라인. FC 온라인 형식, 2026 K리그 선수만, 철FPS 처럼 방 만들어 P2P, 서버·DB 없음, 팬 게임(저작권·광고·결제 없음)".

1. 세 프로젝트를 읽고 무엇을 가져올지 갈랐다 (DESIGN 1장).
2. 사용자에게 갈림길 셋을 물었고 답을 받았다 (DECISIONS 1장):
   **직접 조작(액션)** · **전원 개방 + 급여 상한** · **KLO26**.
3. `docs/DESIGN.md` 설계서 v0.1 (13장) · `DECISIONS.md` · `PREP.md` · README · NOTICE · CHANGELOG · 공지글 틀.
4. 스캐폴드 — Vite + TypeScript + vitest + Pages 워크플로. `src/core/rng.ts`·`fixedmath.ts` 는 bedorage-duck 에서 그대로 복사(결정론의 바닥). `npm install` · `npm test` · `npm run build` 통과 확인.
5. 추가 결정 7건 반영 (DECISIONS 3장) — **보호명** · 기본 3분 · **키보드만**(패드 미검증) · 급여 상한 조건 **K리그2 포함** · 공개 채널 보류 · **Three.js 방송 카메라**(찰흙 선수·키 반영·피부색 안 함) · **PC 전용**(폰 차단). `three` 의존성 추가. 첫 커밋·푸시.

---

## 주요 결정 사항

| 결정 | 근거 | 반영 위치 |
|---|---|---|
| **직접 조작** — KM26 매치엔진 안 씀 | 사용자 답 (Q1). 감독 모드는 백로그 | DESIGN 1·4장, DECISIONS Q1 |
| **카드 전원 개방 · 급여 상한 · 강화 예산제 · 팀컬러** | 서버 없이 "상대가 검증할 수 있는 규칙"만 남긴다 | DESIGN 5장 |
| **Three.js 방송 카메라 · 찰흙 선수 · 키 반영** | 사용자 결정. 피부색은 데이터가 없어 안 함, 생김새는 닮게 그리지 않음 | DESIGN 7.1, DECISIONS 3장 6 |
| **PC 전용 — 폰 차단** | 사용자 결정. 터치 조작 없음 | DESIGN 3.4, DECISIONS 3장 7 |
| **선수 이름 보호명** (빌드 단계 적용) | 사용자 결정. 저장소에 실명 0건이 단계 1 기준 | DESIGN 10.2, NOTICE |
| **키보드만 검증** | 검증할 패드가 없다 | DESIGN 3.2 |
| **60Hz 락스텝 · 정원 2 · 난입/재접속 없음** | bedorage-duck 검증값. 축구는 한쪽이 비면 성립 안 함 | DESIGN 6장 |
| **급여 상한은 도구가 데이터로** | 손으로 정한 숫자를 믿지 않는다 (KLD26·KMD26 교훈) | DESIGN 5.4, D-9 |
| **데이터는 허락 재확인 전에 저장소에 넣지 않는다** | KMD26 허락은 KMD26 것 | PREP A-1 |

---

## 다음 단계

### 사용자가 먼저 (PREP A)

1. **A-1 원작자 허락 재확인** — 단계 1 이 여기 걸려 있다.
2. **A-3 Pages 켜기** (Settings → Pages → Source: GitHub Actions). 첫 푸시의 워크플로는 Pages 가 꺼져 있으면 deploy 단계에서 실패한다 — 켜고 다시 돌리면 된다(Actions 탭 → Re-run).

### 다음 세션 (단계 0 → 1 → 2)

| 순서 | 무엇 | 끝났다의 기준 |
|---|---|---|
| 0 | 첫 커밋 · `gh repo create` · Pages 배포 확인 | 빈 페이지가 배포 주소에서 열린다 |
| 1 | `tools/build_cards.py` (KMD26 `data/players.json` → `src/data/cards.json`) · `tools/calibrate.py` (OVR 앵커 · 급여 상한) | DESIGN 11장 1단계 기준 |
| 2 | `src/core` 시뮬 코어 — 피치·공·선수·소유·패스·슛·GK·기본 AI · 봇 vs 봇 헤드리스 | 같은 시드 100회 해시 일치 · 틱당 < 0.5 ms · 평균 골 2~4/6분 |
| 3 | Three.js 방송 카메라 · 찰흙 선수(키 `h/180`) · 피치 · 키보드 · 폰 차단 · 혼자 하기 | DESIGN 11장 3단계 기준. bedorage-duck `src/render3d`(카메라·프리미티브 조립·툰) 를 옮겨 오는 것부터 |

**2단계가 고비다.** 결정론이 안 서면 프로젝트가 성립하지 않는다. 여기서 시간을 아끼지 않는다.

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
| `src/main.ts` | 설계 단계 안내 페이지 (단계 3 에서 로비로 바뀐다) |
| `tests/primitives.test.ts` | rng·fixedmath 결정론 테스트 |
| `.github/workflows/deploy.yml` | push → 테스트·빌드 → Pages |
| `.claude/launch.json` | `dev` 서버 (5175) |

### 재현 명령

```bash
npm install
npm test
npm run build
npm run dev            # http://localhost:5175/KLO26/
```

---

> 다음 세션 시작 시 다음 입력으로 컨텍스트 복원:
> `@HANDOVER.md 읽고 이어서 작업 진행`
