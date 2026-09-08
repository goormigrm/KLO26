# 출처 표기 (NOTICE)

## 선수 · 구단 데이터

`src/data/cards.json`(예정)은 아래 저작물에서 `tools/build_cards.py` 로 만든 것입니다.

- **원본**: [KleagueM2026/KM26v2.0](https://github.com/KleagueM2026/KM26v2.0) — 개리그 매니저 2026
- **경유**: [goormigrm/KMD26v1.0](https://github.com/goormigrm/KMD26v1.0) `data/players.json` · `data/teams.json` (KM26 의 선수 생성 함수를 한 번 돌려 고정한 것, `dataHash 6d4b32c636580eae`)
- **쓰는 범위**: 선수 1,024명의 능력치 40종 · GK 11종 · 포지션 능숙도 · 특성 · 등번호·키·몸무게·주발, 포메이션 12종과 슬롯 좌표, 구단 이름·색 두 개
- **안 쓰는 것**: 매치엔진(`MatchSim`) · CSS · UI

> 📌 **할 일 (PREP A-1)**: KMD26 이 받은 사용 허락이 이 프로젝트에도 미치는지 원작자에게 확인하고, 그 답(이슈 링크)을 여기 남길 것.
> **확인 전에는 데이터를 저장소에 넣지 않는다.**

원본 저장소에는 LICENSE 파일이 없습니다. 라이선스가 명시되지 않은 공개 저장소는 저작권이 유지되므로,
이 프로젝트는 **원저작자의 개별 허락**에 근거해 배포됩니다.

## 코드

- `src/core/rng.ts` · `src/core/fixedmath.ts` 와 `src/net/`(예정)은 같은 작성자의 [goormigrm/bedorage-duck](https://github.com/goormigrm/bedorage-duck) 에서 가져왔습니다.
- 그래픽·소리는 전부 코드로 생성하며 외부 에셋을 쓰지 않습니다. 폰트는 Google Fonts (OFL).

## 선수 이름

**이 프로젝트는 실명을 쓰지 않습니다.** KM26 의 실존 인물 보호 규칙(`fictName` — 국내 선수 성씨 치환, 외국인 첫 글자 초성 시프트)을
`tools/build_cards.py` 가 빌드 단계에서 적용하므로 저장소·화면·코드 어디에도 실명이 남지 않습니다.
엔진과 UI 는 이름에 의존하지 않도록(선수는 항상 id) 설계합니다.

## 상표 · 형식

비공식 팬 프로젝트입니다. 한국프로축구연맹(K League) 및 각 구단과 아무런 관련이 없습니다.
구단 엠블럼·공식 로고·유니폼 디자인·선수 사진을 사용하지 않습니다.
게임 형식은 넥슨·EA 의 FC 온라인을 참고했으나 그 명칭·에셋·코드·UI 를 쓰지 않으며, 두 회사와 무관합니다.
광고·결제·후원이 없습니다. 문제가 되면 즉시 내립니다.
