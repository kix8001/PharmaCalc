// Concrete CMS のパッケージ一式を作る：web/dist（ビルド結果）を concrete/pharmacalc/app に入れて out/packages/pharmacalc に置く
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const out = '../out/packages/pharmacalc'
if (!existsSync('dist/index.html')) throw new Error('先に npm run build を実行してください')
rmSync('../out', { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync('../concrete/pharmacalc', out, { recursive: true })
cpSync('dist', out + '/app', { recursive: true })
// 大きいファイルは圧縮した .gz も置く（サーバーが圧縮のまま送る。腎機能の薬・OTC類似薬のデータなど）
for (const f of readdirSync(out + '/app/assets')) {
  const p = out + '/app/assets/' + f
  if (/\.(js|css|wasm)$/.test(f) && statSync(p).size > 20000) writeFileSync(p + '.gz', gzipSync(readFileSync(p), { level: 9 }))
}
console.log('作成しました:', out)
