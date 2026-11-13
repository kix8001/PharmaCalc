# CLAUDE.md

## 概要
薬剤師向けの電卓アプリ「薬剤師電卓」の iOS 版。SwiftUI、iOS 16 以上、外部ライブラリなし。バンドルID `app.pharmacalc.ios`。
- ユーザーへの説明・UI文言・コードコメント・コミットメッセージは日本語。
- 個人利用。iPhone へは Sideloadly で入れる（署名なし IPA を自分の Apple ID で署名）。

## ビルド
- ローカルに Xcode は無い。プロジェクトは XcodeGen の `project.yml` から生成する（`.xcodeproj` はコミットしない）。
- GitHub Actions（`.github/workflows/build.yml`、雛形は `ci/pharmacalc-ios.yml`）が macOS で `xcodegen generate` → `xcodebuild`（署名なし）→ `PharmaCalc.ipa` をアーティファクト `PharmaCalc-ipa` として上げる。
- Claude の権限ではワークフローファイルを追加・変更できない。変更が必要なときは `ci/` の雛形を直し、ユーザーに GitHub 上で反映してもらう。
- 修正したら push して Actions の結果まで確認する。リリースのたびに `project.yml` の `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` を上げる。コミットは「薬剤師電卓 iOS 0.x.y: 変更点…」。

## 構成（`PharmaCalc/`）
- `App/`：起動・タブ（計算／バーコード／履歴／情報）・ホームの電卓一覧（`CalcItem` に電卓を登録）
- `Core/`：`PatientStore`（患者情報。全電卓で共有、端末に保存しない）、計算式（`Renal`・`BodyCalc`）、共通部品（`NumField`・`ResultRow`・`calcForm`）、日付（`JPDate`）
- `Calculators/`：各電卓の画面
- `PillCount/`：錠剤カウント。`PillCounter` が画像処理（最頻色を背景→色差で2値化→距離変換の山を錠剤の中心とし、山の間のくびれで別の錠剤か判定→面積比で補正）を自前で行う。結果の印はタップで増減、範囲指定もできる
- `Barcode/`：AVFoundation でGS1データバー等を読む `Scanner`、`GS1` 解析、PMDA電子添文URL、読み取り履歴
- 計算式は画面のフッターに必ず表示する。SwiftUI の `View.Body` と衝突するので型名に `Body` を使わない。
