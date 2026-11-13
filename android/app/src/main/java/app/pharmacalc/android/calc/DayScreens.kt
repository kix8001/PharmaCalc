package app.pharmacalc.android.calc

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import app.pharmacalc.android.core.JPDate
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.DateRow
import app.pharmacalc.android.ui.LabeledRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.QuickButtons
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.SwitchRow
import app.pharmacalc.android.ui.WarningRow
import java.time.LocalDate
import java.time.Period
import kotlin.math.ceil

private val dayPresets = listOf(7.0, 14.0, 21.0, 28.0, 30.0, 35.0, 42.0, 56.0, 60.0, 84.0, 90.0)

@Composable
fun EndDateScreen() = CalcPage {
    var start by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var days by rememberSaveable { mutableStateOf("") }
    var fromNext by rememberSaveable { mutableStateOf(false) }
    Section {
        DateRow("処方日（調剤日）", start, { start = it })
        SwitchRow("翌日から服用開始", fromNext) { fromNext = it }
        NumField("処方日数", days, { days = it }, "日", integer = true)
        QuickButtons(dayPresets, { days = it }, "日")
    }
    val n = parseInt(days)
    if (n != null && n > 0) {
        val first = start.plusDays(if (fromNext) 1 else 0)
        val last = first.plusDays((n - 1).toLong())
        Section("結果") {
            ResultRow("服用開始日", JPDate.text(first), big = false)
            ResultRow("最終服用日", JPDate.text(last), big = false)
            ResultRow("薬がなくなる日", JPDate.text(last.plusDays(1)), note = "この日までに次の受診が必要です",
                big = false, color = Orange)
            ResultRow("週換算", "${n / 7}週＋${n % 7}日", big = false)
        }
    }
}

@Composable
fun NextVisitScreen() = CalcPage {
    var today by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var visit by rememberSaveable { mutableStateOf(LocalDate.now().plusDays(28)) }
    var includeToday by rememberSaveable { mutableStateOf(true) }
    var includeVisit by rememberSaveable { mutableStateOf(false) }
    var daily by rememberSaveable { mutableStateOf("") }
    var remain by rememberSaveable { mutableStateOf("") }
    Section(footer = "受診日の朝の分まで必要な場合は「受診日当日の分も含める」をオンにします") {
        DateRow("今日", today, { today = it })
        DateRow("次回受診日", visit, { visit = it })
        SwitchRow("今日の分を含める", includeToday) { includeToday = it }
        SwitchRow("受診日当日の分も含める", includeVisit) { includeVisit = it }
    }
    Section("数量（任意）") {
        NumField("1日量", daily, { daily = it }, "錠")
        NumField("残薬", remain, { remain = it }, "錠")
    }
    val base = JPDate.diff(today, visit)
    val need = base - (if (includeToday) 0 else 1) + (if (includeVisit) 1 else 0)
    Section("結果") {
        if (base < 0) WarningRow("受診日が今日より前になっています")
        else {
            ResultRow("必要日数", "${maxOf(need, 0)}", "日", note = "今日から受診日まで ${base}日")
            val d = parseNum(daily)
            if (d != null && d > 0) {
                val total = maxOf(need, 0) * d
                ResultRow("必要数", fmtTrim(total), "錠")
                val r = parseNum(remain)
                if (r != null && r > 0) {
                    val lack = maxOf(0.0, total - r)
                    ResultRow("残薬を引いた必要数", fmtTrim(lack), "錠")
                    ResultRow("処方日数にすると", "${ceil(lack / d - 1e-9).toInt()}", "日", note = "端数は切り上げ")
                }
            }
        }
    }
}

@Composable
fun ValidityScreen() = CalcPage {
    var issued by rememberSaveable { mutableStateOf(LocalDate.now()) }
    Section { DateRow("交付日", issued, { issued = it }) }
    val end = issued.plusDays(3)
    val n = JPDate.diff(LocalDate.now(), end)
    Section {
        ResultRow("有効期限", JPDate.text(end), big = false, color = Orange)
        ResultRow("今日から", when {
            n < 0 -> "期限切れ（${-n}日超過）"
            n == 0 -> "今日まで"
            else -> "あと${n}日"
        }, big = false)
    }
    Section("有効な4日間",
        footer = "処方箋の使用期間は交付日を含めて4日以内です（休日も含む）。長期の旅行などの特殊な事情で、医師が処方箋に別の期限を記載した場合はその日まで有効です。祝日は表示に反映していません。") {
        for (i in 0 until 4) {
            val d = issued.plusDays(i.toLong())
            LabeledRow("${i + 1}日目", JPDate.text(d), if (JPDate.isWeekend(d)) Color(0xFFE53935) else null)
        }
    }
}

@Composable
fun CycleScreen() = CalcPage {
    var start by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var on by rememberSaveable { mutableStateOf("21") }
    var off by rememberSaveable { mutableStateOf("7") }
    var cycles by rememberSaveable { mutableStateOf("3") }
    Section(footer = "例：3週投与1週休薬 → 投与21日・休薬7日、2週投与1週休薬 → 14日・7日") {
        DateRow("開始日", start, { start = it })
        NumField("投与日数", on, { on = it }, "日", integer = true)
        NumField("休薬日数", off, { off = it }, "日", integer = true)
        NumField("クール数", cycles, { cycles = it }, "クール", integer = true)
    }
    val a = parseInt(on)
    val b = parseInt(off)
    val c = parseInt(cycles)
    if (a != null && b != null && c != null && a > 0 && c in 1..50) {
        Section("合計") {
            ResultRow("投与日数の合計", "${a * c}", "日")
            ResultRow("全期間", "${(a + b) * c}", "日", note = "最後のクールの休薬期間まで含む")
        }
        for (i in 0 until c) {
            val s = start.plusDays((i * (a + b)).toLong())
            val e = s.plusDays((a - 1).toLong())
            Section("${i + 1}クール目") {
                LabeledRow("投与", "${JPDate.short(s)} 〜 ${JPDate.short(e)}", MaterialTheme.colorScheme.primary)
                if (b > 0) LabeledRow("休薬", "${JPDate.short(e.plusDays(1))} 〜 ${JPDate.short(e.plusDays(b.toLong()))}")
            }
        }
    }
}

@Composable
fun AgeScreen() = CalcPage {
    var birth by rememberSaveable { mutableStateOf(LocalDate.now().minusYears(5)) }
    var base by rememberSaveable { mutableStateOf(LocalDate.now()) }
    Section {
        DateRow("生年月日", birth, { birth = it }, max = LocalDate.now())
        DateRow("基準日", base, { base = it })
    }
    if (!base.isBefore(birth)) {
        val p = Period.between(birth, base)
        val days = JPDate.diff(birth, base)
        Section("結果") {
            ResultRow("年齢", "${p.years}歳${p.months}か月${p.days}日", big = false)
            ResultRow("月齢", "${p.years * 12 + p.months}", "か月")
            ResultRow("日齢", "$days", "日")
            ResultRow("小数の年齢", fmt(days / 365.25, 2), "歳", note = "小児薬用量の計算に使えます")
        }
    } else Section { WarningRow("基準日が生年月日より前です") }
}

