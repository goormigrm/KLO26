// 진입점 — 기기 판정 → 로비 ↔ 혼자 하기 세션. 온라인 대전은 단계 6 에서 (src/net).
// 설계서: docs/DESIGN.md · 다음 할 일: HANDOVER.md

import { Session, type SoloConfig } from './game/session'
import { isBlockedDevice, renderBlocked } from './ui/device'
import { Lobby } from './ui/lobby'

const app = document.getElementById('app')!
let lobby: Lobby | null = null
let session: Session | null = null

function showLobby(): void {
  session = null
  app.innerHTML = ''
  lobby = new Lobby(app, (cfg: SoloConfig) => {
    lobby?.dispose()
    lobby = null
    app.innerHTML = ''
    session = new Session(app, cfg, showLobby)
  })
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
  if (session) return
  const blocked = isBlockedDevice()
  if (blocked && lobby) {
    lobby.dispose()
    lobby = null
    renderBlocked(app)
  } else if (!blocked && !lobby) showLobby()
})

boot()
