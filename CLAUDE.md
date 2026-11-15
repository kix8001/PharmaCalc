# CLAUDE.md

## 概要
薬剤師向けの電卓アプリ「薬剤師電卓」。iOS 版（リポジトリ直下 `PharmaCalc/`、SwiftUI、iOS 16 以上、外部ライブラリなし、バンドルID `app.pharmacalc.ios`）と Android 版（`android/`、Kotlin + Jetpack Compose、minSdk 29、`app.pharmacalc.android`）がある。機能は両方でそろえる。
- ユーザーへの説明・UI文言・コードコメント・コミットメッセージは日本語。
- 個人利用。iPhone へは Sideloadly で入れる（署名なし IPA を自分の Apple ID で署名）。Android は APK を直接入れる。

## ビルド
- ローカルに Xcode は無い。プロジェクトは XcodeGen の `project.yml` から生成する（`.xcodeproj` はコミットしない）。
- GitHub Actions（`.github/workflows/build.yml`、雛形は `ci/pharmacalc-ios.yml`）が macOS で `xcodegen generate` → `xcodebuild`（署名なし）→ `PharmaCalc.ipa` をアーティファクト `PharmaCalc-ipa` として上げる。
- Claude の権限ではワークフローファイルを追加・変更できない。変更が必要なときは `ci/` の雛形を直し、ユーザーに GitHub 上で反映してもらう。
- 修正したら push して Actions の結果まで確認する。リリースのたびに `project.yml` の `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` を上げる。コミットは「薬剤師電卓 iOS 0.x.y: 変更点…」。

## 構成（`PharmaCalc/`）
- `App/`：起動・タブ（計算／バーコード／履歴／情報）・ホーム（`CalcItem` に電卓を登録。ユーザーが選んだ電卓をアイコンタイルで並べる `HomeTiles`／`TileGrid`／`TileEditView`。並びは UserDefaults の `homeTiles`）
- `Core/`：`PatientStore`（患者情報。全電卓で共有、端末に保存しない）、計算式（`Renal`・`BodyCalc`）、共通部品（`NumField`・`ResultRow`・`calcForm`）、日付（`JPDate`）
- `Calculators/`：各電卓の画面
- `PillCount/`：錠剤カウント。`PillCounter` が画像処理（ぼかしで刻印を消す→RGBの勾配で両向きの円ハフ変換→半径は「円の数が急に減る手前」から推定→周囲16方向の輪郭と1.6Rの間隔で確認）を自前で行う。丸い錠剤向け。調整は実写真（袋入り45錠）と合成画像で行った。結果の印はタップで増減、範囲指定もできる
- `PedDose/`：小児用量（薬剤別）。`PedDrug`（体重あたり1日・1回、年齢別、体重別、メモだけ。上限・範囲ごとの回数・μg・錠などの単位）、`PedDrugStore`（UserDefaults の `pedDrugs`）。Android 版は `ped/` に同じものがある
- 小児用量の初期登録は iOS・Android 共通の `data/ped_presets.json`。`tools/make_ped_presets.py` を直して実行して作る（手で JSON を直さない）。2026年11月に PMDA の電子添文（XML の InfoDoseAdmin・InfoPrecautionsDosage）と全品目を照合済み。小児用量の記載が無い・取得できない薬は basis=memo にする。pmda は GeneralList を開く YJ コード先頭7桁。版を上げると既存ユーザーの初期登録の薬は新しい値に入れ替わる（自分で追加した薬は残る）。この環境（PharmaCalc（PMDA接続））から www.pmda.go.jp に接続できる
- `RenalDrugs/`：腎機能で注意する薬。`data/renal_drugs.json`（`tools/fetch_renal.py` で PMDA の電子添文から作る。警告・禁忌・効能関連注意・用法用量・用量関連注意・重要な基本的注意のうち CCr・eGFR・クレアチニン・腎（副腎は除く）・透析に触れた項目と 9.2 全文を文言そのままで載せる。16.6 は腎の数値があるものだけ参考。用量側に数値の基準が無い薬は noNumbers。注射は販売名の「注」で除く）。いまのデータは `tools/fetch_renal_all.py`（PMDA の全169薬効分類の全製品から注射剤を除き、成分＝YJ7ごとに先発品優先で1件。約2,200成分→1,117件、1〜2時間）で作った。抜き出し規則は fetch_renal.py の extract()。aliases は同成分の先発品名（検索用）。Android 版は `renal/`
- `Barcode/`：`ScanScreen`／`HistoryScreen` が本体（タブでは `ScanView`／`HistoryView` が NavigationStack で包む。ホームのタイルからは本体を直接開く）。AVFoundation でGS1データバー等を読む `Scanner`、`GS1` 解析、PMDA電子添文URL、読み取り履歴
- 計算式は画面のフッターに必ず表示する。SwiftUI の `View.Body` と衝突するので型名に `Body` を使わない。

## Android 版（`android/`）
- この環境では Google Maven に届かないのでローカルビルド不可。GitHub Actions（`.github/workflows/android.yml`、雛形は `ci/android.yml`）で `assembleRelease` し、APK を `PharmaCalc-apk` として上げる。
- 署名鍵 `android/app/pharmacalc.jks`（パスワード pharmacalc123）は上書きインストール用に意図的にリポジトリに置いている。リリースのたびに `android/app/build.gradle.kts` の `versionCode` / `versionName` を上げる。
- 構成：`ui/`（`App.kt` がタブと画面の積み重ね。ナビゲーションライブラリは使わない。共通部品は `Components.kt`）、`core/`（`Patient`・計算式・日付）、`calc/`（各電卓）、`home/`（`CalcItem`・`HomeTiles`）、`barcode/`（CameraX＋zxing-cpp 2.3.0 で GS1データバー限定型も読む。`GS1`・`PMDA`・`ScanHistory`）、`pill/`（`PillCounter` は iOS 版と同じ手順の移植）。
- zxing-cpp は JNI でクラスを作るので、リリースでも縮小・難読化はしない。
