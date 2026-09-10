import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * 공지글 첨부용 스크린샷·GIF 를 브라우저에서 `docs/img/` 로 저장한다 (2026-09-11).
 * **개발 서버에서만** 산다(`apply: 'serve'`) — 배포 번들·Pages 와 무관하다.
 * 페이지가 `POST /__snap?name=파일` 로 바이트를 보내면 그대로 쓴다. 파일 이름은 basename 만 받는다.
 */
function snapPlugin(): Plugin {
  return {
    name: 'klo26-snap',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        const url = new URL(req.url ?? '/', 'http://x')
        const name = basename(url.searchParams.get('name') ?? '').replace(/[^\w.\-가-힣]/g, '_')
        if (!name || !/\.(png|gif)$/i.test(name)) {
          res.statusCode = 400
          res.end('name=*.png|*.gif')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const dir = join(root, 'docs', 'img')
          mkdirSync(dir, { recursive: true })
          const file = join(dir, name)
          writeFileSync(file, Buffer.concat(chunks))
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end(`saved docs/img/${name} (${Buffer.concat(chunks).length} bytes)`)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [snapPlugin()],
  // ⚠ GitHub Pages 는 https://goormigrm.github.io/KLO26/ 아래에 뜬다. 저장소 이름과 같아야 경로가 풀린다.
  base: '/KLO26/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: root + 'index.html' },
    },
  },
  server: {
    // bedorage-duck(5173)·KMD26(8123)·KLD26(8124) 와 겹치지 않게
    port: 5175,
    // 공지글 사진·GIF 가 docs/img/ 에 떨어질 때 감시기가 새로고침해 판이 날아가지 않게 (bedorage-duck 교훈)
    watch: { ignored: ['**/docs/img/**'] },
  },
})
