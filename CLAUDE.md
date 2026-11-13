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
- `PillCount/`：錠剤カウント。`PillCounter` が画像処理（ぼかしで刻印を消す→RGBの勾配で両向きの円ハフ変換→半径は「円の数が急に減る手前」から推定→周囲16方向の輪郭と1.6Rの間隔で確認）を自前で行う。丸い錠剤向け。調整は実写真（袋入り45錠）と合成画像で行った結果の印はタップで増減、範囲指定もできる
- `Barcode/`：AVFoundation でGS1データバー等を読む `Scanner`、`GS1` 解析、PMDA電子添文URL、読み取り履歴
- 計算式は画面のフッターに必ず表示する。SwiftUI の `View.Body` と衝突するので型名に `Body` を使わない。
