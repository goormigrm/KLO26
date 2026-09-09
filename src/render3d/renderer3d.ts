// Three.js 렌더러 — 방송 카메라 · 찰흙 선수 22명 · 공 · 조작 표시 (DESIGN 7.1).
// prev/curr 를 보간해 그릴 뿐, sim 을 바꾸지 않는다. src/core 는 이 파일을 모른다.

import * as THREE from 'three'
import { angleToRad } from '../core/fixedmath'
import { ACT_DIVE, HALF_L, HALF_W, type GameState, type Player, type SimEvent } from '../core/state'
import { FOV_WIDE, broadcastTarget, cameraLookAt, cameraPosition, fovForAspect } from './camera'
import { buildPitch, type Pitch3D } from './pitch3d'
import { Referees } from './referee3d'
import { animateRig, buildPlayer, facingToRotY, type Kit, type PlayerRig } from './player3d'

/** 보간에 필요한 만큼만 — 매 틱 22명 pose 와 공을 복사한다 (상태 전체 JSON 복사는 무겁다) */
export interface Pose {
  x: number
  y: number
  facing: number
}
export interface PrevPose {
  players: Pose[]
  ball: { x: number; y: number; z: number }
}

export function capturePose(st: GameState, out?: PrevPose): PrevPose {
  const o: PrevPose = out ?? { players: st.players.map(() => ({ x: 0, y: 0, facing: 0 })), ball: { x: 0, y: 0, z: 0 } }
  for (let i = 0; i < st.players.length; i++) {
    const p = st.players[i]
    const q = o.players[i]
    q.x = p.x
    q.y = p.y
    q.facing = p.facing
  }
  o.ball.x = st.ball.x
  o.ball.y = st.ball.y
  o.ball.z = st.ball.z
  return o
}

export interface RenderOptions {
  shadows: boolean
  /** 렌더 해상도 배율 (1 또는 0.75) */
  resScale: number
}

export interface ViewInfo {
  humanTeam: number
  /** 조작 중인 선수 idx (−1 = 없음) */
  controlled: number
}

/** 공은 실제 0.11 m 보다 크게 그린다 — 70 m 밖에서 보인다 */
const BALL_VIS_R = 0.19

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f7f4'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#1c1c1c'
  const spots = [[16, 16], [48, 40], [80, 14], [112, 44], [64, 60], [0, 48]]
  for (const [x, y] of spots) {
    g.beginPath()
    g.arc(x, y, 7, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function nameSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 72
  const g = c.getContext('2d')!
  g.font = '700 34px "IBM Plex Sans KR", "Segoe UI", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const w = Math.min(248, g.measureText(text).width + 28)
  g.fillStyle = 'rgba(10,14,20,0.78)'
  g.beginPath()
  g.roundRect((256 - w) / 2, 8, w, 56, 12)
  g.fill()
  g.fillStyle = color
  g.fillText(text, 128, 38)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  sp.scale.set(3.2, 0.9, 1)
  sp.renderOrder = 10
  return sp
}

export class Renderer3D {
  readonly canvas: HTMLCanvasElement
  private gl: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private pitch: Pitch3D
  private refs: Referees
  private rigs: PlayerRig[] = []
  private ball: THREE.Mesh
  private ballTex: THREE.CanvasTexture
  private ballShadow: THREE.Mesh
  private marker = new THREE.Group()
  private ring: THREE.Mesh
  private oppRing: THREE.Mesh
  private name: THREE.Sprite | null = null
  private nameFor = -1
  private camX = 0
  private camLookY = 0
  private camFov = FOV_WIDE
  private camInit = false
  private t = 0
  private opts: RenderOptions
  private kits: [Kit, Kit] | null = null
  private gkKits: [Kit, Kit] | null = null

  constructor(
    readonly container: HTMLElement,
    opts: RenderOptions,
  ) {
    this.opts = opts
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'gl'
    container.appendChild(this.canvas)
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.gl.shadowMap.enabled = opts.shadows
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.0
    this.scene.background = new THREE.Color(0x121a26)
    this.camera = new THREE.PerspectiveCamera(FOV_WIDE, 16 / 9, 0.5, 500)
    this.pitch = buildPitch({ shadows: opts.shadows })
    this.scene.add(this.pitch.group)
    this.refs = new Referees(this.scene)

    this.ballTex = ballTexture()
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_VIS_R, 18, 14), new THREE.MeshLambertMaterial({ map: this.ballTex }))
    this.ball.castShadow = true
    this.scene.add(this.ball)
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_VIS_R * 1.1, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.ballShadow.rotation.x = -Math.PI / 2
    this.ballShadow.position.y = 0.012
    this.scene.add(this.ballShadow)

    // 조작 표시: 머리 위 화살표 + 발밑 링
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 4), new THREE.MeshBasicMaterial({ color: 0xffe14a }))
    cone.rotation.x = Math.PI
    this.marker.add(cone)
    this.scene.add(this.marker)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.02
    this.scene.add(this.ring)
    this.oppRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.oppRing.rotation.x = -Math.PI / 2
    this.oppRing.position.y = 0.02
    this.oppRing.visible = false
    this.scene.add(this.oppRing)
    this.resize()
  }

  /** 경기 시작 — 22명 리그를 만든다. GK 는 팀 GK 킷 */
  setMatch(st: GameState, kits: [Kit, Kit], gkKits: [Kit, Kit]): void {
    for (const r of this.rigs) {
      this.scene.remove(r.root)
      r.dispose()
    }
    this.rigs = st.players.map((p) => buildPlayer(p.spec, p.sk.isGK ? gkKits[p.team] : kits[p.team]))
    for (const r of this.rigs) this.scene.add(r.root)
    this.kits = kits
    this.gkKits = gkKits
    this.camInit = false
    this.nameFor = -1
    this.refs.place(st)
  }

  /** 교체로 등번호·유니폼이 바뀐 선수 하나만 다시 만든다 */
  rebuildRig(st: GameState, idx: number): void {
    if (!this.kits || !this.gkKits) return
    const p = st.players[idx]
    const old = this.rigs[idx]
    this.scene.remove(old.root)
    old.dispose()
    const rig = buildPlayer(p.spec, p.sk.isGK ? this.gkKits[p.team] : this.kits[p.team])
    this.rigs[idx] = rig
    this.scene.add(rig.root)
    if (this.nameFor === idx) this.nameFor = -1
  }

  /** sim 이벤트를 렌더에 반영 — 카드·오프사이드 깃발 */
  onEvents(events: SimEvent[], from: number): void {
    for (let i = from; i < events.length; i++) {
      const e = events[i]
      if (e.type === 'card') this.refs.showCard(e.n ?? 1, e.x, e.y)
      else if (e.type === 'offside') this.refs.raiseFlag(e.y)
    }
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * this.opts.resScale)
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  draw(prev: PrevPose, curr: GameState, alpha: number, dt: number, view: ViewInfo): void {
    this.t += dt
    const n = curr.players.length
    if (this.rigs.length !== n) return
    // ---- 선수 ----
    for (let i = 0; i < n; i++) {
      const p = curr.players[i]
      const q = prev.players[i]
      const x = q.x + (p.x - q.x) * alpha
      const y = q.y + (p.y - q.y) * alpha
      const fr = lerpAngle(angleToRad(q.facing), angleToRad(p.facing), alpha)
      const rig = this.rigs[i]
      rig.root.visible = !p.sentOff
      rig.root.position.set(x, 0, -y)
      rig.root.rotation.y = facingToRotY(fr)
      animateRig(rig, this.animOf(p, fr), dt)
    }
    // ---- 공 ----
    const b = curr.ball
    const pb = prev.ball
    const bx = pb.x + (b.x - pb.x) * alpha
    const by = pb.y + (b.y - pb.y) * alpha
    const bz = pb.z + (b.z - pb.z) * alpha
    this.ball.position.set(bx, bz + BALL_VIS_R, -by)
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > 0.05) {
      const axis = new THREE.Vector3(-b.vy, 0, -b.vx).normalize()
      this.ball.rotateOnWorldAxis(axis, (sp * dt) / BALL_VIS_R)
    }
    this.ballShadow.position.set(bx, 0.012, -by)
    const sh = 1 + bz * 0.12
    this.ballShadow.scale.set(sh, sh, 1)
    ;(this.ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.35 / (1 + bz * 0.35)

    // ---- 조작 표시 ----
    const c = view.controlled
    if (c >= 0 && c < n) {
      const rig = this.rigs[c]
      const bob = Math.sin(this.t * 6) * 0.08
      this.marker.visible = true
      this.marker.position.set(rig.root.position.x, rig.height + 0.5 + bob, rig.root.position.z)
      this.marker.rotation.y = this.t * 1.5
      this.ring.visible = true
      this.ring.position.set(rig.root.position.x, 0.02, rig.root.position.z)
      if (this.nameFor !== c) {
        if (this.name) {
          this.scene.remove(this.name)
          ;(this.name.material as THREE.SpriteMaterial).map?.dispose()
          this.name.material.dispose()
        }
        const p = curr.players[c]
        this.name = nameSprite(`${p.spec.no} ${p.spec.name}`, '#ffe14a')
        this.scene.add(this.name)
        this.nameFor = c
      }
      if (this.name) this.name.position.set(rig.root.position.x, rig.height + 1.25, rig.root.position.z)
    } else {
      this.marker.visible = false
      this.ring.visible = false
      if (this.name) this.name.visible = false
    }
    if (this.name && c >= 0) this.name.visible = true
    // 상대가 공을 갖고 있으면 그 선수 발밑에 붉은 링
    const o = b.owner
    if (o >= 0 && curr.players[o].team !== view.humanTeam) {
      const rig = this.rigs[o]
      this.oppRing.visible = true
      this.oppRing.position.set(rig.root.position.x, 0.02, rig.root.position.z)
    } else this.oppRing.visible = false

    this.refs.update(curr, dt)

    // ---- 카메라 ----
    const tgt = broadcastTarget(bx, by, b.vx)
    if (!this.camInit) {
      this.camX = tgt.x
      this.camLookY = tgt.lookY
      this.camFov = tgt.fov
      this.camInit = true
    } else {
      const s = 1 - Math.pow(0.03, dt)
      this.camX += (tgt.x - this.camX) * s
      this.camLookY += (tgt.lookY - this.camLookY) * s * 0.8
      this.camFov += (tgt.fov - this.camFov) * (1 - Math.pow(0.15, dt))
    }
    const ct = { x: this.camX, lookY: this.camLookY, fov: this.camFov }
    const cp = cameraPosition(ct)
    const cl = cameraLookAt(ct)
    this.camera.position.set(cp.x, cp.y, cp.z)
    this.camera.lookAt(cl.x, cl.y, cl.z)
    const fov = fovForAspect(this.camFov, this.camera.aspect)
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    this.gl.render(this.scene, this.camera)
  }

  private animOf(p: Player, facingRad: number) {
    const speed = Math.hypot(p.vx, p.vy)
    // 다이브 방향: 정면 기준 오른쪽 성분
    let lateral = 0
    if (p.action === ACT_DIVE) {
      const rx = Math.sin(facingRad)
      const ry = -Math.cos(facingRad)
      const l = p.vx * rx + p.vy * ry
      lateral = l > 0.05 ? 1 : l < -0.05 ? -1 : 0
    }
    return { action: p.action, actT: p.actT, speed, holding: p.holdT > 0, lateral, throwing: p.throwing }
  }

  /** 프레임 시간(ms) 계측용 */
  get info(): { calls: number; triangles: number } {
    return { calls: this.gl.info.render.calls, triangles: this.gl.info.render.triangles }
  }

  dispose(): void {
    for (const r of this.rigs) r.dispose()
    this.rigs = []
    this.refs.dispose()
    this.pitch.dispose()
    this.ballTex.dispose()
    this.gl.dispose()
    this.canvas.remove()
  }
}

export { HALF_L as PITCH_HALF_L, HALF_W as PITCH_HALF_W }
