package app.pharmacalc.android.calc

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.MissingRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.QuickButtons
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section

@Composable
fun DripScreen() = CalcPage {
    var volume by rememberSaveable { mutableStateOf("") }
    var hours by rememberSaveable { mutableStateOf("") }
    var minutes by rememberSaveable { mutableStateOf("") }
    var factor by rememberSaveable { mutableIntStateOf(20) }
    Section {
        NumField("輸液量", volume, { volume = it }, "mL")
        QuickButtons(listOf(50.0, 100.0, 250.0, 500.0, 1000.0), { volume = it }, "mL")
        NumField("時間", hours, { hours = it }, "時間")
        NumField("＋", minutes, { minutes = it }, "分", integer = true)
        Choice(listOf(20 to "成人用 20滴/mL", 60 to "小児用 60滴/mL"), factor) { factor = it }
    }
    val totalMin = (parseNum(hours) ?: 0.0) * 60 + (parseNum(minutes) ?: 0.0)
    val v = parseNum(volume)
    if (v != null && v > 0 && totalMin > 0) {
        val dpm = v * factor / totalMin
        Section("結果") {
            ResultRow("流量", fmt(v / totalMin * 60, 1), "mL/h")
            ResultRow("滴下数", fmt(dpm, 1), "滴/分", color = Orange)
            ResultRow("10秒あたり", fmt(dpm / 6, 1), "滴")
            ResultRow("1滴の間隔", fmt(60 / dpm, 1), "秒")
        }
    }
}

@Composable
fun GammaScreen() = CalcPage {
    val p = Patient
    var drugMg by rememberSaveable { mutableStateOf("") }
    var volume by rememberSaveable { mutableStateOf("") }
    var input by rememberSaveable { mutableStateOf("") }
    var fromGamma by rememberSaveable { mutableStateOf(true) }
    Section(footer = "例：ドパミン 150mg/50mL（3mg/mL）") {
        NumField("薬の量", drugMg, { drugMg = it }, "mg")
        NumField("溶液の全量", volume, { volume = it }, "mL")
        NumField("体重", p.weight, { p.weight = it }, "kg")
    }
    Section {
        Choice(listOf(true to "γ → mL/h", false to "mL/h → γ"), fromGamma) { fromGamma = it }
        NumField(if (fromGamma) "投与速度" else "流量", input, { input = it }, if (fromGamma) "μg/kg/min" else "mL/h")
    }
    val mg = parseNum(drugMg)
    val v = parseNum(volume)
    val w = p.weightV
    if (mg != null && mg > 0 && v != null && v > 0 && w != null && w > 0) {
        val conc = mg * 1000 / v
        Section("結果") {
            ResultRow("濃度", fmtTrim(conc, 1), "μg/mL", big = false)
            ResultRow("1 mL/h は", fmt(conc / (w * 60), 3), "γ", big = false)
            val x = parseNum(input)
            if (x != null && x > 0) {
                if (fromGamma) ResultRow("流量", fmt(x * w * 60 / conc, 2), "mL/h", color = Orange)
                else ResultRow("投与速度", fmt(x * conc / (w * 60), 2), "μg/kg/min", color = Orange)
            }
        }
    } else Section { MissingRow("薬の量・溶液量・体重を入力してください") }
}
