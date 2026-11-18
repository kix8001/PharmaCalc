// Concrete CMS のパッケージ一式を作る：web/dist（ビルド結果）を concrete/pharmacalc/app に入れて out/packages/pharmacalc に置く
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
const out = '../out/packages/pharmacalc'
if (!existsSync('dist/index.html')) throw new Error('先に npm run build を実行してください')
rmSync('../out', { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync('../concrete/pharmacalc', out, { recursive: true })
cpSync('dist', out + '/app', { recursive: true })
console.log('作成しました:', out)
