// 피치 · 골대 · 관중석 · 조명 (DESIGN 7.1). 전부 코드로 만든다 — 외부 텍스처·모델 없음.
// 단위 m. sim (x, y) → Three (x, 0, −y).

import * as THREE from 'three'
import { BOX_HALF_W, BOX_L, GOAL_H, GOAL_HALF, HALF_L, HALF_W, PEN_SPOT, SIX_HALF_W, SIX_L } from '../core/state'

/** 잔디 텍스처 해상도 (px/m) · 라인 밖 여유 (m) */
const PX = 16
const MARGIN = 6
const GOAL_DEPTH = 2.0
/** 골대 굵기 — 실제 0.06 보다 굵게 그려야 멀리서 보인다 */
const POST_VIS_R = 0.09

export interface Pitch3D {
  group: THREE.Group
  sun: THREE.DirectionalLight
  dispose(): void
}

export interface PitchOptions {
  shadows: boolean
}

/** 잔디 줄무늬 + 라인을 캔버스 하나에 그린다 */
function grassTexture(): THREE.CanvasTexture {
  const wm = HALF_L * 2 + MARGIN * 2
  const hm = HALF_W * 2 + MARGIN * 2
  const c = document.createElement('canvas')
  c.width = Math.round(wm * PX)
  c.height = Math.round(hm * PX)
  const g = c.getContext('2d')!
  const mx = (x: number): number => (x + HALF_L + MARGIN) * PX
  const my = (y: number): number => (HALF_W + MARGIN - y) * PX

  // 바탕 (라인 밖) — 살짝 어두운 잔디
  g.fillStyle = '#25703a'
  g.fillRect(0, 0, c.width, c.height)
  // 줄무늬 10개 (5.25 m)
  const stripe = (HALF_L * 2) / 10
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 === 0 ? '#2f8a45' : '#2a7d3e'
    g.fillRect(mx(-HALF_L + i * stripe), my(HALF_W), stripe * PX + 1, HALF_W * 2 * PX)
  }
  // 잔디 결 — 가는 노이즈 점
  g.fillStyle = 'rgba(0,0,0,0.05)'
  let h = 0x2545f3
  for (let i = 0; i < 9000; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const x = (h % c.width)
    const y = ((h >>> 12) % c.height)
    g.fillRect(x, y, 2, 1)
  }

  // 라인
  g.strokeStyle = '#f4f7f2'
  g.lineWidth = 0.13 * PX
  g.lineCap = 'butt'
  const rect = (x0: number, y0: number, x1: number, y1: number): void => {
    g.strokeRect(mx(Math.min(x0, x1)), my(Math.max(y0, y1)), Math.abs(x1 - x0) * PX, Math.abs(y1 - y0) * PX)
  }
  rect(-HALF_L, -HALF_W, HALF_L, HALF_W)
  g.beginPath()
  g.moveTo(mx(0), my(HALF_W))
  g.lineTo(mx(0), my(-HALF_W))
  g.stroke()
  g.beginPath()
  g.arc(mx(0), my(0), 9.15 * PX, 0, Math.PI * 2)
  g.stroke()
  const spot = (x: number, y: number): void => {
    g.beginPath()
    g.arc(mx(x), my(y), 0.2 * PX, 0, Math.PI * 2)
    g.fillStyle = '#f4f7f2'
    g.fill()
  }
  spot(0, 0)
  for (const s of [-1, 1]) {
    rect(s * HALF_L, -BOX_HALF_W, s * (HALF_L - BOX_L), BOX_HALF_W)
    rect(s * HALF_L, -SIX_HALF_W, s * (HALF_L - SIX_L), SIX_HALF_W)
    const px = s * (HALF_L - PEN_SPOT)
    spot(px, 0)
    // 페널티 아크 — 박스 밖 부분만 (cos θ > 5.5/9.15)
    const th = Math.acos((BOX_L - PEN_SPOT) / 9.15)
    g.beginPath()
    if (s > 0) g.arc(mx(px), my(0), 9.15 * PX, Math.PI - th, Math.PI + th)
    else g.arc(mx(px), my(0), 9.15 * PX, -th, th)
    g.stroke()
    // 코너 아크
    for (const t of [-1, 1]) {
      g.beginPath()
      const cx = mx(s * HALF_L)
      const cy = my(t * HALF_W)
      g.arc(cx, cy, 1 * PX, 0, Math.PI * 2)
      g.save()
      g.beginPath()
      g.rect(mx(-HALF_L), my(HALF_W), HALF_L * 2 * PX, HALF_W * 2 * PX)
      g.clip()
      g.beginPath()
      g.arc(cx, cy, 1 * PX, 0, Math.PI * 2)
      g.stroke()
      g.restore()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

/** 관중 — 색 점을 찍은 캔버스 */
function crowdTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#1b2230'
  g.fillRect(0, 0, c.width, c.height)
  const cols = ['#c94a4a', '#3d6fd6', '#e6d35a', '#e8e8e8', '#4fae5d', '#8a5fd1', '#f08a3c', '#2c3e50']
  let h = 0x9e3779b9
  for (let y = 4; y < c.height; y += 6) {
    for (let x = 2; x < c.width; x += 5) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0
      if ((h >>> 8) % 7 === 0) continue
      g.fillStyle = cols[(h >>> 16) % cols.length]
      g.beginPath()
      g.arc(x + ((h >>> 4) % 3) - 1, y, 2, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

function cylinder(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m)
  mesh.castShadow = true
  return mesh
}

/** 골대 하나 — 포스트·크로스바·뒤 기둥·네트 격자. dir = 골문이 있는 x 부호 */
function buildGoal(dir: number, postM: THREE.Material, netM: THREE.LineBasicMaterial): THREE.Group {
  const g = new THREE.Group()
  const x0 = dir * HALF_L
  const xb = dir * (HALF_L + GOAL_DEPTH)
  for (const s of [-1, 1]) {
    const post = cylinder(POST_VIS_R, GOAL_H, postM)
    post.position.set(x0, GOAL_H / 2, -s * GOAL_HALF)
    g.add(post)
    const back = cylinder(POST_VIS_R * 0.6, GOAL_H * 0.85, postM)
    back.position.set(xb, (GOAL_H * 0.85) / 2, -s * GOAL_HALF)
    g.add(back)
  }
  const bar = cylinder(POST_VIS_R, GOAL_HALF * 2 + POST_VIS_R * 2, postM)
  bar.rotation.x = Math.PI / 2
  bar.position.set(x0, GOAL_H, 0)
  g.add(bar)
  // 네트 — 뒤·위·옆 격자
  const pts: number[] = []
  const step = 0.45
  const hb = GOAL_H * 0.85
  for (let z = -GOAL_HALF; z <= GOAL_HALF + 0.01; z += step) {
    pts.push(xb, 0, z, xb, hb, z) // 뒤 세로
    pts.push(x0, GOAL_H, z, xb, hb, z) // 위 가로(경사)
  }
  for (let y = 0; y <= hb + 0.01; y += step) pts.push(xb, y, -GOAL_HALF, xb, y, GOAL_HALF) // 뒤 가로
  for (let t = 0; t <= 1.001; t += 0.25) {
    const x = x0 + (xb - x0) * t
    const y = GOAL_H + (hb - GOAL_H) * t
    pts.push(x, y, -GOAL_HALF, x, y, GOAL_HALF) // 위 세로
  }
  for (const s of [-1, 1]) {
    for (let y = 0; y <= GOAL_H + 0.01; y += step) {
      const xEnd = y > hb ? x0 + (xb - x0) * ((GOAL_H - y) / (GOAL_H - hb)) : xb
      pts.push(x0, y, s * GOAL_HALF, xEnd, y, s * GOAL_HALF) // 옆 가로
    }
    for (let x = 0; x <= GOAL_DEPTH + 0.01; x += step) {
      const xx = x0 + dir * x
      const yTop = GOAL_H + (hb - GOAL_H) * (x / GOAL_DEPTH)
      pts.push(xx, 0, s * GOAL_HALF, xx, yTop, s * GOAL_HALF) // 옆 세로
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.add(new THREE.LineSegments(geo, netM))
  return g
}

export function buildPitch(opts: PitchOptions): Pitch3D {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []

  // ---- 잔디 ----
  const grassTex = grassTexture()
  disposables.push(grassTex)
  const wm = HALF_L * 2 + MARGIN * 2
  const hm = HALF_W * 2 + MARGIN * 2
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), new THREE.MeshLambertMaterial({ map: grassTex }))
  grass.rotation.x = -Math.PI / 2
  grass.receiveShadow = true
  group.add(grass)
  // 바깥 땅 (어둡게, 넓게)
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshLambertMaterial({ color: 0x141b14 }))
  outside.rotation.x = -Math.PI / 2
  outside.position.y = -0.02
  outside.receiveShadow = true
  group.add(outside)

  // ---- 골대 ----
  const postM = new THREE.MeshLambertMaterial({ color: 0xf6f6f6 })
  const netM = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 })
  group.add(buildGoal(1, postM, netM), buildGoal(-1, postM, netM))

  // ---- 관중석 — 낮은 띠 4개 ----
  const crowd = crowdTexture()
  disposables.push(crowd)
  const standH = 5.5
  const standD = 10
  const gap = 7
  const side = new THREE.MeshLambertMaterial({ color: 0x1b2230 })
  const mkStand = (len: number, depth: number, x: number, z: number, rotY: number): void => {
    const tex = crowd.clone()
    tex.repeat.set(len / 12, 1)
    tex.needsUpdate = true
    disposables.push(tex)
    const face = new THREE.MeshLambertMaterial({ map: tex })
    // 안쪽 면(+z 로컬)만 관중, 나머지는 어두운 벽
    const mats = [side, side, face, side, face, side]
    const geo = new THREE.BoxGeometry(len, standH, depth)
    // 안쪽으로 기울어진 계단 느낌 — 위를 살짝 뒤로 민다
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0 && pos.getZ(i) > 0) pos.setZ(i, pos.getZ(i) - depth * 0.55)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, mats)
    m.position.set(x, standH / 2, z)
    m.rotation.y = rotY
    m.receiveShadow = true
    group.add(m)
    disposables.push(geo)
  }
  // 먼 쪽(−z)·가까운 쪽(+z)·양 골문 뒤. 안쪽 면이 피치를 보게 회전
  mkStand(HALF_L * 2 + 2 * gap + 2 * standD, standD, 0, -(HALF_W + gap + standD / 2), 0)
  mkStand(HALF_L * 2 + 2 * gap + 2 * standD, standD, 0, HALF_W + gap + standD / 2, Math.PI)
  mkStand(HALF_W * 2 + 2 * gap, standD, HALF_L + gap + standD / 2, 0, -Math.PI / 2)
  mkStand(HALF_W * 2 + 2 * gap, standD, -(HALF_L + gap + standD / 2), 0, Math.PI / 2)

  // ---- 조명 ----
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x233a1e, 0.85)
  group.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1)
  sun.position.set(-30, 70, 40)
  sun.castShadow = opts.shadows
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 220
  sun.shadow.camera.left = -66
  sun.shadow.camera.right = 66
  sun.shadow.camera.top = 48
  sun.shadow.camera.bottom = -48
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  group.add(sun)
  group.add(sun.target)

  return {
    group,
    sun,
    dispose() {
      for (const d of disposables) d.dispose()
      grass.geometry.dispose()
      outside.geometry.dispose()
    },
  }
}
