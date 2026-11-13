package app.pharmacalc.android.barcode

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateListOf
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class ScanRecord(
    val id: String = UUID.randomUUID().toString(),
    val date: Long,
    val gtin: String,
    val expiry: String? = null,
    val lot: String? = null,
    val raw: String,
    val memo: String = "",
)

/** 読み取り履歴（端末に保存） */
object ScanHistory {
    val items = mutableStateListOf<ScanRecord>()
    private var prefs: SharedPreferences? = null
    private const val KEY = "scanHistory"

    fun init(ctx: Context) {
        if (prefs != null) return
        prefs = ctx.getSharedPreferences("pharmacalc", Context.MODE_PRIVATE)
        val json = prefs?.getString(KEY, null) ?: return
        runCatching {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                items += ScanRecord(
                    id = o.getString("id"), date = o.getLong("date"), gtin = o.getString("gtin"),
                    expiry = o.optString("expiry").ifEmpty { null }, lot = o.optString("lot").ifEmpty { null },
                    raw = o.optString("raw"), memo = o.optString("memo"))
            }
        }
    }

    /** 追加。同じGTINがあれば薬品名メモを引き継いで先頭に移す */
    fun add(r: GS1Result) {
        val gtin = r.gtin ?: return
        val old = items.indexOfFirst { it.gtin == gtin }
        val memo = if (old >= 0) items[old].memo else ""
        if (old >= 0) items.removeAt(old)
        items.add(0, ScanRecord(date = System.currentTimeMillis(), gtin = gtin, expiry = r.expiry, lot = r.lot,
            raw = r.raw, memo = memo))
        while (items.size > 300) items.removeAt(items.lastIndex)
        save()
    }

    fun memo(gtin: String) = items.firstOrNull { it.gtin == gtin }?.memo ?: ""

    fun setMemo(id: String, memo: String) {
        val i = items.indexOfFirst { it.id == id }
        if (i >= 0) { items[i] = items[i].copy(memo = memo); save() }
    }

    fun remove(id: String) {
        items.removeAll { it.id == id }
        save()
    }

    private fun save() {
        val arr = JSONArray()
        items.forEach {
            arr.put(JSONObject().apply {
                put("id", it.id); put("date", it.date); put("gtin", it.gtin)
                put("expiry", it.expiry ?: ""); put("lot", it.lot ?: ""); put("raw", it.raw); put("memo", it.memo)
            })
        }
        prefs?.edit()?.putString(KEY, arr.toString())?.apply()
    }
}
