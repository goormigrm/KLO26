import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
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
  },
})
