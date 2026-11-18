package app.pharmacalc.android.otc

import android.Manifest
import android.content.pm.PackageManager
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.pharmacalc.android.barcode.BarcodeCamera
import app.pharmacalc.android.barcode.GS1
import app.pharmacalc.android.barcode.PMDA
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.matchesSearch
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Divider
import app.pharmacalc.android.ui.LabeledRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.WarningRow

private val OrangeDark = Color(0xFFC2410C)

/** 判定の札：対象（オレンジ）／対象外 */
@Composable
private fun Verdict(target: Boolean) {
    val bg = if (target) Orange.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (target) OrangeDark else MaterialTheme.colorScheme.onSurfaceVariant
    Text(if (target) "OTC類似薬（別途の負担の対象）" else "OTC類似薬ではない",
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = fg,
        modifier = Modifier.background(bg, RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp))
}

/** 製品1つの行。押すと詳しい画面へ */
@Composable
private fun ProductRow(d: OtcData, yj: String, open: (String) -> Unit) {
    val t = d.targets[yj]
    Row(Modifier.fillMaxWidth().clickable { open(yj) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d.nameOf(yj), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            Verdict(t != null)
            if (t != null) {
                Text("${t.spec}・薬価 ${fmtTrim(t.price, 2)}円 → 別途の負担 ${fmtTrim(t.quarter, 2)}円／${Otc.unitOf(t.spec)}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

/** 調べた結果（製品が複数のこともある） */
@Composable
private fun LookupResult(d: OtcData, r: Lookup, open: (String) -> Unit) {
    when (r) {
        Lookup.Offline -> WarningRow("この製品は端末の中の表に無く、PMDA にも問い合わせられませんでした。電波のあるところで読み直すか、下の「名前で探す」を使ってください。")
        Lookup.NotFound -> WarningRow("このコードの医療用医薬品が見つかりませんでした。下の「名前で探す」を使ってください。")
        is Lookup.Found -> {
            if (r.yj.size > 1) {
                Text("この添付文書には${r.yj.size}製品が載っています。手元の製品を確かめてください。",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            r.yj.forEachIndexed { i, y ->
                if (i > 0) Divider()
                ProductRow(d, y, open)
            }
        }
    }
}

/** バーコード画面の読み取り結果に出す、OTC類似薬かどうか */
@Composable
fun OtcBadge(gtin: String, open: (String) -> Unit) {
    val ctx = LocalContext.current
    val d by produceState<OtcData?>(null) { value = Otc.load(ctx) }
    val r by produceState<Lookup?>(null, gtin) { value = null; value = Otc.lookup(ctx, gtin) }
    val dd = d
    val rr = r
    if (dd == null || rr == null) {
        Text("OTC類似薬かどうか調べています…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else if (rr !is Lookup.Found) {
        Text(if (rr == Lookup.Offline) "OTC類似薬：調べられませんでした（電波を確かめてください）" else "OTC類似薬：製品が見つかりませんでした",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        LookupResult(dd, rr, open)
    }
}

/** OTC類似薬チェック：PTPシートや箱のバーコード、または名前で、別途の負担（薬剤費の4分の1）の対象かどうかを出す */
@Composable
fun OtcScreen(open: (String) -> Unit) {
    val ctx = LocalContext.current
    val view = LocalView.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }
    val d by produceState<OtcData?>(null) { value = Otc.load(ctx) }
    var gtin by rememberSaveable { mutableStateOf<String?>(null) }
    var manual by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    val result by produceState<Lookup?>(null, gtin) { value = null; gtin?.let { value = Otc.lookup(ctx, it) } }

    fun handle(code: String) {
        val g = GS1.parse(code).gtin ?: return
        if (g == gtin) return
        view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        gtin = g
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(240.dp).background(Color.Black), contentAlignment = Alignment.Center) {
            if (granted) {
                BarcodeCamera(false, false, { handle(it) }, Modifier.fillMaxSize())
                Box(Modifier.size(260.dp, 110.dp).border(2.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(12.dp)))
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("カメラの使用が許可されていません", color = Color.White)
                    Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) { Text("許可する") }
                }
            }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val dd = d
            gtin?.let { g ->
                Section("読み取り結果（GTIN $g）") {
                    val r = result
                    if (dd == null || r == null) Text("調べています…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else LookupResult(dd, r, open)
                }
            }
            Section(footer = "PTPシートのGS1データバー、箱のGS1-128・GS1データバーを読めます。箱のコードは端末の中の表で、PTPシートのコードはPMDAの添付文書（電波が必要）で製品を調べます。") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(manual, { manual = it }, singleLine = true, modifier = Modifier.weight(1f),
                        placeholder = { Text("GTIN（14桁）を手入力") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    TextButton(onClick = { handle(manual) }, enabled = manual.isNotEmpty()) { Text("調べる") }
                }
            }
            OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("名前で探す（例：ロキソニン）") },
                leadingIcon = { Icon(Icons.Filled.Search, null) }, modifier = Modifier.fillMaxWidth())
            if (dd != null && query.trim().length >= 2) {
                val hits = remember(query, dd) { dd.search(query) }
                Section {
                    if (hits.isEmpty()) Text("見つかりませんでした", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    hits.forEachIndexed { i, y ->
                        if (i > 0) Divider()
                        ProductRow(dd, y, open)
                    }
                }
            }
            Section("制度のあらまし", footer = dd?.let { "${it.source}、${it.hot}をもとに判定しています。最終的な判断は、医師の診察（別途の負担の対象外に当たるか）と最新の厚労省の資料で確かめてください。" }) {
                Text("OTC医薬品との代替性が特に高い医療用医薬品（OTC類似薬）を保険診療で使うと、令和9年3月1日から、薬剤費の4分の1を「別途の負担（特別の料金）」として患者さんが支払います。こども・がん治療・入院中などは対象外です。",
                    style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { PMDA.open(ctx, "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html") }) {
                    Text("厚労省のページを開く")
                }
            }
        }
    }
}

/** 製品ごとの詳しい画面：判定・価格・特別の料金の計算・対象外になる場合 */
@Composable
fun OtcDetailScreen(yj: String) {
    val ctx = LocalContext.current
    val d by produceState<OtcData?>(null) { value = Otc.load(ctx) }
    var qty by rememberSaveable { mutableStateOf("") }
    var dq by rememberSaveable { mutableStateOf("") }
    val dd = d ?: run {
        CalcPage { Text("読み込んでいます…") }
        return
    }
    val t = dd.targets[yj]
    CalcPage {
        Section {
            Text(dd.nameOf(yj), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
            Verdict(t != null)
            Text("YJコード $yj", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (t == null) {
            Section(footer = "厚労省の対象医薬品リストに無い製品です。通常どおりの保険給付です。") {
                Text("この製品は別途の負担（薬剤費の4分の1）の対象ではありません。")
            }
        } else {
            Section("価格（厚労省マスタ）") {
                LabeledRow("成分", t.ingredient)
                LabeledRow("規格", t.spec)
                LabeledRow("メーカー", t.maker)
                LabeledRow("薬価", "${fmtTrim(t.price, 2)}円")
                LabeledRow("価格の4分の1（別途の負担）", "${fmtTrim(t.quarter, 2)}円")
                LabeledRow("保険外併用療養費の算出に用いる価格", "${fmtTrim(t.base, 2)}円")
            }
            Section("別途の負担（特別の料金）の計算",
                footer = "特別の料金 ＝ 価格の4分の1 × 投薬全量。10円以上なら5円未満の端数は切り捨て、5円以上は10円に切り上げ、10円未満は10円。同じ処方箋に対象医薬品が複数あるときは合算してから丸めます。保険の分（自己負担）は「保険外併用療養費の算出に用いる価格」で薬剤料を算定します。") {
                NumField("投薬全量", qty, { qty = it }, Otc.unitOf(t.spec))
                val q = parseNum(qty)
                if (q != null && q > 0) {
                    ResultRow("特別の料金", "${Otc.fee(t.quarter * q)}", "円",
                        note = "${fmtTrim(t.quarter, 2)}円 × ${fmtTrim(q, 2)} ＝ ${fmtTrim(t.quarter * q, 2)}円", color = OrangeDark)
                    ResultRow("保険の対象となる価格の合計", fmtTrim(t.base * q, 2), "円",
                        note = "薬剤料の点数はこの価格で算定（1剤1日分ごとに五捨五超入）", big = false)
                }
            }
            Section("この製品で対象外になる場合") {
                LabeledRow("妊婦・妊娠の可能性がある者", if (yj in dd.pregnant) "対象外になる" else "該当なし",
                    valueColor = if (yj in dd.pregnant) Color(0xFF1F8A3B) else null)
                LabeledRow("授乳婦", if (yj in dd.lactating) "対象外になる" else "該当なし",
                    valueColor = if (yj in dd.lactating) Color(0xFF1F8A3B) else null)
            }
            val eff = dd.effects[yj].orEmpty()
            if (eff.isNotEmpty()) {
                Section("この効能・効果で使うときは対象外", footer = "類似のOTC医薬品では承認されていない効能・効果です。") {
                    eff.forEach { Text(it) }
                }
            }
            val dis = dd.diseases[t.ingredient].orEmpty()
            if (dis.isNotEmpty()) {
                Section("この傷病名で使うときは対象外（例 ${dis.size}件・成分 ${t.ingredient}）") {
                    OutlinedTextField(dq, { dq = it }, singleLine = true, placeholder = { Text("傷病名で絞り込む") }, modifier = Modifier.fillMaxWidth())
                    val shown = dis.filter { matchesSearch(it, dq) }
                    shown.take(100).forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
                    if (shown.size > 100) Text("ほか${shown.size - 100}件（絞り込んでください）", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Section("次のいずれかに当たるときは、どの対象医薬品も別途の負担の対象外") {
            Otc.EXEMPTIONS.forEachIndexed { i, x -> Text("${i + 1}. $x", style = MaterialTheme.typography.bodySmall) }
        }
        TextButton(onClick = { PMDA.open(ctx, "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yj.take(7)}") }) {
            Text("添付文書を見る（PMDA）")
        }
    }
}
