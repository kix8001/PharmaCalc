package app.pharmacalc.android.calc

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.WarningRow
import kotlin.math.ceil
import kotlin.math.floor

private val sheetSizes = listOf(6, 7, 10, 12, 14, 20, 21, 28)

fun sheetBreakdown(total: Double, size: Int): Pair<Int, Double> {
    val sheets = floor(total / size + 1e-9).toInt()
    return sheets to maxOf(0.0, total - sheets * size)
}

@Composable
fun SheetSizePicker(size: Int, onSize: (Int) -> Unit, custom: String, onCustom: (String) -> Unit) {
    Choice(sheetSizes.map { it to "${it}錠" } + listOf(0 to "その他"), size, onSize)
    if (size == 0) NumField("1シートの錠数", custom, onCustom, "錠", integer = true)
}

@Composable
fun RemainingScreen() = CalcPage {
    var daily by rememberSaveable { mutableStateOf("") }
    var days by rememberSaveable { mutableStateOf("") }
    var remain by rememberSaveable { mutableStateOf("") }
    Section {
        NumField("1日量", daily, { daily = it }, "錠")
        NumField("処方日数", days, { days = it }, "日", integer = true)
        NumField("残薬", remain, { remain = it }, "錠")
    }
    val d = parseNum(daily)
    val n = parseInt(days)
    if (d != null && d > 0 && n != null && n > 0) {
        val r = maxOf(0.0, parseNum(remain) ?: 0.0)
        val covered = floor(r / d + 1e-9).toInt()
        val frac = r - covered * d
        val adj = maxOf(0, n - covered)
        Section("日数で調整") {
            ResultRow("残薬で足りる日数", "$covered", "日")
            ResultRow("調整後の処方日数", "$adj", "日", color = Orange)
            ResultRow("調整後の処方数", fmtTrim(adj * d), "錠",
                note = if (frac > 0.0001) "1日分に満たない残薬 ${fmtTrim(frac)}錠 が手元に残ります" else null)
        }
        Section("総数で調整") {
            ResultRow("必要数 − 残薬", fmtTrim(maxOf(0.0, d * n - r)), "錠",
                note = "総数で調整する場合（日数は変えずに数量だけ減らす）")
        }
        if (covered >= n) Section { WarningRow("残薬だけで処方日数分が足ります") }
    }
}

@Composable
fun SheetScreen() = CalcPage {
    var useDaily by rememberSaveable { mutableStateOf(false) }
    var total by rememberSaveable { mutableStateOf("") }
    var daily by rememberSaveable { mutableStateOf("") }
    var days by rememberSaveable { mutableStateOf("") }
    var size by rememberSaveable { mutableIntStateOf(10) }
    var custom by rememberSaveable { mutableStateOf("") }
    Section {
        Choice(listOf(false to "総数", true to "1日量×日数"), useDaily) { useDaily = it }
        if (useDaily) {
            NumField("1日量", daily, { daily = it }, "錠")
            NumField("日数", days, { days = it }, "日", integer = true)
        } else NumField("総数", total, { total = it }, "錠")
        SheetSizePicker(size, { size = it }, custom, { custom = it })
    }
    val s = if (size == 0) parseInt(custom) ?: 0 else size
    val t: Double? = if (useDaily) {
        val d = parseNum(daily); val n = parseInt(days)
        if (d != null && n != null) d * n else null
    } else parseNum(total)
    if (t != null && t > 0 && s > 0) {
        val (sheets, rest) = sheetBreakdown(t, s)
        val up = ceil(t / s - 1e-9).toInt()
        Section("結果") {
            ResultRow("総数", fmtTrim(t), "錠")
            ResultRow("シート", "$sheets", "シート", color = Orange)
            ResultRow("バラ", fmtTrim(rest), "錠")
            ResultRow("シートで揃えるなら", "$up", "シート", note = "${up * s}錠（端数を切り上げ）", big = false)
        }
    }
}

@Composable
fun UnevenScreen() = CalcPage {
    var m by rememberSaveable { mutableStateOf("") }
    var no by rememberSaveable { mutableStateOf("") }
    var ev by rememberSaveable { mutableStateOf("") }
    var bed by rememberSaveable { mutableStateOf("") }
    var days by rememberSaveable { mutableStateOf("") }
    var size by rememberSaveable { mutableIntStateOf(10) }
    var custom by rememberSaveable { mutableStateOf("") }
    Section("1回量") {
        NumField("朝", m, { m = it }, "錠")
        NumField("昼", no, { no = it }, "錠")
        NumField("夕", ev, { ev = it }, "錠")
        NumField("寝る前", bed, { bed = it }, "錠")
    }
    Section {
        NumField("日数", days, { days = it }, "日", integer = true)
        SheetSizePicker(size, { size = it }, custom, { custom = it })
    }
    val perDay = listOf(m, no, ev, bed).mapNotNull { parseNum(it) }.sum()
    val n = parseInt(days)
    if (perDay > 0 && n != null && n > 0) {
        val total = perDay * n
        val s = if (size == 0) parseInt(custom) ?: 0 else size
        Section("結果") {
            ResultRow("1日量", fmtTrim(perDay), "錠")
            ResultRow("総数", fmtTrim(total), "錠", color = Orange)
            if (s > 0) {
                val (sh, rest) = sheetBreakdown(total, s)
                ResultRow("シート換算", "${sh}シート＋${fmtTrim(rest)}錠", big = false)
            }
        }
    }
}
