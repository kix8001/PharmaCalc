package app.pharmacalc.android.renal

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pharmacalc.android.barcode.PMDA
import app.pharmacalc.android.core.BodyCalc
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.Renal
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.Divider
import app.pharmacalc.android.ui.MissingRow
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import org.json.JSONObject

/** 腎機能で用量調節・禁忌がある薬（data/renal_drugs.json。添付文書の該当箇所をそのまま載せる） */
data class RenalDrug(
    val category: String, val name: String, val products: String, val generic: String, val pmda: String?,
    val excerpts: List<Pair<String, String>>,
    /** 添付文書に腎機能の数値の基準が無い（腎機能に触れた記載だけ） */
    val noNumbers: Boolean = false,
    /** 同じ成分のほかの先発品の販売名（検索用） */
    val aliases: String = "",
) {
    /** 検索用の文字列（1,000件以上あるので最初に1回だけ作る） */
    val searchKey by lazy { app.pharmacalc.android.core.searchKey(name + products + generic + aliases) }

    /** 一覧と詳細をつなぐ ID（成分ごとに一意） */
    val id get() = (pmda ?: "") + "|" + name
}

object RenalDrugData {
    var drugs: List<RenalDrug> = emptyList(); private set
    var source = ""; private set

    fun init(ctx: Context) {
        if (drugs.isNotEmpty()) return
        runCatching {
            val o = JSONObject(ctx.assets.open("renal_drugs.json").bufferedReader().readText())
            source = o.optString("source")
            val arr = o.getJSONArray("drugs")
            drugs = (0 until arr.length()).map { i ->
                val d = arr.getJSONObject(i)
                val ex = d.getJSONArray("excerpts")
                RenalDrug(d.getString("category"), d.getString("name"), d.optString("products"), d.optString("generic"),
                    d.optString("pmda").ifEmpty { null },
                    (0 until ex.length()).map { j -> ex.getJSONObject(j).let { it.getString("section") to it.getString("text") } },
                    d.optBoolean("noNumbers", false), d.optString("aliases"))
            }
        }
    }

    val categories get() = drugs.map { it.category }.distinct()
}

/** 患者情報から出した腎機能 */
@Composable
fun PatientRenalSummary() {
    val p = Patient
    val age = p.ageV; val w = p.weightV; val h = p.heightV; val cr = p.scrV
    if (age != null && cr != null && age > 0 && cr > 0) {
        if (w != null && w > 0) ResultRow("CCr（実体重）", fmt(Renal.cockcroftGault(age, w, cr, p.sex)), "mL/min")
        val e = Renal.egfrCr(age, cr, p.sex)
        ResultRow("eGFR", fmt(e), "mL/min/1.73m²", big = false)
        if (w != null && h != null && w > 0 && h > 0) {
            ResultRow("eGFR（体表面積未補正）", fmt(Renal.deindex(e, BodyCalc.bsaDuBois(w, h))), "mL/min", big = false)
        }
    } else MissingRow("腎機能の画面で年齢・体重・血清Crを入れると、ここに表示します")
}

private fun badge(s: String) = when (s) {
    "禁忌" -> "禁忌"
    "用法及び用量" -> "用量"
    "用法及び用量に関連する注意" -> "用量の注意"
    "効能又は効果に関連する注意" -> "効能の注意"
    "重要な基本的注意" -> "重要な注意"
    "9.2 腎機能障害患者" -> "腎機能障害"
    "警告" -> "警告"
    else -> "薬物動態（参考）"
}

@Composable
fun RenalDrugsScreen(open: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var filter by rememberSaveable { mutableStateOf(0) }  // 0: すべて, 1: 禁忌・警告あり, 2: 数値の基準あり
    val list = RenalDrugData.drugs.filter { d ->
        (category == null || d.category == category) &&
            (query.isEmpty() || d.searchKey.contains(app.pharmacalc.android.core.searchKey(query.trim()))) &&
            (filter != 1 || d.excerpts.any { it.first == "禁忌" || it.first == "警告" }) &&
            (filter != 2 || !d.noNumbers)
    }
    // 件数が多いので、画面に見える行だけ作る LazyColumn にする
    androidx.compose.foundation.lazy.LazyColumn(
        Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { Section("この患者の腎機能") { PatientRenalSummary() } }
        item {
            OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("薬の名前・成分で探す") },
                leadingIcon = { Icon(Icons.Filled.Search, null) }, modifier = Modifier.fillMaxWidth())
        }
        item {
            app.pharmacalc.android.ui.DropdownRow("薬効分類",
                listOf<Pair<String?, String>>(null to "すべて") + RenalDrugData.categories.map { it to it }, category) { category = it }
        }
        item { Choice(listOf(0 to "すべて", 1 to "禁忌・警告あり", 2 to "数値の基準あり"), filter) { filter = it } }
        item { Text("${list.size}件", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        var last: String? = null
        list.forEach { d ->
            if (d.category != last) {
                last = d.category
                item(key = "h_" + d.category) {
                    Text(d.category, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 8.dp, start = 4.dp))
                }
            }
            item(key = d.id) { DrugRow(d) { open(d.id) } }
        }
        item {
            Text("${RenalDrugData.source}の「警告」「禁忌」「効能又は効果に関連する注意」「用法及び用量」「用法及び用量に関連する注意」「重要な基本的注意」のうち腎機能（CCr・eGFR・クレアチニン・腎・透析）に触れた項目と「9.2 腎機能障害患者」の全文を、文言を変えずに載せています。「16.6 薬物動態」は腎機能の数値があるものだけ参考として載せています。",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DrugRow(d: RenalDrug, onClick: () -> Unit) {
    androidx.compose.material3.Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(d.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            Text(d.generic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            d.excerpts.filter { it.first == "禁忌" }.forEach { (_, t) ->
                Text("禁忌：" + t.replace("\n", " "), style = MaterialTheme.typography.bodySmall, color = Color(0xFFD32F2F),
                    maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (d.noNumbers) {
                    Text("数値の基準なし", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.background(Color.Gray.copy(alpha = 0.15f), RoundedCornerShape(50))
                            .padding(horizontal = 6.dp, vertical = 2.dp))
                }
                d.excerpts.map { it.first }.distinct().sorted().forEach { s ->
                    val red = s == "禁忌" || s == "警告"
                    Text(badge(s), style = MaterialTheme.typography.labelSmall,
                        color = if (red) Color(0xFFD32F2F) else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.background(
                            (if (red) Color(0xFFD32F2F) else MaterialTheme.colorScheme.primary).copy(alpha = 0.12f),
                            RoundedCornerShape(50)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }
        }
    }
}

@Composable
fun RenalDrugDetailScreen(name: String) = CalcPage {
    val ctx = LocalContext.current
    val d = RenalDrugData.drugs.firstOrNull { it.id == name || it.name == name } ?: return@CalcPage
    Section {
        Text(d.products)
        Text(d.generic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Section("この患者の腎機能") { PatientRenalSummary() }
    d.excerpts.forEach { (section, text) ->
        Section(section) {
            SelectionContainer {
                Text(text, style = MaterialTheme.typography.bodyMedium,
                    color = if (section == "禁忌" || section == "警告") Color(0xFFD32F2F) else MaterialTheme.colorScheme.onSurface)
            }
        }
    }
    d.pmda?.let { yj ->
        Section(footer = "同じ成分の製品の一覧が開きます。処方された製品の添付文書を確認してください。") {
            TextButton(onClick = { PMDA.open(ctx, "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/$yj") }) {
                Text("添付文書を見る（PMDA）")
            }
        }
    }
}
