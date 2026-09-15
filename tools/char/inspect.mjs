// player.glb 클립 검사 — 클립 길이 · Hips 위치 트랙의 이동 폭 (루트 모션이 있는지)
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(process.argv[2] ?? 'public/models/player.glb')
const root = doc.getRoot()
for (const anim of root.listAnimations()) {
  let dur = 0
  let hips = null
  for (const ch of anim.listChannels()) {
    const s = ch.getSampler()
    const inp = s.getInput().getArray()
    dur = Math.max(dur, inp[inp.length - 1])
    const nm = ch.getTargetNode()?.getName() ?? ''
    if (/hips/i.test(nm) && ch.getTargetPath() === 'translation') {
      const out = s.getOutput().getArray()
      const n = out.length / 3
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], out[i * 3 + k]); mx[k] = Math.max(mx[k], out[i * 3 + k]) }
      hips = { n, first: [out[0], out[1], out[2]].map((v) => +v.toFixed(3)), range: mx.map((v, k) => +(v - mn[k]).toFixed(3)) }
    }
  }
  console.log(anim.getName(), 'dur', dur.toFixed(2), 's · channels', anim.listChannels().length, '· hips', JSON.stringify(hips))
}
// 뼈 스케일 — Hips 노드의 부모 스케일 (cm 단위면 0.01)
const hipsNode = root.listNodes().find((n) => /hips/i.test(n.getName()))
let p = hipsNode
const chain = []
while (p) { chain.push(`${p.getName()} s=${p.getScale().map((v) => +v.toFixed(3))}`); p = p.listParents().find((x) => x.propertyType === 'Node') ?? null }
console.log('hips chain:', chain.join(' ← '))
let tris = 0, meshes = 0
for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) { meshes++; tris += (pr.getIndices()?.getCount() ?? pr.getAttribute('POSITION').getCount()) / 3 }
console.log('meshes(prims)', meshes, 'tris', tris)

// 킥·패스 클립에서 오른 다리(RightUpLeg) 회전이 가장 빠른 순간 = 차는 순간
for (const anim of root.listAnimations()) {
  if (!/kick|pass/.test(anim.getName())) continue
  for (const ch of anim.listChannels()) {
    const nm = ch.getTargetNode()?.getName() ?? ''
    if (!/RightUpLeg$/i.test(nm) || ch.getTargetPath() !== 'rotation') continue
    const s = ch.getSampler()
    const t = s.getInput().getArray()
    const q = s.getOutput().getArray()
    let best = 0, bestT = 0
    const rows = []
    for (let i = 1; i < t.length; i++) {
      const a = q.slice((i - 1) * 4, i * 4), b = q.slice(i * 4, i * 4 + 4)
      const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))
      const ang = 2 * Math.acos(dot) / Math.max(1e-6, t[i] - t[i - 1])
      rows.push(`${t[i].toFixed(2)}:${(ang * 57.3).toFixed(0)}`)
      if (ang > best) { best = ang; bestT = t[i] }
    }
    console.log(anim.getName(), 'RightUpLeg 최고 각속도', (best * 57.3).toFixed(0), 'deg/s at', bestT.toFixed(2), 's ·', rows.join(' '))
  }
}
