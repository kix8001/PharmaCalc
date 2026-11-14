package app.pharmacalc.android.calc

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import kotlin.math.floor
import kotlin.math.roundToLong

@Composable
fun LabScreen() = CalcPage {
    var ca by rememberSaveable { mutableStateOf("") }
    var alb by rememberSaveable { mutableStateOf("") }
    var bil by rememberSaveable { mutableStateOf("") }
    var alb2 by rememberSaveable { mutableStateOf("") }
    var inr by rememberSaveable { mutableStateOf("") }
    var ascites by rememberSaveable { mutableIntStateOf(1) }
    var enceph by rememberSaveable { mutableIntStateOf(1) }
    Section("補正カルシウム（Payne式）", footer = "補正Ca = 血清Ca＋(4−アルブミン)。アルブミンが4g/dL以上なら補正しません。") {
        NumField("血清Ca", ca, { ca = it }, "mg/dL")
        NumField("アルブミン", alb, { alb = it }, "g/dL")
        val c = parseNum(ca); val a = parseNum(alb)
        if (c != null && a != null && c > 0 && a > 0) {
            val corr = if (a < 4) c + (4 - a) else c
            ResultRow("補正Ca", fmt(corr, 1), "mg/dL", color = Orange,
                note = when {
                    corr > 10.4 -> "高カルシウム血症の目安（10.4mg/dL超）"
                    corr < 8.5 -> "低カルシウム血症の目安（8.5mg/dL未満）"
                    else -> null
                })
        }
    }
    Section("Child-Pugh分類",
        footer = "ビリルビン：2未満1点、2〜3は2点、3超3点。アルブミン：3.5超1点、2.8〜3.5は2点、2.8未満3点。PT-INR：1.7未満1点、1.7〜2.3は2点、2.3超3点。A：5〜6点、B：7〜9点、C：10〜15点。") {
        NumField("総ビリルビン", bil, { bil = it }, "mg/dL")
        NumField("アルブミン", alb2, { alb2 = it }, "g/dL")
        NumField("PT-INR", inr, { inr = it })
        Text("腹水")
        Choice(listOf(1 to "なし", 2 to "軽度", 3 to "中等度以上"), ascites) { ascites = it }
        Text("肝性脳症")
        Choice(listOf(1 to "なし", 2 to "軽度（I・II度）", 3 to "昏睡（III度以上）"), enceph) { enceph = it }
        val b = parseNum(bil); val a = parseNum(alb2); val i = parseNum(inr)
        if (b != null && a != null && i != null) {
            val sb = if (b < 2) 1 else if (b <= 3) 2 else 3
            val sa = if (a > 3.5) 1 else if (a >= 2.8) 2 else 3
            val si = if (i < 1.7) 1 else if (i <= 2.3) 2 else 3
            val total = sb + sa + si + ascites + enceph
            val grade = if (total <= 6) "A" else if (total <= 9) "B" else "C"
            ResultRow("Child-Pugh", "$grade（${total}点）", color = Orange,
                note = "ビリルビン${sb}・アルブミン${sa}・PT-INR${si}・腹水${ascites}・脳症${enceph}点")
        }
    }
}

/** 1剤1日分（1調剤単位）の薬価から点数：15円以下は1点、それを超えると10で割って五捨五超入 */
fun drugPoints(yen: Double): Int {
    if (yen <= 15) return 1
    val x = yen / 10
    val fl = floor(x)
    return (if (x - fl > 0.5 + 1e-9) fl + 1 else fl).toInt()
}

@Composable
fun FeeScreen() = CalcPage {
    val prices = remember { mutableStateListOf("", "", "") }
    val days = remember { mutableStateListOf("", "", "") }
    var other by rememberSaveable { mutableStateOf("") }
    var rate by rememberSaveable { mutableIntStateOf(3) }
    for (i in prices.indices) {
        Section("${i + 1}剤目") {
            NumField("1日分の薬価の合計", prices[i], { prices[i] = it }, "円")
            NumField("日数・回数", days[i], { days[i] = it }, "日", integer = true)
            val p = parseNum(prices[i]); val d = parseInt(days[i])
            if (p != null && p > 0 && d != null && d > 0) {
                ResultRow("薬剤料", "${drugPoints(p) * d}", "点", big = false, note = "${drugPoints(p)}点 × $d")
            }
        }
    }
    TextButton(onClick = { prices.add(""); days.add("") }) { Text("剤を追加") }
    Section(footer = "その他の点数には、調剤基本料・薬剤調製料・調剤管理料・服薬管理指導料などの合計を入れます。") {
        NumField("その他の点数（任意）", other, { other = it }, "点")
        Choice(listOf(1 to "1割", 2 to "2割", 3 to "3割"), rate) { rate = it }
    }
    var drug = 0
    for (i in prices.indices) {
        val p = parseNum(prices[i]); val d = parseInt(days[i])
        if (p != null && p > 0 && d != null && d > 0) drug += drugPoints(p) * d
    }
    val total = drug + (parseInt(other) ?: 0)
    if (total > 0) {
        val yen = total * 10
        val pay = (yen * rate / 10.0 / 10.0).roundToLong() * 10
        Section("結果", footer = "内服薬は1剤の1日分、頓服・外用は1調剤分の薬価で計算します（日数・回数には頓服・外用なら1を入れます）。窓口負担は10円未満を四捨五入。公費・高額療養費・上限額は考慮していません。") {
            ResultRow("薬剤料の合計", "$drug", "点", big = false)
            ResultRow("合計", "$total", "点", note = "${yen}円")
            ResultRow("窓口負担（${rate}割）", "$pay", "円", color = Orange)
        }
    }
}
