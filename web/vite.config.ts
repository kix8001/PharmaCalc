import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'

// 置き場所に関係なく動くよう、ファイルは相対パスで参照する（Concrete CMS のパッケージが /pharmacalc/ で配信する）
const base = process.env.BASE ?? './'

/** ビルドした全ファイルを先に保存しておくサービスワーカー（sw.js）を作る。電波が無くても使えるように */
function serviceWorker(): Plugin {
  return {
    name: 'pharmacalc-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      // public/label（添付文書の項目、数十 MB）は先に保存しない。開いたときに保存する
      const files = [...Object.keys(bundle), ...readdirSync('public')].filter((f) => !f.endsWith('.map') && f !== 'label')
      const hash = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 12)
      const list = JSON.stringify(['index.html', ...files.filter((f) => f !== 'index.html')])
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// 自動生成（vite.config.ts）
const CACHE = 'pharmacalc-${hash}'
const LABEL = 'pharmacalc-label-${hash}'
const FILES = ${list}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LABEL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (req.mode === 'navigate') {
    // 画面はネットを優先（ログインが切れていればログイン画面へ）。つながらなければ保存した物を使う
    e.respondWith(fetch(req).catch(() => caches.match('index.html')))
    return
  }
  if (/\/label\/[^/]+\.json$/.test(new URL(req.url).pathname)) {
    // 添付文書の項目：保存した物があれば使い、無ければ取って保存する
    e.respondWith(
      caches.open(LABEL).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone())
              return res
            }),
        ),
      ),
    )
    return
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
`,
      })
    },
  }
}

import pkg from './package.json'

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: { react: 'preact/compat', 'react-dom': 'preact/compat' } },
  plugins: [serviceWorker()],
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' },
})
