package app.pharmacalc.android.barcode

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/** GS1バーコード（PTPシートのGS1データバー、元箱のGS1-128など）を解析した結果 */
data class GS1Result(
    val raw: String,
    val gtin: String? = null,
    val expiry: String? = null,
    val lot: String? = null,
    val serial: String? = null,
    val quantity: String? = null,
)

object GS1 {
    private const val GS = '\u001D'
    /** 固定長のAI（アプリケーション識別子）と値の桁数 */
    private val fixed = mapOf("00" to 18, "01" to 14, "02" to 14, "11" to 6, "12" to 6, "13" to 6,
        "15" to 6, "16" to 6, "17" to 6, "20" to 2)
    /** 可変長のAI（GS区切りまたは末尾まで） */
    private val variable = setOf("10", "21", "22", "30", "37")

    fun parse(input: String): GS1Result {
        var r = GS1Result(raw = input)
        var s = input.trim()
        for (p in listOf("]e0", "]E0", "]C1", "]d2", "]Q3")) if (s.startsWith(p)) s = s.substring(p.length)

        // JAN（EAN-13）・GTIN-14 などの数字だけのコード
        if (s.all { it in '0'..'9' } && s.length in setOf(8, 12, 13, 14)) {
            val g = "0".repeat(14 - s.length) + s
            if (checkDigitOK(g)) return r.copy(gtin = g)
        }

        // 「(01)0498…(17)…」のような括弧つき表記
        if (s.startsWith("(")) {
            s = s.replace(")", "").drop(1).replace('(', GS)
        }

        var i = 0
        while (i < s.length) {
            if (s[i] == GS) { i++; continue }
            if (i + 2 > s.length) break
            val ai = s.substring(i, i + 2)
            val len = fixed[ai]
            if (len != null) {
                if (i + 2 + len > s.length) break
                r = assign(r, ai, s.substring(i + 2, i + 2 + len))
                i += 2 + len
            } else if (ai in variable) {
                var end = s.indexOf(GS, i + 2)
                if (end < 0) end = s.length
                r = assign(r, ai, s.substring(i + 2, end))
                i = end
            } else break
        }
        return r
    }

    private fun assign(r: GS1Result, ai: String, v: String): GS1Result = when (ai) {
        "01", "02" -> if (r.gtin == null) r.copy(gtin = v) else r
        "17" -> r.copy(expiry = dateText(v))
        "10" -> r.copy(lot = v)
        "21" -> r.copy(serial = v)
        "30", "37" -> r.copy(quantity = v)
        else -> r
    }

    /** YYMMDD → 2028年3月31日（DDが00なら月末） */
    fun dateText(v: String): String {
        if (v.length != 6) return v
        val yy = v.substring(0, 2).toIntOrNull() ?: return v
        val mm = v.substring(2, 4).toIntOrNull() ?: return v
        val dd = v.substring(4, 6).toIntOrNull() ?: return v
        if (mm !in 1..12) return v
        return if (dd == 0) "${2000 + yy}年${mm}月（月末）" else "${2000 + yy}年${mm}月${dd}日"
    }

    /** GS1のチェックデジット（モジュラス10） */
    fun checkDigitOK(g: String): Boolean {
        if (g.length < 8 || !g.all { it in '0'..'9' }) return false
        val d = g.map { it - '0' }
        var sum = 0
        d.dropLast(1).reversed().forEachIndexed { k, v -> sum += v * (if (k % 2 == 0) 3 else 1) }
        return (10 - sum % 10) % 10 == d.last()
    }
}

object PMDA {
    /** GTINからPMDAの電子添文ページを開くURL（添文ナビと同じ形式） */
    fun url(gtin: String) = "https://www.pmda.go.jp/PmdaSearch/bookSearch/01/$gtin"
    const val SEARCH_URL = "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/"

    fun open(ctx: Context, url: String) {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(ctx, Uri.parse(url))
    }
}
