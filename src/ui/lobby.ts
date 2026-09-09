// 로비 (DESIGN 7.2) — 혼자 하기 · 설정 · 조작법. 온라인 대전(방 목록·방 만들기)은 단계 6 에서 붙는다.

import { FORMATION_LIST } from '../core/formation'
import type { Difficulty } from '../core/state'
import type { SoloConfig } from '../game/session'
import { START_SIZE, cardSalary, checkSquad, clubById, computeCap, teamColorBonus } from '../cards/squad'
import { cardById } from '../data/pool'
import { loadSquad } from './squad'
import { loadSettings, saveSettings, type Settings } from './settings'

export class Lobby {
  private s: Settings
  private root: HTMLElement

  constructor(
    host: HTMLElement,
    private onStart: (cfg: SoloConfig) => void,
    private onSquad: () => void,
  ) {
    this.s = loadSettings()
    const sq = loadSquad()
    const cap = computeCap().cap
    const chk = checkSquad(sq, cap)
    const color = teamColorBonus(sq.ids.slice(0, START_SIZE))
    const squadLine = chk.ok
      ? `${sq.formation} · 급여 ${chk.salary}/${cap} · 강화 ${chk.enhTotal}/24${color.bonus ? ` · 팀컬러 ${clubById(color.club)?.short ?? ''} +${color.bonus}` : ''}`
      : `⚠ 규칙 위반 — ${chk.errors[0]}`
    const best = sq.ids
      .slice(0, START_SIZE)
      .map((id) => cardById(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .sort((a, b) => cardSalary(b) - cardSalary(a))[0]
    host.innerHTML = `
      <div class="lobby">
        <div class="season">K LEAGUE 2026 · FAN GAME · 개발 중</div>
        <h1><span class="t1">개리그</span> <span class="t2">온라인 2026</span></h1>
        <p class="tag">K리그 2026 선수로 스쿼드를 짜서 브라우저에서 P2P 로 붙는 <b>1:1 실시간 조작 축구</b>. 설치·가입·서버 없음.</p>
        <div class="feats">
          <span>PC 키보드 전용 · 게임패드 없음</span><span>카드 1,024장 전원 개방 · 급여 상한</span><span>방송 카메라 · 찰흙 선수</span><span>오프사이드·파울·카드·PK·교체</span><span>전후반 3분</span><span>광고·결제 없음</span>
        </div>

        <div class="modes">
          <section class="mode">
            <h2>혼자 하기 <span class="k">SOLO</span></h2>
            <p>내 스쿼드로 봇과 한 판. 카드는 아직 <b>자리표시자</b>입니다 — 실제 K리그 선수 데이터는 허락 확인 뒤에.</p>
            <div class="row"><label>봇 난이도</label><div class="seg" data-opt="difficulty">
              <button data-v="1">쉬움</button><button data-v="2">보통</button><button data-v="3">어려움</button></div></div>
            <div class="row"><label>전후반</label><div class="seg" data-opt="halfMin">
              <button data-v="2">2분</button><button data-v="3">3분</button><button data-v="4">4분</button></div></div>
            <div class="row"><label>상대 포메이션 (원정 · 파랑)</label><select class="sel" data-opt="oppFormation"></select></div>
            <div class="row"><label>내 스쿼드</label><span class="sqline">${squadLine}${best ? ` · 최고 ${best.name}` : ''}</span></div>
            <div class="row"><button class="btn main" id="btn-solo"${chk.ok ? '' : ' disabled'}>경기 시작</button><button class="btn secondary" id="btn-squad">스쿼드 짜기</button></div>
          </section>
          <section class="mode dim">
            <h2>온라인 대전 <span class="k">P2P</span></h2>
            <p>방을 만들고 P2P 로 붙는 1:1. <b>단계 6</b> 에서 붙습니다 — 지금은 없습니다.</p>
            <div class="row"><button class="btn" disabled>방 만들기</button><button class="btn secondary" disabled>방 목록</button></div>
            <p class="hintline dim">스쿼드는 이미 짤 수 있습니다 — 왼쪽 <b>스쿼드 짜기</b>.</p>
          </section>
          <section class="mode">
            <h2>설정 <span class="k">PC</span></h2>
            <p>브라우저에만 저장됩니다. 저사양 PC 는 그림자를 끄고 해상도를 낮추세요.</p>
            <div class="row"><label>그림자</label><div class="seg" data-opt="shadows">
              <button data-v="1">켬</button><button data-v="0">끔</button></div></div>
            <div class="row"><label>렌더 해상도</label><div class="seg" data-opt="resScale">
              <button data-v="1">100%</button><button data-v="0.75">75%</button></div></div>
            <div class="row"><label>조작 안내 띠</label><div class="seg" data-opt="keysHint">
              <button data-v="1">보임</button><button data-v="0">숨김</button></div></div>
          </section>
        </div>

        <div class="section-t">조작법 <small>축구 게임 표준 키 배치 · 같은 키가 공격/수비에서 뜻이 바뀝니다</small></div>
        <table class="keys-table">
          <thead><tr><th>키</th><th>공격 (우리 팀이 공 소유)</th><th>수비</th></tr></thead>
          <tbody>
            <tr><td><b>방향키</b></td><td>이동 · 드리블 (화면 오른쪽 = 전반 공격 방향)</td><td>이동</td></tr>
            <tr><td><b>E</b> 홀드</td><td>전력질주</td><td>전력질주</td></tr>
            <tr><td><b>S</b></td><td>그라운드 패스 (홀드 = 거리)</td><td>선수 변경</td></tr>
            <tr><td><b>W</b></td><td>스루 패스</td><td>—</td></tr>
            <tr><td><b>A</b></td><td>로빙 패스 · 크로스 (<b>A A</b> 로우 크로스 · <b>Q+A</b> 하이 크로스)</td><td>슬라이딩 태클</td></tr>
            <tr><td><b>D</b></td><td>슛 (홀드 = 파워 · <b>Q+D</b> 칩슛)</td><td>압박 (홀드) · 루즈볼이면 걷어내기</td></tr>
            <tr><td><b>Space</b></td><td>—</td><td>태클 / 밀치기</td></tr>
            <tr><td><b>C</b> 홀드</td><td>—</td><td>견제 (마주 보며 천천히)</td></tr>
            <tr><td><b>Q</b> 홀드</td><td>조합키</td><td>팀 지원 요청 (두 번째 수비수 압박)</td></tr>
            <tr><td><b>Shift</b> 홀드</td><td>페이스 컨트롤 (천천히, 볼을 붙임)</td><td>—</td></tr>
            <tr><td><b>[</b> · <b>]</b></td><td colspan="2">전술 프리셋 이전 · 다음 (수비 → 균형 → 공격)</td></tr>
            <tr><td><b>Esc</b></td><td colspan="2">메뉴 (일시정지 · <b>교체</b> · 로비로)</td></tr>
          </tbody>
        </table>
        <p class="hintline">세트피스 — 킥커일 때 방향키로 방향을 잡고 <b>S</b>(그라운드) · <b>W</b>(스루) · <b>A</b>(로빙·크로스) · <b>D</b>(슛). 방향키가 없으면 AI 가 대신 고릅니다.</p>
        <p class="hintline">비상업 팬 게임 · 서버·DB 없음 · <a href="https://github.com/goormigrm/KLO26" target="_blank" rel="noopener">저장소</a></p>
      </div>`
    this.root = host.querySelector('.lobby') as HTMLElement

    for (const sel of this.root.querySelectorAll<HTMLSelectElement>('select[data-opt]')) {
      for (const f of FORMATION_LIST) {
        const o = document.createElement('option')
        o.value = f
        o.textContent = f
        sel.appendChild(o)
      }
      sel.value = String(this.s[sel.dataset.opt as 'formation' | 'oppFormation'])
      sel.onchange = () => {
        ;(this.s as unknown as Record<string, unknown>)[sel.dataset.opt!] = sel.value
        saveSettings(this.s)
      }
    }
    for (const seg of this.root.querySelectorAll<HTMLElement>('.seg[data-opt]')) {
      const key = seg.dataset.opt as keyof Settings
      const cur = this.s[key]
      const curStr = typeof cur === 'boolean' ? (cur ? '1' : '0') : String(cur)
      for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) {
        b.classList.toggle('on', b.dataset.v === curStr)
        b.onclick = () => {
          const v = b.dataset.v!
          const rec = this.s as unknown as Record<string, unknown>
          if (typeof cur === 'boolean') rec[key] = v === '1'
          else rec[key] = Number(v)
          saveSettings(this.s)
          for (const bb of seg.querySelectorAll('button')) bb.classList.toggle('on', bb === b)
        }
      }
    }
    ;(this.root.querySelector('#btn-squad') as HTMLButtonElement).onclick = () => this.onSquad()
    ;(this.root.querySelector('#btn-solo') as HTMLButtonElement).onclick = () => {
      const s = this.s
      this.onStart({
        difficulty: s.difficulty as Difficulty,
        halfSec: s.halfMin * 60,
        formation: sq.formation,
        oppFormation: s.oppFormation,
        // 시드는 sim 밖에서 뽑는다. 사람 대전(단계 6)은 스쿼드 코드·방 코드 해시로 (DESIGN 4.11)
        seed: (Math.random() * 0x7fffffff) >>> 0,
        settings: { ...s },
      })
    }
  }

  dispose(): void {
    this.root.remove()
  }
}
