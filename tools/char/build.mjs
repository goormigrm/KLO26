// 실사 캐릭터 굽기 — Mixamo FBX 폴더 → public/models/player.glb (2026-09-15, docs/캐릭터-교체-절차.md 3장)
//
//   npm run char:build -- C:\assets\mixamo            (폴더 안: character.fbx + idle.fbx run.fbx walk.fbx kick.fbx …)
//   npm run char:build -- C:\assets\mixamo --out public/models/player.glb
//
// 1. fbx2gltf(Facebook 공개 바이너리, npm)로 FBX 마다 GLB 를 만든다 (임시 폴더).
// 2. @gltf-transform 으로 캐릭터 GLB 에 애니 GLB 들의 클립을 **뼈 이름으로** 옮겨 붙인다 — 클립 이름은 파일 이름.
//    (Mixamo "Without Skin" 애니 파일은 뼈대만 있어 메시 없이 노드+애니만 온다)
// 3. dedup · prune · resample · quantize 로 줄여 저장하고 삼각형·클립·크기를 찍는다.
//
// 원본 FBX 는 저장소에 넣지 않는다 (`assets/` 는 .gitignore). 실존 인물을 닮게 만들지 않는다.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample, quantize } from '@gltf-transform/functions'

const require = createRequire(import.meta.url)

const args = process.argv.slice(2)
const srcDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'assets/mixamo')
const outIdx = args.indexOf('--out')
const outPath = resolve(outIdx >= 0 ? args[outIdx + 1] : 'public/models/player.glb')
const charName = (() => {
  const i = args.indexOf('--char')
  return i >= 0 ? args[i + 1] : 'character'
})()

const files = readdirSync(srcDir).filter((f) => /\.fbx$/i.test(f))
if (files.length === 0) {
  console.error(`FBX 가 없다: ${srcDir}`)
  process.exit(1)
}
const charFile = files.find((f) => basename(f, extname(f)).toLowerCase() === charName.toLowerCase()) ?? files.sort((a, b) => statSync(join(srcDir, b)).size - statSync(join(srcDir, a)).size)[0]
const animFiles = files.filter((f) => f !== charFile)
console.log(`캐릭터 ${charFile} · 애니 ${animFiles.length}개 · 출력 ${outPath}`)

// ---- 1. FBX → GLB ----
const tmp = mkdtempSync(join(tmpdir(), 'klo26-char-'))
function fbxToGlb(fbx) {
  const out = join(tmp, basename(fbx, extname(fbx)) + '.glb')
  // fbx2gltf 패키지는 플랫폼 바이너리 경로를 준다
  const bin = require('fbx2gltf')
  const exe = typeof bin === 'string' ? bin : bin.default ?? bin
  if (typeof exe === 'function') {
    // 옛 API: convert(src, dst, opts) → Promise
    return exe(join(srcDir, fbx), out, ['--binary']).then(() => out)
  }
  execFileSync(exe, ['--binary', '--input', join(srcDir, fbx), '--output', out], { stdio: 'inherit' })
  return Promise.resolve(out)
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const norm = (n) => (n ?? '').replace(/^mixamorig:?/i, '').toLowerCase()

const charGlb = await fbxToGlb(charFile)
const doc = await io.read(charGlb)
const root = doc.getRoot()
const buffer = root.listBuffers()[0] ?? doc.createBuffer()
const nodesByName = new Map()
for (const n of root.listNodes()) nodesByName.set(norm(n.getName()), n)

// 캐릭터 파일 자체의 클립은 'idle' 후보로 남긴다 (이름이 mixamo.com 이면)
for (const a of root.listAnimations()) if (/mixamo/i.test(a.getName())) a.setName(animFiles.length ? '__char_clip' : 'idle')

// ---- 2. 애니 옮겨 붙이기 ----
for (const f of animFiles) {
  const clip = basename(f, extname(f)).toLowerCase().replace(/\s+/g, '_')
  const glb = await fbxToGlb(f)
  const src = await io.read(glb)
  let added = 0
  for (const anim of src.getRoot().listAnimations()) {
    const out = doc.createAnimation(clip)
    for (const ch of anim.listChannels()) {
      const target = nodesByName.get(norm(ch.getTargetNode()?.getName()))
      if (!target) continue
      const s = ch.getSampler()
      const inA = s.getInput()
      const outA = s.getOutput()
      const inp = doc.createAccessor().setType('SCALAR').setArray(inA.getArray().slice()).setBuffer(buffer)
      const oup = doc.createAccessor().setType(outA.getType()).setArray(outA.getArray().slice()).setBuffer(buffer)
      const sm = doc.createAnimationSampler().setInput(inp).setOutput(oup).setInterpolation(s.getInterpolation())
      const c = doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sm)
      out.addSampler(sm).addChannel(c)
      added++
    }
    if (added === 0) {
      out.dispose()
      console.warn(`  ${clip}: 맞는 뼈가 없어 건너뜀 (뼈 이름이 다르다)`)
    } else console.log(`  ${clip}: 채널 ${added}`)
    break // 파일당 클립 하나
  }
}
for (const a of root.listAnimations()) if (a.getName() === '__char_clip') a.dispose()

// ---- 3. 줄이기 · 저장 ----
// 양자화는 위치·법선·UV 만 — JOINTS/WEIGHTS 는 건드리지 않는다(스킨을 지킨다)
await doc.transform(
  dedup(),
  prune(),
  resample(),
  quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_\d+)$/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
)
mkdirSync(dirname(outPath), { recursive: true })
await io.write(outPath, doc)
rmSync(tmp, { recursive: true, force: true })

let tris = 0
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
const size = statSync(outPath).size
console.log(`저장 ${outPath} — ${(size / 1e6).toFixed(2)} MB · 삼각형 ${Math.round(tris)} · 클립 ${root.listAnimations().map((a) => a.getName()).join(', ')}`)
if (size > 8e6) console.warn('8 MB 를 넘는다 — 텍스처를 줄이거나 클립 수를 줄일 것')
