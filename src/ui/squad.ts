// 스쿼드 화면 (DESIGN 7.2 🃏) — **구단을 먼저 고르고**, 그 구단 선수로 선발·벤치를 채운 뒤 전술판에서 바꾼다.
// 전술판 좌표는 `SLOT_XY` 그대로다 (KM26·KMD26 과 같은 값이라 자리 배치가 같다).
//
// 흐름 (사용자 요청 2026-09-09):
//   1. 구단 고르기 → 2. 그 구단 선수로 선발 11 + 벤치 7 자동 → 3. 전술판에서 자리를 옮기거나 선수를 바꾼다
// 기본 목록은 **그 구단 선수**만 보여 준다. "전 구단"을 켜면 풀 전부 — 급여 상한이 규칙이다 (DESIGN 5.8).
//
// 규칙 검사는 화면이 아니라 `cards/squad.ts` 가 한다 — 받는 쪽도 같은 함수로 다시 센다.

import { FORMATIONS, FORMATION_LIST, SLOT_FAM, SLOT_XY } from '../core/formation'
import { SIX_FIELD, SIX_GK, famColor, ovrStars, sixGKOf, sixOf, statStars } from '../cards/cards'
import {
  ENH_BUDGET, ENH_MAX, SQUAD_SIZE, START_SIZE, cardOvr, cardSalary, checkSquad, clubById, clubSquad, computeCap,
  teamColorBonus, type Squad,
} from '../cards/squad'
import { CLUBS, POOL, POOL_HASH, POOL_SIZE, cardById } from '../data/pool'
import type { Card } from '../cards/cards'
import { sfx } from '../audio/sfx'
import { pipsHtml, starHtml } from './stars'

const SLOTS_KEY = 'klo26.squads'
const CUR_KEY = 'klo26.squad'
/** 자동 채우기 기준 (능숙도 우선 / 능력치 우선) — 브라우저에 기억 */
const AUTO_KEY = 'klo26.autoBy'
type AutoBy = 'fam' | 'ovr'
/** 저장 슬롯 — 10 → 5 (사용자 요청 2026-09-10). 위에 띠로 늘 보인다 */
const SLOT_COUNT = 5
const CAP = computeCap().cap

/**
 * 저장된 스쿼드를 읽는다. 데이터가 바뀌었거나 규칙을 어기면 **버린다**.
 *
 * 지문을 안 보면 자리표시자 시절에 저장한 id 가 실제 명단의 딴 선수를 가리킨다 —
 * 골키퍼 자리에 공격수가 앉아 있던 원인이다 (2026-09-09 제보).
 */
export function loadSquad(): Squad | null {
  try {
    const raw = localStorage.getItem(CUR_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Squad
    if (!s || !Array.isArray(s.ids) || s.ids.length !== SQUAD_SIZE || !FORMATIONS[s.formation]) return null
    if (s.hash !== POOL_HASH) return null
    if (!checkSquad(s, CAP).ok) return null
    return s
  } catch {
    return null
  }
}

/** 스쿼드가 없으면 만들어 준다 (로비·세션이 쓴다) */
export function loadSquadOrDefault(): Squad {
  return loadSquad() ?? defaultSquad()
}

/** 1부 구단 하나로 시작 스쿼드를 만든다 */
export function defaultSquad(): Squad {
  const first = CLUBS.find((c) => c.div === 1) ?? CLUBS[0]
  return withMeta(clubSquad(first.id, '4-3-3'), first.id)
}

function withMeta(sq: Squad, club: number): Squad {
  return { ...sq, hash: POOL_HASH, club }
}

export function saveSquad(s: Squad): void {
  try {
    localStorage.setItem(CUR_KEY, JSON.stringify({ ...s, hash: POOL_HASH }))
  } catch {
    // 사생활 모드 — 저장 못 해도 게임은 된다
  }
}

function loadSlots(): (Squad | null)[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (raw) {
      const a = JSON.parse(raw) as (Squad | null)[]
      // 데이터가 바뀌었으면 그 슬롯은 비운다
      if (Array.isArray(a)) return a.slice(0, SLOT_COUNT).map((s) => (s && s.hash === POOL_HASH ? s : null))
    }
  } catch {
    // 무시
  }
  return new Array(SLOT_COUNT).fill(null)
}

function saveSlots(a: (Squad | null)[]): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(a))
  } catch {
    // 무시
  }
}

const POS_ORDER = ['GK', 'DF', 'MF', 'FW']
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0')

export class SquadScreen {
  private sq: Squad
  private root: HTMLElement
  /** 고른 자리 (0~17). −1 = 없음 */
  private sel = -1
  private filterPos = ''
  /** 목록을 내 구단으로 좁힐지 */
  private ownOnly = true
  private search = ''
  private sort: 'ovr' | 'sal' | 'name' = 'ovr'
  private msg = ''
  /** 'club' = 구단 고르기 · 'board' = 전술판 */
  private mode: 'club' | 'board'
  /** 저장돼 있던 스쿼드가 있는가 — 구단 고르기에서 "그만두고 돌아가기" 를 띄울지 정한다 */
  private hasSquad: boolean
  /** 화면을 열 때의 스쿼드 — "저장 안 하고 돌아가기" 가 이걸로 되돌린다 (사용자 요청 2026-09-10) */
  private original: Squad | null
  private autoBy: AutoBy
  private snd = sfx()

  constructor(
    host: HTMLElement,
    private onDone: (s: Squad) => void,
    /** 'club' 이면 구단 고르기부터 연다 (로비의 "구단 바꾸기") */
    startAt: 'edit' | 'club' = 'edit',
  ) {
    const saved = loadSquad()
    this.sq = saved ?? defaultSquad()
    this.hasSquad = !!saved
    this.original = saved ? (JSON.parse(JSON.stringify(saved)) as Squad) : null
    let by: AutoBy = 'fam'
    try {
      if (localStorage.getItem(AUTO_KEY) === 'ovr') by = 'ovr'
    } catch {
      // 무시
    }
    this.autoBy = by
    // 저장된 스쿼드가 없거나 버려졌으면 구단 고르기부터. 있으면 바로 **수정**으로 (사용자 요청 2026-09-09)
    this.mode = saved && startAt === 'edit' ? 'board' : 'club'
    if (!saved) this.msg = '구단을 고르면 그 구단 선수로 선발 11명과 벤치 7명을 채웁니다.'
    this.root = document.createElement('div')
    this.root.className = 'squad'
    host.appendChild(this.root)
    this.draw()
  }

  // ---------------------------------------------------------------- 도우미

  private slotName(i: number): string {
    if (i === 0) return 'GK'
    if (i < START_SIZE) return FORMATIONS[this.sq.formation][i - 1][1]
    return `벤치 ${i - START_SIZE + 1}`
  }

  /** 그 자리의 능숙도 (DESIGN 5.7) */
  private famAt(c: Card, i: number): number {
    if (i >= START_SIZE) return 100
    const slot = i === 0 ? 'GK' : FORMATIONS[this.sq.formation][i - 1][1]
    return c.posFam?.[SLOT_FAM[slot] ?? 'MC'] ?? 50
  }

  private myClub(): number {
    if (this.sq.club !== undefined) return this.sq.club
    return teamColorBonus(this.sq.ids.slice(0, START_SIZE)).club
  }

  // ---------------------------------------------------------------- 구단 고르기

  private drawClubs(): void {
    const rows = CLUBS.map((c) => {
      const own = POOL.filter((p) => p.club === c.id)
      const avg = own.reduce((a, p) => a + cardOvr(p, 0), 0) / own.length
      const best = own.slice().sort((a, b) => cardOvr(b, 0) - cardOvr(a, 0))[0]
      return `<button class="clubcard" data-club="${c.id}" style="--c:${hex(c.col)}">
        <span class="cbar"></span>
        <b>${c.name}</b>
        <small>${c.div === 1 ? 'K리그1' : 'K리그2'} · 선수 ${own.length}명 · 평균 ${starHtml(ovrStars(avg), true)}</small>
        <em>최고 ${best.name} ${starHtml(ovrStars(cardOvr(best, 0)), true)}</em>
      </button>`
    }).join('')
    this.root.innerHTML = `
      <div class="sq-top">
        <h1>구단 고르기</h1>
        <div class="row">
          ${this.hasSquad ? '<button class="btn secondary" id="sq-keep">그만두고 스쿼드 수정으로</button>' : ''}
          <button class="btn secondary" id="sq-back">저장 안 하고 로비로</button>
        </div>
      </div>
      <p class="hintline">구단을 고르면 <b>그 구단 선수로 선발 11명과 벤치 7명을 자동으로 채웁니다.</b>
      그 뒤 전술판에서 자리를 옮기거나 다른 선수로 바꿀 수 있습니다. 한 구단으로만 채우면 <b>팀컬러 +4</b> 가 붙습니다.</p>
      ${this.msg ? `<div class="okmsg">${this.msg}</div>` : ''}
      <div class="clubgrid">${rows}</div>`
    this.root.querySelectorAll<HTMLButtonElement>('[data-club]').forEach((b) => {
      b.onclick = () => {
        const id = Number(b.dataset.club)
        this.sq = withMeta(clubSquad(id, this.sq.formation || '4-3-3'), id)
        this.ownOnly = true
        this.sel = -1
        this.mode = 'board'
        this.hasSquad = true
        this.msg = `${clubById(id)?.name ?? ''} 선수로 채웠습니다 — 팀컬러 +4`
        this.snd.ui('ok')
        saveSquad(this.sq)
        this.draw()
      }
    })
    const keep = this.root.querySelector<HTMLButtonElement>('#sq-keep')
    if (keep) {
      keep.onclick = () => {
        this.mode = 'board'
        this.msg = ''
        this.snd.ui('click')
        this.draw()
      }
    }
    ;(this.root.querySelector('#sq-back') as HTMLButtonElement).onclick = () => this.cancel()
  }

  // ---------------------------------------------------------------- 전술판

  private draw(): void {
    if (this.mode === 'club') {
      this.drawClubs()
      return
    }
    const sq = this.sq
    const check = checkSquad(sq, CAP)
    const color = check.color
    const club = color.club >= 0 ? clubById(color.club) : undefined
    const salPct = Math.min(100, (check.salary / CAP) * 100)
    const enhPct = (check.enhTotal / ENH_BUDGET) * 100
    const shape = FORMATIONS[sq.formation]

    // ---- 전술판 위 선수 ----
    // 전술판은 **세로** — 자기 골문이 아래, 공격 방향이 위 (사용자 요청 2026-09-11). SLOT_XY 의 x(골라인→상대 골라인)가 위아래, y 가 좌우
    const chip = (i: number): string => {
      const c = cardById(sq.ids[i])
      const slot = i === 0 ? 'GK' : shape[i - 1][1]
      const xy = SLOT_XY[slot] ?? { x: 0.5, y: 0.5 }
      const on = this.sel === i ? ' on' : this.mark(i)
      // 셋이 나란한 줄의 가운데 자리(CM·ST·CB·CAM·DM)는 7% 아래로 — 세로판에서 칩이 겹치지 않게 (4% 는 18px 겹쳤다)
      const stagger = slot === 'CM' || slot === 'ST' || slot === 'CB' || slot === 'CAM' || slot === 'DM' ? 7 : 0
      const style = `left:${xy.y * 100}%;top:${(1 - xy.x) * 100 + stagger}%`
      if (!c) return `<button class="chip empty${on}" data-slot="${i}" style="${style}"><b>${slot}</b></button>`
      const fam = this.famAt(c, i)
      const enh = sq.enh[i] ?? 0
      return `<button class="chip${on}" data-slot="${i}" draggable="true" style="${style};--fam:${famColor(fam)}">
        <b>${c.name}</b>
        <span class="ov">${starHtml(ovrStars(cardOvr(c, enh + color.bonus)), true)}</span>
        <small>${slot} · ${c.no}번${enh ? ` · +${enh}` : ''}</small>
      </button>`
    }
    const pitch = Array.from({ length: START_SIZE }, (_, i) => chip(i)).join('')

    const benchRow = Array.from({ length: SQUAD_SIZE - START_SIZE }, (_, k) => {
      const i = k + START_SIZE
      const c = cardById(sq.ids[i])
      const on = this.sel === i ? ' on' : this.mark(i)
      if (!c) return `<button class="bchip empty${on}" data-slot="${i}">비어 있음</button>`
      return `<button class="bchip${on}" data-slot="${i}" draggable="true">
        <span class="no">${c.no}</span><b>${c.name}</b><span class="ov">${starHtml(ovrStars(cardOvr(c, sq.enh[i] ?? 0)), true)}</span><small>${c.pos}</small>
      </button>`
    }).join('')

    const list = this.filtered()
    const detail = this.detailHtml(check.enhTotal)
    const left = CAP - check.salary
    const salCls = check.salary > CAP ? ' over' : check.salary > CAP * 0.92 ? ' warn' : ''

    this.root.innerHTML = `
      <div class="sq-top">
        <h1>${club ? club.name : '스쿼드'} <small class="subtitle">스쿼드 수정</small></h1>
        <div class="row">
          <select class="sel" id="sq-form">${FORMATION_LIST.map((f) => `<option${f === sq.formation ? ' selected' : ''}>${f}</option>`).join('')}</select>
          <button class="btn secondary" id="sq-club">🏟 구단 바꾸기</button>
          <button class="btn secondary" id="sq-json-save">JSON 저장</button>
          <button class="btn secondary" id="sq-json-load">JSON 불러오기</button>
          <input type="file" id="sq-file" accept=".json,application/json" hidden />
          <button class="btn secondary" id="sq-cancel">저장 안 하고 돌아가기</button>
          <button class="btn main" id="sq-done"${check.ok ? '' : ' disabled'}>이 스쿼드로 (저장)</button>
        </div>
      </div>
      ${this.slotsStrip()}
      <div class="gauges v2">
        <div class="g salary${salCls}">
          <label>급여 — 구단이 쓸 수 있는 자산</label>
          <div class="big"><b>${check.salary}</b><span>/ ${CAP}</span></div>
          <div class="bar"><i class="${check.salary > CAP ? 'over' : ''}" style="width:${salPct}%"></i></div>
          <div class="left">${left >= 0 ? `남은 급여 <b>${left}</b> — 이 안에서 선수를 바꿉니다` : `상한을 <b>${-left}</b> 넘었습니다 — 비싼 선수를 내려야 시작할 수 있습니다`}</div>
        </div>
        <div class="g enh">
          <label>강화 예산 <b>${check.enhTotal}</b> / ${ENH_BUDGET}</label>
          <div class="bar"><i class="${check.enhTotal > ENH_BUDGET ? 'over' : ''}" style="width:${enhPct}%"></i></div>
          <div class="help">+1 = 그 선수 능력치 전부 +1 (OVR 은 1~2 오릅니다). 카드당 +${ENH_MAX} 까지, 급여는 안 오릅니다. 자리를 고르면 아래에서 줍니다.</div>
        </div>
        <div class="g color">${color.bonus > 0 ? `팀컬러 <b>${club?.name ?? ''} ${color.count}명 → 전원 +${color.bonus}</b>` : `팀컬러 없음 (최다 ${club?.name ?? '-'} ${color.count}명 · 5명부터)`}<br><small>선발 11명 중 같은 구단 5·7·9·11명 → +1·2·3·4</small></div>
      </div>
      ${check.errors.length ? `<div class="errs">${check.errors.map((e) => `<span>${e}</span>`).join('')}</div>` : ''}
      ${this.msg ? `<div class="okmsg">${this.msg}</div>` : ''}
      <div class="sq-body">
        <div class="sq-board">
          <div class="autobar board">
            <span class="lab">자동 채우기</span>
            <button class="btn" id="auto-xi">선발 11명</button>
            <button class="btn" id="auto-bench">후보 7명</button>
            <span class="lab">기준</span>
            <div class="seg" id="auto-by">
              <button data-v="fam"${this.autoBy === 'fam' ? ' class="on"' : ''} title="포메이션 자리마다 그 자리 능숙도가 높은 선수부터">포메이션 능숙도 우선</button>
              <button data-v="ovr"${this.autoBy === 'ovr' ? ' class="on"' : ''} title="자리에 서도 되는 선수 중 능력치가 높은 선수부터">선수 능력치 우선</button>
            </div>
            <small>내 구단 선수로만 채웁니다 · 선발을 채우면 비는 후보 자리는 자동으로 메웁니다</small>
          </div>
          <div class="pitch vertical">
            <div class="p-half"></div><div class="p-circle"></div><div class="p-spot"></div>
            <div class="p-box top"></div><div class="p-box bottom"></div>
            <div class="p-six top"></div><div class="p-six bottom"></div>
            <div class="p-goal top"></div><div class="p-goal bottom"></div>
            <div class="p-arrow">공격 방향 ↑</div>
            ${pitch}
          </div>
          <div class="sub-h">벤치 7 <small>${
            this.sel >= 0
              ? '<b>초록 테두리</b>가 지금 고른 선수와 바꿀 수 있는 자리입니다'
              : '자리를 눌러 고른 뒤 다른 자리를 누르면 서로 바뀝니다 (끌어다 놓아도 됩니다)'
          }</small></div>
          <div class="bench">${benchRow}</div>
          <p class="hintline edit-hint">
            <b>자리 옮기기</b> 두 자리를 차례로 누르면 서로 바뀝니다 ·
            <b>선발↔벤치</b> 오른쪽 카드의 버튼 한 번 ·
            <b>선수 교체</b> 자리를 고르고 오른쪽 목록에서 고릅니다
          </p>
        </div>
        <div class="sq-detail">${detail}</div>
        <div class="sq-list">
          <div class="seg wide" id="scope">
            <button data-v="own"${this.ownOnly ? ' class="on"' : ''}>${club?.short ?? '내 구단'} 선수</button>
            <button data-v="all"${this.ownOnly ? '' : ' class="on"'}>전 구단 ${POOL_SIZE.toLocaleString('ko-KR')}장</button>
          </div>
          <div class="row filters">
            <input class="nick" id="f-search" placeholder="이름 찾기" value="${this.search}" />
            <select class="sel" id="f-pos"><option value="">전 포지션</option>${POS_ORDER.map((p) => `<option${p === this.filterPos ? ' selected' : ''}>${p}</option>`).join('')}</select>
            <select class="sel" id="f-sort"><option value="ovr"${this.sort === 'ovr' ? ' selected' : ''}>종합 순</option><option value="sal"${this.sort === 'sal' ? ' selected' : ''}>급여 순</option><option value="name"${this.sort === 'name' ? ' selected' : ''}>이름 순</option></select>
          </div>
          <div class="crow-head"><span>종합</span><span>이름</span><span>구단 · 포지션 · 급여</span><span class="lab">${(this.filterPos === 'GK' ? SIX_GK : SIX_FIELD).map(([k, n]) => `<i title="${k}">${n}</i>`).join('')}</span></div>
          <div class="crow-list">${list.slice(0, 200).map((c) => this.cardRow(c)).join('')}</div>
          <p class="hintline">${list.length}장${list.length > 200 ? ' (앞 200장)' : ''}${this.ownOnly ? '' : ' · 다른 구단을 섞으면 팀컬러가 깨집니다'}</p>
        </div>
      </div>`
    this.bind()
  }

  private cardRow(c: Card): string {
    const used = this.sq.ids.includes(c.id) || (this.sel >= 0 && !this.canPlace(this.sel, c))
    const cl = clubById(c.club)
    const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
    // 자리를 골랐으면 그 자리 능숙도를 색으로 (포지션에 맞는 선수를 눈으로 고른다)
    const showFam = this.sel >= 0 && this.sel < START_SIZE
    const fam = showFam ? this.famAt(c, this.sel) : 100
    // 급여 강조 (사용자 요청 2026-09-10): 자리를 골랐으면 "바꾸면 얼마나 늘/주나"와 상한 초과를 바로 보여 준다
    const sal = cardSalary(c)
    let salHtml = `<span class="sal">급여 ${sal}</span>`
    let over = false
    if (this.sel >= 0 && !used) {
      const cur = cardById(this.sq.ids[this.sel])
      const delta = sal - (cur ? cardSalary(cur) : 0)
      const after = checkSquad(this.sq, CAP).salary + delta
      over = after > CAP
      const sign = delta > 0 ? `+${delta}` : `${delta}`
      salHtml = `<span class="sal${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}">급여 ${sal} (${sign})</span>${over ? '<span class="sal over">상한 초과</span>' : ''}`
    }
    const dis = used || over
    const labels = c.pos === 'GK' ? SIX_GK : SIX_FIELD
    return `<button class="crow${used ? ' used' : ''}${over ? ' over' : ''}" data-card="${c.id}"${dis ? ' disabled' : ''}>
      <span class="ov">${starHtml(ovrStars(cardOvr(c, 0)), true)}</span>
      <b>${c.name}</b>
      <small${showFam ? ` style="color:${famColor(fam)}"` : ''}>${cl?.short ?? ''} · ${c.pos}${showFam ? ` · 능숙도 ${fam}` : ''} ${salHtml}</small>
      ${pipsHtml(Object.values(s).map(statStars), labels)}
    </button>`
  }

  /** 저장 슬롯 띠 — 전술판 위에 늘 보인다 (5칸, 사용자 요청 2026-09-10) */
  private slotsStrip(): string {
    const slots = loadSlots()
    return `<div class="slots-strip">${slots
      .map((s, i) => {
        if (!s) {
          return `<div class="slotcard empty"><span class="n">SLOT ${i + 1}</span><b>비어 있음</b><small>지금 스쿼드를 여기에</small>
            <div class="acts"><button class="btn secondary" data-save="${i}">저장</button></div></div>`
        }
        const cl = clubById(teamColorBonus(s.ids.slice(0, START_SIZE)).club)
        const chk = checkSquad(s, CAP)
        return `<div class="slotcard"><span class="n">SLOT ${i + 1}</span><b>${cl?.name ?? s.name}</b><small>${s.formation} · 급여 ${chk.salary}/${CAP}${chk.enhTotal ? ` · 강화 ${chk.enhTotal}` : ''}</small>
          <div class="acts"><button class="btn secondary" data-load="${i}">불러오기</button><button class="btn secondary" data-save="${i}">덮어쓰기</button><button class="btn secondary" data-del="${i}">지우기</button></div></div>`
      })
      .join('')}</div>`
  }

  private detailHtml(enhTotal: number): string {
    if (this.sel < 0) return '<p class="hintline">전술판에서 자리를 고르면 그 선수를 보고 바꿀 수 있습니다.</p>'
    const c = cardById(this.sq.ids[this.sel])
    if (!c) return '<p class="hintline">비어 있는 자리입니다. 오른쪽에서 선수를 고르세요.</p>'
    const fam = this.famAt(c, this.sel)
    const enh = this.sq.enh[this.sel] ?? 0
    const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
    const names = c.pos === 'GK' ? SIX_GK : SIX_FIELD
    // 세부 능력치는 숫자 대신 별 (사용자 결정 2026-09-10)
    const bars = Object.values(s)
      .map((v, i) => `<div class="st"><span title="${names[i][1]}">${names[i][0]} <em>${names[i][1]}</em></span>${starHtml(statStars(v))}</div>`)
      .join('')
    const starter = this.sel < START_SIZE
    const partner = this.bestPartner(this.sel)
    const partnerName = partner >= 0 ? cardById(this.sq.ids[partner])?.name ?? '' : ''
    const base = ovrStars(cardOvr(c, 0))
    const now = ovrStars(cardOvr(c, enh))
    const next = enh < ENH_MAX ? ovrStars(cardOvr(c, enh + 1)) : now
    const budgetLeft = ENH_BUDGET - enhTotal
    return `
      <div class="dtl">
        <div class="dhead"><b>${c.name}</b> <span class="ov">${starHtml(now)}</span></div>
        <small>${clubById(c.club)?.name ?? ''} · ${c.pos} · ${c.h}cm ${c.w}kg · ${c.foot === 'R' ? '오른발' : c.foot === 'L' ? '왼발' : '양발'} · 급여 ${cardSalary(c)}</small>
        <div class="fam" style="color:${famColor(fam)}">${this.slotName(this.sel)} 능숙도 ${fam}</div>
        ${bars}
        <div class="row swaprow">
          <button class="btn secondary wide" id="quick-swap"${partner < 0 ? ' disabled' : ''}>
            ${starter ? '벤치로 내리기' : '선발로 올리기'}${partnerName ? ` <em>↔ ${partnerName}</em>` : ''}
          </button>
        </div>
        <div class="enh-box">
          <div class="t">강화 — 남은 예산 ${budgetLeft} / ${ENH_BUDGET}</div>
          <div class="exp">+1 마다 이 선수의 <b>능력치 40종 전부 +1</b>. 종합 ${starHtml(base, true)}${enh > 0 ? ` → 지금 ${starHtml(now, true)}` : ''}${enh < ENH_MAX ? ` → 한 번 더 주면 ${starHtml(next, true)}${next === now ? ' (별은 그대로, 능력치는 오릅니다)' : ''}` : ' · 최대'}.
            카드당 +${ENH_MAX} 까지, 18명이 예산 ${ENH_BUDGET} 을 나눠 씁니다. <b>급여는 오르지 않습니다.</b></div>
          <div class="ctl">
            <button class="btn secondary" id="enh-minus"${enh <= 0 ? ' disabled' : ''}>−</button>
            <span class="enhv">+${enh}</span>
            <button class="btn secondary" id="enh-plus"${enh >= ENH_MAX || budgetLeft <= 0 ? ' disabled' : ''}>+</button>
            <span class="delta">${starHtml(now, true)}</span>
          </div>
          <div class="auto">
            <button class="btn secondary" id="enh-even" title="선발 11명에게 +2 씩, 남는 2 는 OVR 이 높은 두 명에게">선발 고르게</button>
            <button class="btn secondary" id="enh-attack" title="공격수·공격형 미드필더부터 +5 씩">공격에 몰기</button>
            <button class="btn secondary" id="enh-reset">전부 0</button>
          </div>
        </div>
      </div>`
  }

  /**
   * 자동 채우기 — 선발 11 / 후보 7 을 따로 (사용자 요청 2026-09-10). 내 구단 선수만 쓴다.
   * 기준 'fam' = 그 자리 능숙도가 먼저(동률이면 능력치), 'ovr' = 자리에 설 수 있는 선수 중 능력치가 먼저(능숙도는 뒷순위).
   * 선발을 채워서 후보 자리가 비면 그 자리만 자동으로 메운다. 강화는 그대로 남아 있는 선수만 따라간다.
   */
  private autoFill(part: 'xi' | 'bench'): void {
    const club = this.myClub()
    if (club < 0) {
      this.mode = 'club'
      this.msg = '구단을 먼저 고르세요.'
      return
    }
    const own = POOL.filter((c) => c.club === club)
    const by = this.autoBy
    const oldEnh = new Map<number, number>()
    this.sq.ids.forEach((id, i) => oldEnh.set(id, this.sq.enh[i] ?? 0))
    const used = new Set<number>()
    const score = (c: Card, slot: number): number => {
      const ovr = cardOvr(c, 0)
      if (slot < START_SIZE) {
        const fam = this.famAt(c, slot)
        return by === 'fam' ? fam * 2 + ovr : ovr * 2 + fam * 0.3
      }
      return ovr
    }
    const pickFor = (slot: number, pos?: string): number => {
      let best = -1
      let bestS = -1e9
      for (const c of own) {
        if (used.has(c.id) || !this.canPlace(slot, c)) continue
        if (pos && c.pos !== pos) continue
        const s = score(c, slot)
        if (s > bestS) {
          bestS = s
          best = c.id
        }
      }
      return best
    }
    let xi = this.sq.ids.slice(0, START_SIZE)
    let bench = this.sq.ids.slice(START_SIZE).filter((id) => cardById(id) !== undefined)
    if (part === 'xi') {
      xi = []
      for (let i = 0; i < START_SIZE; i++) {
        const id = pickFor(i)
        if (id < 0) {
          this.msg = '이 구단 선수로는 자리를 다 채울 수 없습니다.'
          this.snd.ui('no')
          return
        }
        used.add(id)
        xi.push(id)
      }
      // 선발로 올라간 후보는 빼고, 비는 후보 자리는 모자란 포지션(GK 1 · DF 2 · MF 2 · FW 2)부터 메운다
      bench = bench.filter((id) => !used.has(id))
      for (const id of bench) used.add(id)
      const need: Record<string, number> = { GK: 1, DF: 2, MF: 2, FW: 2 }
      for (const id of bench) {
        const pos = cardById(id)?.pos
        if (pos && need[pos] > 0) need[pos]--
      }
      for (const pos of ['GK', 'DF', 'MF', 'FW']) {
        while (need[pos] > 0 && bench.length < SQUAD_SIZE - START_SIZE) {
          const id = pickFor(START_SIZE, pos)
          if (id < 0) break
          used.add(id)
          bench.push(id)
          need[pos]--
        }
      }
      while (bench.length < SQUAD_SIZE - START_SIZE) {
        const id = pickFor(START_SIZE)
        if (id < 0) break
        used.add(id)
        bench.push(id)
      }
    } else {
      for (const id of xi) used.add(id)
      bench = []
      if (by === 'fam') {
        for (const pos of ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']) {
          const id = pickFor(START_SIZE, pos)
          if (id >= 0) {
            used.add(id)
            bench.push(id)
          }
        }
      } else {
        const gk = pickFor(START_SIZE, 'GK')
        if (gk >= 0) {
          used.add(gk)
          bench.push(gk)
        }
        while (bench.length < SQUAD_SIZE - START_SIZE) {
          let best = -1
          let bestS = -1
          for (const c of own) {
            if (used.has(c.id) || c.pos === 'GK') continue
            const s = cardOvr(c, 0)
            if (s > bestS) {
              bestS = s
              best = c.id
            }
          }
          if (best < 0) break
          used.add(best)
          bench.push(best)
        }
      }
      while (bench.length < SQUAD_SIZE - START_SIZE) {
        const id = pickFor(START_SIZE)
        if (id < 0) break
        used.add(id)
        bench.push(id)
      }
    }
    if (bench.length < SQUAD_SIZE - START_SIZE) {
      this.msg = '이 구단 선수로는 후보 7명을 다 채울 수 없습니다.'
      this.snd.ui('no')
      return
    }
    this.sq.ids = [...xi, ...bench]
    this.sq.enh = this.sq.ids.map((id) => oldEnh.get(id) ?? 0)
    this.sel = -1
    this.msg = `${part === 'xi' ? '선발 11명' : '후보 7명'}을 ${by === 'fam' ? '포메이션 능숙도' : '선수 능력치'} 우선으로 다시 채웠습니다.`
    this.snd.ui('ok')
    saveSquad(this.sq)
  }

  /** 강화 자동 배분 — 'even': 선발 +2 씩 (+ 남는 2 는 최고 OVR 둘) · 'attack': FW→AM→MF 순으로 +5 씩 */
  private autoEnh(mode: 'even' | 'attack' | 'reset'): void {
    const enh = new Array(SQUAD_SIZE).fill(0) as number[]
    if (mode === 'even') {
      let left = ENH_BUDGET
      for (let i = 0; i < START_SIZE && left >= 2; i++) {
        enh[i] = 2
        left -= 2
      }
      const order = Array.from({ length: START_SIZE }, (_, i) => i)
        .filter((i) => cardById(this.sq.ids[i]))
        .sort((a, b) => cardOvr(cardById(this.sq.ids[b])!, 0) - cardOvr(cardById(this.sq.ids[a])!, 0))
      for (const i of order) {
        if (left <= 0) break
        enh[i] = Math.min(ENH_MAX, enh[i] + 1)
        left--
      }
    } else if (mode === 'attack') {
      const shape = FORMATIONS[this.sq.formation]
      const rank = (i: number): number => {
        if (i === 0) return 9
        const band = shape[i - 1][0]
        return band === 'FW' ? 0 : band === 'AM' ? 1 : band === 'MF' ? 2 : band === 'DM' ? 3 : band === 'WB' ? 4 : 5
      }
      const order = Array.from({ length: START_SIZE }, (_, i) => i).sort((a, b) => rank(a) - rank(b) || a - b)
      let left = ENH_BUDGET
      for (const i of order) {
        if (left <= 0) break
        const give = Math.min(ENH_MAX, left)
        enh[i] = give
        left -= give
      }
    }
    this.sq.enh = enh
    this.msg = mode === 'reset' ? '강화를 전부 0 으로 되돌렸습니다.' : mode === 'even' ? '선발 11명에게 고르게 나눴습니다.' : '공격수부터 +5 씩 몰아 줬습니다.'
    this.snd.ui('ok')
    saveSquad(this.sq)
  }

  private filtered(): Card[] {
    const q = this.search.trim().toLowerCase()
    const club = this.myClub()
    const out = POOL.filter((c) => {
      if (this.ownOnly && club >= 0 && c.club !== club) return false
      if (this.filterPos && c.pos !== this.filterPos) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
    const key = this.sort
    // 자리를 골랐으면 그 자리 능숙도가 높은 선수를 위로 — 포지션에 맞는 사람을 먼저 보여 준다
    const byFam = this.sel >= 0 && this.sel < START_SIZE && key === 'ovr'
    return out.sort((a, b) => {
      if (key === 'name') return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      if (byFam) {
        const fa = this.famAt(a, this.sel)
        const fb = this.famAt(b, this.sel)
        if (fa !== fb) return fb - fa
      }
      const va = key === 'sal' ? cardSalary(a) : cardOvr(a, 0)
      const vb = key === 'sal' ? cardSalary(b) : cardOvr(b, 0)
      return vb - va || a.id - b.id
    })
  }

  /**
   * 그 자리에 그 선수를 놓을 수 있나.
   * **선발 GK 자리(0)에는 골키퍼만**, 필드 자리(1~10)에는 골키퍼를 놓지 않는다 —
   * 안 막으면 골키퍼 자리에 공격수가 앉는다 (2026-09-09 제보). 벤치는 자유롭다.
   */
  private canPlace(slot: number, c: Card | undefined): boolean {
    if (!c) return true
    if (slot === 0) return c.pos === 'GK'
    if (slot < START_SIZE) return c.pos !== 'GK'
    return true
  }

  /** 지금 고른 자리와 바꿀 수 있는 자리인가 — 전술판·벤치에 초록/흐림 테두리를 준다 */
  private mark(i: number): string {
    if (this.sel < 0 || this.sel === i) return ''
    const ca = cardById(this.sq.ids[this.sel])
    const cb = cardById(this.sq.ids[i])
    return this.canPlace(i, ca) && this.canPlace(this.sel, cb) ? ' can' : ' cant'
  }

  /**
   * 선발 ↔ 벤치를 한 번에 바꿀 짝을 고른다 (사용자 요청 — "선발 후보 교체만 하고 싶을 때").
   * · 선발을 골랐으면: 그 자리에 설 수 있는 벤치 선수 중 **가장 잘하는 사람**
   * · 벤치를 골랐으면: 그 선수가 설 수 있는 선발 자리 중 **능숙도가 가장 높고, 지금 있는 사람이 가장 약한 자리**
   * 못 찾으면 −1 (골키퍼가 벤치에 없을 때 등).
   */
  private bestPartner(i: number): number {
    const me = cardById(this.sq.ids[i])
    if (!me) return -1
    let best = -1
    let bestScore = -1e9
    if (i < START_SIZE) {
      for (let b = START_SIZE; b < SQUAD_SIZE; b++) {
        const c = cardById(this.sq.ids[b])
        if (!c || !this.canPlace(i, c)) continue
        const score = this.famAt(c, i) * 2 + cardOvr(c, 0)
        if (score > bestScore) {
          bestScore = score
          best = b
        }
      }
    } else {
      for (let a = 0; a < START_SIZE; a++) {
        const c = cardById(this.sq.ids[a])
        if (!this.canPlace(a, me) || !this.canPlace(i, c)) continue
        // 능숙도가 높을수록, 지금 그 자리에 있는 사람이 약할수록 좋다
        const score = this.famAt(me, a) * 2 - cardOvr(c ?? me, 0)
        if (score > bestScore) {
          bestScore = score
          best = a
        }
      }
    }
    return best
  }

  /** 두 자리의 선수를 맞바꾼다 (강화도 따라간다) */
  private swap(a: number, b: number): boolean {
    if (a === b || !Number.isInteger(a) || !Number.isInteger(b)) return false
    const ids = this.sq.ids
    const ca = cardById(ids[a])
    const cb = cardById(ids[b])
    if (!this.canPlace(a, cb) || !this.canPlace(b, ca)) {
      this.msg = '골키퍼 자리에는 골키퍼만 설 수 있습니다. (벤치로는 옮길 수 있습니다)'
      this.snd.ui('no')
      return false
    }
    const enh = this.sq.enh
    const ti = ids[a]
    ids[a] = ids[b]
    ids[b] = ti
    const te = enh[a]
    enh[a] = enh[b]
    enh[b] = te
    this.snd.ui('click')
    saveSquad(this.sq)
    return true
  }

  private bind(): void {
    const $ = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T

    // ---- 자리: 고르기 · 맞바꾸기 · 끌어다 놓기 ----
    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      const i = Number(el.dataset.slot)
      el.onclick = () => {
        if (this.sel >= 0 && this.sel !== i) {
          this.msg = ''
          if (this.swap(this.sel, i)) this.sel = i
        } else {
          this.sel = this.sel === i ? -1 : i
          this.msg = ''
          this.snd.ui('click')
        }
        this.draw()
      }
      el.ondragstart = (e) => {
        ;(e as DragEvent).dataTransfer?.setData('text/plain', String(i))
        this.sel = i
      }
      el.ondragover = (e) => e.preventDefault()
      el.ondrop = (e) => {
        e.preventDefault()
        const from = Number((e as DragEvent).dataTransfer?.getData('text/plain'))
        if (Number.isInteger(from)) {
          this.msg = ''
          if (this.swap(from, i)) this.sel = i
          this.draw()
        }
      }
    })

    // ---- 목록에서 넣기 ----
    this.bindList()

    $<HTMLSelectElement>('#sq-form').onchange = (e) => {
      this.sq.formation = (e.target as HTMLSelectElement).value
      saveSquad(this.sq)
      this.draw()
    }
    const scope = $<HTMLElement>('#scope')
    scope.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        this.ownOnly = b.dataset.v === 'own'
        this.draw()
      }
    })
    const search = $<HTMLInputElement>('#f-search')
    search.oninput = () => {
      this.search = search.value
      this.drawListOnly()
    }
    $<HTMLSelectElement>('#f-pos').onchange = (e) => {
      this.filterPos = (e.target as HTMLSelectElement).value
      this.draw()
    }
    $<HTMLSelectElement>('#f-sort').onchange = (e) => {
      this.sort = (e.target as HTMLSelectElement).value as 'ovr'
      this.draw()
    }

    const quick = this.root.querySelector<HTMLButtonElement>('#quick-swap')
    if (quick) {
      quick.onclick = () => {
        const partner = this.bestPartner(this.sel)
        if (partner < 0) {
          this.msg = '바꿀 수 있는 자리가 없습니다.'
          this.snd.ui('no')
        } else if (this.swap(this.sel, partner)) {
          this.msg = ''
          this.sel = partner
        }
        this.draw()
      }
    }
    const minus = this.root.querySelector<HTMLButtonElement>('#enh-minus')
    if (minus) {
      minus.onclick = () => {
        if (this.sel < 0) return
        this.sq.enh[this.sel] = Math.max(0, (this.sq.enh[this.sel] ?? 0) - 1)
        saveSquad(this.sq)
        this.draw()
      }
    }
    const plus = this.root.querySelector<HTMLButtonElement>('#enh-plus')
    if (plus) {
      plus.onclick = () => {
        if (this.sel < 0) return
        const cur = this.sq.enh[this.sel] ?? 0
        const total = this.sq.enh.reduce((a, b) => a + b, 0)
        if (cur >= ENH_MAX) this.msg = `카드당 강화는 +${ENH_MAX} 까지입니다.`
        else if (total >= ENH_BUDGET) this.msg = `강화 예산 ${ENH_BUDGET} 을 다 썼습니다.`
        else {
          this.sq.enh[this.sel] = cur + 1
          this.msg = ''
          saveSquad(this.sq)
        }
        this.draw()
      }
    }
    for (const [id, mode] of [['#enh-even', 'even'], ['#enh-attack', 'attack'], ['#enh-reset', 'reset']] as const) {
      const b = this.root.querySelector<HTMLButtonElement>(id)
      if (b) {
        b.onclick = () => {
          this.autoEnh(mode)
          this.draw()
        }
      }
    }
    // ---- 저장 슬롯 띠 ----
    const slots = loadSlots()
    this.root.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
      b.onclick = () => {
        slots[Number(b.dataset.save)] = JSON.parse(JSON.stringify({ ...this.sq, hash: POOL_HASH })) as Squad
        saveSlots(slots)
        this.msg = `슬롯 ${Number(b.dataset.save) + 1} 에 저장했습니다.`
        this.snd.ui('ok')
        this.draw()
      }
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) => {
      b.onclick = () => {
        const s = slots[Number(b.dataset.load)]
        if (s) {
          this.sq = JSON.parse(JSON.stringify(s)) as Squad
          this.sel = -1
          saveSquad(this.sq)
          this.msg = `슬롯 ${Number(b.dataset.load) + 1} 을 불러왔습니다.`
          this.snd.ui('ok')
        }
        this.draw()
      }
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
      b.onclick = () => {
        slots[Number(b.dataset.del)] = null
        saveSlots(slots)
        this.msg = ''
        this.snd.ui('click')
        this.draw()
      }
    })

    $<HTMLButtonElement>('#sq-club').onclick = () => {
      this.mode = 'club'
      this.msg = ''
      this.draw()
    }
    // ---- 자동 채우기 (선발 / 후보 · 기준) ----
    $<HTMLButtonElement>('#auto-xi').onclick = () => {
      this.autoFill('xi')
      this.draw()
    }
    $<HTMLButtonElement>('#auto-bench').onclick = () => {
      this.autoFill('bench')
      this.draw()
    }
    $<HTMLElement>('#auto-by').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        this.autoBy = b.dataset.v === 'ovr' ? 'ovr' : 'fam'
        try {
          localStorage.setItem(AUTO_KEY, this.autoBy)
        } catch {
          // 무시
        }
        this.snd.ui('click')
        this.draw()
      }
    })
    // ---- JSON 저장 / 불러오기 (사용자 요청 2026-09-10 — 코드 대신 파일) ----
    $<HTMLButtonElement>('#sq-json-save').onclick = () => {
      const club = clubById(this.myClub())
      const data = JSON.stringify({ app: 'KLO26', ver: 1, hash: POOL_HASH, squad: { ...this.sq, hash: POOL_HASH } }, null, 1)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `klo26-${club?.short ?? 'squad'}-${this.sq.formation}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      this.msg = `JSON 으로 저장했습니다 (${a.download}). 다른 PC 에서 "JSON 불러오기"로 엽니다.`
      this.snd.ui('ok')
      this.draw()
    }
    const file = $<HTMLInputElement>('#sq-file')
    $<HTMLButtonElement>('#sq-json-load').onclick = () => file.click()
    file.onchange = async () => {
      const f = file.files?.[0]
      if (!f) return
      try {
        const obj = JSON.parse(await f.text()) as { app?: string; hash?: number; squad?: Squad }
        const s = obj.squad ?? (obj as unknown as Squad)
        if (!s || !Array.isArray(s.ids) || !Array.isArray(s.enh)) throw new Error('스쿼드 파일이 아닙니다')
        const h = obj.hash ?? s.hash
        if (h !== POOL_HASH) throw new Error('선수 명단이 달라(지문 불일치) 불러올 수 없습니다 — 명단이 갱신되면 저장된 스쿼드는 버려집니다')
        const c = checkSquad(s, CAP)
        if (!c.ok) throw new Error(`규칙 위반: ${c.errors[0]}`)
        this.sq = { ...s, hash: POOL_HASH, club: teamColorBonus(s.ids.slice(0, START_SIZE)).club }
        this.sel = -1
        saveSquad(this.sq)
        this.msg = `${f.name} 을 불러왔습니다.`
        this.snd.ui('ok')
      } catch (e) {
        this.msg = `❌ ${(e as Error).message}`
        this.snd.ui('no')
      }
      file.value = ''
      this.draw()
    }
    $<HTMLButtonElement>('#sq-cancel').onclick = () => this.cancel()
    $<HTMLButtonElement>('#sq-done').onclick = () => this.finish()
  }

  private bindList(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b) => {
      b.onclick = () => {
        if (this.sel < 0) {
          this.msg = '먼저 전술판에서 자리를 고르세요.'
          this.snd.ui('no')
          this.draw()
          return
        }
        const c = cardById(Number(b.dataset.card))
        if (!this.canPlace(this.sel, c)) {
          this.msg =
            this.sel === 0
              ? '골키퍼 자리에는 골키퍼만 넣을 수 있습니다.'
              : '골키퍼는 필드 자리에 넣을 수 없습니다. (벤치에는 됩니다)'
          this.snd.ui('no')
          this.draw()
          return
        }
        this.sq.ids[this.sel] = Number(b.dataset.card)
        this.sq.enh[this.sel] = 0
        this.msg = ''
        this.snd.ui('click')
        saveSquad(this.sq)
        this.draw()
      }
    })
  }

  /** 목록만 다시 그린다 (검색어를 칠 때 포커스를 잃지 않게) */
  private drawListOnly(): void {
    const holder = this.root.querySelector('.crow-list')
    if (!holder) return
    holder.innerHTML = this.filtered().slice(0, 200).map((c) => this.cardRow(c)).join('')
    this.bindList()
  }

  private finish(): void {
    saveSquad(this.sq)
    this.onDone(this.sq)
  }

  /** 저장 안 하고 돌아가기 — 화면을 열 때의 스쿼드로 되돌린다 (없었으면 저장을 비운다) */
  private cancel(): void {
    if (this.original) {
      saveSquad(this.original)
      this.onDone(this.original)
      return
    }
    try {
      localStorage.removeItem(CUR_KEY)
    } catch {
      // 무시
    }
    this.onDone(defaultSquad())
  }

  dispose(): void {
    this.root.remove()
  }
}
