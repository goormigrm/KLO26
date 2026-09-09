// 진입점 — 기기 판정 → 로비 ↔ 혼자 하기 세션. 온라인 대전은 단계 6 에서 (src/net).
// 설계서: docs/DESIGN.md · 다음 할 일: HANDOVER.md

import { Session, type NetConfig, type SoloConfig } from './game/session'
import { openLobby, type LobbyLink } from './net/room'
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
/**
 * 공용 로비 통로는 페이지가 사는 동안 하나만 연다 (bedorage-duck 2026-09-06 교훈).
 * 폰 차단 화면에서는 아예 열지 않는다 — 접속만 하고 못 노는 사람이 목록에 뜨면 헷갈린다.
 */
let lobbyLink: LobbyLink | null = null

function showSquad(): void {
  lobby?.dispose()
  lobby = null
  app.innerHTML = ''
  squad = new SquadScreen(app, () => {
    squad?.dispose()
    squad = null
    showLobby()
  })
}

function showWait(code: string, role: 'host' | 'guest'): void {
  const s = loadSettings()
  lobby?.dispose()
  lobby = null
  app.innerHTML = ''
  const halfSec = s.halfMin * 60
  wait = new WaitRoom(
    app,
    {
      code,
      role,
      name: s.nick.trim() || '이름 없음',
      squad: loadSquadOrDefault(),
      halfSec,
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

function showLobby(): void {
  session = null
  squad = null
  wait = null
  app.innerHTML = ''
  if (!lobbyLink) lobbyLink = openLobby()
  lobby = new Lobby(
    app,
    (cfg: SoloConfig) => {
      lobby?.dispose()
      lobby = null
      app.innerHTML = ''
      session = new Session(app, { ...cfg, squad: loadSquadOrDefault() }, showLobby)
    },
    showSquad,
    showWait,
    lobbyLink,
  )
}

function boot(): void {
  if (isBlockedDevice()) {
    renderBlocked(app)
    lobby = null
    return
  }
  if (!lobby && !session) showLobby()
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
