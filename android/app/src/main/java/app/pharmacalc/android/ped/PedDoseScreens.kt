package app.pharmacalc.android.ped

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.core.fmtTrim
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.core.parseNum
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Choice
import app.pharmacalc.android.ui.Divider
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.Section

/** 小児用量（薬剤別）：年齢・体重から登録した薬の用量を一覧で出す */
@Composable
fun PedDoseScreen(edit: (String?) -> Unit) = CalcPage {
    val p = Patient
    var query by rememberSaveable { mutableStateOf("") }
    Section("患者情報（共通）", footer = "年齢は小数でも入れられます（例：1歳6か月 → 1.5）。") {
        NumField("年齢", p.age, { p.age = it }, "歳")
        NumField("体重", p.weight, { p.weight = it }, "kg")
    }
    OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("薬の名前・成分で絞り込む") },
        leadingIcon = { Icon(Icons.Filled.Search, null) }, modifier = Modifier.fillMaxWidth())
    val list = PedDrugStore.drugs.filter { query.isEmpty() || (it.name + it.ingredient).contains(query, ignoreCase = true) }
    Section("薬（タップで編集）",
        footer = "初期登録は添付文書の小児用量をもとにした目安です。適応症・剤形で用量が違う場合があるので、必ず最新の添付文書で確認してください。") {
        list.forEachIndexed { i, d ->
            if (i > 0) Divider()
            PedDrugRow(d, p.ageV, p.weightV, Modifier.clickable { edit(d.id) })
        }
        TextButton(onClick = { edit(null) }) {
            Icon(Icons.Filled.AddCircle, null); Text("  薬を追加")
        }
    }
    TextButton(onClick = { PedDrugStore.reset() }) { Text("初期の薬に戻す", color = MaterialTheme.colorScheme.error) }
}

@Composable
private fun PedDrugRow(d: PedDrug, age: Double?, weight: Double?, modifier: Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(d.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            if (d.ingredient.isNotEmpty()) {
                Text("  ${d.ingredient}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val (r, err) = d.compute(age, weight)
        if (r != null) {
            val dg = if (d.isSyrup) 1 else 2
            Text("1日 ${range(r.dailyLo, r.dailyHi, 1)}mg → ${range(r.dailyLo / d.conc, r.dailyHi / d.conc, dg)}${d.unit}",
                color = MaterialTheme.colorScheme.primary)
            Text("1回 ${range(r.doseLo, r.doseHi, 1)}mg → ${range(r.doseLo / d.conc, r.doseHi / d.conc, dg)}${d.unit}（1日${r.times}回）")
            if (r.capped) Text("上限で頭打ちにしています", style = MaterialTheme.typography.bodySmall, color = Orange)
        } else {
            Text(err ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (d.note.isNotEmpty()) {
            Text(d.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private class BandText(below: String = "", min: String = "", max: String = "") {
    var below by mutableStateOf(below)
    var min by mutableStateOf(min)
    var max by mutableStateOf(max)
}

/** 薬の追加・編集 */
@Composable
fun PedDrugEditScreen(id: String?, done: () -> Unit) = CalcPage {
    val original = remember(id) { PedDrugStore.drugs.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(original?.name ?: "") }
    var ingredient by remember { mutableStateOf(original?.ingredient ?: "") }
    var isSyrup by remember { mutableStateOf(original?.isSyrup ?: false) }
    var conc by remember { mutableStateOf(original?.conc?.let { fmtTrim(it, 3) } ?: "") }
    var basis by remember { mutableStateOf(original?.basis ?: DoseBasis.DAY) }
    var minPerKg by remember { mutableStateOf(original?.minPerKg?.takeIf { it > 0 }?.let { fmtTrim(it, 3) } ?: "") }
    var maxPerKg by remember { mutableStateOf(original?.maxPerKg?.takeIf { it > 0 }?.let { fmtTrim(it, 3) } ?: "") }
    var times by remember { mutableStateOf("${original?.times ?: 3}") }
    var maxDose by remember { mutableStateOf(original?.maxDoseMg?.let { fmtTrim(it, 2) } ?: "") }
    var maxDaily by remember { mutableStateOf(original?.maxDailyMg?.let { fmtTrim(it, 2) } ?: "") }
    var maxDailyPerKg by remember { mutableStateOf(original?.maxDailyPerKg?.let { fmtTrim(it, 2) } ?: "") }
    var note by remember { mutableStateOf(original?.note ?: "") }
    val bands = remember {
        mutableStateListOf<BandText>().apply {
            original?.bands?.forEach { add(BandText(fmtTrim(it.below, 1), fmtTrim(it.min, 1), fmtTrim(it.max, 1))) }
            if (isEmpty()) add(BandText())
        }
    }

    fun build(): PedDrug? {
        if (name.isBlank()) return null
        val c = parseNum(conc) ?: return null
        val t = parseInt(times) ?: return null
        if (c <= 0 || t <= 0) return null
        var d = PedDrug(id = original?.id ?: java.util.UUID.randomUUID().toString(), name = name.trim(), ingredient = ingredient.trim(),
            isSyrup = isSyrup, conc = c, basis = basis, times = t, note = note.trim(),
            maxDoseMg = parseNum(maxDose)?.takeIf { it > 0 }, maxDailyMg = parseNum(maxDaily)?.takeIf { it > 0 },
            maxDailyPerKg = parseNum(maxDailyPerKg)?.takeIf { it > 0 })
        if (basis == DoseBasis.AGE) {
            val list = bands.mapNotNull { b ->
                val bl = parseNum(b.below); val lo = parseNum(b.min)
                if (bl == null || lo == null || bl <= 0 || lo <= 0) null
                else AgeBand(bl, lo, maxOf(lo, parseNum(b.max) ?: lo))
            }
            if (list.isEmpty()) return null
            d = d.copy(bands = list)
        } else {
            val lo = parseNum(minPerKg) ?: return null
            if (lo <= 0) return null
            d = d.copy(minPerKg = lo, maxPerKg = maxOf(lo, parseNum(maxPerKg) ?: lo))
        }
        return d
    }

    Section(footer = "例：50%散 → 500mg、10%DS → 100mg、5%シロップ → 50mg（1mLあたり）") {
        OutlinedTextField(name, { name = it }, singleLine = true, label = { Text("薬の名前（例：ムコダインDS50%）") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(ingredient, { ingredient = it }, singleLine = true, label = { Text("成分名（任意）") }, modifier = Modifier.fillMaxWidth())
        Choice(listOf(false to "散・DS（g）", true to "シロップ（mL）"), isSyrup) { isSyrup = it }
        NumField(if (isSyrup) "1mLあたりの成分量" else "1gあたりの成分量", conc, { conc = it }, "mg")
    }
    Section("用量") {
        Choice(DoseBasis.entries.map { it to it.label }, basis) { basis = it }
        if (basis == DoseBasis.AGE) {
            bands.toList().forEachIndexed { i, b ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SmallField(b.below, { b.below = it }, "歳", Modifier.width(64.dp))
                    Text("歳未満 ", style = MaterialTheme.typography.bodySmall)
                    SmallField(b.min, { b.min = it }, "最小", Modifier.weight(1f))
                    Text("〜")
                    SmallField(b.max, { b.max = it }, "最大", Modifier.weight(1f))
                    Text("mg/日", style = MaterialTheme.typography.bodySmall)
                    IconButton(onClick = { bands.removeAt(i) }) { Icon(Icons.Filled.RemoveCircle, "削除", tint = Color(0xFFE53935)) }
                }
            }
            TextButton(onClick = { bands.add(BandText()) }) { Text("年齢の区切りを追加") }
        } else {
            val u = if (basis == DoseBasis.DAY) "mg/kg/日" else "mg/kg/回"
            NumField("最小", minPerKg, { minPerKg = it }, u)
            NumField("最大（任意）", maxPerKg, { maxPerKg = it }, u)
        }
        NumField("1日の回数", times, { times = it }, "回", integer = true)
    }
    Section("上限（任意）") {
        NumField("1回の上限", maxDose, { maxDose = it }, "mg")
        NumField("1日の上限", maxDaily, { maxDaily = it }, "mg")
        NumField("1日の上限（体重あたり）", maxDailyPerKg, { maxDailyPerKg = it }, "mg/kg")
    }
    Section("メモ") {
        OutlinedTextField(note, { note = it }, label = { Text("用法の注意など") }, modifier = Modifier.fillMaxWidth())
    }
    val built = build()
    Button(onClick = { built?.let { PedDrugStore.upsert(it); done() } }, enabled = built != null, modifier = Modifier.fillMaxWidth()) {
        Text("保存")
    }
    if (original != null) {
        OutlinedButton(onClick = { PedDrugStore.remove(original.id); done() }, modifier = Modifier.fillMaxWidth()) {
            Text("この薬を削除", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun SmallField(value: String, onChange: (String) -> Unit, hint: String, modifier: Modifier) {
    OutlinedTextField(value, onChange, singleLine = true, placeholder = { Text(hint) }, modifier = modifier,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
}
