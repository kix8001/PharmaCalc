package app.pharmacalc.android.calc

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.DropdownRow
import app.pharmacalc.android.ui.LabeledRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.SwitchRow

/** オピオイドの種類と、経口モルヒネに換算する係数（1日量 × 係数 = 経口モルヒネ mg/日）。iOS 版と同じ値 */
enum class OpioidDrug(val label: String, val factor: Double, val kind: Kind) {
    MORPHINE_ORAL("モルヒネ 経口", 1.0, Kind.ORAL),
    MORPHINE_SUPP("モルヒネ 坐剤", 1.5, Kind.ORAL),
    MORPHINE_INJ("モルヒネ 注射（静注・皮下）", 2.0, Kind.INJECTION),
    OXYCODONE_ORAL("オキシコドン 経口", 1.5, Kind.ORAL),
    OXYCODONE_INJ("オキシコドン 注射", 2.0, Kind.INJECTION),
    HYDROMORPHONE_ORAL("ヒドロモルフォン 経口", 5.0, Kind.ORAL),
    HYDROMORPHONE_INJ("ヒドロモルフォン 注射", 25.0, Kind.INJECTION),
    FENTANYL_PATCH("フェンタニル 貼付（1日型の表示量）", 30.0, Kind.PATCH),
    FENTANYL_INJ("フェンタニル 注射", 100.0, Kind.INJECTION),
    TAPENTADOL("タペンタドール 経口", 0.3, Kind.ORAL),
    TRAMADOL("トラマドール 経口", 0.2, Kind.ORAL),
    CODEINE("コデイン 経口", 1.0 / 6, Kind.ORAL);

    enum class Kind { ORAL, INJECTION, PATCH }
}

@Composable
fun OpioidScreen() = CalcPage {
    var from by rememberSaveable { mutableStateOf(OpioidDrug.OXYCODONE_ORAL) }
    var dose by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf(OpioidDrug.FENTANYL_PATCH) }
    var reduce by rememberSaveable { mutableStateOf(false) }
    val opts = OpioidDrug.entries.map { it to it.label }
    Section("いまの薬") {
        DropdownRow("薬", opts, from) { from = it }
        NumField("1日量", dose, { dose = it }, "mg/日")
    }
    val d = parseNum(dose)
    if (d != null && d > 0) {
        val mme = d * from.factor
        Section { ResultRow("経口モルヒネ換算", fmtTrim(mme, 1), "mg/日", color = Orange) }
        Section("変更先") {
            DropdownRow("変更先", opts, to) { to = it }
            SwitchRow("交差耐性を考えて25%減らす", reduce) { reduce = it }
            val target = mme / to.factor * (if (reduce) 0.75 else 1.0)
            ResultRow("1日量", fmtTrim(target, 2), "mg/日")
            when (to.kind) {
                OpioidDrug.Kind.ORAL -> ResultRow("レスキュー1回量（1日量の1/6）", fmtTrim(target / 6, 2), "mg", big = false)
                OpioidDrug.Kind.INJECTION -> ResultRow("レスキュー（1時間量）", fmtTrim(target / 24, 3), "mg", big = false)
                OpioidDrug.Kind.PATCH -> {
                    ResultRow("レスキュー：モルヒネ速放", fmtTrim(mme / 6, 1), "mg/回", big = false)
                    ResultRow("レスキュー：オキシコドン速放", fmtTrim(mme / 6 / 1.5, 1), "mg/回", big = false,
                        note = "貼付剤のときは経口の速放性製剤をレスキューに使います（1日量の1/6が目安）")
                }
            }
        }
        Section("各薬の相当量") {
            OpioidDrug.entries.forEach { LabeledRow(it.label, "${fmtTrim(mme / it.factor, 2)} mg/日") }
        }
    }
    Section("換算比（経口モルヒネ 60mg/日 に相当）",
        footer = "がん疼痛の治療で一般的に使われる換算比の目安です。個人差が大きく、切り替え直後は効果と副作用をよく観察してください。フェンタニル貼付はフェントステープ（1日型）の表示量で、デュロテップMTパッチ（3日型）2.1mg ≒ フェントステープ1mg。メサドンは換算が一定でないため対象外です。") {
        OpioidDrug.entries.forEach {
            Text("${it.label}　${fmtTrim(60 / it.factor, 2)}mg", style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** ステロイドと、プレドニゾロン5mgに相当する量 */
enum class SteroidDrug(val label: String, val equivalent: Double, val note: String) {
    HYDROCORTISONE("ヒドロコルチゾン", 20.0, "短時間型・鉱質作用あり"),
    CORTISONE("コルチゾン", 25.0, "短時間型・鉱質作用あり"),
    PREDNISOLONE("プレドニゾロン", 5.0, "中間型"),
    METHYLPREDNISOLONE("メチルプレドニゾロン", 4.0, "中間型"),
    TRIAMCINOLONE("トリアムシノロン", 4.0, "中間型"),
    DEXAMETHASONE("デキサメタゾン", 0.75, "長時間型"),
    BETAMETHASONE("ベタメタゾン", 0.75, "長時間型"),
}

@Composable
fun SteroidScreen() = CalcPage {
    var from by rememberSaveable { mutableStateOf(SteroidDrug.PREDNISOLONE) }
    var dose by rememberSaveable { mutableStateOf("") }
    Section {
        DropdownRow("薬", SteroidDrug.entries.map { it to it.label }, from) { from = it }
        NumField("量", dose, { dose = it }, "mg")
    }
    val d = parseNum(dose)
    if (d != null && d > 0) {
        val pred = d / from.equivalent * 5
        Section("相当量（抗炎症作用）") {
            SteroidDrug.entries.forEach { s ->
                ResultRow(s.label, fmtTrim(pred / 5 * s.equivalent, 2), "mg", note = s.note,
                    big = s == SteroidDrug.PREDNISOLONE, color = if (s == from) Orange else null)
            }
        }
    }
    Section("換算表（プレドニゾロン5mg相当）",
        footer = "抗炎症作用で比べた一般的な目安です。鉱質コルチコイド作用や作用時間は薬ごとに違います。") {
        SteroidDrug.entries.forEach {
            Text("${it.label}　${fmtTrim(it.equivalent, 2)}mg", style = MaterialTheme.typography.bodySmall)
        }
    }
}
