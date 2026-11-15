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
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    Choice(listOf<Pair<String?, String>>(null to "すべて") + PedDrugStore.categories.map { it to it }, category) { category = it }
    PedDrugStore.categories.filter { category == null || it == category }.forEach { c ->
        val list = PedDrugStore.drugs.filter {
            (it.category ?: "自分で追加") == c && app.pharmacalc.android.core.matchesSearch(it.name + it.ingredient, query)
        }
        if (list.isNotEmpty()) Section(c) {
            list.forEachIndexed { i, d ->
                if (i > 0) Divider()
                PedDrugRow(d, p.ageV, p.weightV, Modifier.clickable { edit(d.id) })
            }
        }
    }
    Section(footer = "初期登録は PMDA の電子添文（2026年11月）の用法及び用量と照合しています。適応症で用量が違う薬もあるので、迷ったらタップして「添付文書を見る」で確認してください。「用量未登録」の薬は、タップして用量を入れられます。") {
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
            val ad = if (d.amount == "μg") 1 else 2
            val a = d.amount
            if (d.hasProduct) {
                Text("1日 ${range(r.dailyLo, r.dailyHi, ad)}$a → ${range(r.dailyLo / d.conc, r.dailyHi / d.conc, dg)}${d.unit}",
                    color = MaterialTheme.colorScheme.primary)
                Text("1回 ${range(r.doseLo, r.doseHi, ad)}$a → ${range(r.doseLo / d.conc, r.doseHi / d.conc, dg)}${d.unit}（1日${r.times}回）")
            } else {
                Text("1日 ${range(r.dailyLo, r.dailyHi, ad)}$a", color = MaterialTheme.colorScheme.primary)
                Text("1回 ${range(r.doseLo, r.doseHi, ad)}$a（1日${r.times}回）")
            }
            if (r.capped) Text("上限で頭打ちにしています", style = MaterialTheme.typography.bodySmall, color = Orange)
        } else if (err.isNullOrEmpty()) {
            if (d.note.contains("添付文書で用量を確認")) {
                Text("用量未登録", style = MaterialTheme.typography.labelMedium, color = Orange)
            }
        } else {
            Text(err, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (d.note.isNotEmpty()) {
            Text(d.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private class BandText(below: String = "", min: String = "", max: String = "", times: String = "", perKg: Boolean = false) {
    var perKg by mutableStateOf(perKg)
    var below by mutableStateOf(below)
    var min by mutableStateOf(min)
    var max by mutableStateOf(max)
    var times by mutableStateOf(times)
}

private enum class Form3 { POWDER, SYRUP, OTHER }

/** 薬の追加・編集 */
@Composable
fun PedDrugEditScreen(id: String?, done: () -> Unit) = CalcPage {
    val original = remember(id) { PedDrugStore.drugs.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(original?.name ?: "") }
    var ingredient by remember { mutableStateOf(original?.ingredient ?: "") }
    var category by remember { mutableStateOf(original?.category ?: "") }
    var form by remember {
        mutableStateOf(if (original?.formUnit != null) Form3.OTHER else if (original?.isSyrup == true) Form3.SYRUP else Form3.POWDER)
    }
    var formUnit by remember { mutableStateOf(original?.formUnit ?: "錠") }
    var microgram by remember { mutableStateOf(original?.amountUnit == "μg") }
    var conc by remember { mutableStateOf(original?.conc?.takeIf { it > 0 }?.let { fmtTrim(it, 3) } ?: "") }
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
            original?.bands?.forEach { add(BandText(fmtTrim(it.below, 1), fmtTrim(it.min, 2), fmtTrim(it.max, 2), it.times?.toString() ?: "", it.perKg)) }
            if (isEmpty()) add(BandText())
        }
    }
    val au = if (microgram) "μg" else "mg"

    fun build(): PedDrug? {
        if (name.isBlank()) return null
        val t = parseInt(times) ?: return null
        if (t <= 0) return null
        var d = PedDrug(id = original?.id ?: java.util.UUID.randomUUID().toString(), name = name.trim(), ingredient = ingredient.trim(),
            isSyrup = form == Form3.SYRUP, conc = maxOf(0.0, parseNum(conc) ?: 0.0), basis = basis, times = t, note = note.trim(),
            maxDoseMg = parseNum(maxDose)?.takeIf { it > 0 }, maxDailyMg = parseNum(maxDaily)?.takeIf { it > 0 },
            maxDailyPerKg = parseNum(maxDailyPerKg)?.takeIf { it > 0 },
            category = category.trim().ifEmpty { null }, formUnit = if (form == Form3.OTHER) formUnit.trim() else null,
            amountUnit = if (microgram) "μg" else null, pmda = original?.pmda)
        when (basis) {
            DoseBasis.AGE, DoseBasis.WEIGHT -> {
                val list = bands.mapNotNull { b ->
                    val bl = parseNum(b.below)
                    if (bl == null || bl <= 0) null
                    else {
                        val lo = parseNum(b.min) ?: 0.0
                        AgeBand(bl, lo, maxOf(lo, parseNum(b.max) ?: lo), parseInt(b.times)?.takeIf { it > 0 }, b.perKg)
                    }
                }
                if (list.isEmpty()) return null
                d = d.copy(bands = list)
            }
            DoseBasis.DAY, DoseBasis.DOSE -> {
                val lo = parseNum(minPerKg) ?: return null
                if (lo <= 0) return null
                d = d.copy(minPerKg = lo, maxPerKg = maxOf(lo, parseNum(maxPerKg) ?: lo))
            }
            DoseBasis.MEMO -> {}
        }
        return d
    }

    Section {
        OutlinedTextField(name, { name = it }, singleLine = true, label = { Text("薬の名前（例：ムコダインDS50%）") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(ingredient, { ingredient = it }, singleLine = true, label = { Text("成分名（任意）") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(category, { category = it }, singleLine = true, label = { Text("分類（任意、例：抗菌薬）") }, modifier = Modifier.fillMaxWidth())
    }
    Section("剤形", footer = "例：50%散 → 500mg、10%DS → 100mg、5%シロップ → 50mg（1mLあたり）。0や空欄なら製剤量は出さず、成分量だけ出します。") {
        Choice(listOf(Form3.POWDER to "散・DS（g）", Form3.SYRUP to "シロップ（mL）", Form3.OTHER to "その他"), form) { form = it }
        if (form == Form3.OTHER) {
            OutlinedTextField(formUnit, { formUnit = it }, singleLine = true, label = { Text("単位（錠・包・個・枚など）") }, modifier = Modifier.fillMaxWidth())
        }
        Choice(listOf(false to "mg", true to "μg"), microgram) { microgram = it }
        val per = when (form) { Form3.POWDER -> "g"; Form3.SYRUP -> "mL"; Form3.OTHER -> formUnit }
        NumField("1${per}あたりの成分量", conc, { conc = it }, au)
    }
    Section("用量") {
        Choice(DoseBasis.entries.map { it to it.label }, basis) { basis = it }
        when (basis) {
            DoseBasis.AGE, DoseBasis.WEIGHT -> {
                val k = if (basis == DoseBasis.AGE) "歳" else "kg"
                bands.toList().forEachIndexed { i, b ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SmallField(b.below, { b.below = it }, k, Modifier.width(64.dp))
                        Text("${k}未満 ", style = MaterialTheme.typography.bodySmall)
                        SmallField(b.min, { b.min = it }, "最小", Modifier.weight(1f))
                        Text("〜")
                        SmallField(b.max, { b.max = it }, "最大", Modifier.weight(1f))
                        IconButton(onClick = { bands.removeAt(i) }) { Icon(Icons.Filled.RemoveCircle, "削除", tint = Color(0xFFE53935)) }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (b.perKg) "${au}/kg/日　この範囲の1日の回数（任意）" else "${au}/日　この範囲の1日の回数（任意）",
                            style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        SmallField(b.times, { b.times = it }, "回", Modifier.width(72.dp))
                    }
                    app.pharmacalc.android.ui.SwitchRow("体重1kgあたりの量", b.perKg) { b.perKg = it }
                }
                TextButton(onClick = { bands.add(BandText()) }) { Text("区切りを追加") }
                Text("最小・最大を0にすると「用量の記載なし」と表示します（対象年齢外など）。",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            DoseBasis.DAY, DoseBasis.DOSE -> {
                val u = if (basis == DoseBasis.DAY) "$au/kg/日" else "$au/kg/回"
                NumField("最小", minPerKg, { minPerKg = it }, u)
                NumField("最大（任意）", maxPerKg, { maxPerKg = it }, u)
            }
            DoseBasis.MEMO -> Text("用量は計算せず、メモだけ表示します。", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        NumField("1日の回数", times, { times = it }, "回", integer = true)
    }
    if (basis != DoseBasis.MEMO) Section("上限（任意）") {
        NumField("1回の上限", maxDose, { maxDose = it }, au)
        NumField("1日の上限", maxDaily, { maxDaily = it }, au)
        NumField("1日の上限（体重あたり）", maxDailyPerKg, { maxDailyPerKg = it }, "$au/kg")
    }
    Section("メモ") {
        OutlinedTextField(note, { note = it }, label = { Text("用法の注意など") }, modifier = Modifier.fillMaxWidth())
    }
    original?.pmdaUrl?.let { url ->
        val ctx = androidx.compose.ui.platform.LocalContext.current
        Section(footer = "同じ成分の製品の一覧が開きます。目的の製品の「HTML」か「PDF」を選んでください。") {
            TextButton(onClick = { app.pharmacalc.android.barcode.PMDA.open(ctx, url) }) { Text("添付文書を見る（PMDA）") }
        }
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
