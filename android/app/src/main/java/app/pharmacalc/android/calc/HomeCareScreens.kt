package app.pharmacalc.android.calc

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.Sex
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
import app.pharmacalc.android.ui.SwitchRow
import app.pharmacalc.android.ui.WarningRow
import kotlin.math.floor

@Composable
fun PCAScreen() = CalcPage {
    var daily by rememberSaveable { mutableStateOf("") }
    var byConc by rememberSaveable { mutableStateOf(true) }
    var conc by rememberSaveable { mutableStateOf("") }
    var drugMg by rememberSaveable { mutableStateOf("") }
    var totalMl by rememberSaveable { mutableStateOf("") }
    var rescue by rememberSaveable { mutableStateOf("") }
    var container by rememberSaveable { mutableStateOf("") }
    Section {
        NumField("1日量", daily, { daily = it }, "mg/日")
        Choice(listOf(true to "濃度で入力", false to "薬の量と全量"), byConc) { byConc = it }
        if (byConc) NumField("濃度", conc, { conc = it }, "mg/mL")
        else {
            NumField("薬の量", drugMg, { drugMg = it }, "mg")
            NumField("全量", totalMl, { totalMl = it }, "mL")
        }
    }
    Section {
        NumField("早送りの回数（1日・任意）", rescue, { rescue = it }, "回", integer = true)
        NumField("容器の容量（任意）", container, { container = it }, "mL")
    }
    val c: Double? = if (byConc) parseNum(conc) else {
        val m = parseNum(drugMg); val v = parseNum(totalMl)
        if (m != null && v != null && v > 0) m / v else null
    }
    val d = parseNum(daily)
    if (d != null && d > 0 && c != null && c > 0) {
        val mlDay = d / c
        val bolus = mlDay / 24
        val used = mlDay + bolus * (parseInt(rescue) ?: 0)
        Section("結果", footer = "流量 = 1日量 ÷ 濃度 ÷ 24。早送り（レスキュー）は1時間量が目安で、ロックアウト時間は15〜30分程度が一般的です。") {
            if (!byConc) ResultRow("濃度", fmtTrim(c, 3), "mg/mL", big = false)
            ResultRow("1日の液量", fmtTrim(mlDay, 2), "mL/日")
            ResultRow("流量", fmtTrim(mlDay / 24, 3), "mL/h", color = Orange)
            ResultRow("早送り1回（1時間量）", fmtTrim(bolus, 3), "mL", note = "薬の量 ${fmtTrim(d / 24, 2)}mg")
            val r = parseInt(rescue)
            if (r != null && r > 0) ResultRow("早送り込みの1日の液量", fmtTrim(used, 2), "mL/日", big = false,
                note = "薬の量 ${fmtTrim(used * c, 2)}mg/日")
            val v = parseNum(container)
            if (v != null && v > 0) ResultRow("容器が空になるまで", fmtTrim(v / used, 1), "日", note = "約${fmtTrim(v / used * 24, 0)}時間")
        }
    }
}

@Composable
fun NutritionScreen() = CalcPage {
    val p = Patient
    var activity by rememberSaveable { mutableStateOf("1.2") }
    var stress by rememberSaveable { mutableStateOf("1.0") }
    var glucose by rememberSaveable { mutableStateOf("") }
    var amino by rememberSaveable { mutableStateOf("") }
    var fat by rememberSaveable { mutableStateOf("") }
    Section("患者情報（共通）") { PatientFields(setOf(PField.AGE, PField.SEX, PField.HEIGHT, PField.WEIGHT)) }
    Section(footer = "活動係数：寝たきり1.0、ベッド上安静1.2、ベッド外活動1.3。ストレス係数：なし1.0、軽い手術・褥瘡1.1〜1.2、感染症・発熱1.2〜1.3。") {
        NumField("活動係数", activity, { activity = it })
        QuickButtons(listOf(1.0, 1.1, 1.2, 1.3, 1.5), { activity = it })
        NumField("ストレス係数", stress, { stress = it })
        QuickButtons(listOf(1.0, 1.1, 1.2, 1.3, 1.5), { stress = it })
    }
    val a = p.ageV; val w = p.weightV; val h = p.heightV
    if (a != null && w != null && h != null && a > 0 && w > 0 && h > 0) {
        val bee = if (p.sex == Sex.MALE) 66.47 + 13.75 * w + 5.0 * h - 6.76 * a
        else 655.1 + 9.56 * w + 1.85 * h - 4.68 * a
        val af = parseNum(activity) ?: 1.0
        val sf = parseNum(stress) ?: 1.0
        Section("必要量（Harris-Benedict式）",
            footer = "男性：66.47＋13.75×体重＋5.0×身長−6.76×年齢\n女性：655.1＋9.56×体重＋1.85×身長−4.68×年齢\n必要エネルギー＝基礎エネルギー×活動係数×ストレス係数") {
            ResultRow("基礎エネルギー消費量", fmtTrim(bee, 0), "kcal/日", big = false)
            ResultRow("必要エネルギー", fmtTrim(bee * af * sf, 0), "kcal/日", color = Orange,
                note = "簡易法（25〜30kcal/kg）なら ${fmtTrim(w * 25, 0)}〜${fmtTrim(w * 30, 0)}kcal/日")
            ResultRow("必要水分量", "${fmtTrim(w * 30, 0)}〜${fmtTrim(w * 35, 0)}", "mL/日", big = false,
                note = "30〜35mL/kg/日（心不全・腎不全では制限することがあります）")
            ResultRow("必要たんぱく質", "${fmtTrim(w * 1.0, 0)}〜${fmtTrim(w * 1.2, 0)}", "g/日", big = false,
                note = "1.0〜1.2g/kg/日（腎機能に合わせて調整）")
        }
    } else Section { MissingRow("年齢・性別・身長・体重を入力してください") }
    Section("輸液・経腸栄養のカロリー（1日分）",
        footer = "ブドウ糖4kcal/g、アミノ酸4kcal/g、脂肪9kcal/g。窒素量＝アミノ酸×0.16。") {
        NumField("ブドウ糖", glucose, { glucose = it }, "g")
        NumField("アミノ酸", amino, { amino = it }, "g")
        NumField("脂肪", fat, { fat = it }, "g")
        val g = parseNum(glucose) ?: 0.0
        val aa = parseNum(amino) ?: 0.0
        val f = parseNum(fat) ?: 0.0
        if (g + aa + f > 0) {
            val npc = g * 4 + f * 9
            ResultRow("総エネルギー", fmtTrim(npc + aa * 4, 0), "kcal", color = Orange)
            ResultRow("非たんぱくカロリー（NPC）", fmtTrim(npc, 0), "kcal", big = false)
            if (aa > 0) ResultRow("NPC/N比", fmtTrim(npc / (aa * 0.16), 0), big = false,
                note = "一般に150〜200。腎不全では高め、侵襲が大きいときは低め")
        }
    }
}

private fun hm(m: Double): String {
    val t = floor(m).toInt()
    return "${t / 60}時間${t % 60}分"
}

@Composable
fun OxygenScreen() = CalcPage {
    var capacity by rememberSaveable { mutableStateOf("500") }
    var fullP by rememberSaveable { mutableStateOf("14.7") }
    var pressure by rememberSaveable { mutableStateOf("") }
    var flow by rememberSaveable { mutableStateOf("") }
    var conserver by rememberSaveable { mutableStateOf(false) }
    var ratio by rememberSaveable { mutableStateOf("3") }
    Section(footer = "呼吸同調器は機種と呼吸数で変わりますが、2〜3倍長持ちするのが目安です。") {
        NumField("ボンベの容量（満充填）", capacity, { capacity = it }, "L")
        QuickButtons(listOf(150.0, 200.0, 300.0, 500.0), { capacity = it }, "L")
        NumField("満充填の圧力", fullP, { fullP = it }, "MPa")
        NumField("いまの圧力", pressure, { pressure = it }, "MPa")
        NumField("流量", flow, { flow = it }, "L/分")
        QuickButtons(listOf(0.5, 1.0, 1.5, 2.0, 3.0), { flow = it }, "L")
        SwitchRow("呼吸同調器を使う", conserver) { conserver = it }
        if (conserver) NumField("節約倍率", ratio, { ratio = it }, "倍")
    }
    val cap = parseNum(capacity); val fp = parseNum(fullP); val pr = parseNum(pressure); val f = parseNum(flow)
    if (cap != null && fp != null && pr != null && f != null && cap > 0 && fp > 0 && pr >= 0 && f > 0) {
        val remain = cap * pr / fp
        val r = if (conserver) parseNum(ratio) ?: 1.0 else 1.0
        val minutes = remain / f * r
        Section("結果", footer = "残量 = 容量 × いまの圧力 ÷ 満充填の圧力、使える時間 = 残量 ÷ 流量（× 同調器の倍率）") {
            ResultRow("残りの酸素量", fmtTrim(remain, 0), "L")
            ResultRow("使える時間", hm(minutes), color = Orange)
            ResultRow("安全を見た時間（8割）", hm(minutes * 0.8), big = false, note = "移動や外出の計画はこちらで")
        }
    }
}

@Composable
fun DilutionScreen() = CalcPage {
    var stock by rememberSaveable { mutableStateOf("6") }
    var target by rememberSaveable { mutableStateOf("0.1") }
    var amount by rememberSaveable { mutableStateOf("1000") }
    Section(footer = "次亜塩素酸ナトリウムの目安：ノロウイルスの吐物・便の処理は0.1%（1000ppm）、ドアノブや手すりなどの拭き取りは0.02〜0.05%（200〜500ppm）。家庭用塩素系漂白剤は約5〜6%。") {
        NumField("原液の濃度", stock, { stock = it }, "%")
        QuickButtons(listOf(1.0, 5.0, 6.0, 12.0), { stock = it }, "%")
        NumField("作りたい濃度", target, { target = it }, "%")
        QuickButtons(listOf(0.02, 0.05, 0.1), { target = it }, "%")
        NumField("作る量", amount, { amount = it }, "mL")
        QuickButtons(listOf(500.0, 1000.0, 2000.0, 5000.0), { amount = it }, "mL")
    }
    val s = parseNum(stock); val t = parseNum(target); val v = parseNum(amount)
    if (s != null && t != null && v != null && s > 0 && t > 0 && v > 0) {
        Section("結果") {
            if (t >= s) WarningRow("作りたい濃度が原液以上です")
            else {
                val x = v * t / s
                ResultRow("原液", fmtTrim(x, 1), "mL", color = Orange, note = "ペットボトルのキャップ1杯は約5mL → 約${fmtTrim(x / 5, 1)}杯")
                ResultRow("水", fmtTrim(v - x, 1), "mL")
                ResultRow("濃度（ppm）", fmtTrim(t * 10000, 0), "ppm", big = false)
            }
        }
    }
}
