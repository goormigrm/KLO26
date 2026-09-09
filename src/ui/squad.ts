// 스쿼드 화면 (DESIGN 7.2 🃏) — 카드 목록 · 포메이션 판 · 급여 게이지 · 팀컬러 · 강화 배분 · 코드 · 저장 슬롯 10.
// 규칙 검사는 화면이 아니라 `cards/squad.ts` 가 한다 — 받는 쪽도 같은 함수로 다시 센다 (DESIGN 5.8).

import { FORMATIONS, FORMATION_LIST, SLOT_FAM } from '../core/formation'
import { famColor, sixGKOf, sixOf } from '../cards/cards'
import {
  ENH_BUDGET, ENH_MAX, SQUAD_SIZE, START_SIZE, cardOvr, cardSalary, checkSquad, clubById, clubSquad, computeCap,
  starterSquad, teamColorBonus, type Squad,
} from '../cards/squad'
import { decodeSquad, encodeSquad } from '../cards/squadcode'
import { CLUBS, POOL, cardById } from '../data/pool'
import type { Card } from '../cards/cards'

const SLOTS_KEY = 'klo26.squads'
const CUR_KEY = 'klo26.squad'
const SLOT_COUNT = 10

export function loadSquad(): Squad {
  try {
    const raw = localStorage.getItem(CUR_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Squad
      if (s && Array.isArray(s.ids) && s.ids.length === SQUAD_SIZE && FORMATIONS[s.formation]) return s
    }
  } catch {
    // 저장을 못 읽어도 기본 스쿼드로 시작한다
  }
  return starterSquad('4-3-3')
}

export function saveSquad(s: Squad): void {
  try {
    localStorage.setItem(CUR_KEY, JSON.stringify(s))
  } catch {
    // 사생활 모드 — 저장 못 해도 게임은 된다
  }
}

function loadSlots(): (Squad | null)[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (raw) {
      const a = JSON.parse(raw) as (Squad | null)[]
      if (Array.isArray(a)) return a.slice(0, SLOT_COUNT)
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

const CAP = computeCap().cap
const POS_ORDER = ['GK', 'DF', 'MF', 'FW']

export class SquadScreen {
  private sq: Squad
  private root: HTMLElement
  private sel = -1
  private filterPos = ''
  private filterClub = -1
  private search = ''
  private sort: 'ovr' | 'sal' | 'name' = 'ovr'
  private msg = ''

  constructor(
    host: HTMLElement,
    private onDone: (s: Squad) => void,
  ) {
    this.sq = loadSquad()
    host.innerHTML = '<div class="squad"></div>'
    this.root = host.querySelector('.squad') as HTMLElement
    this.draw()
  }

  private slotLabel(i: number): string {
    if (i === 0) return 'GK'
    if (i < START_SIZE) return FORMATIONS[this.sq.formation][i - 1][1]
    return `벤치 ${i - START_SIZE + 1}`
  }

  /** 그 자리의 능숙도 (DESIGN 5.7) */
  private famAt(c: Card, i: number): number {
    if (i >= START_SIZE) return 100
    const slot = i === 0 ? 'GK' : FORMATIONS[this.sq.formation][i - 1][1]
    const key = SLOT_FAM[slot] ?? 'MC'
    return c.posFam?.[key] ?? 50
  }

  private draw(): void {
    const sq = this.sq
    const check = checkSquad(sq, CAP)
    const color = check.color
    const club = color.club >= 0 ? clubById(color.club) : undefined
    const salPct = Math.min(100, (check.salary / CAP) * 100)
    const enhPct = (check.enhTotal / ENH_BUDGET) * 100

    const slotRow = (i: number): string => {
      const c = cardById(sq.ids[i])
      const on = this.sel === i ? ' on' : ''
      if (!c) return `<button class="slot empty${on}" data-slot="${i}"><b>${this.slotLabel(i)}</b><small>비어 있음</small></button>`
      const fam = this.famAt(c, i)
      const enh = sq.enh[i] ?? 0
      const cl = clubById(c.club)
      return `<button class="slot${on}" data-slot="${i}">
        <span class="pos" style="color:${famColor(fam)}">${this.slotLabel(i)}</span>
        <b>${c.name}</b>
        <span class="ov">${cardOvr(c, enh + (i < START_SIZE ? color.bonus : 0))}</span>
        <small>${cl?.short ?? ''} · ${c.pos} · 급여 ${cardSalary(c)}${enh ? ` · +${enh}` : ''}</small>
      </button>`
    }

    const list = this.filtered()
    const cardRow = (c: Card): string => {
      const used = sq.ids.includes(c.id)
      const cl = clubById(c.club)
      const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
      const nums = Object.values(s).join(' ')
      return `<button class="crow${used ? ' used' : ''}" data-card="${c.id}"${used ? ' disabled' : ''}>
        <span class="ov">${cardOvr(c, 0)}</span>
        <b>${c.name}</b>
        <small>${cl?.short ?? ''} · ${c.pos} · 급여 ${cardSalary(c)}</small>
        <em>${nums}</em>
      </button>`
    }

    const detail = ((): string => {
      if (this.sel < 0) return '<p class="hintline">왼쪽에서 자리를 고르면 그 자리에 넣을 카드를 고를 수 있습니다.</p>'
      const c = cardById(sq.ids[this.sel])
      if (!c) return '<p class="hintline">비어 있는 자리입니다. 오른쪽에서 카드를 고르세요.</p>'
      const fam = this.famAt(c, this.sel)
      const enh = sq.enh[this.sel] ?? 0
      const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
      const names = c.pos === 'GK' ? ['DIV', 'HAN', 'KIC', 'REF', 'POS', 'SPD'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
      const bars = Object.values(s)
        .map((v, i) => `<div class="st"><span>${names[i]}</span><i style="width:${v}%"></i><b>${v}</b></div>`)
        .join('')
      return `
        <div class="dtl">
          <div class="dhead"><b>${c.name}</b> <span class="ov">${cardOvr(c, enh)}</span></div>
          <small>${clubById(c.club)?.name ?? ''} · ${c.pos} · ${c.h}cm ${c.w}kg · ${c.foot === 'R' ? '오른발' : c.foot === 'L' ? '왼발' : '양발'}</small>
          <div class="fam" style="color:${famColor(fam)}">이 자리 능숙도 ${fam}</div>
          ${bars}
          <div class="row enh">
            <label>강화 (예산 ${check.enhTotal}/${ENH_BUDGET})</label>
            <button class="btn secondary" id="enh-minus">−</button>
            <span class="enhv">+${enh}</span>
            <button class="btn secondary" id="enh-plus">+</button>
          </div>
        </div>`
    })()

    this.root.innerHTML = `
      <div class="sq-top">
        <h1>스쿼드</h1>
        <div class="row">
          <select class="sel" id="sq-form">${FORMATION_LIST.map((f) => `<option${f === sq.formation ? ' selected' : ''}>${f}</option>`).join('')}</select>
          <button class="btn secondary" id="sq-code">코드 복사</button>
          <button class="btn secondary" id="sq-paste">코드 붙여넣기</button>
          <select class="sel" id="sq-club"><option value="-1">구단 통째로 불러오기…</option>${CLUBS.map((c) => `<option value="${c.id}">${c.name}${c.div === 2 ? ' (2부)' : ''}</option>`).join('')}</select>
          <button class="btn secondary" id="sq-slots">저장 슬롯</button>
          <button class="btn main" id="sq-done"${check.ok ? '' : ' disabled'}>이 스쿼드로</button>
          <button class="btn secondary" id="sq-back">로비로</button>
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
        <div class="sq-slots">
          <div class="sub-h">선발 11</div>
          <div class="slot-grid">${Array.from({ length: START_SIZE }, (_, i) => slotRow(i)).join('')}</div>
          <div class="sub-h">벤치 7</div>
          <div class="slot-grid">${Array.from({ length: SQUAD_SIZE - START_SIZE }, (_, i) => slotRow(i + START_SIZE)).join('')}</div>
        </div>
        <div class="sq-detail">${detail}</div>
        <div class="sq-list">
          <div class="row filters">
            <input class="nick" id="f-search" placeholder="이름 찾기" value="${this.search}" />
            <select class="sel" id="f-pos"><option value="">전체</option>${POS_ORDER.map((p) => `<option${p === this.filterPos ? ' selected' : ''}>${p}</option>`).join('')}</select>
            <select class="sel" id="f-club"><option value="-1">전 구단</option>${CLUBS.map((c) => `<option value="${c.id}"${c.id === this.filterClub ? ' selected' : ''}>${c.name}</option>`).join('')}</select>
            <select class="sel" id="f-sort"><option value="ovr"${this.sort === 'ovr' ? ' selected' : ''}>OVR 순</option><option value="sal"${this.sort === 'sal' ? ' selected' : ''}>급여 순</option><option value="name"${this.sort === 'name' ? ' selected' : ''}>이름 순</option></select>
          </div>
          <div class="crow-list">${list.slice(0, 220).map(cardRow).join('')}</div>
          <p class="hintline">${list.length}장 (앞 220장 표시)</p>
        </div>
      </div>`

    this.bind()
  }

  private filtered(): Card[] {
    const q = this.search.trim().toLowerCase()
    let out = POOL.filter((c) => {
      if (this.filterPos && c.pos !== this.filterPos) return false
      if (this.filterClub >= 0 && c.club !== this.filterClub) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
    // 고른 자리가 있으면 그 자리에 맞는 포지션을 위로
    if (this.sel >= 0) {
      const c0 = cardById(this.sq.ids[this.sel])
      void c0
    }
    const key = this.sort
    out = out.sort((a, b) => {
      if (key === 'name') return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      const va = key === 'ovr' ? cardOvr(a, 0) : cardSalary(a)
      const vb = key === 'ovr' ? cardOvr(b, 0) : cardSalary(b)
      return vb - va || a.id - b.id
    })
    return out
  }

  private bind(): void {
    const $ = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => {
      b.onclick = () => {
        this.sel = Number(b.dataset.slot)
        this.msg = ''
        this.draw()
      }
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b) => {
      b.onclick = () => {
        if (this.sel < 0) {
          this.msg = '먼저 왼쪽에서 자리를 고르세요.'
          this.draw()
          return
        }
        this.sq.ids[this.sel] = Number(b.dataset.card)
        this.sq.enh[this.sel] = 0
        this.msg = ''
        saveSquad(this.sq)
        this.draw()
      }
    })
    $<HTMLSelectElement>('#sq-form').onchange = (e) => {
      this.sq.formation = (e.target as HTMLSelectElement).value
      saveSquad(this.sq)
      this.draw()
    }
    const search = $<HTMLInputElement>('#f-search')
    search.oninput = () => {
      this.search = search.value
      this.drawListOnly()
    }
    $<HTMLSelectElement>('#f-pos').onchange = (e) => {
      this.filterPos = (e.target as HTMLSelectElement).value
      this.draw()
    }
    $<HTMLSelectElement>('#f-club').onchange = (e) => {
      this.filterClub = Number((e.target as HTMLSelectElement).value)
      this.draw()
    }
    $<HTMLSelectElement>('#f-sort').onchange = (e) => {
      this.sort = (e.target as HTMLSelectElement).value as 'ovr'
      this.draw()
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
        if (cur >= ENH_MAX) {
          this.msg = `카드당 강화는 +${ENH_MAX} 까지입니다.`
        } else if (total >= ENH_BUDGET) {
          this.msg = `강화 예산 ${ENH_BUDGET} 을 다 썼습니다.`
        } else {
          this.sq.enh[this.sel] = cur + 1
          this.msg = ''
          saveSquad(this.sq)
        }
        this.draw()
      }
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
      if (!res.ok) {
        this.msg = `❌ ${res.message}`
      } else {
        const c = checkSquad(res.squad, CAP)
        if (!c.ok) this.msg = `❌ 규칙 위반: ${c.errors[0]}`
        else {
          this.sq = res.squad
          saveSquad(this.sq)
          this.msg = '스쿼드를 불러왔습니다.'
        }
      }
      this.draw()
    }
    const clubSel = $<HTMLSelectElement>('#sq-club')
    clubSel.onchange = () => {
      const id = Number(clubSel.value)
      if (id < 0) return
      // 그 구단 선수만으로 짠다 — 팀컬러 +4 가 붙는 순수 구단 팀 (DESIGN 5.6)
      this.sq = clubSquad(id, this.sq.formation)
      this.sel = -1
      this.msg = `${clubById(id)?.name ?? ''} 선수로 짰습니다 — 팀컬러 +4`
      saveSquad(this.sq)
      this.draw()
    }
    $<HTMLButtonElement>('#sq-slots').onclick = () => this.drawSlots()
    $<HTMLButtonElement>('#sq-done').onclick = () => {
      saveSquad(this.sq)
      this.onDone(this.sq)
    }
    $<HTMLButtonElement>('#sq-back').onclick = () => {
      saveSquad(this.sq)
      this.onDone(this.sq)
    }
  }

  /** 목록만 다시 그린다 (검색어를 칠 때 포커스를 잃지 않게) */
  private drawListOnly(): void {
    const holder = this.root.querySelector('.crow-list')
    if (!holder) return
    const list = this.filtered()
    holder.innerHTML = list
      .slice(0, 220)
      .map((c) => {
        const used = this.sq.ids.includes(c.id)
        const cl = clubById(c.club)
        const s = c.pos === 'GK' ? sixGKOf(c) : sixOf(c)
        return `<button class="crow${used ? ' used' : ''}" data-card="${c.id}"${used ? ' disabled' : ''}>
          <span class="ov">${cardOvr(c, 0)}</span><b>${c.name}</b>
          <small>${cl?.short ?? ''} · ${c.pos} · 급여 ${cardSalary(c)}</small><em>${Object.values(s).join(' ')}</em>
        </button>`
      })
      .join('')
    holder.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b) => {
      b.onclick = () => {
        if (this.sel < 0) return
        this.sq.ids[this.sel] = Number(b.dataset.card)
        this.sq.enh[this.sel] = 0
        saveSquad(this.sq)
        this.draw()
      }
    })
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
              const label = s ? `${s.name} · ${s.formation} · ${teamColorBonus(s.ids.slice(0, START_SIZE)).count}명 팀컬러` : '비어 있음'
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
        slots[Number(b.dataset.save)] = JSON.parse(JSON.stringify(this.sq)) as Squad
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

  dispose(): void {
    this.root.remove()
  }
}
