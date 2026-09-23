// 진입점 — 기기 판정 → 로비 ↔ 혼자 하기 세션. 온라인 대전은 단계 6 에서 (src/net).
// 설계서: docs/DESIGN.md · 다음 할 일: HANDOVER.md

import { PracticeSession } from './game/practice'
import { Session, type NetConfig, type SoloConfig } from './game/session'
import { HostRoom } from './net/hostroom'
import { openLobby, type LobbyLink, type RoomLink } from './net/room'
import { isBlockedDevice, renderBlocked } from './ui/device'
import { Lobby } from './ui/lobby'
import { loadSettings } from './ui/settings'
import { SquadScreen, loadSquadOrDefault } from './ui/squad'
import { WaitRoom } from './ui/waitroom'

const app = document.getElementById('app')!
let lobby: Lobby | null = null
let session: Session | null = null
let squad: SquadScreen | null = null
let wait: WaitRoom | null = null
let practice: PracticeSession | null = null
/**
 * 공용 로비 통로는 페이지가 사는 동안 하나만 연다 (bedorage-duck 2026-09-06 교훈).
 * 폰 차단 화면에서는 아예 열지 않는다 — 접속만 하고 못 노는 사람이 목록에 뜨면 헷갈린다.
 */
let lobbyLink: LobbyLink | null = null
/**
 * 방을 만들어 놓고 **로비에 남아 있는 중** (2026-09-16, 사용자 요청).
 * 화면(로비 ↔ 스쿼드)이 바뀌어도 연결은 살아 있어야 하므로 여기에 둔다.
 */
let hosting: HostRoom | null = null

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

/** 로비 카드에 넘길 지금 방 상태 */
function hostingInfo(): { code: string; guestName: string } | null {
  return hosting ? { code: hosting.code, guestName: hosting.guestName } : null
}

function closeAsk(): void {
  document.getElementById('join-ask')?.remove()
}

/** 방을 닫는다 — 목록에서 지우고 연결을 끊는다 */
function closeRoom(): void {
  hosting?.close()
  hosting = null
  closeAsk()
  lobby?.setHosting(null)
}

/** 열어 둔 방을 그대로 들고 대기실로 들어간다 (스쿼드는 대기실에서 준비를 눌러 확정한다) */
function enterWait(): void {
  if (!hosting) return
  const h = hosting
  hosting = null
  closeAsk()
  squad?.save() // 스쿼드 화면에서 고치던 중이면 지금 상태를 저장하고 간다
  showWait(h.code, 'host', h.handOver(), h.guestId || undefined, h.guestName || undefined)
}

/**
 * 상대가 들어왔다 — 스쿼드를 고치던 중일 수 있으니 **묻는다** (사용자 요청 2026-09-16).
 * 화면이 로비든 스쿼드든 뜨도록 `document.body` 에 붙인다.
 */
function askJoin(guest: string): void {
  closeAsk()
  const d = document.createElement('div')
  d.className = 'dlg'
  d.id = 'join-ask'
  d.innerHTML = `<div class="dbox">
    <h3>🚪 상대가 들어왔습니다</h3>
    <p><b>${esc(guest)}</b> 님이 내 방에 들어왔습니다.</p>
    <p class="hintline">지금 상태를 저장하고 대기실로 갑니다. 스쿼드는 대기실에서 <b>준비</b>를 눌러야 확정되니 거기서 더 고쳐도 됩니다.</p>
    <div class="row">
      <button class="btn main" id="ja-go">저장하고 대기실로</button>
      <button class="btn secondary" id="ja-stay">조금 더 준비하기</button>
    </div>
  </div>`
  document.body.appendChild(d)
  ;(d.querySelector('#ja-go') as HTMLButtonElement).onclick = () => enterWait()
  ;(d.querySelector('#ja-stay') as HTMLButtonElement).onclick = () => closeAsk()
}

/** 방 만들기 — 대기실로 바로 들어가지 않고 **로비에 남는다** */
function createRoom(code: string): void {
  const s = loadSettings()
  hosting?.close()
  hosting = new HostRoom({
    code,
    name: s.nick.trim() || '이름 없음',
    halfSec: s.halfMin * 60,
    announce: (info) => lobbyLink?.announce(info),
    onGuest: (name) => {
      lobby?.setHosting(hostingInfo())
      askJoin(name)
    },
    onGuestLeave: () => {
      closeAsk()
      lobby?.setHosting(hostingInfo())
    },
  })
  lobby?.setHosting(hostingInfo())
}

function showSquad(at: 'edit' | 'club' = 'edit'): void {
  lobby?.dispose()
  lobby = null
  app.innerHTML = ''
  // 방을 열어 둔 채로 스쿼드를 고칠 수 있다 — 상대가 들어오면 `askJoin` 이 여기로도 뜬다 (2026-09-16)
  squad = new SquadScreen(
    app,
    () => {
      squad?.dispose()
      squad = null
      showLobby()
    },
    at,
  )
}

function showWait(code: string, role: 'host' | 'guest', link?: RoomLink, peerId?: string, peerName?: string): void {
  const s = loadSettings()
  lobby?.dispose()
  lobby = null
  squad?.dispose()
  squad = null
  app.innerHTML = ''
  const halfSec = s.halfMin * 60
  wait = new WaitRoom(
    app,
    {
      code,
      role,
      name: s.nick.trim() || '이름 없음',
      // 스쿼드는 **준비를 누를 때** 확정한다 — 그래서 값이 아니라 읽는 함수를 넘긴다 (2026-09-16)
      getSquad: () => loadSquadOrDefault(),
      halfSec,
      link,
      peerId,
      peerName,
      offside: true,
      announce:
        role === 'host'
          ? (count, state) =>
              lobbyLink?.announce(
                state === 'closed' ? null : { code, hostName: s.nick.trim() || '이름 없음', halfSec, offside: true, count, max: 2, state },
              )
          : undefined,
    },
    (net: NetConfig, hs: number, seed: number) => {
      wait?.dispose()
      wait = null
      app.innerHTML = ''
      session = new Session(
        app,
        {
          difficulty: s.difficulty,
          halfSec: hs,
          formation: '4-3-3',
          oppFormation: '4-4-2',
          seed,
          settings: s,
          net,
        },
        () => {
          if (role === 'host') lobbyLink?.announce(null)
          showLobby()
        },
      )
    },
    () => {
      if (role === 'host') lobbyLink?.announce(null)
      showLobby()
    },
  )
}

/** 🎯 조작 연습 (2026-09-23) — 내 스쿼드로, 로비에서 들어가고 로비로 나온다 */
function showPractice(): void {
  closeRoom()
  lobby?.dispose()
  lobby = null
  app.innerHTML = ''
  practice = new PracticeSession(app, loadSettings(), loadSquadOrDefault(), () => {
    practice = null
    showLobby()
  })
}

function showLobby(): void {
  session = null
  squad = null
  wait = null
  practice = null
  app.innerHTML = ''
  if (!lobbyLink) lobbyLink = openLobby()
  lobby = new Lobby(
    app,
    (cfg: SoloConfig) => {
      closeRoom() // 혼자 하기로 가면 열어 둔 방은 닫는다
      lobby?.dispose()
      lobby = null
      app.innerHTML = ''
      session = new Session(app, { ...cfg, squad: loadSquadOrDefault() }, showLobby)
    },
    showSquad,
    // 방 만들기는 **로비에 남고**, 남의 방에 참가하는 것만 바로 대기실로 간다 (2026-09-16)
    (code, role) => {
      if (role === 'host') createRoom(code)
      else {
        closeRoom()
        showWait(code, 'guest')
      }
    },
    lobbyLink,
    { info: hostingInfo, enter: enterWait, close: closeRoom },
    showPractice,
  )
  lobby.setHosting(hostingInfo())
}

function boot(): void {
  if (isBlockedDevice()) {
    renderBlocked(app)
    lobby = null
    return
  }
  if (!lobby && !session && !practice) showLobby()
}

// 창을 넓히면 로비가 열리고, 좁히면 (세션 중이 아닐 때) 다시 안내로
window.addEventListener('resize', () => {
  if (session || squad || wait) return
  const blocked = isBlockedDevice()
  if (blocked && lobby) {
    lobby.dispose()
    lobby = null
    renderBlocked(app)
  } else if (!blocked && !lobby) showLobby()
})

boot()

// ---------------------------------------------------------------- 공지글 첨부 (개발 서버에서만)
// 로비·스쿼드처럼 세션 밖 화면을 찍는다: 콘솔에서 `__shot('이름.png')`. 경기 중은 `__klo.snap/gif`.
// 배포 번들에는 shot.ts 가 들어가지 않는다 (DEV 가 아니면 이 블록이 통째로 사라진다).
if (import.meta.env.DEV) {
  ;(window as unknown as { __shot?: unknown }).__shot = async (name: string, scale = 1) => {
    const m = await import('./debug/shot')
    const url = await m.snapDom(scale)
    const r = await m.postSnap(name, m.dataUrlBytes(url))
    console.log('[shot]', r)
    return r
  }
}
