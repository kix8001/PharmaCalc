package app.pharmacalc.android.ui

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import app.pharmacalc.android.barcode.PMDA

@Composable
fun AboutScreen() = CalcPage {
    val ctx = LocalContext.current
    val info = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0) }.getOrNull()
    Section { LabeledRow("バージョン", "${info?.versionName ?: "-"}（${info?.longVersionCode ?: "-"}）") }
    Section("ご注意") {
        Text("計算結果は業務の補助として使う目安です。投与量などは、添付文書・ガイドライン・医師の指示で必ず確認してください。計算の誤りによる結果について、作者は責任を負いません。")
    }
    Section("個人情報") {
        Text("患者情報（年齢・体重・検査値など）は端末に保存せず、アプリを終了すると消えます。バーコードの読み取り履歴とホームの並びだけを端末内に保存します。外部へは、添付文書を開くときにPMDAのサイトへGTINを送るだけです。")
    }
    Section("添付文書") {
        Text("PTPシートや箱のGS1バーコードからGTINを読み取り、PMDA（医薬品医療機器総合機構）の電子添文ページを開きます。")
        TextButton(onClick = { PMDA.open(ctx, PMDA.SEARCH_URL) }) { Text("PMDA 医療用医薬品 情報検索") }
    }
}
