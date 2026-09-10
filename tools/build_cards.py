# -*- coding: utf-8 -*-
"""KMD26 선수 데이터 → KLO26 카드 (DESIGN 5.1 · 11장 1단계).

    python tools/build_cards.py [KMD26 data 폴더] [출력]

기본값: `../KMD26v1.0/KMD26v1.0/data` → `src/data/cards.json`

이 도구가 하는 일은 셋이다.

1. **보호명** — 선수 실명을 KM26 `fictName` 규칙으로 바꾼다 (DECISIONS 3장 1 · D-10).
   · 한국 선수: 성씨를 `SURNAME_MAP` 의 다른 실재 성씨로 (김→구, 이→여 …). 이름 뒷글자는 그대로라
     부르는 느낌은 살고 실존 인물과는 겹치지 않는다.
   · 외국 선수: 첫 글자 **초성만 다음 자음으로** 민다 (`shiftCho`).
   · 한 구단 안에서 결과가 겹치면 마지막 글자의 초성을 밀어 떼어 놓는다 (충돌 회피).
   **저장소에는 실명이 한 건도 남지 않는다** — 이 도구가 끝에서 직접 확인한다.

2. **구단명** — 지역명(공공 지명)은 그대로 두고, **기업·구단 고유 명칭은 쓰지 않는다**
   (DESIGN 10.2 "고지 대신 안 쓰는 것으로 답한다"). 아래 `CLUB_NAME` 표 한 곳만 고치면 된다.

3. **컬럼 형식으로 굽는다** — 키 이름을 1,024번 되풀이하지 않도록 값만 배열로 넣는다.
   그냥 객체로 쓰면 약 700 KB, 이렇게 하면 약 1/3 이다.

원본 데이터(실명)는 저장소 **밖**에 있고, 여기서 읽기만 한다.
"""

import io
import json
import os
import sys

# ---------------------------------------------------------------- 보호명

# KM26 index.html 의 SURNAME_MAP 그대로. 여러 성이 같은 성으로 모여도 괜찮다 —
# 실제 한국도 김·이·박이 인구의 절반이다.
SURNAME_MAP = {
    "김": "구", "이": "여", "박": "반", "정": "진", "최": "추", "조": "석", "강": "공", "윤": "은",
    "장": "지", "임": "인", "한": "함", "오": "육", "서": "선", "신": "설", "권": "금", "황": "현",
    "안": "어", "송": "소", "류": "나", "전": "천", "홍": "변", "고": "국", "문": "민", "양": "염",
    "손": "표", "배": "방", "백": "봉", "허": "기", "남": "마", "심": "사", "노": "도", "하": "피",
    "곽": "길", "성": "소", "차": "채", "주": "탁", "우": "위", "유": "예", "지": "제", "원": "명",
    "민": "맹", "진": "위", "구": "공", "엄": "연", "채": "제", "천": "단", "방": "봉", "석": "설",
    "선": "성", "공": "곽", "연": "염", "여": "예", "은": "인", "금": "강", "현": "함", "도": "두",
}

# 초성 index → 다음 초성 index (KM26 CHO_NEXT)
CHO_NEXT = {0: 2, 1: 2, 2: 3, 3: 5, 4: 5, 5: 6, 6: 7, 7: 9, 8: 9, 9: 11,
            10: 11, 11: 12, 12: 14, 13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 0}

HANGUL_BASE = 0xAC00
HANGUL_LAST = 0xD7A3


def shift_cho(ch):
    """한 글자의 초성을 다음 자음으로 민다. 한글이 아니면 그대로."""
    c = ord(ch)
    if c < HANGUL_BASE or c > HANGUL_LAST:
        return ch
    i = c - HANGUL_BASE
    cho = i // 588
    return chr(HANGUL_BASE + CHO_NEXT[cho] * 588 + (i % 588))


def fict_name(name, foreign):
    """KM26 fictName — 한국 선수는 성씨 치환, 외국 선수는 첫 글자 초성 시프트."""
    if not name:
        return name
    head = name[0]
    if foreign:
        return shift_cho(head) + name[1:]
    return SURNAME_MAP.get(head, shift_cho(head)) + name[1:]


def dedupe(name, *forbidden):
    """
    겹치면 마지막 글자의 초성을 밀어 떼어 놓는다.

    피해야 하는 것이 둘이다.
    · **원본에 실제로 있는 이름** — 성씨를 바꾸다 보면 하필 다른 실존 선수의 이름이 되는 수가 있다
      (정호진 → 진호진 인데 진호진이 실제로 명단에 있는 식). 그러면 보호가 아니다.
    · 같은 구단 안의 다른 보호명 — 스쿼드 화면에서 헷갈린다.
    """
    def bad(n):
        return any(n in f for f in forbidden)

    if not bad(name):
        return name
    for _ in range(8):
        if len(name) < 2:
            break
        name = name[:-1] + shift_cho(name[-1])
        if not bad(name):
            return name
    # 그래도 겹치면 가운데 글자까지 민다 (실제로는 여기까지 오지 않는다)
    if len(name) >= 3:
        for _ in range(8):
            name = name[0] + shift_cho(name[1]) + name[2:]
            if not bad(name):
                return name
    raise SystemExit("이름 충돌을 못 풀었다: %s" % name)


# ---------------------------------------------------------------- 구단명
#
# 지역명은 공공 지명이라 그대로 둔다. **기업명·구단 고유 별칭은 쓰지 않는다** —
# 고지 문구를 붙이는 대신 아예 안 쓰기로 한 결정(DESIGN 10.2)을 구단명에도 그대로 적용한 것이다.
# 같은 지역 두 구단(서울/서울E · 수원/수원FC)은 접미어로 갈랐다.
# 바꾸고 싶으면 이 표만 고치면 된다.
CLUB_NAME = {
    "ansan": "안산 울브스",
    "anyang": "안양 치토스",
    "asan": "아산 블루피닉스",
    "bucheon": "부천 레드 FC",
    "busan": "부산 빅쉴드",
    "cheonan": "천안 시티즌",
    "cheongju": "청주 레이크 FC",
    "daegu": "대구 아프리카누스",
    "daejeon": "대전 브레드 FC",
    "gangwon": "강원 포테이토스",
    "gimcheon": "김천 국군 FC",
    "gimhae": "김해 가야 FC",
    "gimpo": "김포 골든라이스 FC",
    "gwangju": "광주 빛고을 FC",
    "gyeongnam": "경남 레드스톰",
    "hwaseong": "화성 피닉스 FC",
    "incheon": "인천 포트 FC",
    "jeju": "제주 오션 유나이티드",
    "jeonbuk": "전북 모터스",
    "jeonnam": "전남 용가리 FC",
    "paju": "파주 유나이티드",
    "pohang": "포항 강철 축구단",
    "seongnam": "성남 블랙스타",
    "seoul": "서울 한강 FC",
    "seoule": "서울 이스트 FC",
    "suwon": "수원 블루스타",
    "suwonfc": "수원 레드윙스",
    "ulsan": "울산 오션 FC",
    "yongin": "용인 드래곤즈 FC",
}

# ---------------------------------------------------------------- 형식

# 시뮬(`src/core/skills.ts`)과 카드 6스탯(`src/cards/cards.ts`)이 읽는 키만 굽는다.
ATTR_KEYS = ["pac", "acc", "agi", "bal", "jum", "str", "sta", "fir", "tec", "dri", "pas", "vis",
             "crs", "fin", "lon", "pen", "hea", "cmp", "dec", "cnt", "ant", "pos", "mar", "tck",
             "agg", "bra", "fla", "wor", "tea"]
GK_KEYS = ["ref", "one", "han", "cmd", "aer", "com", "kic", "pun", "tro", "ecc"]
FAM_KEYS = ["GK", "SW", "DC", "DL", "DR", "WBL", "WBR", "DM", "MC", "ML", "MR",
            "AMC", "AML", "AMR", "LW", "RW", "ST"]
POS_LIST = ["GK", "DF", "MF", "FW"]
FOOT_LIST = ["R", "L", "B"]
FOOT_MAP = {"오른발": 0, "왼발": 1, "양발": 2}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        repo, "..", "KMD26v1.0", "KMD26v1.0", "data")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(repo, "src", "data", "cards.json")

    def load(name):
        with io.open(os.path.join(src, name), encoding="utf-8") as f:
            return json.load(f)

    meta = load("meta.json")
    teams = load("teams.json")["teams"]
    players = load("players.json")

    print("원본 %s · dataHash %s · 선수 %d · 구단 %d"
          % (meta.get("source", "?"), meta.get("dataHash"), meta.get("playerCount"), meta.get("teamCount")))

    # ---- 구단 ----
    club_ids = sorted(teams.keys())
    clubs = []
    for cid in club_ids:
        t = teams[cid]
        name = CLUB_NAME.get(cid)
        if not name:
            raise SystemExit("CLUB_NAME 에 %s 가 없다 — 표를 채워야 한다" % cid)
        clubs.append({
            "id": cid,
            "name": name,
            "short": t["short"],
            "div": t["div"],
            "col": t["col"],
            "col2": t["col2"],
        })
    club_index = {cid: i for i, cid in enumerate(club_ids)}

    # ---- 선수 ----
    # 원본 이름을 먼저 전부 모은다 — 보호명이 **다른 실존 선수**의 이름이 되는 것을 막아야 한다
    real_names = set()
    for cid in club_ids:
        for p in players[cid]:
            real_names.add(p["name"])

    rows = []
    renamed = 0
    collisions = 0
    for cid in club_ids:
        taken = set()
        for p in players[cid]:
            real = p["name"]
            nm = fict_name(real, p.get("frn"))
            before = nm
            nm = dedupe(nm, real_names, taken)
            if nm != before:
                collisions += 1
            taken.add(nm)
            if nm != real:
                renamed += 1
            attr = p.get("attr", {})
            fam = p.get("posFam", {})
            gk = p.get("gkA")
            row = [
                p["id"],
                nm,
                p.get("no", 0),
                POS_LIST.index(p["pos"]) if p["pos"] in POS_LIST else 2,
                p.get("h", 178),
                p.get("w", 74),
                FOOT_MAP.get(p.get("foot"), 0),
                club_index[cid],
                [int(attr.get(k, 50)) for k in ATTR_KEYS],
                [int(gk.get(k, 25)) for k in GK_KEYS] if gk else 0,
                [int(fam.get(k, 0)) for k in FAM_KEYS],
            ]
            rows.append(row)

    # ---- 실명이 한 건도 안 남았는지 확인 (단계 1 검토 기준) ----
    leaked = [r[1] for r in rows if r[1] in real_names]
    if leaked:
        raise SystemExit("❌ 실명이 남았다: %s" % leaked[:10])
    if renamed != len(rows):
        raise SystemExit("❌ 이름이 안 바뀐 선수가 있다: %d / %d" % (renamed, len(rows)))

    data = {
        "note": "tools/build_cards.py 가 구운 파일입니다. 손으로 고치지 마세요.",
        "dataHash": meta.get("dataHash"),
        "attrKeys": ATTR_KEYS,
        "gkKeys": GK_KEYS,
        "famKeys": FAM_KEYS,
        "posList": POS_LIST,
        "footList": FOOT_LIST,
        "clubs": clubs,
        "players": rows,
    }
    with io.open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(out)
    gk_count = sum(1 for r in rows if r[9] != 0)
    print("카드 %d장 · 구단 %d · GK 능력치 %d명 · 충돌 회피 %d건"
          % (len(rows), len(clubs), gk_count, collisions))
    print("→ %s (%.0f KB)" % (out, size / 1024.0))
    print("실명 0건 확인 ✅")
    # 보호명 예시 (원본은 찍지 않는다)
    print("보호명 예시:", ", ".join(r[1] for r in rows[:8]))


if __name__ == "__main__":
    main()
