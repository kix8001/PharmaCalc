package app.pharmacalc.android.core

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat

/** 文字列を数値にする（全角数字・カンマにも対応） */
fun parseNum(s: String): Double? {
    var t = s.trim()
    val full = "０１２３４５６７８９．，"
    val half = "0123456789.."
    for (i in full.indices) t = t.replace(full[i], half[i])
    t = t.replace(',', '.')
    if (t.isEmpty()) return null
    val v = t.toDoubleOrNull() ?: return null
    return if (v.isFinite()) v else null
}

fun parseInt(s: String): Int? {
    val v = parseNum(s) ?: return null
    if (v < 0 || v != Math.rint(v)) return null
    return v.toInt()
}

/** 小数点以下 digits 桁で表示（四捨五入、末尾の0は残す） */
fun fmt(v: Double, digits: Int = 1): String {
    val bd = BigDecimal(v).setScale(digits, RoundingMode.HALF_UP)
    val df = DecimalFormat(if (digits > 0) "#,##0." + "0".repeat(digits) else "#,##0")
    return df.format(bd)
}

/** 必要な桁だけ表示（12.50 → 12.5、3.0 → 3） */
fun fmtTrim(v: Double, maxDigits: Int = 2): String {
    val bd = BigDecimal(v).setScale(maxDigits, RoundingMode.HALF_UP)
    val df = DecimalFormat(if (maxDigits > 0) "#,##0." + "#".repeat(maxDigits) else "#,##0")
    return df.format(bd)
}
