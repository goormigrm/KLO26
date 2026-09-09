// 스쿼드 화면 (DESIGN 7.2 🃏) — **구단을 먼저 고르고**, 그 구단 선수로 선발·벤치를 채운 뒤 전술판에서 바꾼다.
// 전술판 좌표는 `SLOT_XY` 그대로다 (KM26·KMD26 과 같은 값이라 자리 배치가 같다).
//
// 흐름 (사용자 요청 2026-09-09):
//   1. 구단 고르기 → 2. 그 구단 선수로 선발 11 + 벤치 7 자동 → 3. 전술판에서 자리를 옮기거나 선수를 바꾼다
// 기본 목록은 **그 구단 선수**만 보여 준다. "전 구단"을 켜면 풀 전부 — 급여 상한이 규칙이다 (DESIGN 5.8).
//
// 규칙 검사는 화면이 아니라 `cards/squad.ts` 가 한다 — 받는 쪽도 같은 함수로 다시 센다.

import { FORMATIONS, FORMATION_LIST, SLOT_FAM, SLOT_XY } from '../core/formation'
import { famColor, sixGKOf, sixOf } from '../cards/cards'
import {
  ENH_BUDGET, ENH_MAX, SQUAD_SIZE, START_SIZE, cardOvr, cardSalary, checkSquad, clubById, clubSquad, computeCap,
  teamColorBonus, type Squad,
} from '../cards/squad'
import { decodeSquad, encodeSquad } from '../cards/squadcode'
import { CLUBS, POOL, POOL_HASH, POOL_SIZE, cardById } from '../data/pool'
import type { Card } from '../cards/cards'
import { sfx } from '../audio/sfx'

const SLOTS_KEY = 'klo26.squads'
const CUR_KEY = 'klo26.squad'
const SLOT_COUNT = 10
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
      const avg = Math.round(own.reduce((a, p) => a + cardOvr(p, 0), 0) / own.length)
      const best = own.slice().sort((a, b) => cardOvr(b, 0) - cardOvr(a, 0))[0]
      return `<button class="clubcard" data-club="${c.id}" style="--c:${hex(c.col)};--c2:${hex(c.col2)}">
        <span class="cbar"></span>
        <b>${c.name}</b>
        <small>${c.div === 1 ? 'K리그1' : 'K리그2'} · 선수 ${own.length}명 · 평균 OVR ${avg}</small>
        <em>최고 ${best.name} ${cardOvr(best, 0)}</em>
      </button>`
    }).join('')
    this.root.innerHTML = `
      <div class="sq-top">
        <h1>구단 고르기</h1>
        <div class="row">
          ${this.hasSquad ? '<button class="btn secondary" id="sq-keep">그만두고 스쿼드 수정으로</button>' : ''}
          <button class="btn secondary" id="sq-back">로비로</button>
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
    ;(this.root.querySelector('#sq-back') as HTMLButtonElement).onclick = () => this.finish()
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
    const chip = (i: number): string => {
      const c = cardById(sq.ids[i])
      const slot = i === 0 ? 'GK' : shape[i - 1][1]
      const xy = SLOT_XY[slot] ?? { x: 0.5, y: 0.5 }
      const on = this.sel === i ? ' on' : this.mark(i)
      const style = `left:${xy.x * 100}%;top:${xy.y * 100}%`
      if (!c) return `<button class="chip empty${on}" data-slot="${i}" style="${style}"><b>${slot}</b></button>`
      const fam = this.famAt(c, i)
      const enh = sq.enh[i] ?? 0
      return `<button class="chip${on}" data-slot="${i}" draggable="true" style="${style};--fam:${famColor(fam)}">
        <span class="no">${c.no}</span>
        <b>${c.name}</b>
        <span class="ov">${cardOvr(c, enh + color.bonus)}</span>
        <small>${slot}${enh ? ` +${enh}` : ''}</small>
      </button>`
    }
    const pitch = Array.from({ length: START_SIZE }, (_, i) => chip(i)).join('')

    const benchRow = Array.from({ length: SQUAD_SIZE - START_SIZE }, (_, k) => {
      const i = k + START_SIZE
      const c = cardById(sq.ids[i])
      const on = this.sel === i ? ' on' : this.mark(i)
      if (!c) return `<button class="bchip empty${on}" data-slot="${i}">비어 있음</button>`
      return `<button class="bchip${on}" data-slot="${i}" draggable="true">
        <span class="no">${c.no}</span><b>${c.name}</b><span class="ov">${cardOvr(c, sq.enh[i] ?? 0)}</span><small>${c.pos}</small>
      </button>`
    }).join('')

    const list = this.filtered()
    const detail = this.detailHtml(check.enhTotal)

    this.root.innerHTML = `
      <div class="sq-top">
        <h1>${club ? club.name : '스쿼드'} <small class="subtitle">스쿼드 수정</small></h1>
        <div class="row">
          <select class="sel" id="sq-form">${FORMATION_LIST.map((f) => `<option${f === sq.formation ? ' selected' : ''}>${f}</option>`).join('')}</select>
          <button class="btn secondary" id="sq-club">구단 바꾸기</button>
          <button class="btn secondary" id="sq-auto">자동 채우기</button>
          <button class="btn secondary" id="sq-code">코드 복사</button>
          <button class="btn secondary" id="sq-paste">붙여넣기</button>
          <button class="btn secondary" id="sq-slots">저장 슬롯</button>
          <button class="btn main" id="sq-done"${check.ok ? '' : ' disabled'}>이 스쿼드로</button>
        </div>
      </div>
      <div class="gauges">
        <div class="g"><label>급여 <b>${check.salary}</b> / ${CAP}</label><div class="bar"><i class="${check.salary > CAP ? 'over' : ''}" style="width:${salPct}%"></i></div></div>
        <div class="g"><label>강화 <b>${check.enhTotal}</b> / ${ENH_BUDGET}</label><div class="bar"><i class="${check.enhTotal > ENH_BUDGET ? 'over' : ''}" style="width:${enhPct}%"></i></div></div>
        <div class="g color">${color.bonus > 0 ? `팀컬러 <b>${club?.name ?? ''} ${color.count}명 → 전원 +${color.bonus}</b>` : `팀컬러 없음 (최다 ${club?.name ?? '-'} ${color.count}명 · 5명부터)`}</div>
      </div>
      ${check.errors.length ? `<div class="errs">${check.errors.map((e) => `<span>${e}</span>`).join('')}</div>` : ''}
      ${this.msg ? `<div class="okmsg">${this.msg}</div>` : ''}
      <div class="sq-body">
        <div class="sq-board">
          <div class="pitch">
            <div class="p-half"></div><div class="p-circle"></div><div class="p-spot"></div>
            <div class="p-box left"></div><div class="p-box right"></div>
            <div class="p-six left"></div><div class="p-six right"></div>
            <div class="p-goal left"></div><div class="p-goal right"></div>
            <div class="p-arrow">공격 방향 →</div>
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
            <select class="sel" id="f-sort"><option value="ovr"${this.sort === 'ovr' ? ' selected' : ''}>OVR 순</option><option value="sal"${this.sort === 'sal' ? ' selected' : ''}>급여 순</option><option value="name"${this.sort === 'name' ? ' selected' : ''}>이름 순</option></select>
          </div>
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
    return `<button class="crow${used ? ' used' : ''}" data-card="${c.id}"${used ? ' disabled' : ''}>
      <span class="ov">${cardOvr(c, 0)}</span>
      <b>${c.name}</b>
      <small${showFam ? ` style="color:${famColor(fam)}"` : ''}>${cl?.short ?? ''} · ${c.pos} · 급여 ${cardSalary(c)}${showFam ? ` · 능숙도 ${fam}` : ''}</small>
      <em>${Object.values(s).join(' ')}</em>
    </button>`
  }

  private detailHtml(enhTotal: number): string {
    if (this.sel < 0) return '<p class="hintline">전술판에서 자리를 고르면 그 선수를 보고 바꿀 수 있습니다.</p>'
    const c = cardById(this.sq.ids[this.sel])
    if (!c) return '<p class="hintline">비어 있는 자리입니다. 오른쪽에서 선수를 고르세요.</p>'
    const fam = this.famAt(c, this.sel)
    const enh = this.sq.enh[this.sel] ?? 0
    const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
    const names = c.pos === 'GK' ? ['DIV', 'HAN', 'KIC', 'REF', 'POS', 'SPD'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
    const bars = Object.values(s)
      .map((v, i) => `<div class="st"><span>${names[i]}</span><i style="width:${v}%"></i><b>${v}</b></div>`)
      .join('')
    const starter = this.sel < START_SIZE
    const partner = this.bestPartner(this.sel)
    const partnerName = partner >= 0 ? cardById(this.sq.ids[partner])?.name ?? '' : ''
    return `
      <div class="dtl">
        <div class="dhead"><b>${c.name}</b> <span class="ov">${cardOvr(c, enh)}</span></div>
        <small>${clubById(c.club)?.name ?? ''} · ${c.pos} · ${c.h}cm ${c.w}kg · ${c.foot === 'R' ? '오른발' : c.foot === 'L' ? '왼발' : '양발'}</small>
        <div class="fam" style="color:${famColor(fam)}">${this.slotName(this.sel)} 능숙도 ${fam}</div>
        ${bars}
        <div class="row swaprow">
          <button class="btn secondary wide" id="quick-swap"${partner < 0 ? ' disabled' : ''}>
            ${starter ? '벤치로 내리기' : '선발로 올리기'}${partnerName ? ` <em>↔ ${partnerName}</em>` : ''}
          </button>
        </div>
        <div class="row enh">
          <label>강화 (예산 ${enhTotal}/${ENH_BUDGET})</label>
          <button class="btn secondary" id="enh-minus">−</button>
          <span class="enhv">+${enh}</span>
          <button class="btn secondary" id="enh-plus">+</button>
        </div>
      </div>`
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

    $<HTMLButtonElement>('#sq-club').onclick = () => {
      this.mode = 'club'
      this.msg = ''
      this.draw()
    }
    $<HTMLButtonElement>('#sq-auto').onclick = () => {
      const club = this.myClub()
      if (club < 0) {
        this.mode = 'club'
        this.msg = '구단을 먼저 고르세요.'
        this.draw()
        return
      }
      this.sq = withMeta(clubSquad(club, this.sq.formation), club)
      this.sel = -1
      this.msg = `${clubById(club)?.name ?? ''} 선수로 다시 채웠습니다.`
      this.snd.ui('ok')
      saveSquad(this.sq)
      this.draw()
    }
    $<HTMLButtonElement>('#sq-code').onclick = async () => {
      const code = encodeSquad(this.sq)
      try {
        await navigator.clipboard.writeText(code)
        this.msg = `코드를 복사했습니다 (${code.length}자)`
      } catch {
        this.msg = code
      }
      this.draw()
    }
    $<HTMLButtonElement>('#sq-paste').onclick = () => {
      const text = prompt('스쿼드 코드를 붙여 넣으세요 (KLO26-…)')
      if (!text) return
      const res = decodeSquad(text)
      if (!res.ok) this.msg = `❌ ${res.message}`
      else {
        const c = checkSquad(res.squad, CAP)
        if (!c.ok) this.msg = `❌ 규칙 위반: ${c.errors[0]}`
        else {
          this.sq = { ...res.squad, hash: POOL_HASH, club: teamColorBonus(res.squad.ids.slice(0, START_SIZE)).club }
          saveSquad(this.sq)
          this.msg = '스쿼드를 불러왔습니다.'
        }
      }
      this.draw()
    }
    $<HTMLButtonElement>('#sq-slots').onclick = () => this.drawSlots()
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

  private drawSlots(): void {
    const slots = loadSlots()
    const body = this.root.querySelector('.sq-body') as HTMLElement
    body.innerHTML = `
      <div class="slot-page">
        <div class="sub-h">저장 슬롯 10 — 브라우저에만 남습니다</div>
        <div class="slot-grid wide">
          ${slots
            .map((s, i) => {
              const cl = s ? clubById(teamColorBonus(s.ids.slice(0, START_SIZE)).club) : undefined
              const label = s ? `${cl?.name ?? s.name} · ${s.formation}` : '비어 있음'
              return `<div class="save-row"><b>${i + 1}</b><span>${label}</span>
                <button class="btn secondary" data-save="${i}">저장</button>
                <button class="btn secondary" data-load="${i}"${s ? '' : ' disabled'}>불러오기</button>
                <button class="btn secondary" data-del="${i}"${s ? '' : ' disabled'}>지우기</button></div>`
            })
            .join('')}
        </div>
        <div class="row"><button class="btn secondary" id="slot-back">돌아가기</button></div>
      </div>`
    body.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
      b.onclick = () => {
        slots[Number(b.dataset.save)] = JSON.parse(JSON.stringify({ ...this.sq, hash: POOL_HASH })) as Squad
        saveSlots(slots)
        this.drawSlots()
      }
    })
    body.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) => {
      b.onclick = () => {
        const s = slots[Number(b.dataset.load)]
        if (s) {
          this.sq = s
          saveSquad(s)
          this.msg = '슬롯에서 불러왔습니다.'
        }
        this.draw()
      }
    })
    body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
      b.onclick = () => {
        slots[Number(b.dataset.del)] = null
        saveSlots(slots)
        this.drawSlots()
      }
    })
    ;(body.querySelector('#slot-back') as HTMLButtonElement).onclick = () => this.draw()
  }

  private finish(): void {
    saveSquad(this.sq)
    this.onDone(this.sq)
  }

  dispose(): void {
    this.root.remove()
  }
}
