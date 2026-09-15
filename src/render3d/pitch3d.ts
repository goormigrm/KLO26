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
  /** 골망 출렁임 — 골이 들어간 골문(dir)의 y 자리에 충격 (P4, 2026-09-15) */
  netHit(dir: number, y: number): void
  /** 매 프레임 — 골망 진동 감쇠 */
  update(dt: number): void
  group: THREE.Group
  sun: THREE.DirectionalLight
  /** 홈 팀 색으로 관중석·스탠드를 다시 칠한다 (2026-09-11 — 경기마다 홈이 바뀐다) */
  setHomeColor(hex: number): void
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
  // 줄무늬 10개 (5.25 m) — 두 톤을 조금 더 벌렸다 (2026-09-15, FC 온라인 영상의 진한 줄무늬)
  const stripe = (HALF_L * 2) / 10
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 === 0 ? '#328f47' : '#287a3c'
    g.fillRect(mx(-HALF_L + i * stripe), my(HALF_W), stripe * PX + 1, HALF_W * 2 * PX)
  }
  // 세로 방향 깎은 자국 — 가로 줄무늬 위에 옅게 겹쳐 **격자**가 된다 (영상의 두 방향 깎기)
  const stripeY = (HALF_W * 2) / 8
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)'
    g.fillRect(mx(-HALF_L), my(HALF_W - i * stripeY), HALF_L * 2 * PX, stripeY * PX + 1)
  }
  // 잔디 결 — 가는 노이즈 점 (밝은 점·어두운 점 섞어)
  let h = 0x2545f3
  for (let i = 0; i < 22000; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const x = (h % c.width)
    const y = ((h >>> 12) % c.height)
    g.fillStyle = (h >>> 24) & 1 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'
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

/** 색을 어둡게/밝게 (k < 1 이면 어둡게) */
function shade(hex: number, k: number): string {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k))
  const b = Math.min(255, Math.round((hex & 255) * k))
  return `rgb(${r},${g},${b})`
}

/**
 * 관중 캔버스를 그린다. `home` 을 주면 그 색 옷을 입은 사람이 **절반쯤** 되고 바탕도 그 색으로 어두워진다
 * — 홈 팀 컬러가 관중석에 보이게 (사용자 요청 2026-09-11).
 */
function drawCrowd(c: HTMLCanvasElement, home?: number): void {
  const g = c.getContext('2d')!
  g.fillStyle = home === undefined ? '#1b2230' : shade(home, 0.24)
  g.fillRect(0, 0, c.width, c.height)
  const cols = ['#c94a4a', '#3d6fd6', '#e6d35a', '#e8e8e8', '#4fae5d', '#8a5fd1', '#f08a3c', '#2c3e50']
  const homeCols = home === undefined ? [] : [shade(home, 1), shade(home, 1.25), shade(home, 0.78)]
  let h = 0x9e3779b9
  for (let y = 4; y < c.height; y += 6) {
    for (let x = 2; x < c.width; x += 5) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0
      if ((h >>> 8) % 7 === 0) continue
      // 홈 색 절반 · 나머지는 알록달록 (원정 팬·중립)
      g.fillStyle = homeCols.length && (h >>> 12) % 2 === 0 ? homeCols[(h >>> 20) % homeCols.length] : cols[(h >>> 16) % cols.length]
      g.beginPath()
      g.arc(x + ((h >>> 4) % 3) - 1, y, 2, 0, Math.PI * 2)
      g.fill()
    }
  }
}

/**
 * 광고판 띠 텍스처 (2026-09-15, P0) — 실제 브랜드는 쓰지 않는다. 우리 이름과 홈 구단 색 띠만.
 * 한 장이 12 m 를 덮고 repeat 로 둘레를 채운다
 */
function boardTexture(home: number): { tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; redraw(home: number): void } {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 64
  const draw = (hex: number): void => {
    const g = c.getContext('2d')!
    g.fillStyle = '#0e1626'
    g.fillRect(0, 0, c.width, c.height)
    // 홈 색 띠 (위·아래)
    g.fillStyle = shade(hex, 0.9)
    g.fillRect(0, 0, c.width, 6)
    g.fillRect(0, c.height - 6, c.width, 6)
    g.font = '800 34px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.fillStyle = '#f4f7f2'
    g.fillText('개리그 온라인 2026', 192, 33)
    g.fillStyle = '#e3b341'
    g.fillText('KLO26', 576, 33)
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(383, 10, 2, 44)
  }
  draw(home)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 4
  return { tex, canvas: c, redraw: draw }
}

/** 관중 텍스처 + 홈 색으로 다시 칠하는 함수 */
function crowdTexture(): { tex: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  drawCrowd(c)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return { tex, canvas: c }
}

function cylinder(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m)
  mesh.castShadow = true
  return mesh
}

/** 골대 하나 — 포스트·크로스바·뒤 기둥·네트 격자. dir = 골문이 있는 x 부호 */
interface GoalBuilt {
  group: THREE.Group
  net: THREE.LineSegments
  base: Float32Array
}

function buildGoal(dir: number, postM: THREE.Material, netM: THREE.LineBasicMaterial): GoalBuilt {
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
  const base = new Float32Array(pts)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  const net = new THREE.LineSegments(geo, netM)
  net.frustumCulled = false
  g.add(net)
  return { group: g, net, base }
}

export function buildPitch(opts: PitchOptions): Pitch3D {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []

  // ---- 잔디 ----
  const grassTex = grassTexture()
  disposables.push(grassTex)
  const wm = HALF_L * 2 + MARGIN * 2
  const hm = HALF_W * 2 + MARGIN * 2
  // 잔디에 살짝 광택 — 방송 화면의 젖은 잔디 느낌 (2026-09-15)
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.82, metalness: 0 }))
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
  const goals: [GoalBuilt, GoalBuilt] = [buildGoal(1, postM, netM), buildGoal(-1, postM, netM)]
  group.add(goals[0].group, goals[1].group)
  // 골망 출렁임 상태 — 충격 시각·자리 (P4)
  const netHits: { t: number; y: number }[] = [{ t: -10, y: 0 }, { t: -10, y: 0 }]
  let netClock = 0

  // ---- 광고판 띠 — 피치 둘레 (2026-09-15, P0) ----
  const board = boardTexture(0x2c3644)
  disposables.push(board.tex)
  const boardMat = new THREE.MeshLambertMaterial({ map: board.tex })
  const boardBack = new THREE.MeshLambertMaterial({ color: 0x0b1018 })
  const BOARD_H = 1.0
  const BOARD_OFF = 2.6
  const mkBoard = (len: number, x: number, z: number, rotY: number): void => {
    const geo = new THREE.BoxGeometry(len, BOARD_H, 0.25)
    const tex = board.tex.clone()
    tex.repeat.set(len / 12, 1)
    tex.needsUpdate = true
    disposables.push(tex, geo)
    const face = boardMat.clone()
    face.map = tex
    const m = new THREE.Mesh(geo, [boardBack, boardBack, boardBack, boardBack, face, boardBack])
    m.position.set(x, BOARD_H / 2, z)
    m.rotation.y = rotY
    m.rotation.x = -0.12 // 살짝 뒤로 기울여 카메라를 본다
    m.castShadow = true
    group.add(m)
  }
  mkBoard(HALF_L * 2 + 2, 0, -(HALF_W + BOARD_OFF), 0)
  mkBoard(HALF_L * 2 + 2, 0, HALF_W + BOARD_OFF, Math.PI)
  mkBoard(HALF_W * 2 - 8, HALF_L + BOARD_OFF, 0, -Math.PI / 2)
  mkBoard(HALF_W * 2 - 8, -(HALF_L + BOARD_OFF), 0, Math.PI / 2)

  // ---- 관중석 — 2단 + 지붕 (2026-09-15: 영상의 2층 스탠드) ----
  const crowd = crowdTexture()
  disposables.push(crowd.tex)
  /** 스탠드마다 clone 을 쓴다 (repeat 이 달라서) — 홈 색을 바꾸면 전부 needsUpdate 해야 한다 */
  const crowdClones: THREE.Texture[] = []
  const standD = 10
  const gap = 7
  const side = new THREE.MeshLambertMaterial({ color: 0x1b2230 })
  const roofM = new THREE.MeshLambertMaterial({ color: 0x0f141c })
  const mkStand = (len: number, depth: number, x: number, z: number, rotY: number, standH: number, lift: number, back: number): void => {
    const tex = crowd.tex.clone()
    crowdClones.push(tex)
    tex.repeat.set(len / 12, standH / 5.5)
    tex.wrapT = THREE.RepeatWrapping
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
    // 로컬 +z 가 피치 쪽 — `back` 만큼 피치에서 멀어진다
    const holder = new THREE.Group()
    holder.position.set(x, 0, z)
    holder.rotation.y = rotY
    m.position.set(0, lift + standH / 2, -back)
    m.receiveShadow = true
    holder.add(m)
    group.add(holder)
    disposables.push(geo)
    return
  }
  const mkRoof = (len: number, x: number, z: number, rotY: number, y: number, depth: number, back: number): void => {
    const geo = new THREE.BoxGeometry(len, 0.6, depth)
    const holder = new THREE.Group()
    holder.position.set(x, 0, z)
    holder.rotation.y = rotY
    const m = new THREE.Mesh(geo, roofM)
    m.position.set(0, y, -back)
    m.rotation.x = 0.08 // 앞이 살짝 내려온 캔틸레버
    holder.add(m)
    group.add(holder)
    disposables.push(geo)
  }
  // 먼 쪽(−z)·가까운 쪽(+z)·양 골문 뒤. 안쪽 면이 피치를 보게 회전. 1단(6 m) 위에 2단(9 m)이 뒤로 물러나 얹히고 지붕
  const stands: [number, number, number, number][] = [
    [HALF_L * 2 + 2 * gap + 2 * standD, 0, -(HALF_W + gap + standD / 2), 0],
    [HALF_L * 2 + 2 * gap + 2 * standD, 0, HALF_W + gap + standD / 2, Math.PI],
    [HALF_W * 2 + 2 * gap, HALF_L + gap + standD / 2, 0, -Math.PI / 2],
    [HALF_W * 2 + 2 * gap, -(HALF_L + gap + standD / 2), 0, Math.PI / 2],
  ]
  for (const [len, x, z, rotY] of stands) {
    mkStand(len, standD, x, z, rotY, 6, 0, 0)
    if (rotY === Math.PI) continue // 카메라 쪽(가까운 사이드) 스탠드는 1단만 — 2단·지붕이 카메라 아래 시야를 가린다
    mkStand(len + 2 * standD, standD, x, z, rotY, 9, 6.5, standD)
    mkRoof(len + 2 * standD + 4, x, z, rotY, 17.5, standD + 6, standD - 2)
  }

  // ---- 조명 ----
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x233a1e, 1.0)
  group.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4)
  sun.position.set(-30, 70, 40)
  sun.castShadow = opts.shadows
  // 2026-09-15 (P0): 그림자맵 2048 을 **공 주변 52 × 40 m 에만** 쓴다 — 렌더러가 매 프레임 태양·과녁을 공 위치로 옮긴다.
  // 예전 4096 으로 피치 전체(132 × 96 m)를 덮던 것보다 텍셀이 촘촘해 그림자가 선명하고, 실사 22명 그림자 패스도 가볍다
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 160
  sun.shadow.camera.left = -26
  sun.shadow.camera.right = 26
  sun.shadow.camera.top = 20
  sun.shadow.camera.bottom = -20
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  group.add(sun)
  group.add(sun.target)

  return {
    group,
    sun,
    netHit(dir: number, y: number) {
      const k = dir > 0 ? 0 : 1
      netHits[k] = { t: netClock, y }
    },
    update(dt: number) {
      netClock += dt
      for (let k = 0; k < 2; k++) {
        const h = netHits[k]
        const age = netClock - h.t
        const gb = goals[k]
        const pos = gb.net.geometry.getAttribute('position') as THREE.BufferAttribute
        const arr = pos.array as Float32Array
        if (age > 1.4) {
          if (arr[0] !== gb.base[0] || arr[arr.length - 1] !== gb.base[arr.length - 1]) {
            arr.set(gb.base)
            pos.needsUpdate = true
          }
          continue
        }
        // 감쇠 진동 — 공이 들어간 자리(y)에서 멀수록 작게, 뒤쪽 그물이 가장 크게
        const dir = k === 0 ? 1 : -1
        const amp = 0.55 * Math.exp(-3.2 * age) * Math.sin(age * 14)
        const xb = dir * (HALF_L + GOAL_DEPTH)
        for (let i = 0; i < arr.length; i += 3) {
          const bx = gb.base[i]
          const by = gb.base[i + 1]
          const bz = gb.base[i + 2]
          // 뒤 그물(x ≈ xb)·위 그물(x 사이) 만 — 골대 위치 x0 의 점은 고정
          const depth = Math.abs(bx - dir * HALF_L) / GOAL_DEPTH // 0 골라인 ~ 1 뒤 그물
          if (depth < 0.05) {
            arr[i] = bx
            arr[i + 1] = by
            arr[i + 2] = bz
            continue
          }
          const dy = -bz - h.y // three z = −sim y
          const w = Math.exp(-(dy * dy) / 3.2) * depth * (0.3 + 0.7 * Math.min(1, by / 1.6))
          arr[i] = bx + dir * amp * w
          arr[i + 1] = by - Math.abs(amp) * 0.15 * w
          arr[i + 2] = bz
        }
        void xb
        pos.needsUpdate = true
      }
    },
    setHomeColor(hex: number) {
      drawCrowd(crowd.canvas, hex)
      crowd.tex.needsUpdate = true
      board.redraw(hex)
      board.tex.needsUpdate = true
      // clone 은 캔버스를 공유하지만 needsUpdate 는 각자 켜야 GPU 에 다시 올라간다
      for (const t of crowdClones) t.needsUpdate = true
      side.color.set(shade(hex, 0.3))
    },
    dispose() {
      for (const d of disposables) d.dispose()
      grass.geometry.dispose()
      outside.geometry.dispose()
    },
  }
}
