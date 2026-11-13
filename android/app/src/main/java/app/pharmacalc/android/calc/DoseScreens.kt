package app.pharmacalc.android.calc

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.MissingRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.QuickButtons
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.WarningRow

@Composable
fun PowderScreen() = CalcPage {
    var toGram by rememberSaveable { mutableStateOf(true) }
    var conc by rememberSaveable { mutableStateOf("10") }
    var percent by rememberSaveable { mutableStateOf(true) }
    var amount by rememberSaveable { mutableStateOf("") }
    var times by rememberSaveable { mutableStateOf("3") }
    var days by rememberSaveable { mutableStateOf("") }
    Section(footer = "10% = 100mg/g。力価表示の製剤は力価の値を入れてください。") {
        Choice(listOf(true to "成分量 → 製剤量", false to "製剤量 → 成分量"), toGram) { toGram = it }
        NumField("製剤の濃度", conc, { conc = it }, if (percent) "%" else "mg/g")
        Choice(listOf(true to "%", false to "mg/g"), percent) { percent = it }
        QuickButtons(listOf(1.0, 2.0, 5.0, 10.0, 20.0, 50.0), { conc = it }, if (percent) "%" else "mg/g")
    }
    Section {
        if (toGram) NumField("1日の成分量", amount, { amount = it }, "mg")
        else NumField("1日の製剤量", amount, { amount = it }, "g")
        NumField("1日の回数", times, { times = it }, "回", integer = true)
        NumField("日数（任意）", days, { days = it }, "日", integer = true)
    }
    val c = parseNum(conc)
    val a = parseNum(amount)
    if (c != null && c > 0 && a != null && a > 0) {
        val mgPerG = if (percent) c * 10 else c
        val gram = if (toGram) a / mgPerG else a
        val mg = if (toGram) a else a * mgPerG
        Section("結果") {
            ResultRow("製剤の濃度", fmtTrim(mgPerG, 3), "mg/g", big = false)
            if (toGram) ResultRow("1日の製剤量", fmtTrim(gram, 3), "g", color = Orange)
            else ResultRow("1日の成分量", fmtTrim(mg, 2), "mg", color = Orange)
            val t = parseInt(times)
            if (t != null && t > 0) ResultRow("1回（1包）", fmtTrim(gram / t, 3), "g", note = "成分量 ${fmtTrim(mg / t, 2)}mg")
            val n = parseInt(days)
            if (n != null && n > 0) ResultRow("総量（${n}日分）", fmtTrim(gram * n, 3), "g")
        }
    }
}

/** von Harnack の換算表（年齢の下限, 成人量に対する比, 表示） */
private val harnack = listOf(
    Triple(0.0, 0.0, "新生児（表の対象外）"),
    Triple(0.25, 1.0 / 6, "3か月 1/6"),
    Triple(0.5, 1.0 / 5, "6か月 1/5"),
    Triple(1.0, 1.0 / 4, "1歳 1/4"),
    Triple(3.0, 1.0 / 3, "3歳 1/3"),
    Triple(7.5, 1.0 / 2, "7.5歳 1/2"),
    Triple(12.0, 2.0 / 3, "12歳 2/3"),
    Triple(20.0, 1.0, "成人 1"),
)

@Composable
fun PediatricScreen() = CalcPage {
    val p = Patient
    var adult by rememberSaveable { mutableStateOf("") }
    var unit by rememberSaveable { mutableStateOf("mg") }
    Section(footer = "年齢は小数でも入れられます（例：1歳6か月 → 1.5）。年齢は患者情報と共通です。") {
        NumField("年齢", p.age, { p.age = it }, "歳")
        NumField("成人量", adult, { adult = it }, unit)
        Choice(listOf("mg" to "mg", "g" to "g", "mL" to "mL", "錠" to "錠"), unit) { unit = it }
    }
    val age = p.ageV
    val a = parseNum(adult)
    if (age != null && age >= 0 && a != null && a > 0) {
        Section("小児の量（目安）", footer = "あくまで目安です。添付文書や小児の用量の資料で必ず確認してください。") {
            if (age >= 1) {
                val r = minOf((age * 4 + 20) / 100, 1.0)
                ResultRow("Augsberger-II式", fmtTrim(a * r, 2), unit, note = "成人量 ×（年齢×4＋20）÷100 ＝ ×${fmt(r, 2)}")
            } else MissingRow("Augsberger-II式は1歳以上が対象です")
            val h = harnack.last { age >= it.first }
            if (h.second > 0) ResultRow("von Harnack", fmtTrim(a * h.second, 2), unit, note = "表の ${h.third} を適用（表の年齢の間は目安）")
            if (age < 12) {
                val y = age / (age + 12)
                ResultRow("Young式", fmtTrim(a * y, 2), unit, note = "成人量 × 年齢 ÷（年齢＋12）＝ ×${fmt(y, 2)}")
            }
        }
    }
}

@Composable
fun WeightDoseScreen() = CalcPage {
    val p = Patient
    var perKg by rememberSaveable { mutableStateOf("") }
    var times by rememberSaveable { mutableStateOf("3") }
    var maxDaily by rememberSaveable { mutableStateOf("") }
    var perDose by rememberSaveable { mutableStateOf(false) }
    Section {
        NumField("体重", p.weight, { p.weight = it }, "kg")
        Choice(listOf(false to "mg/kg/日", true to "mg/kg/回"), perDose) { perDose = it }
        NumField("用量", perKg, { perKg = it }, if (perDose) "mg/kg/回" else "mg/kg/日")
        NumField("1日の回数", times, { times = it }, "回", integer = true)
        NumField("1日の上限（任意）", maxDaily, { maxDaily = it }, "mg")
    }
    val w = p.weightV
    val k = parseNum(perKg)
    val t = parseInt(times)
    if (w != null && w > 0 && k != null && k > 0 && t != null && t > 0) {
        val raw = if (perDose) k * w * t else k * w
        val cap = parseNum(maxDaily)
        val daily = if (cap != null) minOf(raw, cap) else raw
        Section("結果") {
            ResultRow("1日量", fmtTrim(daily, 2), "mg", color = Orange)
            ResultRow("1回量", fmtTrim(daily / t, 2), "mg")
            if (cap != null && raw > cap) WarningRow("計算値 ${fmtTrim(raw, 2)}mg が上限 ${fmtTrim(cap, 2)}mg を超えたため、上限で表示しています")
        }
    }
}
