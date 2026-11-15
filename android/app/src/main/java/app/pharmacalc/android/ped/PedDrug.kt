package app.pharmacalc.android.ped

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateListOf
import app.pharmacalc.android.core.ageText
import app.pharmacalc.android.core.fmtTrim
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** 年齢別・体重別の用量（〜未満なら 1日 min〜max）。min・max とも0なら「この範囲は用量の記載なし」 */
data class AgeBand(val below: Double, val min: Double, val max: Double, val times: Int? = null, val perKg: Boolean = false,
                   /** true なら min・max は1回量（false なら1日量） */
                   val perDose: Boolean = false) {
    val notIndicated get() = min <= 0 && max <= 0
}

/** 用量の決め方 */
enum class DoseBasis(val label: String) {
    DAY("体重あたり（1日）"), DOSE("体重あたり（1回）"), AGE("年齢別"), WEIGHT("体重別"), MEMO("メモだけ")
}

/** 小児用量を計算する薬（ユーザーが追加・編集できる）。iOS 版の PedDrug と同じ */
data class PedDrug(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val ingredient: String = "",
    /** true: シロップ（mL）、false: 散・DS（g）。formUnit があればそちらを使う */
    val isSyrup: Boolean,
    /** 製剤1g・1mL・1単位あたりの成分量。0なら製剤量は出さない */
    val conc: Double,
    val basis: DoseBasis,
    val minPerKg: Double = 0.0,
    val maxPerKg: Double = 0.0,
    val times: Int = 3,
    val maxDoseMg: Double? = null,
    val maxDailyMg: Double? = null,
    val maxDailyPerKg: Double? = null,
    val bands: List<AgeBand> = emptyList(),
    val note: String = "",
    val category: String? = null,
    /** 錠・包・個・枚など（散・シロップ以外） */
    val formUnit: String? = null,
    /** 成分量の単位（"mg" か "μg"） */
    val amountUnit: String? = null,
    /** PMDA の一般名ごとの一覧を開くための YJ コード先頭7桁 */
    val pmda: String? = null,
) {
    val pmdaUrl get() = pmda?.let { "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/$it" }
    val unit get() = formUnit ?: if (isSyrup) "mL" else "g"
    val amount get() = amountUnit ?: "mg"
    val hasProduct get() = conc > 0

    class Result(val dailyLo: Double, val dailyHi: Double, val doseLo: Double, val doseHi: Double,
                 val times: Int, val capped: Boolean,
                 /** 年齢別・体重別で、どの区切りの用量を使ったか（例：「1歳未満」） */
                 val bandLabel: String? = null)

    /** 年齢（歳）と体重（kg）から用量を出す。出せないときは理由（MEMO のときは空文字） */
    fun compute(age: Double?, weight: Double?): Pair<Result?, String?> {
        val t = max(1, times)
        return when (basis) {
            DoseBasis.MEMO -> null to ""
            DoseBasis.DAY -> {
                if (weight == null || weight <= 0) return null to "体重を入れてください"
                var hi = maxPerKg * weight
                var capped = false
                maxDailyPerKg?.let { if (hi > it * weight) { hi = it * weight; capped = true } }
                maxDailyMg?.let { if (hi > it) { hi = it; capped = true } }
                val lo = min(minPerKg * weight, hi)
                Result(lo, hi, lo / t, hi / t, t, capped) to null
            }
            DoseBasis.DOSE -> {
                if (weight == null || weight <= 0) return null to "体重を入れてください"
                var hi = maxPerKg * weight
                var capped = false
                maxDoseMg?.let { if (hi > it) { hi = it; capped = true } }
                val lo = min(minPerKg * weight, hi)
                var dHi = hi * t
                maxDailyPerKg?.let { if (dHi > it * weight) { dHi = it * weight; capped = true } }
                maxDailyMg?.let { if (dHi > it) { dHi = it; capped = true } }
                Result(min(lo * t, dHi), dHi, lo, hi, t, capped) to null
            }
            DoseBasis.AGE, DoseBasis.WEIGHT -> {
                val key = if (basis == DoseBasis.AGE) {
                    if (age == null || age < 0) return null to "年齢を入れてください"
                    age
                } else {
                    if (weight == null || weight <= 0) return null to "体重を入れてください"
                    weight
                }
                val sorted = bands.sortedBy { it.below }
                val i = sorted.indexOfFirst { key < it.below }
                if (i < 0) return null to "登録した範囲の外です"
                val b = sorted[i]
                if (b.notIndicated) return null to "この年齢・体重では用量の記載がありません"
                val bt = max(1, b.times ?: t)
                var lo = b.min
                var hi = b.max
                if (b.perKg) {
                    if (weight == null || weight <= 0) return null to "体重を入れてください"
                    lo *= weight; hi *= weight
                }
                // 上限（登録してあれば年齢別・体重別にも使う）
                var capped = false
                var dLo: Double
                var dHi: Double
                if (b.perDose) {
                    maxDoseMg?.let { if (hi > it) { hi = it; capped = true } }
                    lo = min(lo, hi)
                    dLo = lo * bt; dHi = hi * bt
                } else {
                    dLo = lo; dHi = hi
                }
                if (weight != null) maxDailyPerKg?.let { if (dHi > it * weight) { dHi = it * weight; capped = true } }
                maxDailyMg?.let { if (dHi > it) { dHi = it; capped = true } }
                dLo = min(dLo, dHi)
                var oLo = dLo / bt
                var oHi = dHi / bt
                if (!b.perDose) maxDoseMg?.let {
                    if (oHi > it) { oHi = it; oLo = min(oLo, it); dHi = it * bt; dLo = min(dLo, dHi); capped = true }
                }
                val f: (Double) -> String = if (basis == DoseBasis.AGE) ::ageText else { w -> "${fmtTrim(w, 1)}kg" }
                val lower = if (i > 0) sorted[i - 1].below else null
                val label = when {
                    sorted.size <= 1 -> null
                    lower == null -> "${f(b.below)}未満"
                    b.below >= 100 -> "${f(lower)}以上"
                    else -> "${f(lower)}〜${f(b.below)}未満"
                }
                Result(dLo, dHi, oLo, oHi, bt, capped, label) to null
            }
        }
    }
}

fun range(a: Double, b: Double, digits: Int): String =
    if (abs(a - b) < 1e-9) fmtTrim(a, digits) else "${fmtTrim(a, digits)}〜${fmtTrim(b, digits)}"

private fun JSONObject.optDoubleOrNull(k: String): Double? = if (has(k) && !isNull(k)) getDouble(k) else null
private fun JSONObject.optIntOrNull(k: String): Int? = if (has(k) && !isNull(k)) getInt(k) else null
private fun JSONObject.optStringOrNull(k: String): String? = if (has(k) && !isNull(k)) getString(k) else null

/** 小児用量の薬の一覧（端末に保存） */
object PedDrugStore {
    val drugs = mutableStateListOf<PedDrug>()
    private var prefs: SharedPreferences? = null
    private const val KEY = "pedDrugs"
    private const val VERSION_KEY = "pedPresetVersion"
    private var presetVersion = 0
    private var presets: List<PedDrug> = emptyList()

    /** 0.3.0 の初期登録の名前（0.4.0 で名前を変えたので入れ替える） */
    private val oldNames = setOf(
        "ムコダインDS50%", "ムコダインシロップ5%", "ムコソルバンDS1.5%", "ムコソルバンシロップ0.3%", "トランサミンシロップ5%",
        "アスベリン散10%", "アスベリンシロップ0.5%", "カロナール細粒20%", "カロナールシロップ2%", "ワイドシリン細粒20%",
        "クラリスDS10%小児用", "メイアクトMS小児用細粒10%", "フロモックス小児用細粒100mg", "ジスロマック細粒小児用10%",
        "タミフルDS3%", "オノンDS10%", "ザジテンDS0.1%", "オゼックス錠小児用",
    )

    fun init(ctx: Context) {
        if (prefs != null) return
        prefs = ctx.getSharedPreferences("pharmacalc", Context.MODE_PRIVATE)
        runCatching {
            val o = JSONObject(ctx.assets.open("ped_presets.json").bufferedReader().readText())
            presetVersion = o.getInt("version")
            val arr = o.getJSONArray("drugs")
            presets = (0 until arr.length()).map { presetFrom(arr.getJSONObject(it)) }
        }
        val saved = prefs?.getString(KEY, null)?.let { runCatching { decode(it) }.getOrNull() }
        drugs.clear()
        if (saved == null) {
            drugs.addAll(presets)
        } else {
            var list = saved
            val v = prefs?.getInt(VERSION_KEY, 0) ?: 0
            if (v < presetVersion) {
                // 初期登録の薬は新しい版（添付文書と照合して直した値）に入れ替え、自分で追加した薬は後ろに残す
                val presetNames = presets.map { it.name }.toSet()
                list = presets + list.filter { it.name !in presetNames && it.name !in oldNames }
            }
            drugs.addAll(list)
        }
        prefs?.edit()?.putInt(VERSION_KEY, presetVersion)?.apply()
        save()
    }

    /** 一覧に出てくる分類（初期登録の順） */
    val categories: List<String> get() = drugs.map { it.category ?: "自分で追加" }.distinct()

    fun upsert(d: PedDrug) {
        val i = drugs.indexOfFirst { it.id == d.id }
        if (i >= 0) drugs[i] = d else drugs.add(d)
        save()
    }

    fun remove(id: String) { drugs.removeAll { it.id == id }; save() }

    fun reset() { drugs.clear(); drugs.addAll(presets); save() }

    private fun presetFrom(o: JSONObject): PedDrug {
        val form = o.getString("form")
        val bands = o.optJSONArray("bands")
        val minK = o.optDoubleOrNull("minPerKg") ?: 0.0
        return PedDrug(
            name = o.getString("name"), ingredient = o.optString("ingredient"), isSyrup = form == "syrup",
            conc = o.getDouble("conc"),
            basis = DoseBasis.entries.firstOrNull { it.name.equals(o.getString("basis"), true) } ?: DoseBasis.MEMO,
            minPerKg = minK, maxPerKg = o.optDoubleOrNull("maxPerKg") ?: minK, times = o.optIntOrNull("times") ?: 3,
            maxDoseMg = o.optDoubleOrNull("maxDoseMg"), maxDailyMg = o.optDoubleOrNull("maxDailyMg"),
            maxDailyPerKg = o.optDoubleOrNull("maxDailyPerKg"),
            bands = if (bands == null) emptyList() else (0 until bands.length()).map { j ->
                val b = bands.getJSONObject(j)
                AgeBand(b.getDouble("below"), b.getDouble("min"), b.getDouble("max"), b.optIntOrNull("times"), b.optBoolean("perKg", false),
                    b.optBoolean("perDose", false))
            },
            note = o.optString("note"), category = o.optStringOrNull("category"),
            formUnit = if (form == "other") o.optStringOrNull("unit") ?: "" else null,
            amountUnit = o.optStringOrNull("amountUnit"), pmda = o.optStringOrNull("pmda"),
        )
    }

    private fun save() {
        val arr = JSONArray()
        drugs.forEach { d ->
            arr.put(JSONObject().apply {
                put("id", d.id); put("name", d.name); put("ingredient", d.ingredient); put("isSyrup", d.isSyrup)
                put("conc", d.conc); put("basis", d.basis.name); put("minPerKg", d.minPerKg); put("maxPerKg", d.maxPerKg)
                put("times", d.times); put("note", d.note)
                d.maxDoseMg?.let { put("maxDoseMg", it) }
                d.maxDailyMg?.let { put("maxDailyMg", it) }
                d.maxDailyPerKg?.let { put("maxDailyPerKg", it) }
                d.category?.let { put("category", it) }
                d.formUnit?.let { put("formUnit", it) }
                d.amountUnit?.let { put("amountUnit", it) }
                d.pmda?.let { put("pmda", it) }
                put("bands", JSONArray().apply {
                    d.bands.forEach { b ->
                        put(JSONObject().apply {
                            put("below", b.below); put("min", b.min); put("max", b.max); b.times?.let { put("times", it) }; if (b.perKg) put("perKg", true)
                            if (b.perDose) put("perDose", true)
                        })
                    }
                })
            })
        }
        prefs?.edit()?.putString(KEY, arr.toString())?.apply()
    }

    private fun decode(json: String): List<PedDrug> {
        val arr = JSONArray(json)
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            val bands = o.optJSONArray("bands")
            PedDrug(
                id = o.getString("id"), name = o.getString("name"), ingredient = o.optString("ingredient"),
                isSyrup = o.getBoolean("isSyrup"), conc = o.getDouble("conc"),
                basis = DoseBasis.entries.firstOrNull { it.name == o.getString("basis") } ?: DoseBasis.MEMO,
                minPerKg = o.optDouble("minPerKg", 0.0), maxPerKg = o.optDouble("maxPerKg", 0.0), times = o.optInt("times", 3),
                maxDoseMg = o.optDoubleOrNull("maxDoseMg"), maxDailyMg = o.optDoubleOrNull("maxDailyMg"),
                maxDailyPerKg = o.optDoubleOrNull("maxDailyPerKg"),
                bands = if (bands == null) emptyList() else (0 until bands.length()).map { j ->
                    val b = bands.getJSONObject(j)
                    AgeBand(b.getDouble("below"), b.getDouble("min"), b.getDouble("max"), b.optIntOrNull("times"), b.optBoolean("perKg", false),
                    b.optBoolean("perDose", false))
                },
                note = o.optString("note"), category = o.optStringOrNull("category"),
                formUnit = o.optStringOrNull("formUnit"), amountUnit = o.optStringOrNull("amountUnit"),
                pmda = o.optStringOrNull("pmda"),
            )
        }
    }
}
