// 로비 (DESIGN 7.2) — 큰 버튼 셋(혼자 하기 · 방 만들기 · 설정)을 누르면 팝업이 뜬다 (bedorage-duck 방식).
// 방 목록은 로비에 그대로 둔다 — 남이 만든 방은 바로 보여야 들어간다.

import { FORMATION_LIST } from '../core/formation'
import type { Difficulty } from '../core/state'
import type { SoloConfig, TestConfig } from '../game/session'
import { START_SIZE, cardSalary, checkSquad, clubById, computeCap, teamColorBonus } from '../cards/squad'
import { CLUBS, cardById } from '../data/pool'
import { sfx } from '../audio/sfx'
import type { LobbyLink, RoomInfo } from '../net/room'
import { makeRoomCode } from '../net/room'
import { loadSquadOrDefault } from './squad'
import { loadSettings, saveSettings, type Settings } from './settings'

/** 테스트 모드는 주소에 `?test=1` 이 있을 때만 보인다 — 배포에서는 링크를 안 걸면 끝이다 */
export function testEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has('test')
  } catch {
    return false
  }
}

export class Lobby {
  private s: Settings
  private root: HTMLElement
  private host: HTMLElement
  private roomTimer = 0
  private snd = sfx()

  constructor(
    host: HTMLElement,
    private onStart: (cfg: SoloConfig) => void,
    private onSquad: () => void,
    private onRoom?: (code: string, role: 'host' | 'guest') => void,
    private lobbyLink?: LobbyLink,
  ) {
    this.host = host
    this.s = loadSettings()
    const sq = loadSquadOrDefault()
    const cap = computeCap().cap
    const chk = checkSquad(sq, cap)
    const color = teamColorBonus(sq.ids.slice(0, START_SIZE))
    const myClub = color.club >= 0 ? clubById(color.club) : undefined
    const squadLine = chk.ok
      ? `${myClub ? `${myClub.name} · ` : ''}${sq.formation} · 급여 ${chk.salary}/${cap} · 강화 ${chk.enhTotal}/24${color.bonus ? ` · 팀컬러 +${color.bonus}` : ''}`
      : `⚠ 규칙 위반 — ${chk.errors[0]}`
    const best = sq.ids
      .slice(0, START_SIZE)
      .map((id) => cardById(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .sort((a, b) => cardSalary(b) - cardSalary(a))[0]
    const test = testEnabled()
    const formOpts = (sel: string): string =>
      FORMATION_LIST.map((f) => `<option${f === sel ? ' selected' : ''}>${f}</option>`).join('')
    const clubOpts = (sel: number): string =>
      `<option value="-1"${sel < 0 ? ' selected' : ''}>무작위</option>` +
      CLUBS.map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${c.name}${c.div === 2 ? ' (2부)' : ''}</option>`).join('')
    const seg = (opt: string, items: [string, string][], cur: string): string =>
      `<div class="seg" data-opt="${opt}">${items.map(([v, label]) => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${label}</button>`).join('')}</div>`

    host.innerHTML = `
      <div class="lobby">
        <div class="season">K LEAGUE 2026 · FAN GAME · 개발 중</div>
        <h1><span class="t1">개리그</span> <span class="t2">온라인 2026</span></h1>
        <p class="tag">K리그 2026 선수로 스쿼드를 짜서 브라우저에서 P2P 로 붙는 <b>1:1 실시간 조작 축구</b>. 설치·가입·서버 없음.</p>
        <div class="feats">
          <span>PC 키보드 전용 · 게임패드 없음</span><span>카드 1,024장 전원 개방 · 급여 상한</span><span>방송 카메라 · 찰흙 선수</span><span>오프사이드·파울·카드·PK·교체</span><span>전후반 3분</span><span>광고·결제 없음</span>
        </div>

        <div class="squad-bar">
          <div>
            <div class="sub-h">내 스쿼드</div>
            <span class="sqline">${squadLine}${best ? ` · 최고 ${best.name}` : ''}</span>
          </div>
          <button class="btn secondary" id="btn-squad">스쿼드 짜기</button>
        </div>

        <div class="tiles">
          <button class="tile" id="btn-solo"${chk.ok ? '' : ' disabled'}>
            <span class="k">SOLO</span><b>혼자 하기</b><small>실제 구단 봇과 한 판</small>
          </button>
          <button class="tile" id="btn-host"${chk.ok ? '' : ' disabled'}>
            <span class="k">P2P</span><b>방 만들기</b><small>서버 없이 둘이 붙는다</small>
          </button>
          <button class="tile" id="btn-settings">
            <span class="k">PC</span><b>설정</b><small>소리 · 그림자 · 해상도</small>
          </button>
          ${test ? '<button class="tile test" id="btn-test"><span class="k">TEST</span><b>테스트</b><small>AI 대 AI · 키 입력 보기</small></button>' : ''}
        </div>
        ${chk.ok ? '' : '<p class="hintline">⚠ 스쿼드가 규칙을 어겨 경기를 시작할 수 없습니다. 스쿼드 짜기에서 고쳐 주세요.</p>'}

        <div class="section-t">방 목록 <small id="online"></small></div>
        <div class="rooms" id="rooms"><div class="empty">방을 찾는 중…</div></div>

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
        <p class="hintline">소리는 파일 없이 코드로 만듭니다 — 관중석·휘슬·킥·로비 배경음 전부 Web Audio 절차 생성입니다.</p>
        <p class="hintline">비상업 팬 게임 · 서버·DB 없음 · <a href="https://github.com/goormigrm/KLO26" target="_blank" rel="noopener">저장소</a></p>
      </div>

      <div class="dlg" id="dlg-solo" hidden><div class="dbox">
        <h3>혼자 하기</h3>
        <p class="hintline">내 스쿼드로 실제 구단 봇과 한 판.</p>
        <div class="row"><label>봇 난이도</label>${seg('difficulty', [['1', '쉬움'], ['2', '보통'], ['3', '어려움']], String(this.s.difficulty))}</div>
        <div class="row"><label>전후반</label>${seg('halfMin', [['2', '2분'], ['3', '3분'], ['4', '4분']], String(this.s.halfMin))}</div>
        <div class="row"><label>상대 구단</label><select class="sel" data-sel="oppClub">${clubOpts(this.s.oppClub)}</select></div>
        <div class="row"><label>상대 포메이션</label><select class="sel" data-sel="oppFormation">${formOpts(this.s.oppFormation)}</select></div>
        <div class="dacts"><button class="btn secondary" data-close>닫기</button><button class="btn main" id="go-solo">경기 시작</button></div>
      </div></div>

      <div class="dlg" id="dlg-host" hidden><div class="dbox">
        <h3>방 만들기</h3>
        <p class="hintline">서버가 없어 두 브라우저가 직접 붙습니다. 방을 만들면 아래 목록에 뜹니다.</p>
        <div class="row"><label>닉네임</label><input class="nick" id="nick" maxlength="12" placeholder="닉네임" value="${this.s.nick}" /></div>
        <div class="row"><label>전후반</label>${seg('halfMin', [['2', '2분'], ['3', '3분'], ['4', '4분']], String(this.s.halfMin))}</div>
        <div class="dacts"><button class="btn secondary" data-close>닫기</button><button class="btn main" id="go-host">방 만들기</button></div>
      </div></div>

      <div class="dlg" id="dlg-settings" hidden><div class="dbox">
        <h3>설정</h3>
        <p class="hintline">브라우저에만 저장됩니다. 저사양 PC 는 그림자를 끄고 해상도를 낮추세요.</p>
        <div class="row"><label>소리</label>${seg('sound', [['1', '켬'], ['0', '끔']], this.snd.muted ? '0' : '1')}</div>
        <div class="row"><label>그림자</label>${seg('shadows', [['1', '켬'], ['0', '끔']], this.s.shadows ? '1' : '0')}</div>
        <div class="row"><label>렌더 해상도</label>${seg('resScale', [['1', '100%'], ['0.75', '75%']], String(this.s.resScale))}</div>
        <div class="row"><label>조작 안내 띠</label>${seg('keysHint', [['1', '보임'], ['0', '숨김']], this.s.keysHint ? '1' : '0')}</div>
        <div class="dacts"><button class="btn main" data-close>닫기</button></div>
      </div></div>

      ${
        test
          ? `<div class="dlg" id="dlg-test" hidden><div class="dbox">
        <h3>테스트 모드</h3>
        <p class="hintline">배포에서는 보이지 않습니다 — 주소에 <b>?test=1</b> 을 붙였을 때만 열립니다.</p>
        <div class="row"><label>모드</label>${seg('spectate', [['1', 'AI 대 AI 관전'], ['0', '내가 조작']], this.s.testSpectate ? '1' : '0')}</div>
        <div class="row"><label>키 입력 표시</label>${seg('keyView', [['1', '보임'], ['0', '숨김']], this.s.testKeyView ? '1' : '0')}</div>
        <div class="row"><label>홈 봇 난이도</label>${seg('difficulty', [['1', '쉬움'], ['2', '보통'], ['3', '어려움']], String(this.s.difficulty))}</div>
        <div class="row"><label>원정 봇 난이도</label>${seg('awayDiff', [['1', '쉬움'], ['2', '보통'], ['3', '어려움']], String(this.s.testAwayDiff))}</div>
        <div class="row"><label>전후반</label>${seg('halfMin', [['2', '2분'], ['3', '3분'], ['4', '4분']], String(this.s.halfMin))}</div>
        <div class="row"><label>상대 구단</label><select class="sel" data-sel="oppClub">${clubOpts(this.s.oppClub)}</select></div>
        <div class="dacts"><button class="btn secondary" data-close>닫기</button><button class="btn main" id="go-test">시작</button></div>
      </div></div>`
          : ''
      }`

    this.root = host.querySelector('.lobby') as HTMLElement
    this.bind()
    // 로비 배경음 (첫 클릭·키 입력 뒤에 들린다 — 브라우저 자동재생 정책)
    this.snd.stopCrowd()
    this.snd.startMusic()
  }

  private bind(): void {
    const h = this.host
    // ---- 세그먼트 버튼 (누르면 바로 저장) ----
    h.querySelectorAll<HTMLElement>('.seg[data-opt]').forEach((seg) => {
      const key = seg.dataset.opt!
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.onclick = () => {
          for (const bb of seg.querySelectorAll('button')) bb.classList.toggle('on', bb === b)
          this.setOpt(key, b.dataset.v!)
          this.snd.ui('click')
        }
      })
    })
    h.querySelectorAll<HTMLSelectElement>('select[data-sel]').forEach((sel) => {
      sel.onchange = () => this.setOpt(sel.dataset.sel!, sel.value)
    })
    const nick = h.querySelector('#nick') as HTMLInputElement | null
    if (nick) {
      nick.oninput = () => {
        this.s.nick = nick.value.slice(0, 12)
        saveSettings(this.s)
      }
    }

    // ---- 큰 버튼 → 팝업 ----
    const open = (sel: string): void => {
      this.closeDlg()
      const d = h.querySelector(sel) as HTMLElement | null
      if (d) d.hidden = false
      this.snd.ui('click')
    }
    ;(h.querySelector('#btn-solo') as HTMLButtonElement).onclick = () => open('#dlg-solo')
    ;(h.querySelector('#btn-host') as HTMLButtonElement).onclick = () => open('#dlg-host')
    ;(h.querySelector('#btn-settings') as HTMLButtonElement).onclick = () => open('#dlg-settings')
    const testBtn = h.querySelector('#btn-test') as HTMLButtonElement | null
    if (testBtn) testBtn.onclick = () => open('#dlg-test')
    ;(h.querySelector('#btn-squad') as HTMLButtonElement).onclick = () => {
      this.snd.ui('click')
      this.onSquad()
    }
    // 닫기 · 바깥 클릭 · Esc
    h.querySelectorAll<HTMLElement>('.dlg').forEach((d) => {
      d.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => (b.onclick = () => this.closeDlg()))
      d.onclick = (e) => {
        if (e.target === d) this.closeDlg()
      }
    })
    window.addEventListener('keydown', this.onKey)

    // ---- 시작 ----
    ;(h.querySelector('#go-solo') as HTMLButtonElement).onclick = () => this.start()
    ;(h.querySelector('#go-host') as HTMLButtonElement).onclick = () => {
      if (!this.s.nick.trim()) {
        nick?.classList.add('need')
        nick?.focus()
        this.snd.ui('no')
        return
      }
      this.snd.ui('ok')
      this.onRoom?.(makeRoomCode(), 'host')
    }
    const goTest = h.querySelector('#go-test') as HTMLButtonElement | null
    if (goTest) {
      goTest.onclick = () =>
        this.start({
          spectate: this.s.testSpectate,
          keyView: this.s.testKeyView,
          awayDifficulty: this.s.testAwayDiff as Difficulty,
        })
    }

    // ---- 방 목록 ----
    if (this.lobbyLink) {
      this.lobbyLink.onRooms((rooms) => this.drawRooms(rooms))
      this.roomTimer = window.setInterval(() => {
        const el = this.root.querySelector('#online')
        if (el) el.textContent = `접속 ${this.lobbyLink!.onlineCount()}명`
      }, 1500)
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeDlg()
  }

  private closeDlg(): void {
    this.host.querySelectorAll<HTMLElement>('.dlg').forEach((d) => (d.hidden = true))
  }

  private setOpt(key: string, v: string): void {
    const rec = this.s as unknown as Record<string, unknown>
    switch (key) {
      case 'sound':
        this.snd.setMuted(v === '0')
        if (v === '1') this.snd.startMusic()
        else this.snd.stopMusic()
        return
      case 'shadows':
      case 'keysHint':
        rec[key] = v === '1'
        break
      case 'spectate':
        rec.testSpectate = v === '1'
        break
      case 'keyView':
        rec.testKeyView = v === '1'
        break
      case 'awayDiff':
        rec.testAwayDiff = Number(v)
        break
      case 'oppFormation':
        rec.oppFormation = v
        break
      default:
        rec[key] = Number.isNaN(Number(v)) ? v : Number(v)
        break
    }
    saveSettings(this.s)
  }

  private start(test?: TestConfig): void {
    const s = this.s
    const sq = loadSquadOrDefault()
    this.snd.ui('ok')
    this.onStart({
      difficulty: s.difficulty as Difficulty,
      halfSec: s.halfMin * 60,
      formation: sq.formation,
      oppFormation: s.oppFormation,
      // 시드는 sim 밖에서 뽑는다. 사람 대전(단계 6)은 스쿼드 코드·방 코드 해시로 (DESIGN 4.11)
      seed: (Math.random() * 0x7fffffff) >>> 0,
      settings: { ...s },
      oppClub: s.oppClub >= 0 ? s.oppClub : undefined,
      test,
    })
  }

  private drawRooms(rooms: RoomInfo[]): void {
    const el = this.root.querySelector('#rooms')
    if (!el) return
    const open = rooms.filter((r) => r.state !== 'closed')
    if (open.length === 0) {
      el.innerHTML = '<div class="empty">열린 방이 없습니다. 방을 만들어 기다려 보세요.</div>'
      return
    }
    el.innerHTML = open
      .map(
        (r) => `<div class="room"><span><b>${r.hostName || '이름 없음'}</b> <small>· ${Math.round(r.halfSec / 60)}분 · ${r.count}/${r.max}</small></span>
          <button class="btn" data-join="${r.code}"${r.state === 'open' ? '' : ' disabled'}>${r.state === 'open' ? '참가' : r.state === 'playing' ? '경기 중' : '가득 참'}</button></div>`,
      )
      .join('')
    el.querySelectorAll<HTMLButtonElement>('[data-join]').forEach((b) => {
      b.onclick = () => {
        if (!this.s.nick.trim()) {
          // 닉네임이 없으면 방 만들기 팝업을 열어 받는다
          const d = this.host.querySelector('#dlg-host') as HTMLElement | null
          if (d) d.hidden = false
          const n = this.host.querySelector('#nick') as HTMLInputElement | null
          n?.classList.add('need')
          n?.focus()
          this.snd.ui('no')
          return
        }
        this.snd.ui('ok')
        this.onRoom?.(b.dataset.join!, 'guest')
      }
    })
  }

  dispose(): void {
    if (this.roomTimer) clearInterval(this.roomTimer)
    window.removeEventListener('keydown', this.onKey)
    this.root.remove()
    this.host.querySelectorAll('.dlg').forEach((d) => d.remove())
  }
}
