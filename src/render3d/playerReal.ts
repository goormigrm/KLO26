// 실사 선수 — glTF 스킨드 메시 + 모션캡처 클립 (2026-09-15, 개발계획 5.4 옵션 B).
//
// - 캐릭터 파일: `public/models/player.glb` (Mixamo 뼈대 `mixamorig*`, 클립 idle/walk/run 필수). 지금은 three.js 예제의
//   Soldier(Mixamo 캐릭터, MIT 저장소)로 파이프라인을 검증한다 — 최종 인간 캐릭터는 Mixamo 에서 받아 같은 이름으로 바꿔 넣는다.
// - 유니폼: 텍스처를 캔버스에서 **피부색 픽셀은 남기고 나머지는 밝기 × 구단 색**으로 물들인다 — 어떤 캐릭터든 같은 규칙.
// - 클립이 없는 동작(킥·스로인·GK 홀드·세레모니)은 믹서가 뼈를 세팅한 뒤 **뼈를 월드 방향으로 겨눠** 덧씌운다 —
//   뼈 로컬 축을 가정하지 않으므로(사용자 제보 2026-09-15: "스로잉·골 모션이 없다") 어느 Mixamo 리그든 같은 결과.
//   눕기(슬라이딩·다이브·넘어짐)는 허리 축 그룹 회전. Mixamo 축구 클립이 들어오면 그 부분만 클립으로 바꾼다.
// - 찰흙(`player3d.ts`)과 같은 `Rig` 인터페이스라 렌더러는 둘을 구분하지 않는다. 설정 "선수 그래픽"으로 바꾼다.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ACT_DIVE, ACT_FALLEN, ACT_HEAD, ACT_KICK, ACT_SLIDE, type PlayerSpec } from '../core/state'
import { BASE_H, numberTexture, type AnimInput, type Kit, type Rig } from './player3d'

export interface CharacterLib {
  scene: THREE.Group
  idle: THREE.AnimationClip
  /** 없으면 run 을 느리게 튼다 */
  walk: THREE.AnimationClip | null
  run: THREE.AnimationClip
  /** 있으면 절차적 킥 대신 클립 (Mixamo "Strike"·"Soccer Pass") */
  kick: THREE.AnimationClip | null
  pass: THREE.AnimationClip | null
  /** 바인드 포즈 높이 (m) */
  height: number
  /** 클립이 원래 만들어진 이동 속도 (m/s) — 재생 속도를 sim 속도에 맞출 때 */
  walkSpeed: number
  runSpeed: number
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/player.glb`
/**
 * 모델 정면. Mixamo/three 예제 캐릭터는 **−z 를 본다**(사용자 제보 2026-09-15: 반대 방향을 보고 뛰었다) —
 * 우리 로컬 정면(+z)에 맞추려 모델을 180° 돌린다. 캐릭터 파일이 +z 를 보면 0 으로.
 */
const MODEL_YAW = Math.PI

let libPromise: Promise<CharacterLib> | null = null

/** 캐릭터 라이브러리 — 한 번만 내려받아 모두가 공유한다. 로비에서 미리 불러 두면 경기 시작 때 바로 뜬다 */
export function loadCharacterLib(): Promise<CharacterLib> {
  if (!libPromise) {
    libPromise = new GLTFLoader().loadAsync(MODEL_URL).then((g) => {
      const opt = (name: string): THREE.AnimationClip | null => g.animations.find((a) => a.name.toLowerCase() === name) ?? null
      const find = (name: string): THREE.AnimationClip => {
        const c = opt(name)
        if (!c) throw new Error(`player.glb 에 '${name}' 클립이 없다: ${g.animations.map((a) => a.name).join(', ')}`)
        return c
      }
      const scene = g.scene
      scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(scene)
      const height = Math.max(0.5, box.max.y - box.min.y)
      return { scene, idle: find('idle'), walk: opt('walk'), run: find('run'), kick: opt('kick'), pass: opt('pass'), height, walkSpeed: 1.6, runSpeed: 5.0 }
    })
    libPromise.catch(() => {
      libPromise = null // 다음에 다시 시도할 수 있게
    })
  }
  return libPromise
}

// ---------------------------------------------------------------- 유니폼 텍스처

const tintCache = new Map<string, THREE.Texture>()

/** 피부색 픽셀(붉은 기 도는 살구~갈색)은 그대로, 나머지는 밝기 × 구단 색 */
function tintTexture(src: THREE.Texture, color: number): THREE.Texture {
  const key = `${src.uuid}:${color}`
  const hit = tintCache.get(key)
  if (hit) return hit
  const img = src.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement
  const w = img.width
  const h = img.height
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, w, h)
  const p = d.data
  const cr = (color >> 16) & 255
  const cg = (color >> 8) & 255
  const cb = color & 255
  const isSkin = (R: number, G: number, B: number): boolean => R > G && G > B && R - B > 35 && R > 110 && G > 60
  // 옷 픽셀의 평균 밝기로 정규화한다 — 원본 텍스처가 어두우면(군복) 팀색이 갈색으로 죽었다.
  // 평균 밝기 픽셀이 팀색 그대로(×1.05), 어두운 주름은 음영, 밝은 하이라이트는 조금 더 밝게
  let sum = 0
  let n = 0
  for (let i = 0; i < p.length; i += 4) {
    if (isSkin(p[i], p[i + 1], p[i + 2])) continue
    sum += 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]
    n++
  }
  const meanL = Math.max(20, sum / Math.max(1, n))
  for (let i = 0; i < p.length; i += 4) {
    const R = p[i]
    const G = p[i + 1]
    const B = p[i + 2]
    if (isSkin(R, G, B)) continue
    const l = (0.3 * R + 0.59 * G + 0.11 * B) / meanL
    const k = Math.min(1.35, Math.max(0.3, 0.35 + 0.7 * l))
    p[i] = Math.min(255, cr * k)
    p[i + 1] = Math.min(255, cg * k)
    p[i + 2] = Math.min(255, cb * k)
  }
  ctx.putImageData(d, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.flipY = src.flipY
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = src.wrapS
  t.wrapT = src.wrapT
  tintCache.set(key, t)
  return t
}

// ---------------------------------------------------------------- 뼈 겨누기 (절차적 덧씌우기)

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const qParent = new THREE.Quaternion()
const qRoot = new THREE.Quaternion()
const qGoal = new THREE.Quaternion()
const vDir = new THREE.Vector3()
const tmpV = new THREE.Vector3()

/**
 * 뼈의 자식 방향(+y, Mixamo 관습)이 **root 공간의 `dir`** 을 향하게 slerp 로 돌린다.
 * root 공간: +z 정면 · +y 위 · +x 오른쪽(선수 기준 왼쪽). 부모 뼈의 월드 회전을 거꾸로 적용해 로컬 축 가정을 없앤다.
 */
function aimBone(bone: THREE.Object3D, root: THREE.Object3D, dir: THREE.Vector3, k: number): void {
  if (!bone.parent) return
  bone.parent.getWorldQuaternion(qParent)
  root.getWorldQuaternion(qRoot)
  vDir.copy(dir).normalize().applyQuaternion(qRoot).applyQuaternion(qParent.invert())
  qGoal.setFromUnitVectors(Y_AXIS, vDir.normalize())
  bone.quaternion.slerp(qGoal, k)
}

const DIR_UP = new THREE.Vector3(0.15, 1, 0.1)
const DIR_THROW = new THREE.Vector3(0, 1, -0.45)
const DIR_HOLD = new THREE.Vector3(0.1, -0.25, 1)
const DIR_KICK = new THREE.Vector3(0.05, -0.55, 1)
const DIR_KICK_BACK = new THREE.Vector3(0.05, -0.7, -0.7)
const DIR_CHEER_L = new THREE.Vector3(0.45, 1, 0.15)
const DIR_CHEER_R = new THREE.Vector3(-0.45, 1, 0.15)

// ---------------------------------------------------------------- 리그

interface Bones {
  hips: THREE.Object3D | null
  spine: THREE.Object3D | null
  spine1: THREE.Object3D | null
  lUpLeg: THREE.Object3D | null
  rUpLeg: THREE.Object3D | null
  lArm: THREE.Object3D | null
  rArm: THREE.Object3D | null
  lForeArm: THREE.Object3D | null
  rForeArm: THREE.Object3D | null
  head: THREE.Object3D | null
}

function bone(model: THREE.Object3D, name: string): THREE.Object3D | null {
  return model.getObjectByName(`mixamorig${name}`) ?? model.getObjectByName(`mixamorig:${name}`) ?? null
}

export interface RealRig extends Rig {
  body: THREE.Group
  mixer: THREE.AnimationMixer
}

export function buildRealPlayer(lib: CharacterLib, spec: PlayerSpec, kit: Kit): RealRig {
  const model = cloneSkinned(lib.scene) as THREE.Group
  const disposables: (THREE.Material | THREE.Texture | THREE.BufferGeometry)[] = []
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.frustumCulled = false
    m.castShadow = true
    m.receiveShadow = false
    if (/visor|helmet/i.test(m.name)) {
      m.visible = false
      return
    }
    // 부위별 킷 (2026-09-15) — Mixamo 캐릭터는 셔츠·반바지·양말·몸·신발·머리가 따로 메시다. 이름으로 색을 정한다.
    // 이름을 모르는 한 덩어리 메시(Soldier 같은)는 예전처럼 피부 빼고 상의 색
    const nm = m.name.toLowerCase()
    let col: number | null = kit.shirt
    if (/shirt|jersey|top|torso|sleeve/.test(nm)) col = kit.shirt
    else if (/short|pant|trouser/.test(nm)) col = kit.shorts
    else if (/sock|stocking/.test(nm)) col = kit.socks
    else if (/body|skin|head|face|hair|eye|lash|brow|beard|shoe|boot|foot|teeth|tongue/.test(nm)) col = null
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    const out = mats.map((mat) => {
      const std = mat as THREE.MeshStandardMaterial
      const cl = std.clone()
      if (col !== null) {
        if (std.map) cl.map = tintTexture(std.map, col)
        else cl.color = new THREE.Color(col)
      }
      cl.roughness = 0.75
      cl.metalness = 0
      disposables.push(cl)
      return cl
    })
    m.material = Array.isArray(m.material) ? out : out[0]
  })

  const scale = (spec.h / 180) * (BASE_H / lib.height)
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  // 회전축을 허리 높이에 — 눕힐 때 발이 아니라 몸 가운데를 축으로 돈다
  const pivotY = lib.height * 0.5
  body.position.y = pivotY
  model.position.y = -pivotY
  model.rotation.y = MODEL_YAW
  body.add(model)
  root.scale.setScalar(scale)

  // 등번호 — 등 뒤 작은 판. 뼈 스케일이 제각각이라 뼈에 붙이지 않고 매 프레임 척추 월드 위치를 따라간다
  const numTex = numberTexture(spec.no, kit.number)
  const num = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  num.rotation.y = Math.PI
  disposables.push(numTex, num.geometry, num.material as THREE.Material)
  root.add(num)

  const mixer = new THREE.AnimationMixer(model)
  const idle = mixer.clipAction(lib.idle)
  // walk 클립이 없으면 run 을 느리게 — 두 번째 액션으로 같은 클립을 쓴다
  const walk = lib.walk ? mixer.clipAction(lib.walk) : mixer.clipAction(lib.run, undefined, THREE.NormalAnimationBlendMode)
  const run = mixer.clipAction(lib.run)
  for (const a of [idle, walk, run]) {
    a.enabled = true
    a.setEffectiveTimeScale(1)
    a.setEffectiveWeight(0)
    a.play()
  }
  idle.setEffectiveWeight(1)
  const walkSpeed = lib.walk ? lib.walkSpeed : lib.runSpeed * 0.55
  // 킥·패스 클립 (있으면) — 한 번 재생, 끝나면 멈춘다
  const kickAct = lib.kick ? mixer.clipAction(lib.kick) : null
  const passAct = lib.pass ? mixer.clipAction(lib.pass) : null
  for (const a of [kickAct, passAct]) {
    if (!a) continue
    a.setLoop(THREE.LoopOnce, 1)
    a.clampWhenFinished = true
    a.enabled = true
    a.setEffectiveWeight(0)
  }
  let clipKick: THREE.AnimationAction | null = null
  let clipT = 0

  const bones: Bones = {
    hips: bone(model, 'Hips'),
    spine: bone(model, 'Spine'),
    spine1: bone(model, 'Spine1'),
    lUpLeg: bone(model, 'LeftUpLeg'),
    rUpLeg: bone(model, 'RightUpLeg'),
    lArm: bone(model, 'LeftArm'),
    rArm: bone(model, 'RightArm'),
    lForeArm: bone(model, 'LeftForeArm'),
    rForeArm: bone(model, 'RightForeArm'),
    head: bone(model, 'Head'),
  }

  let kickT = 0
  let headT = 0
  let lastAction = 0
  let lie = 0
  let lieSide = 1
  let wasDive = false
  let wIdle = 1
  let wWalk = 0
  let wRun = 0
  let armPose = 0 // 팔 오버레이 강도 (부드럽게 들어가고 나온다)
  let cheerT = 0

  const rig: RealRig = {
    root,
    body,
    mixer,
    height: lib.height * scale,
    animate(a: AnimInput, dt: number): void {
      if (a.action === ACT_KICK && lastAction !== ACT_KICK) {
        kickT = 0.36
        // 클립이 있으면 절차적 킥 대신 — 슛은 kick, 패스는 pass. 클립을 0.55 초에 맞춰 돌린다
        const want = a.shot ? kickAct ?? passAct : passAct ?? kickAct
        if (want) {
          if (clipKick) clipKick.setEffectiveWeight(0)
          clipKick = want
          clipT = 0.55
          const dur = want.getClip().duration
          want.reset().setEffectiveTimeScale(Math.max(0.5, dur / 0.55)).setEffectiveWeight(1).play()
          kickT = 0 // 절차적 킥은 끈다
        }
      }
      if (clipKick) {
        clipT -= dt
        if (clipT <= 0) {
          clipKick.setEffectiveWeight(0)
          clipKick.stop()
          clipKick = null
        }
      }
      if (a.action === ACT_HEAD && lastAction !== ACT_HEAD) headT = 0.3
      lastAction = a.action
      kickT = Math.max(0, kickT - dt)
      headT = Math.max(0, headT - dt)
      if (a.action === ACT_DIVE) wasDive = true
      else if (a.action !== ACT_FALLEN) wasDive = false

      // ---- 눕기 (찰흙과 같은 규칙) ----
      let lieTarget = 0
      let sideways = false
      if (a.action === ACT_SLIDE) lieTarget = 1
      else if (a.action === ACT_FALLEN) {
        lieTarget = Math.min(1, a.actT / 10)
        if (wasDive) sideways = true
      } else if (a.action === ACT_DIVE) {
        lieTarget = 1
        sideways = true
        if (a.lateral !== 0) lieSide = a.lateral
      }
      lie += (lieTarget - lie) * Math.min(1, dt * 9)

      // ---- 클립 가중치: idle ↔ walk ↔ run, 재생 속도는 sim 속도에 맞춘다 (발 미끄러짐 줄이기) ----
      const moving = a.speed > 0.4 && lie < 0.5
      const runK = moving ? Math.min(1, Math.max(0, (a.speed - 2.2) / 2.3)) : 0
      const tIdle = moving ? 0 : 1
      const tWalk = moving ? 1 - runK : 0
      const tRun = moving ? runK : 0
      const k = Math.min(1, dt * 10)
      wIdle += (tIdle - wIdle) * k
      wWalk += (tWalk - wWalk) * k
      wRun += (tRun - wRun) * k
      // 킥 클립 재생 중엔 이동 클립을 눌러 준다
      const clipK = clipKick ? 0.25 : 1
      idle.setEffectiveWeight(wIdle * clipK)
      walk.setEffectiveWeight(wWalk * clipK)
      run.setEffectiveWeight(wRun * clipK)
      walk.setEffectiveTimeScale(Math.max(0.6, a.speed / walkSpeed))
      run.setEffectiveTimeScale(Math.max(0.7, (a.speed / lib.runSpeed) * (a.sprint ? 1.12 : 1)))
      mixer.update(dt)

      // ---- 눕기 — 허리 축으로 몸 전체 (먼저: 뼈 겨누기가 이 회전을 본다) ----
      if (sideways || (lie > 0.01 && wasDive)) {
        body.rotation.x = 0
        body.rotation.z = 1.4 * lie * lieSide
      } else {
        body.rotation.z = 0
        body.rotation.x = -1.4 * lie
      }
      // 하이 다이브는 몸이 떠오른다 (P3) · 헤딩은 점프 (2026-09-15)
      const jump = a.action === ACT_DIVE && a.diveHigh ? 0.5 * Math.sin(Math.min(1, lie) * Math.PI) : 0
      const headJump = headT > 0 ? 0.3 * Math.sin((1 - headT / 0.3) * Math.PI) : 0
      body.position.y = pivotY * (1 - lie) + 0.18 * lie + jump + headJump

      // ---- 절차적 덧씌우기 (믹서 뒤, 월드 방향으로 겨눈다) ----
      const wantArm = a.throwing || a.holding || a.celebrate || (a.action === ACT_DIVE && a.diveHigh)
      armPose += ((wantArm ? 1 : 0) - armPose) * Math.min(1, dt * 8)
      const needWorld = kickT > 0 || armPose > 0.01 || (a.sprint && moving)
      if (needWorld) root.updateMatrixWorld(true)

      // 킥: 오른 다리를 뒤로 뺐다가 앞으로 차고, 상체는 살짝 뒤로
      if (kickT > 0 && bones.rUpLeg) {
        const t = 1 - kickT / 0.36 // 0 → 1
        if (t < 0.3) aimBone(bones.rUpLeg, root, DIR_KICK_BACK, t / 0.3 * 0.7)
        else aimBone(bones.rUpLeg, root, DIR_KICK, Math.sin(((t - 0.3) / 0.7) * Math.PI) * 0.9)
        if (bones.spine) bones.spine.rotation.x += -0.1 * Math.sin(t * Math.PI)
      }
      // 헤딩: 상체를 젖혔다 앞으로
      if (headT > 0 && bones.spine) {
        const t = 1 - headT / 0.3
        bones.spine.rotation.x += t < 0.4 ? -0.4 * (t / 0.4) : -0.4 + 0.8 * ((t - 0.4) / 0.6)
      }
      // 전력질주: 상체를 앞으로 (뼈 로컬 x — 척추는 어느 리그든 x 가 앞뒤다)
      if (a.sprint && moving && bones.spine) bones.spine.rotation.x += 0.16 * wRun
      // 팔 — 스로인(머리 뒤로) · GK 홀드(앞으로) · 세레모니(위로 흔들기)
      if (armPose > 0.01 && bones.lArm && bones.rArm) {
        if (a.celebrate) {
          cheerT += dt
          const sway = Math.sin(cheerT * 6) * 0.25
          DIR_CHEER_L.set(0.45 + sway, 1, 0.15)
          DIR_CHEER_R.set(-0.45 + sway, 1, 0.15)
          aimBone(bones.lArm, root, DIR_CHEER_L, armPose)
          aimBone(bones.rArm, root, DIR_CHEER_R, armPose)
          if (bones.lForeArm) aimBone(bones.lForeArm, root, DIR_UP, armPose)
          if (bones.rForeArm) aimBone(bones.rForeArm, root, DIR_UP, armPose)
        } else if (a.action === ACT_DIVE && a.diveHigh) {
          // 하이 다이브 — 두 팔을 위로 뻗는다
          aimBone(bones.lArm, root, DIR_UP, armPose)
          aimBone(bones.rArm, root, DIR_UP, armPose)
          if (bones.lForeArm) aimBone(bones.lForeArm, root, DIR_UP, armPose)
          if (bones.rForeArm) aimBone(bones.rForeArm, root, DIR_UP, armPose)
        } else if (a.throwing) {
          aimBone(bones.lArm, root, DIR_THROW, armPose)
          aimBone(bones.rArm, root, DIR_THROW, armPose)
          if (bones.lForeArm) aimBone(bones.lForeArm, root, DIR_THROW, armPose)
          if (bones.rForeArm) aimBone(bones.rForeArm, root, DIR_THROW, armPose)
        } else {
          aimBone(bones.lArm, root, DIR_HOLD, armPose)
          aimBone(bones.rArm, root, DIR_HOLD, armPose)
          if (bones.lForeArm) aimBone(bones.lForeArm, root, DIR_HOLD, armPose)
          if (bones.rForeArm) aimBone(bones.rForeArm, root, DIR_HOLD, armPose)
        }
      } else cheerT = 0

      // 등번호 — 척추 뒤
      const sp = bones.spine1 ?? bones.spine ?? bones.hips
      if (sp) {
        sp.getWorldPosition(tmpV)
        root.worldToLocal(tmpV)
        num.position.set(tmpV.x, tmpV.y + 0.02, tmpV.z - 0.13)
        num.visible = lie < 0.5
      }
    },
    dispose(): void {
      mixer.stopAllAction()
      for (const d of disposables) d.dispose()
    },
  }
  return rig
}
