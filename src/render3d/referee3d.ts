// 심판 — 주심 1명 + 부심 2명 (사용자 요청 2026-09-09). **렌더 전용**이다.
// sim 은 심판을 모른다(충돌·결정론에 끼지 않는다). 위치는 공과 오프사이드 라인에서 계산한다.
//
// 주심: 대각선 시스템 — 공을 12~15 m 뒤·옆에서 따라간다. 파울이 나면 그 자리로 가서 카드를 든다.
// 부심: 각자 한쪽 터치라인의 한쪽 절반을 맡고, 뒤에서 두 번째 수비수(오프사이드 라인)와 공 중 골라인에 가까운 쪽에 선다.

import * as THREE from 'three'
import { offsideLineX } from '../core/ball'
import { HALF_L, HALF_W, type GameState } from '../core/state'
import { buildPlayer, facingToRotY, type Kit, type PlayerRig } from './player3d'
import type { PlayerSpec } from '../core/state'

/** 주심 유니폼 — 검정 상하의 */
const REF_KIT: Kit = { shirt: 0x1b1b1f, sleeve: 0x2c2c33, shorts: 0x141418, socks: 0x1b1b1f, number: 0xbdbdbd }
/** 부심 — 노랑·검정 (깃발과 같은 색) */
const AR_KIT: Kit = { shirt: 0xe8c93a, sleeve: 0x1b1b1f, shorts: 0x141418, socks: 0xe8c93a, number: 0x1b1b1f }

function refSpec(id: number, h: number): PlayerSpec {
  return { id, name: '심판', no: 0, pos: 'MF', h, w: 76, foot: 'R', attr: {} }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

interface Actor {
  rig: PlayerRig
  x: number
  y: number
  facing: number
}

export class Referees {
  readonly group = new THREE.Group()
  private main: Actor
  private ars: [Actor, Actor]
  private card: THREE.Mesh
  private cardT = 0
  private flags: [THREE.Group, THREE.Group]
  private flagUp: [number, number] = [0, 0]
  private inited = false

  constructor(scene: THREE.Scene) {
    const mk = (rig: PlayerRig): Actor => {
      this.group.add(rig.root)
      return { rig, x: 0, y: 0, facing: 0 }
    }
    this.main = mk(buildPlayer(refSpec(90001, 180), REF_KIT))
    this.ars = [
      mk(buildPlayer(refSpec(90002, 178), AR_KIT)),
      mk(buildPlayer(refSpec(90003, 178), AR_KIT)),
    ]
    // 카드 — 주심 손 위에 뜨는 작은 판
    this.card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.23),
      new THREE.MeshBasicMaterial({ color: 0xf5d442, side: THREE.DoubleSide, depthTest: false }),
    )
    this.card.renderOrder = 8
    this.card.visible = false
    this.group.add(this.card)
    // 부심 깃발 — 막대 + 삼각 천
    this.flags = [this.makeFlag(), this.makeFlag()]
    for (let i = 0; i < 2; i++) this.ars[i].rig.armR.add(this.flags[i])
    scene.add(this.group)
  }

  private makeFlag(): THREE.Group {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
    )
    pole.position.y = -0.21
    g.add(pole)
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xe8c93a, side: THREE.DoubleSide }),
    )
    cloth.position.set(0.16, -0.3, 0)
    g.add(cloth)
    // 팔 끝(아래)에 매단다
    g.position.y = -0.28
    return g
  }

  /** 카드를 든다 — 1 경고(노랑) · 2 퇴장(빨강) */
  showCard(kind: number, x: number, y: number): void {
    ;(this.card.material as THREE.MeshBasicMaterial).color.setHex(kind >= 2 ? 0xd62839 : 0xf5d442)
    this.cardT = 2.6
    this.main.x = x
    this.main.y = clamp(y + 2, -HALF_W + 1, HALF_W - 1)
  }

  /** 부심이 깃발을 든다 (오프사이드) */
  raiseFlag(y: number): void {
    this.flagUp[y >= 0 ? 0 : 1] = 2.2
  }

  update(st: GameState, dt: number): void {
    const b = st.ball
    // ---- 주심: 공에서 대각선 뒤. 파울이면 그 자리 ----
    this.cardT = Math.max(0, this.cardT - dt)
    let mx: number
    let my: number
    if (this.cardT > 0) {
      mx = this.main.x
      my = this.main.y
    } else {
      // 공의 진행 반대쪽으로 조금 물러나고, 터치라인과 반대편(+y 쪽)에서 본다
      mx = clamp(b.x - Math.sign(b.vx || 1) * 3, -HALF_L + 3, HALF_L - 3)
      my = clamp(b.y + (b.y > 0 ? -9 : 9), -HALF_W + 2, HALF_W - 2)
    }
    this.step(this.main, mx, my, dt, this.cardT > 0 ? 7 : 9)
    this.card.visible = this.cardT > 0
    if (this.cardT > 0) {
      const r = this.main.rig
      this.card.position.set(r.root.position.x, r.height + 0.55, r.root.position.z + 0.1)
      this.card.rotation.set(-0.15, 0, 0.12)
    }

    // ---- 부심: 오프사이드 라인 ----
    for (let i = 0; i < 2; i++) {
      // i=0 은 +y 터치라인 · x ≤ 0 절반, i=1 은 −y 터치라인 · x ≥ 0 절반
      const sideY = i === 0 ? HALF_W + 1.6 : -(HALF_W + 1.6)
      const halfSign = i === 0 ? -1 : 1
      // 그 절반을 지키는 팀 = 그쪽 골문이 자기 골문인 팀 → 공격하는 팀의 dir 이 halfSign
      const attacker = st.teams[0].dir === halfSign ? 0 : 1
      const line = offsideLineX(st, attacker)
      // 공과 라인 중 골라인에 가까운 쪽
      const cand = b.x * halfSign > line * halfSign ? b.x : line
      const x = halfSign < 0 ? clamp(cand, -HALF_L + 1, 0) : clamp(cand, 0, HALF_L - 1)
      this.step(this.ars[i], x, sideY, dt, 8)
      // 깃발
      this.flagUp[i] = Math.max(0, this.flagUp[i] - dt)
      const up = this.flagUp[i] > 0
      this.ars[i].rig.armR.rotation.z = up ? -2.5 : 0
      this.flags[i].rotation.z = up ? 0.4 : 0
    }
  }

  /** 목표로 걸어간다 (렌더 전용 보간) */
  private step(a: Actor, tx: number, ty: number, dt: number, speed: number): void {
    if (!this.inited) {
      a.x = tx
      a.y = ty
    }
    const dx = tx - a.x
    const dy = ty - a.y
    const d = Math.hypot(dx, dy)
    let moved = 0
    if (d > 0.15) {
      const k = Math.min(1, (speed * dt) / d)
      a.x += dx * k
      a.y += dy * k
      moved = d * k
      const want = Math.atan2(dy, dx)
      let diff = want - a.facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      a.facing += diff * Math.min(1, dt * 8)
    }
    const rig = a.rig
    rig.root.position.set(a.x, 0, -a.y)
    rig.root.rotation.y = facingToRotY(a.facing)
    // 걷기 애니메이션 — 실제로 이동한 만큼
    const sp = dt > 0 ? moved / dt : 0
    rig.walk += dt * (3 + sp * 1.6)
    const swing = sp > 0.4 ? Math.sin(rig.walk) * Math.min(0.7, sp / 7) : 0
    rig.legL.rotation.x = swing
    rig.legR.rotation.x = -swing
    if (rig.armL.rotation.z === 0) rig.armL.rotation.x = -swing * 0.7
  }

  /** 첫 프레임에 자리를 잡는다 */
  place(st: GameState): void {
    this.inited = false
    this.update(st, 0.016)
    this.inited = true
  }

  dispose(): void {
    this.main.rig.dispose()
    for (const a of this.ars) a.rig.dispose()
    this.card.geometry.dispose()
    ;(this.card.material as THREE.Material).dispose()
    for (const f of this.flags) {
      f.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
    }
  }
}
