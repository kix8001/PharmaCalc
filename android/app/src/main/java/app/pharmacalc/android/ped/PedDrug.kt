package app.pharmacalc.android.ped

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateListOf
import app.pharmacalc.android.core.fmtTrim
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** 年齢別の用量（〜歳未満なら 1日 min〜max mg） */
data class AgeBand(val below: Double, val min: Double, val max: Double)

/** 用量の決め方 */
enum class DoseBasis(val label: String) { DAY("mg/kg/日"), DOSE("mg/kg/回"), AGE("年齢別") }

/** 小児用量を計算する薬（ユーザーが追加・編集できる）。iOS 版の PedDrug と同じ */
data class PedDrug(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val ingredient: String = "",
    /** true: シロップ（mL）、false: 散・DS（g） */
    val isSyrup: Boolean,
    /** 製剤1g（または1mL）あたりの成分量 mg */
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
) {
    val unit get() = if (isSyrup) "mL" else "g"

    class Result(val dailyLo: Double, val dailyHi: Double, val doseLo: Double, val doseHi: Double,
                 val times: Int, val capped: Boolean)

    /** 年齢（歳）と体重（kg）から用量を出す。必要な値が無ければ理由の文字列を返す */
    fun compute(age: Double?, weight: Double?): Pair<Result?, String?> {
        val t = max(1, times)
        return when (basis) {
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
            DoseBasis.AGE -> {
                if (age == null || age < 0) return null to "年齢を入れてください"
                val b = bands.sortedBy { it.below }.firstOrNull { age < it.below } ?: return null to "登録した年齢の範囲外です"
                Result(b.min, b.max, b.min / t, b.max / t, t, false) to null
            }
        }
    }
}

fun range(a: Double, b: Double, digits: Int): String =
    if (abs(a - b) < 1e-9) fmtTrim(a, digits) else "${fmtTrim(a, digits)}〜${fmtTrim(b, digits)}"

/** 小児用量の薬の一覧（端末に保存） */
object PedDrugStore {
    val drugs = mutableStateListOf<PedDrug>()
    private var prefs: SharedPreferences? = null
    private const val KEY = "pedDrugs"

    fun init(ctx: Context) {
        if (prefs != null) return
        prefs = ctx.getSharedPreferences("pharmacalc", Context.MODE_PRIVATE)
        val json = prefs?.getString(KEY, null)
        val list = json?.let { runCatching { decode(it) }.getOrNull() }
        drugs.clear()
        drugs.addAll(list ?: presets)
    }

    fun upsert(d: PedDrug) {
        val i = drugs.indexOfFirst { it.id == d.id }
        if (i >= 0) drugs[i] = d else drugs.add(d)
        save()
    }

    fun remove(id: String) { drugs.removeAll { it.id == id }; save() }

    fun reset() { drugs.clear(); drugs.addAll(presets); save() }

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
                put("bands", JSONArray().apply {
                    d.bands.forEach { b -> put(JSONObject().apply { put("below", b.below); put("min", b.min); put("max", b.max) }) }
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
                isSyrup = o.getBoolean("isSyrup"), conc = o.getDouble("conc"), basis = DoseBasis.valueOf(o.getString("basis")),
                minPerKg = o.optDouble("minPerKg", 0.0), maxPerKg = o.optDouble("maxPerKg", 0.0), times = o.optInt("times", 3),
                maxDoseMg = if (o.has("maxDoseMg")) o.getDouble("maxDoseMg") else null,
                maxDailyMg = if (o.has("maxDailyMg")) o.getDouble("maxDailyMg") else null,
                maxDailyPerKg = if (o.has("maxDailyPerKg")) o.getDouble("maxDailyPerKg") else null,
                bands = if (bands == null) emptyList() else (0 until bands.length()).map { j ->
                    val b = bands.getJSONObject(j); AgeBand(b.getDouble("below"), b.getDouble("min"), b.getDouble("max"))
                },
                note = o.optString("note"),
            )
        }
    }

    /** 初期登録（添付文書の小児用量をもとにした目安）。iOS 版と同じ */
    val presets: List<PedDrug> by lazy {
        val tranexamic = listOf(AgeBand(2.0, 75.0, 200.0), AgeBand(4.0, 150.0, 350.0), AgeBand(7.0, 250.0, 650.0),
            AgeBand(15.0, 400.0, 1000.0), AgeBand(200.0, 750.0, 2000.0))
        val tipepidine = listOf(AgeBand(1.0, 5.0, 20.0), AgeBand(3.0, 10.0, 25.0), AgeBand(6.0, 15.0, 40.0))
        val acetaminophenNote = "投与間隔は4〜6時間以上。1日総量60mg/kgまで（成人量を超えない）"
        listOf(
            PedDrug(name = "ムコダインDS50%", ingredient = "カルボシステイン", isSyrup = false, conc = 500.0, basis = DoseBasis.DAY,
                minPerKg = 30.0, maxPerKg = 30.0, times = 3, note = "1回10mg/kgを1日3回"),
            PedDrug(name = "ムコダインシロップ5%", ingredient = "カルボシステイン", isSyrup = true, conc = 50.0, basis = DoseBasis.DAY,
                minPerKg = 30.0, maxPerKg = 30.0, times = 3, note = "1回10mg/kgを1日3回"),
            PedDrug(name = "ムコソルバンDS1.5%", ingredient = "アンブロキソール", isSyrup = false, conc = 15.0, basis = DoseBasis.DAY,
                minPerKg = 0.9, maxPerKg = 0.9, times = 3),
            PedDrug(name = "ムコソルバンシロップ0.3%", ingredient = "アンブロキソール", isSyrup = true, conc = 3.0, basis = DoseBasis.DAY,
                minPerKg = 0.9, maxPerKg = 0.9, times = 3),
            PedDrug(name = "トランサミンシロップ5%", ingredient = "トラネキサム酸", isSyrup = true, conc = 50.0, basis = DoseBasis.AGE,
                times = 3, bands = tranexamic, note = "1日量を3〜4回に分ける"),
            PedDrug(name = "アスベリン散10%", ingredient = "チペピジンヒベンズ酸塩", isSyrup = false, conc = 100.0, basis = DoseBasis.AGE,
                times = 3, bands = tipepidine),
            PedDrug(name = "アスベリンシロップ0.5%", ingredient = "チペピジンヒベンズ酸塩", isSyrup = true, conc = 5.0, basis = DoseBasis.AGE,
                times = 3, bands = tipepidine),
            PedDrug(name = "カロナール細粒20%", ingredient = "アセトアミノフェン", isSyrup = false, conc = 200.0, basis = DoseBasis.DOSE,
                minPerKg = 10.0, maxPerKg = 15.0, times = 4, maxDoseMg = 1000.0, maxDailyMg = 4000.0, maxDailyPerKg = 60.0, note = acetaminophenNote),
            PedDrug(name = "カロナールシロップ2%", ingredient = "アセトアミノフェン", isSyrup = true, conc = 20.0, basis = DoseBasis.DOSE,
                minPerKg = 10.0, maxPerKg = 15.0, times = 4, maxDoseMg = 1000.0, maxDailyMg = 4000.0, maxDailyPerKg = 60.0, note = acetaminophenNote),
            PedDrug(name = "ワイドシリン細粒20%", ingredient = "アモキシシリン", isSyrup = false, conc = 200.0, basis = DoseBasis.DAY,
                minPerKg = 20.0, maxPerKg = 40.0, times = 3, maxDailyPerKg = 90.0, note = "1日3〜4回。1日最大90mg/kg"),
            PedDrug(name = "クラリスDS10%小児用", ingredient = "クラリスロマイシン", isSyrup = false, conc = 100.0, basis = DoseBasis.DAY,
                minPerKg = 10.0, maxPerKg = 15.0, times = 2, note = "1日2〜3回に分ける"),
            PedDrug(name = "メイアクトMS小児用細粒10%", ingredient = "セフジトレン ピボキシル", isSyrup = false, conc = 100.0, basis = DoseBasis.DOSE,
                minPerKg = 3.0, maxPerKg = 3.0, times = 3, maxDoseMg = 200.0, note = "必要に応じて1回6mg/kgまで（1回200mgまで）"),
            PedDrug(name = "フロモックス小児用細粒100mg", ingredient = "セフカペン ピボキシル", isSyrup = false, conc = 100.0, basis = DoseBasis.DOSE,
                minPerKg = 3.0, maxPerKg = 3.0, times = 3),
            PedDrug(name = "ジスロマック細粒小児用10%", ingredient = "アジスロマイシン", isSyrup = false, conc = 100.0, basis = DoseBasis.DAY,
                minPerKg = 10.0, maxPerKg = 10.0, times = 1, maxDailyMg = 500.0, note = "1日1回3日間"),
            PedDrug(name = "タミフルDS3%", ingredient = "オセルタミビル", isSyrup = false, conc = 30.0, basis = DoseBasis.DOSE,
                minPerKg = 2.0, maxPerKg = 2.0, times = 2, maxDoseMg = 75.0, note = "治療は1日2回5日間、予防は1日1回"),
            PedDrug(name = "オノンDS10%", ingredient = "プランルカスト", isSyrup = false, conc = 100.0, basis = DoseBasis.DAY,
                minPerKg = 7.0, maxPerKg = 7.0, times = 2, maxDailyMg = 450.0, maxDailyPerKg = 10.0,
                note = "朝・夕食後。1日最高10mg/kg（成人量450mg/日を超えない）"),
            PedDrug(name = "ザジテンDS0.1%", ingredient = "ケトチフェン", isSyrup = false, conc = 1.0, basis = DoseBasis.DAY,
                minPerKg = 0.06, maxPerKg = 0.06, times = 2, note = "朝食後と就寝前"),
        )
    }
}
