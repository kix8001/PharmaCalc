package app.pharmacalc.android.calc

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import app.pharmacalc.android.core.BodyCalc
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.Renal
import app.pharmacalc.android.core.Sex
import app.pharmacalc.android.core.fmt
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.MissingRow
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.SwitchRow
import app.pharmacalc.android.ui.WarningRow

enum class PField { AGE, SEX, HEIGHT, WEIGHT, SCR, CYS }

/** 患者情報の入力欄（必要な項目だけ） */
@Composable
fun PatientFields(fields: Set<PField>) {
    val p = Patient
    if (PField.AGE in fields) NumField("年齢", p.age, { p.age = it }, "歳")
    if (PField.SEX in fields) Choice(Sex.entries.map { it to it.label }, p.sex) { p.sex = it }
    if (PField.HEIGHT in fields) NumField("身長", p.height, { p.height = it }, "cm")
    if (PField.WEIGHT in fields) NumField("体重", p.weight, { p.weight = it }, "kg")
    if (PField.SCR in fields) NumField("血清Cr", p.scr, { p.scr = it }, "mg/dL")
    if (PField.CYS in fields) NumField("シスタチンC", p.cys, { p.cys = it }, "mg/L")
}

@Composable
fun PatientScreen() = CalcPage {
    Section(footer = "ここで入れた値は、腎機能・体表面積・用量などすべての計算で使われます。端末には保存されず、アプリを終了すると消えます。") {
        PatientFields(PField.entries.toSet())
    }
    Button(onClick = { Patient.clear() },
        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
        Text("すべてクリア")
    }
}

@Composable
fun RenalScreen() = CalcPage {
    val p = Patient
    var roundUp by rememberSaveable { mutableStateOf(false) }
    Section("患者情報（共通）") { PatientFields(PField.entries.toSet()) }
    val age = p.ageV
    if (age != null && age < 18) {
        Section { WarningRow("18歳未満は成人の式の対象外です。小児用の式を使ってください。") }
    }
    val w = p.weightV
    val h = p.heightV
    val bsa = if (w != null && h != null && w > 0 && h > 0) BodyCalc.bsaDuBois(w, h) else null

    Section("CCr（Cockcroft-Gault式）",
        footer = "CCr = (140−年齢)×体重 ÷ (72×血清Cr)、女性は×0.85\n理想体重（Devine）：男性 50＋0.91×(身長−152.4)、女性 45.5＋0.91×(身長−152.4)\n補正体重 = 理想体重＋0.4×(実体重−理想体重)") {
        SwitchRow("Crが0.6未満なら0.6として計算", roundUp) { roundUp = it }
        val cr0 = p.scrV
        if (age != null && w != null && cr0 != null && cr0 > 0 && w > 0) {
            val cr = if (roundUp) maxOf(cr0, 0.6) else cr0
            ResultRow("実体重 ${fmt(w)}kg", fmt(Renal.cockcroftGault(age, w, cr, p.sex)), "mL/min")
            if (h != null && h > 0) {
                val ibw = BodyCalc.idealWeight(h, p.sex)
                if (ibw > 0) {
                    ResultRow("理想体重 ${fmt(ibw)}kg", fmt(Renal.cockcroftGault(age, ibw, cr, p.sex)), "mL/min",
                        note = if (w < ibw) "実体重が理想体重より少ないため、実体重の値を使うのが一般的です" else null)
                    if (w > ibw) {
                        val abw = BodyCalc.adjustedWeight(w, ibw)
                        ResultRow("補正体重 ${fmt(abw)}kg", fmt(Renal.cockcroftGault(age, abw, cr, p.sex)), "mL/min",
                            note = if (w > ibw * 1.2) "実体重が理想体重の120%を超えています。補正体重での値を考慮してください" else null)
                    }
                }
            }
        } else MissingRow("年齢・体重・血清Crを入力してください")
    }

    Section("eGFR（血清Cr・日本人の式）",
        footer = "eGFR = 194 × Cr^−1.094 × 年齢^−0.287、女性は×0.739\n未補正値 = eGFR × 体表面積(DuBois) ÷ 1.73") {
        val cr = p.scrV
        if (age != null && cr != null && cr > 0 && age > 0) {
            val e = Renal.egfrCr(age, cr, p.sex)
            ResultRow("eGFR", fmt(e), "mL/min/1.73m²", note = Renal.stage(e))
            if (bsa != null) {
                ResultRow("体表面積未補正（BSA ${fmt(bsa, 2)}m²）", fmt(Renal.deindex(e, bsa)), "mL/min",
                    note = "薬の投与量の判断にはこちらを使います")
            } else MissingRow("身長・体重を入れると、体表面積で補正しない値も出します")
        } else MissingRow("年齢・血清Crを入力してください")
    }

    Section("eGFR（シスタチンC）",
        footer = "eGFRcys = 104 × CysC^−1.019 × 0.996^年齢（女性は×0.929）− 8\n筋肉量が極端に少ない・多い人では血清Crより正確なことがあります") {
        val c = p.cysV
        if (age != null && c != null && c > 0 && age > 0) {
            val e = Renal.egfrCys(age, c, p.sex)
            ResultRow("eGFRcys", fmt(e), "mL/min/1.73m²", note = Renal.stage(e))
            if (bsa != null) ResultRow("体表面積未補正", fmt(Renal.deindex(e, bsa)), "mL/min")
        } else MissingRow("年齢・シスタチンCを入力してください")
    }
}

@Composable
fun BodyScreen() = CalcPage {
    val p = Patient
    Section("患者情報（共通）") { PatientFields(setOf(PField.SEX, PField.HEIGHT, PField.WEIGHT)) }
    val w = p.weightV
    val h = p.heightV
    if (w != null && h != null && w > 0 && h > 0) {
        Section("体表面積（BSA）",
            footer = "DuBois：0.007184 × W^0.425 × H^0.725\n藤本：0.008883 × W^0.444 × H^0.663\nMosteller：√(H×W÷3600)") {
            ResultRow("DuBois式", fmt(BodyCalc.bsaDuBois(w, h), 3), "m²")
            ResultRow("藤本式", fmt(BodyCalc.bsaFujimoto(w, h), 3), "m²")
            ResultRow("Mosteller式", fmt(BodyCalc.bsaMosteller(w, h), 3), "m²")
        }
        Section("体格") {
            val b = BodyCalc.bmi(w, h)
            ResultRow("BMI", fmt(b), note = BodyCalc.bmiCategory(b) + "（日本肥満学会の基準）")
            ResultRow("標準体重（BMI 22）", fmt(BodyCalc.standardWeight(h)), "kg")
            val ibw = BodyCalc.idealWeight(h, p.sex)
            ResultRow("理想体重（Devine）", fmt(ibw), "kg")
            if (w > ibw) ResultRow("補正体重", fmt(BodyCalc.adjustedWeight(w, ibw)), "kg")
        }
    } else Section { MissingRow("身長・体重を入力してください") }
}
