# 개리그 온라인 2026 (KLO26)

**K리그 2026 29개 구단 1,024명으로 내 스쿼드를 짜서, 브라우저에서 P2P 로 1:1 실시간 조작 축구 대전.**
설치·가입·서버 없음. PC 전용. 비상업.

> 🚧 **개발 중 (2026-09-09).** 설계서 · 시뮬레이션 코어 · **혼자 하기(봇과 한 판, Three.js 방송 카메라, 키보드 조작)** 까지 있습니다.
> 실제 선수 카드는 아직 없어 **합성 스쿼드(가짜 선수 "홈7" 같은 이름)** 로 돕니다. 온라인 대전·스쿼드 화면은 아직입니다.

- 배포: <https://goormigrm.github.io/KLO26/> — 로비에서 **혼자 하기** 로 봇과 한 판
- 저장소: <https://github.com/goormigrm/KLO26>

## 이런 게임이 됩니다

- **카드 1,024장 전원 개방** — 뽑기도 이적시장도 없습니다. 대신 **급여 상한** 안에서 골라야 합니다.
- **팀컬러** — 선발 11명 중 같은 구단이 5·7·9·11명이면 전원 능력치 +1·2·3·4.
- **강화는 예산제** — 스쿼드마다 24 포인트, 카드당 +5 까지. 확률 없음.
- **직접 조작** — 공을 가진 선수를 키보드로. 키 배치는 **축구 게임에서 익숙한 표준 배치**(방향키 이동 · S 패스 · W 스루 · A 로빙 · D 슛 · E 대시, 수비 때 S 선수 변경 · A 슬라이딩 · D 압박 · Space 태클 · Q 팀 압박 · C 견제). 나머지 20명은 AI.
- **PC 키보드 전용** — 폰에서는 안내만 뜨고, **게임패드는 지원하지 않습니다**(계획에 없습니다).
- **방송 카메라 · 찰흙 선수** — Three.js. 선수 키가 그대로 보이고, 생김새는 닮게 그리지 않습니다.
- **선수 이름은 보호명** — 실명이 아니라 성씨를 바꾼 이름(김→금, 이→리 …)입니다.
- **전후반 3분씩** 실시간(경기 시계 ×15). 오프사이드·파울·세트피스·교체 3명.
- **방을 만들고 P2P 로** — 서버가 없어도 두 브라우저가 같은 경기를 봅니다(결정론 락스텝).
- **혼자 하기** — 봇 3단계.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | **설계서 정본** — 규칙·조작·시뮬·카드·네트워크·화면·개발 단계·검증 기준 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 갈림길과 근거 — 사용자 결정 3건 · 기본안 17건 · 확인 필요 5건 |
| [docs/PREP.md](docs/PREP.md) | 사용자가 직접 해야 하는 것 (허락 재확인 · 저장소 · Pages · 기기) |
| [HANDOVER.md](HANDOVER.md) | 개발 인수인계 **정본** — 현재 상태, 다음 할 일, 작업 규칙 |
| [CHANGELOG.md](CHANGELOG.md) | 변경 이력 |
| [docs/공지글-모음.md](docs/공지글-모음.md) | 공개 때 붙여 넣을 공지 문안 (지금은 틀만) |

## 개발

필요한 것: **Node.js 20 이상**(24 권장), **git**.

```bash
git clone https://github.com/goormigrm/KLO26.git
cd KLO26
npm install
npm run dev     # http://localhost:5175/KLO26/
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm test` | vitest — 결정론 · 성능 · 경기 · 리스타트 킥 · 키 매핑 · 카메라 · 기본 수학 (26개) |
| `npm run build` | `tsc --noEmit` + vite build → `dist/` |
| `npm run balance -- 50` | 봇 vs 봇 50판 계측 (골 분포 · 슛 · 점유 · 패스 성공률) |
| `npm run probe -- 101` | 시드 101 한 경기 진단 (사건 · 공 위치 분포) |

`main` 에 push 하면 GitHub Actions 가 테스트·빌드 후 GitHub Pages 로 배포합니다.
커밋 작성자는 저장소마다 설정합니다: `git config user.name goormigrm` / `git config user.email 1117tkdrms@gmail.com`

### Claude Code 로 이어서 개발하기

저장소 폴더를 열고 **"HANDOVER.md 읽고 이어서 진행해줘"** 한 줄이면 됩니다.

### 구조 (설계서 8장 · ✅ = 있음)

```
src/core/     ✅ 결정론 시뮬레이션 (물리·규칙·AI·포메이션·스킬·합성 스쿼드) — 렌더/DOM 금지
src/cards/       카드 6스탯·OVR·급여·스쿼드 규칙·스쿼드 코드 (단계 5)
src/net/         Trystero 로비·방, 2인 락스텝 (단계 6)
src/game/     ✅ 혼자 하기 세션 루프 · 키보드 입력 · Worker 틱 타이머
src/render3d/ ✅ Three.js 방송 카메라 · 찰흙 선수(키 반영·동작) · 피치·골대·관중석 · 공
src/render/   ✅ HUD(DOM 오버레이) · 레이더
src/audio/       효과음 (Web Audio 절차 생성) — 아직 없음
src/ui/       ✅ 로비 · 설정 · 폰 차단 (스쿼드·대기실은 단계 5·6)
tools/        ✅ 밸런스 계측 · 한 경기 진단 (카드 빌드·캘리브레이션은 단계 1)
tests/        ✅ vitest
```

**핵심 규칙**: `src/core/` 에서는 `Math.random`·삼각함수·시간 함수를 쓰지 않습니다. 두 브라우저가 같은 입력으로 같은 결과를 내야 하기 때문입니다. [docs/DESIGN.md](docs/DESIGN.md) 4.12.

## 만드는 것

TypeScript · Vite · Trystero(WebRTC) · Three.js · GitHub Pages. 그래픽·소리는 전부 코드로 생성하고 외부 에셋·3D 모델을 쓰지 않습니다.

**비용 원칙**: 카드 등록이 필요한 서비스는 무료 티어라도 쓰지 않습니다(TURN 배제). GitHub Pages·Google Fonts·공개 릴레이·무료 STUN 만 씁니다.
