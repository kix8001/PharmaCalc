package app.pharmacalc.android.otc

import android.content.Context
import app.pharmacalc.android.core.searchKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.floor
import kotlin.math.roundToLong

/** 対象医薬品（厚労省の対象医薬品リスト。価格は円） */
class OtcTarget(
    val name: String, val ingredient: String, val spec: String, val maker: String,
    /** 薬価 */
    val price: Double,
    /** 対象医薬品の価格の4分の1（特別の料金の計算に使う） */
    val quarter: Double,
    /** 保険外併用療養費の算出に用いる価格 */
    val base: Double,
)

/** 長期収載品の選定療養の対象医薬品（厚労省の対象医薬品リスト。価格は円） */
class SenteiTarget(
    val name: String, val ingredient: String, val spec: String, val maker: String,
    /** 薬価 */
    val price: Double,
    /** 後発医薬品の最高価格 */
    val generic: Double,
    /** 長期収載品と後発医薬品の価格差の2分の1（特別の料金の計算に使う） */
    val half: Double,
    /** 保険外併用療養費の算出に用いる価格 */
    val base: Double,
)

/** 調べる制度：OTC類似薬の一部保険外療養／長期収載品の選定療養 */
enum class OtcKind { OTC, SENTEI }

/** OTC類似薬・長期収載品の選定療養の判定データ（data/otc.json。tools/make_otc.py で作る。iOS・Web と共通） */
class OtcData(
    val source: String,
    val hot: String,
    val targets: Map<String, OtcTarget>,
    val senteiSource: String,
    /** YJ → 長期収載品の選定療養の対象 */
    val sentei: Map<String, SenteiTarget>,
    /** YJ → 特別の料金の対象外となる効能・効果 */
    val effects: Map<String, List<String>>,
    /** 成分 → 特別の料金の対象外となる傷病名の例 */
    val diseases: Map<String, List<String>>,
    val pregnant: Set<String>,
    val lactating: Set<String>,
    /** YJ → 販売名（HOTコードマスターの全品目） */
    val names: Map<String, String>,
    /** 箱（販売包装単位）のGS1コード → YJ */
    val box: Map<String, String>,
    /** 名前で探すための（YJ, 検索用の文字） */
    val index: List<Pair<String, String>>,
) {
    fun nameOf(yj: String) = targets[yj]?.name ?: sentei[yj]?.name ?: names[yj] ?: yj

    /** その制度の対象か */
    fun isTarget(kind: OtcKind, yj: String) = if (kind == OtcKind.OTC) targets.containsKey(yj) else sentei.containsKey(yj)

    fun search(q: String, kind: OtcKind = OtcKind.OTC, limit: Int = 50): List<String> {
        val k = searchKey(q.trim())
        if (k.length < 2) return emptyList()
        // 対象医薬品を先に
        val a = index.filter { isTarget(kind, it.first) && it.second.contains(k) }.map { it.first }
        val b = index.filter { !isTarget(kind, it.first) && it.second.contains(k) }.map { it.first }
        return (a + b).take(limit)
    }
}

sealed interface Lookup {
    data class Found(val yj: List<String>, val viaPmda: Boolean) : Lookup
    data object NotFound : Lookup
    data object Offline : Lookup
}

object Otc {
    private var data: OtcData? = null
    private val lock = Mutex()

    /** 3MB あるので、使うときに1回だけ読み込む */
    suspend fun load(ctx: Context): OtcData = lock.withLock {
        data ?: withContext(Dispatchers.Default) {
            val o = JSONObject(ctx.assets.open("otc.json").bufferedReader().readText())
            fun strMap(k: String): Map<String, String> {
                val j = o.getJSONObject(k)
                return j.keys().asSequence().associateWith { j.getString(it) }
            }
            fun listMap(k: String): Map<String, List<String>> {
                val j = o.getJSONObject(k)
                return j.keys().asSequence().associateWith { key ->
                    val a = j.getJSONArray(key); (0 until a.length()).map { a.getString(it) }
                }
            }
            fun set(k: String): Set<String> { val a = o.getJSONArray(k); return (0 until a.length()).map { a.getString(it) }.toSet() }
            val tj = o.getJSONObject("targets")
            val targets = tj.keys().asSequence().associateWith { k ->
                val t = tj.getJSONObject(k)
                OtcTarget(t.getString("name"), t.getString("ingredient"), t.getString("spec"), t.getString("maker"),
                    t.getDouble("price"), t.getDouble("quarter"), t.getDouble("base"))
            }
            val sj = o.getJSONObject("sentei")
            val sentei = sj.keys().asSequence().associateWith { k ->
                val t = sj.getJSONObject(k)
                SenteiTarget(t.getString("name"), t.getString("ingredient"), t.getString("spec"), t.getString("maker"),
                    t.getDouble("price"), t.getDouble("generic"), t.getDouble("half"), t.getDouble("base"))
            }
            val names = strMap("names")
            OtcData(
                source = o.getString("source"), hot = o.getString("hot"), targets = targets,
                senteiSource = o.getString("senteiSource"), sentei = sentei,
                effects = listMap("effects"), diseases = listMap("diseases"),
                pregnant = set("pregnant"), lactating = set("lactating"),
                names = names, box = strMap("box"),
                index = names.map { (yj, n) -> yj to searchKey(n + (targets[yj]?.ingredient ?: sentei[yj]?.ingredient ?: "")) },
            ).also { data = it }
        }
    }

    /**
     * GS1コード（GTIN）から製品（YJコード）を調べる。
     * 箱（販売包装単位）のコードは HOTコードマスターで端末の中だけで分かる。
     * PTPシート（調剤包装単位）のコードはマスターに無いので、PMDA の「バーコードから添付文書を開く」で添付文書を引き、
     * その添付文書に載っている製品（錠・細粒など複数のことがある）を返す
     */
    suspend fun lookup(ctx: Context, gtin: String): Lookup {
        val d = load(ctx)
        val g = gtin.padStart(14, '0')
        d.box[g]?.let { return Lookup.Found(listOf(it), false) }
        return withContext(Dispatchers.IO) {
            try {
                val base = "https://www.pmda.go.jp/PmdaSearch/"
                val (status, location, body) = fetch(base + "bookSearch/01/" + g)
                if (status == 0) return@withContext Lookup.Offline
                val ids = Regex("""\d{6}_\d{7}[0-9A-Z]\d{4}_\d+_\d+""").findAll("$location $body").map { it.value }.distinct().take(4).toList()
                val yj = mutableListOf<String>()
                for (id in ids) {
                    val rep = id.split("_")[1]
                    yj += rep
                    val (st, _, html) = fetch(base + "iyakuDetail/" + id)
                    if (st == 200) {
                        // 同じ添付文書に載る製品は、YJコードの先頭7桁（成分と剤形の分類）が同じ
                        Regex("""(?<![0-9A-Z])(\d{7}[0-9A-Z]\d{4})(?![0-9A-Z])""").findAll(html)
                            .map { it.groupValues[1] }.filter { it.take(7) == rep.take(7) }.forEach { yj += it }
                    }
                }
                val list = yj.distinct().filter { d.names.containsKey(it) || d.targets.containsKey(it) || d.sentei.containsKey(it) }
                if (list.isEmpty()) Lookup.NotFound else Lookup.Found(list, true)
            } catch (e: Exception) {
                Lookup.Offline
            }
        }
    }

    /** 転送をたどらずに取得する。（状態コード, 転送先, 本文）。PDF の中身は読まない */
    private fun fetch(url: String): Triple<Int, String, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = false
        c.connectTimeout = 15000
        c.readTimeout = 15000
        c.setRequestProperty("User-Agent", "PharmaCalc/1.0")
        return try {
            val status = c.responseCode
            val location = c.getHeaderField("Location") ?: ""
            val type = c.contentType ?: ""
            val body = if (status == 200 && !type.contains("pdf")) c.inputStream.bufferedReader().readText() else ""
            Triple(status, location, body)
        } finally {
            c.disconnect()
        }
    }

    /** 別途の負担（特別の料金）の対象外となる場合（厚労省のページより。令和9年3月1日施行時点） */
    val EXEMPTIONS = listOf(
        "こども（18歳に達する日以後の最初の3月31日までの間にある者）",
        "がん治療又はがん治療に関連して生じた状態に使う場合",
        "指定難病若しくは小児慢性特定疾病（18歳から20歳までの者に限る）又はこれらに関連して生じた状態に使う場合",
        "国の公費負担医療において使う場合",
        "入院中（退院時処方を含む）に使う場合",
        "侵襲を伴う検査、処置又は手術に伴って使う場合（その検査等の後、14日以内の使用に限る）",
        "医師が年間を通じた症状の持続と治療の継続性を確認し、長期の使用が医療上必要と認めた場合",
        "類似のOTC医薬品で承認されている効能・効果では対応できない状態に使う場合（この薬の該当する効能・効果・傷病名の例は上に）",
        "妊婦・妊娠している可能性がある者・授乳婦が、特定の対象医薬品を使う場合",
    )

    /** 長期収載品の選定療養の対象外となる場合（保医発0327第9号ほか。令和8年6月1日から） */
    val SENTEI_EXEMPTIONS = listOf(
        "医療上必要があると認められる場合（処方箋の「変更不可（医療上必要）」欄に「✓」又は「×」がある）",
        "薬局（医療機関）で、後発医薬品の在庫状況等により後発医薬品を提供することが困難な場合",
        "服用しにくい剤形である、効能・効果に差異があるなど、後発医薬品では適切な服用が困難で、薬剤師が長期収載品を服用すべきと判断した場合（医療上必要に当たる）",
        "入院中の患者",
        "OTC類似薬でもある薬で、OTC類似薬の別途の負担（4分の1）の対象になる場合（2つの制度は重ならない）",
    )

    /** 選定療養の特別の料金（円）。価格差の2分の1 × 投薬全量を fee と同じく丸め、消費税（10%）を加える。（税抜き, 税込み） */
    fun senteiFee(yen: Double): Pair<Long, Long> {
        val f = fee(yen)
        return f to Math.round(f * 1.1)
    }

    /**
     * 特別の料金（円）＝ 対象医薬品の価格の4分の1 × 投薬全量。
     * 10円以上なら5円未満の端数は切り捨て、5円以上10円未満は10円に切り上げ。10円未満は10円
     */
    fun fee(yen: Double): Long {
        val v = (yen * 100).roundToLong() / 100.0
        if (v <= 0) return 0
        if (v < 10) return 10
        val base = floor(v / 10) * 10
        return (if (v - base < 5) base else base + 10).toLong()
    }

    /** 規格の末尾の単位（「60mg1錠」→「錠」、「5%1g」→「g」、「10mL」→「10mL」） */
    fun unitOf(spec: String): String {
        val m = Regex("""([\d.]+)([^\d.]+)$""").find(spec) ?: return "単位"
        val n = m.groupValues[1].toDoubleOrNull()
        return if (n == 1.0) m.groupValues[2] else m.groupValues[1] + m.groupValues[2]
    }
}
