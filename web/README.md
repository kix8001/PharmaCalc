# 薬剤師電卓（Web版）

iOS・Android 版と同じ機能の Web アプリ。社内の Concrete CMS 9 サイトに「パッケージ」として置き、サイトにログインした人だけが `https://（サイト）/pharmacalc` で開ける。

## 作り

- Preact ＋ TypeScript ＋ Vite。外部のサーバーには何も読みに行かない（バーコードを読む zxing-cpp の WebAssembly もサイトに置く）
- ホーム画面に追加するとアプリのように起動し、サービスワーカー（`sw.js`、ビルド時に自動生成）で電波が無くても使える
- データは iOS・Android と共通の `../data/ped_presets.json`・`../data/renal_drugs.json`
- 端末に保存する物（localStorage）：ホームのタイル、小児用量の薬、腎機能の☆、バーコードの読み取り履歴。患者情報は保存しない

## ビルド

```
cd web
npm ci
npm run package     # web/dist をビルドし、out/packages/pharmacalc（Concrete CMS のパッケージ）を作る
npm run dev         # 手元で試す（http://localhost:5173/）
```

GitHub Actions（雛形 `ci/web.yml`）でも同じ物を作り、`PharmaCalc-web` として上げる。

## サーバーへの置き方（初回）

1. `PharmaCalc-web` を展開した中の `pharmacalc` フォルダを、サーバーの Concrete CMS の `packages/` の中に置く（`packages/pharmacalc/controller.php` になるように）
2. Concrete の管理画面 →「拡張機能」（Extend Concrete）→「薬剤師電卓」の「インストール」
3. `https://（サイト）/pharmacalc` を開く（ログインしていなければログイン画面へ。ログイン後に戻ってくる）

## 更新

`packages/pharmacalc` の中身を新しい物に入れ替えるだけ（管理画面での操作は要らない）。開いている端末には、次に開いたときに新しい版が入る。
