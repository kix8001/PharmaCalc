package app.pharmacalc.android.calc

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pharmacalc.android.core.fmtTrim
import kotlin.math.abs
import kotlin.math.floor

/** 余り電卓の計算（四則と「割ってあまり」）。iOS 版の RemainderCalc と同じ */
data class RemainderCalc(val a: String = "", val op: String? = null, val b: String = "", val done: Boolean = false) {
    class Result(val plain: Double? = null, val quotient: Double? = null, val remainder: Double? = null, val decimal: Double? = null)

    companion object {
        fun calc(a: String, op: String?, b: String): Result? {
            val x = a.toDoubleOrNull() ?: return null
            val y = b.toDoubleOrNull() ?: return null
            return when (op) {
                "+" -> Result(plain = x + y)
                "−" -> Result(plain = x - y)
                "×" -> Result(plain = x * y)
                "÷" -> Result(plain = if (y == 0.0) Double.NaN else x / y)
                "mod" -> {
                    if (y == 0.0) Result(plain = Double.NaN) else {
                        val q = floor(x / y + 1e-9)
                        var r = x - q * y
                        if (abs(r) < 1e-9) r = 0.0
                        Result(quotient = q, remainder = r, decimal = x / y)
                    }
                }
                else -> null
            }
        }

        fun show(v: Double): String = if (!v.isFinite()) "エラー" else fmtTrim(v, 3).replace(",", "")
    }

    val result get() = if (done) calc(a, op, b) else null
    private val carried get() = calc(a, op, b)?.let { show(it.plain ?: it.quotient ?: 0.0) }

    fun press(key: String): RemainderCalc {
        if (key.all { it.isDigit() || it == '.' }) {
            var s = if (done) RemainderCalc() else this
            var v = if (s.op == null) s.a else s.b
            if (key == "." && v.contains('.')) return s
            if (v == "0" && key != ".") v = ""
            v = (v + key).take(9)
            return if (s.op == null) s.copy(a = v) else s.copy(b = v)
        }
        return when (key) {
            "C" -> RemainderCalc()
            "⌫" -> when {
                done -> RemainderCalc()
                b.isNotEmpty() -> copy(b = b.dropLast(1))
                op != null -> copy(op = null)
                else -> copy(a = a.dropLast(1))
            }
            "=" -> if (op != null && b.isNotEmpty()) copy(done = true) else this
            else -> {
                var s = this
                if (s.done) s = RemainderCalc(a = carried ?: a)
                if (s.a.isEmpty()) return this
                if (s.op != null && s.b.isNotEmpty()) s = RemainderCalc(a = s.carried ?: s.a)
                s.copy(op = key)
            }
        }
    }

    fun divideBy(n: Int): RemainderCalc {
        var x = a.ifEmpty { "0" }
        if (done || (op != null && b.isNotEmpty())) x = carried ?: x
        return RemainderCalc(x, "mod", n.toString(), true)
    }

    val opLabel get() = if (op == "mod") "÷余" else op ?: ""
    val expression: String
        get() {
            var s = a
            if (op != null) s += " $opLabel "
            s += b
            return if (done) "$s =" else s
        }

    val summary: String?
        get() {
            val r = result ?: return null
            val q = r.quotient; val rem = r.remainder
            return if (q != null && rem != null) "$a ÷ $b ＝ ${show(q)} あまり ${show(rem)}"
            else "$a $opLabel $b ＝ ${show(r.plain ?: 0.0)}"
        }
}

private val Teal = Color(0xFF0F766E)
private val Rust = Color(0xFFC2410C)

private object RemainderHistory {
    val items = mutableStateListOf<RemainderCalc>()
}

@Composable
fun RemainderScreen() {
    var c by remember { mutableStateOf(RemainderCalc()) }
    var showHistory by rememberSaveable { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current

    fun update(n: RemainderCalc) {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        c = n
        val s = n.summary
        if (n.done && s != null && RemainderHistory.items.firstOrNull() != n) {
            RemainderHistory.items.add(0, n)
            while (RemainderHistory.items.size > 30) RemainderHistory.items.removeAt(RemainderHistory.items.lastIndex)
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // 表示
        Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Column(Modifier.fillMaxWidth().heightIn(min = 150.dp).padding(18.dp), horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.Bottom)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { showHistory = true }, enabled = RemainderHistory.items.isNotEmpty()) {
                        Icon(Icons.Filled.History, "履歴", tint = Teal)
                    }
                    Text(c.expression, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End, maxLines = 1, modifier = Modifier.weight(1f))
                }
                val r = c.result
                val q = r?.quotient; val rem = r?.remainder
                if (r != null && q != null && rem != null) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(RemainderCalc.show(q), fontSize = 52.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Text("あまり", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Rust, modifier = Modifier.padding(bottom = 10.dp))
                        Text(RemainderCalc.show(rem), fontSize = 52.sp, fontWeight = FontWeight.Bold, color = Rust, maxLines = 1)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${RemainderCalc.show(q)}シート ＋ バラ${RemainderCalc.show(rem)}錠", style = MaterialTheme.typography.labelLarge,
                            color = Teal, modifier = Modifier.background(Teal.copy(alpha = 0.1f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp))
                        Text("小数 ${RemainderCalc.show(r.decimal ?: 0.0)}", style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.background(Color.Gray.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp))
                    }
                } else {
                    val value = r?.plain?.let { RemainderCalc.show(it) } ?: (if (c.op == null) c.a else c.b).ifEmpty { "0" }
                    Text(value, fontSize = 52.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
        }
        // シートの錠数で割る
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("シートの錠数で割る", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(6, 10, 14, 21, 28).forEach { n ->
                    val on = c.done && c.op == "mod" && c.b == n.toString()
                    Surface(onClick = { update(c.divideBy(n)) }, shape = RoundedCornerShape(14.dp),
                        color = if (on) Teal else MaterialTheme.colorScheme.surfaceContainer,
                        border = BorderStroke(1.5.dp, Teal.copy(alpha = if (on) 1f else 0.3f)),
                        modifier = Modifier.weight(1f).heightIn(min = 46.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("÷$n", fontWeight = FontWeight.Bold, color = if (on) Color.White else Teal)
                        }
                    }
                }
            }
        }
        // キー
        val rows = listOf(listOf("C", "⌫", "÷余", "÷"), listOf("7", "8", "9", "×"), listOf("4", "5", "6", "−"),
            listOf("1", "2", "3", "+"), listOf("0", "00", ".", "="))
        Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            rows.forEach { row ->
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { k ->
                        val isNum = k.all { it.isDigit() || it == '.' }
                        val isOp = k in listOf("÷", "×", "−", "+")
                        val opOn = isOp && c.op == k && !c.done
                        val bg = when {
                            k == "=" -> Rust
                            k == "÷余" || opOn -> Teal
                            isOp -> Teal.copy(alpha = 0.12f)
                            isNum -> MaterialTheme.colorScheme.surfaceContainer
                            else -> Color.Gray.copy(alpha = 0.25f)
                        }
                        val fg = if (k == "=" || k == "÷余" || opOn) Color.White else if (isOp) Teal else MaterialTheme.colorScheme.onSurface
                        Surface(onClick = { update(c.press(if (k == "÷余") "mod" else k)) }, shape = RoundedCornerShape(18.dp), color = bg,
                            modifier = Modifier.weight(1f).fillMaxHeight()) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(k, fontSize = if (k == "÷余") 22.sp else 27.sp,
                                    fontWeight = if (k == "÷余" || k == "=") FontWeight.Bold else FontWeight.Medium, color = fg)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showHistory) {
        AlertDialog(
            onDismissRequest = { showHistory = false },
            title = { Text("履歴（タップで呼び出し）") },
            text = {
                LazyColumn {
                    items(RemainderHistory.items.toList()) { h ->
                        Text(h.summary ?: "", modifier = Modifier.fillMaxWidth().clickable { c = h; showHistory = false }.padding(vertical = 10.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showHistory = false }) { Text("閉じる") } },
            dismissButton = { TextButton(onClick = { RemainderHistory.items.clear(); showHistory = false }) { Text("消去") } },
        )
    }
}
