# 개리그 온라인 2026 (KLO26)

**K리그 2026 29개 구단 1,024명으로 내 스쿼드를 짜서, 브라우저에서 P2P 로 1:1 실시간 조작 축구 대전.**
설치·가입·서버 없음. PC 전용. 비공식 팬 프로젝트이며 비상업입니다.

> 🚧 **설계 단계 (2026-09-08).** 게임은 아직 없습니다. 설계서와 뼈대만 있습니다.

- 배포 예정: <https://goormigrm.github.io/KLO26/>
- 저장소: <https://github.com/goormigrm/KLO26>

## 이런 게임이 됩니다

- **카드 1,024장 전원 개방** — 뽑기도 이적시장도 없습니다. 대신 **급여 상한** 안에서 골라야 합니다.
- **팀컬러** — 선발 11명 중 같은 구단이 5·7·9·11명이면 전원 능력치 +1·2·3·4.
- **강화는 예산제** — 스쿼드마다 24 포인트, 카드당 +5 까지. 확률 없음.
- **직접 조작** — 공을 가진 선수를 키보드로(게임패드는 나중에). 나머지 20명은 AI. **PC 전용** — 폰에서는 안내만 뜹니다.
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
| [NOTICE.md](NOTICE.md) | 출처 표기 |
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
| `npm test` | vitest |
| `npm run build` | `tsc --noEmit` + vite build → `dist/` |

`main` 에 push 하면 GitHub Actions 가 테스트·빌드 후 GitHub Pages 로 배포합니다.
커밋 작성자는 저장소마다 설정합니다: `git config user.name goormigrm` / `git config user.email 1117tkdrms@gmail.com`

### Claude Code 로 이어서 개발하기

저장소 폴더를 열고 **"HANDOVER.md 읽고 이어서 진행해줘"** 한 줄이면 됩니다.

### 구조 (계획 — 설계서 8장)

```
src/core/     결정론 시뮬레이션 (물리·규칙·AI·포메이션·스킬) — 렌더/DOM 금지
src/cards/    카드 6스탯·OVR·급여·스쿼드 규칙·스쿼드 코드
src/net/      Trystero 로비·방, 2인 락스텝
src/game/     세션 루프, 입력(키·패드·터치), Worker 틱 타이머
src/render3d/ Three.js 방송 카메라·찰흙 선수(키 반영)·피치·공
src/render/   HUD(DOM 오버레이)·레이더
src/audio/    효과음 (Web Audio 절차 생성)
src/ui/       로비·스쿼드·대기실·결과·설정
tools/        카드 빌드 · 캘리브레이션 · 밸런스 계측
tests/        vitest
```

**핵심 규칙**: `src/core/` 에서는 `Math.random`·삼각함수·시간 함수를 쓰지 않습니다. 두 브라우저가 같은 입력으로 같은 결과를 내야 하기 때문입니다. [docs/DESIGN.md](docs/DESIGN.md) 4.12.

## 만드는 것

TypeScript · Vite · Trystero(WebRTC) · Three.js · GitHub Pages. 그래픽·소리는 전부 코드로 생성하고 외부 에셋·3D 모델을 쓰지 않습니다.

**비용 원칙**: 카드 등록이 필요한 서비스는 무료 티어라도 쓰지 않습니다(TURN 배제). GitHub Pages·Google Fonts·공개 릴레이·무료 STUN 만 씁니다.

## 고지

비공식 팬 프로젝트입니다. 한국프로축구연맹 및 각 구단, 넥슨·EA 와 아무 관련이 없습니다. 구단 엠블럼·선수 사진·유니폼 디자인·선수 실명을 사용하지 않으며, 선수 모델은 실존 인물을 닮게 만들지 않습니다. 광고·결제·후원이 없습니다.
선수 데이터는 [개리그 매니저 2026 (KM26 v2.0)](https://github.com/KleagueM2026/KM26v2.0) 에서 왔습니다 ([NOTICE](NOTICE.md)). 문제가 되면 즉시 내립니다.
