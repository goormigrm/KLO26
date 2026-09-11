// 찰흙 선수 — 프리미티브 조립 + MeshToonMaterial (DESIGN 7.1).
// 머리 = 구(대두, 머리:몸 ≈ 1:2.2), 몸통 = 캡슐, 팔·다리 = 짧은 캡슐, 신발 = 납작 구.
// 키 `h` → 모델 높이 `h/180`, 몸무게 `w` → 굵기 `sqrt(w/75)`. 피부색 한 가지(연한 황토). 머리 모양 4종은 id 해시로.
// 로컬 좌표: 발 아래 원점, +y 위, 정면 = +z. 기준 높이 1.0 (180 cm) 을 만들고 root 를 배율한다.

import * as THREE from 'three'
import { ACT_DIVE, ACT_FALLEN, ACT_KICK, ACT_SLIDE, type PlayerSpec } from '../core/state'

/** 180 cm 선수의 월드 높이 (m). 실제보다 조금 크게 — 방송 시점에서 22명이 읽혀야 한다 */
export const BASE_H = 1.9
/** 찰흙색 — 데이터에 피부색이 없어 한 가지만 쓴다 (DESIGN 7.1) */
const CLAY = 0xe4bd93
const HAIR_COLORS = [0x23201d, 0x3a2a1c, 0x5a3b1f, 0x141414]

export interface Kit {
  shirt: number
  sleeve: number
  shorts: number
  socks: number
  /** 등번호 글자색 */
  number: number
}

export interface PlayerRig {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  /** 월드 높이 (배율 뒤) */
  height: number
  scale: number
  // ---- 애니메이션 상태 (렌더 전용) ----
  walk: number
  kickT: number
  lie: number
  lieSide: number
  lastAction: number
  /** 직전이 다이브였다 — 넘어져 있는 동안 옆으로 누운 자세를 유지한 채 일어난다 */
    wasDive: boolean
  dispose(): void
}

let gradient: THREE.DataTexture | null = null
/** 3단 툰 그라디언트 — 전 재질이 공유한다 */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  const data = new Uint8Array([90, 170, 255])
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

const matCache = new Map<number, THREE.MeshToonMaterial>()
function toon(color: number): THREE.MeshToonMaterial {
  let m = matCache.get(color)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() })
    matCache.set(color, m)
  }
  return m
}

function sphere(r: number, m: THREE.Material, x: number, y: number, z: number, ws = 16, hs = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** 축이 −y 인 캡슐. 원점은 위쪽 끝 (관절) */
function capsuleDown(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 10)
  g.translate(0, -len / 2, 0)
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
  return mesh
}

/** 등번호 텍스처 */
function numberTexture(no: number, color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 96
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 96, 96)
  g.fillStyle = '#' + color.toString(16).padStart(6, '0')
  g.font = '800 68px "IBM Plex Sans KR", "Segoe UI", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(no), 48, 52)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function hashId(id: number): number {
  let h = Math.imul(id ^ 0x5bd1e995, 0x9e3779b1) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  return h
}

/** 몸통·팔다리 굵기 배율 — "조금 더 마르게" (사용자 요청 2026-09-10). 머리는 그대로 대두다 */
const SLIM = 0.8

export function buildPlayer(spec: PlayerSpec, kit: Kit): PlayerRig {
  const thick = Math.sqrt(spec.w / 75) * SLIM
  const scale = (spec.h / 180) * BASE_H
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const disposables: THREE.BufferGeometry[] = []
  const track = (m: THREE.Mesh): THREE.Mesh => {
    disposables.push(m.geometry as THREE.BufferGeometry)
    return m
  }

  // ---- 다리: 허벅지(반바지) + 정강이(양말) + 신발 ----
  const legR0 = 0.055 * thick
  const hipY = 0.31
  const mkLeg = (side: -1 | 1): THREE.Group => {
    const g = new THREE.Group()
    g.position.set(side * 0.07 * thick, hipY, 0)
    const thigh = track(capsuleDown(legR0 * 1.15, 0.155, toon(kit.shorts)))
    const shin = track(capsuleDown(legR0, 0.175, toon(kit.socks)))
    shin.position.y = -0.135
    const shoe = track(sphere(legR0 * 1.45, toon(0x1d1a17), 0, -0.30, legR0 * 0.9, 12, 8))
    shoe.scale.set(1, 0.55, 1.6)
    g.add(thigh, shin, shoe)
    return g
  }
  const legL = mkLeg(-1)
  const legR = mkLeg(1)
  body.add(legL, legR)

  // ---- 몸통 (유니폼 상의) ----
  const TR = 0.13 * thick
  const torso = track(new THREE.Mesh(new THREE.CapsuleGeometry(TR, 0.25, 4, 14), toon(kit.shirt)))
  torso.position.y = 0.51
  torso.castShadow = true
  body.add(torso)
  // 등번호
  const numTex = numberTexture(spec.no, kit.number)
  const num = track(new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false })))
  num.position.set(0, 0.55, -TR - 0.004)
  num.rotation.y = Math.PI
  body.add(num)

  // ---- 팔: 소매(kit.sleeve — 2026-09-10 부터 상의와 같은 단색) + 팔뚝(피부) ----
  const armR0 = 0.042 * thick
  const mkArm = (side: -1 | 1): THREE.Group => {
    const g = new THREE.Group()
    g.position.set(side * (TR + armR0 * 0.9), 0.66, 0)
    const upper = track(capsuleDown(armR0 * 1.1, 0.13, toon(kit.sleeve)))
    const fore = track(capsuleDown(armR0, 0.17, toon(CLAY)))
    fore.position.y = -0.12
    g.add(upper, fore)
    g.rotation.z = -side * 0.12
    return g
  }
  const armL = mkArm(-1)
  const armR = mkArm(1)
  body.add(armL, armR)

  // ---- 머리 (대두) + 얼굴 + 머리카락 ----
  const head = new THREE.Group()
  const HR = 0.16
  head.position.y = 0.86
  body.add(head)
  head.add(track(sphere(HR, toon(CLAY), 0, 0, 0, 22, 16)))
  // 눈·입은 그림자를 안 드리운다 — 22명 × 3개의 그림자 패스 드로우콜을 아낀다
  const eyeM = toon(0x151515)
  const eyeL = track(sphere(0.021, eyeM, -0.058, 0.02, HR * 0.9, 8, 6))
  const eyeR = track(sphere(0.021, eyeM, 0.058, 0.02, HR * 0.9, 8, 6))
  const mouth = track(sphere(0.014, toon(0x8a3a3a), 0, -0.06, HR * 0.94, 8, 6))
  mouth.scale.set(1.7, 0.6, 0.6)
  eyeL.castShadow = eyeR.castShadow = mouth.castShadow = false
  head.add(eyeL, eyeR, mouth)
  const hh = hashId(spec.id)
  const hairM = toon(HAIR_COLORS[(hh >>> 8) % HAIR_COLORS.length])
  const style = hh % 4
  if (style !== 3) {
    // 0 짧은 · 1 덮은 · 2 묶은 (3 = 민머리)
    const theta = style === 1 ? 1.35 : 1.0
    const cap = track(new THREE.Mesh(new THREE.SphereGeometry(HR * 1.05, 22, 12, 0, Math.PI * 2, 0, theta), hairM))
    cap.castShadow = true
    head.add(cap)
    if (style === 2) head.add(track(sphere(0.05, hairM, 0, 0.11, -0.12, 10, 8)))
  }

  root.scale.setScalar(scale)
  const rig: PlayerRig = {
    root, body, head, legL, legR, armL, armR,
    height: 1.03 * scale,
    scale,
    walk: 0, kickT: 0, lie: 0, lieSide: 1, lastAction: 0, wasDive: false,
    dispose() {
      for (const g of disposables) g.dispose()
      numTex.dispose()
    },
  }
  return rig
}

/** sim 각도(0..1023, 0 = +x, 반시계 = +y) → root.rotation.y. 정면(+z 로컬)이 (cos a, −sin a) 를 보게 */
export function facingToRotY(facingRad: number): number {
  return Math.atan2(Math.cos(facingRad), -Math.sin(facingRad))
}

export interface AnimInput {
  action: number
  actT: number
  /** m/s */
  speed: number
  /** GK 가 공을 들고 있다 */
  holding: boolean
  /** 다이브 방향 (−1/1, 정면 기준 오른쪽이 +) */
  lateral: number
  /** 스로인을 던지려고 두 팔을 머리 위로 올렸다 */
  throwing: boolean
  /** 전력질주 중 — 보폭이 빠르고 팔을 크게 굽혀 흔들며 상체를 앞으로 (사용자 요청 2026-09-11) */
  sprint: boolean
}

/** 코드 애니메이션 — 걷기/달리기 · 킥 · 슬라이딩 · 넘어짐 · GK 다이브 */
export function animateRig(rig: PlayerRig, a: AnimInput, dt: number): void {
  // 킥은 sim 에서 6틱(0.1초)뿐이라 렌더가 0.32초로 늘려 보여 준다
  if (a.action === ACT_KICK && rig.lastAction !== ACT_KICK) rig.kickT = 0.32
  rig.lastAction = a.action
  rig.kickT = Math.max(0, rig.kickT - dt)

  // 눕기 목표: 슬라이딩·넘어짐 1, 다이브 1 (옆으로), 아니면 0
  if (a.action === ACT_DIVE) rig.wasDive = true
  else if (a.action !== ACT_FALLEN) rig.wasDive = false
  let lieTarget = 0
  let sideways = false
  if (a.action === ACT_SLIDE) lieTarget = 1
  else if (a.action === ACT_FALLEN) {
    lieTarget = Math.min(1, a.actT / 10)
    // 골키퍼가 다이브 뒤 일어나는 중 — 옆으로 누운 그대로 천천히 (2026-09-11)
    if (rig.wasDive) sideways = true
  } else if (a.action === ACT_DIVE) {
    lieTarget = 1
    sideways = true
    if (a.lateral !== 0) rig.lieSide = a.lateral
  }
  const k = Math.min(1, dt * 9)
  rig.lie += (lieTarget - rig.lie) * k
  const lie = rig.lie

  // 걷기 위상 — 속도에 비례. 전력질주는 보폭 주기 ×1.25 · 팔 스윙 ×1.6 · 상체 앞으로 · 위아래 흔들림 ×1.5
  const moving = a.speed > 0.4 && lie < 0.5
  const sprint = a.sprint && moving
  if (moving) rig.walk += dt * (5 + a.speed * 2.1) * (sprint ? 1.25 : 1)
  else rig.walk *= 1 - Math.min(1, dt * 10)
  const amp = Math.min(1, a.speed / 6) * (sprint ? 1.1 : 0.85)
  const swing = moving ? Math.sin(rig.walk) * amp : 0
  const legL = swing
  let legR = -swing
  const armK = sprint ? 1.3 : 0.8
  let armL = -swing * armK
  let armR = swing * armK
  let leanX = moving ? 0.06 * Math.min(1, a.speed / 8) + (sprint ? 0.18 : 0) : 0
  const bob = moving ? Math.abs(Math.sin(rig.walk)) * 0.025 * amp * (sprint ? 1.5 : 1) : 0
  // 전력질주는 팔을 굽혀 앞으로 당긴 자세
  const armFwd = sprint ? 0.4 : 0

  // 킥: 오른발을 앞으로 (−x 회전이 앞), 상체 뒤로 살짝
  if (rig.kickT > 0) {
    const t = 1 - rig.kickT / 0.32
    const s = Math.sin(t * Math.PI)
    legR = -1.25 * s + 0.4 * Math.sin(Math.min(1, t * 2.2) * Math.PI) * (1 - t)
    armL = -0.9 * s
    armR = 0.5 * s
    leanX -= 0.12 * s
  }
  // GK 가 공을 들면 두 팔을 앞으로
  if (a.holding) {
    armL = -1.35
    armR = -1.35
  }
  // 스로인 — 두 팔을 머리 뒤로 (손으로 던진다, 사용자 지적 4)
  if (a.throwing) {
    armL = -2.7
    armR = -2.7
  }
  rig.legL.rotation.x = legL * (1 - lie)
  rig.legR.rotation.x = legR * (1 - lie) + 0.35 * lie
  rig.armL.rotation.x = (armL - armFwd) * (1 - lie) + (sideways ? -2.6 : -0.6) * lie
  rig.armR.rotation.x = (armR - armFwd) * (1 - lie) + (sideways ? -2.6 : -0.6) * lie

  if (sideways || (lie > 0.01 && rig.lie > 0 && a.action === ACT_DIVE)) {
    rig.body.rotation.x = 0
    rig.body.rotation.z = 1.35 * lie * rig.lieSide
    rig.body.position.set(0, bob + 0.1 * lie, 0)
  } else {
    rig.body.rotation.z = 0
    rig.body.rotation.x = leanX * (1 - lie) - 1.35 * lie
    rig.body.position.set(0, bob + 0.12 * lie, 0.12 * lie)
  }
}
