package app.pharmacalc.android.ui

import android.app.DatePickerDialog
import android.widget.Toast
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pharmacalc.android.core.JPDate
import app.pharmacalc.android.core.fmtTrim
import java.time.LocalDate

/** 電卓画面の本体（縦にスクロール） */
@Composable
fun CalcPage(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content
    )
}

/** iOS の Form のセクションに相当するカード */
@Composable
fun Section(title: String? = null, footer: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (title != null) {
            Text(title, style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp))
        }
        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer,
            modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
        if (footer != null) {
            Text(footer, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 8.dp))
        }
    }
}

@Composable
fun Divider() = HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

@Composable
fun NumField(title: String, value: String, onChange: (String) -> Unit, unit: String = "", integer: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(title, modifier = Modifier.weight(1f))
        OutlinedTextField(
            value = value, onValueChange = onChange, singleLine = true,
            placeholder = { Text("—", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End) },
            keyboardOptions = KeyboardOptions(keyboardType = if (integer) KeyboardType.Number else KeyboardType.Decimal),
            textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.End),
            modifier = Modifier.width(120.dp)
        )
        if (unit.isNotEmpty()) {
            Text(unit, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.widthIn(min = 56.dp).padding(start = 8.dp))
        }
    }
}

/** よく使う値をワンタップで入れるボタン列 */
@Composable
fun QuickButtons(values: List<Double>, onPick: (String) -> Unit, suffix: String = "") {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        values.forEach { v ->
            FilterChip(selected = false, onClick = { onPick(fmtTrim(v)) }, label = { Text(fmtTrim(v) + suffix) })
        }
    }
}

/** 計算結果の1行。長押しでコピー */
@Composable
fun ResultRow(title: String, value: String, unit: String = "", note: String? = null,
              big: Boolean = true, color: Color? = null) {
    val clip = LocalClipboardManager.current
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().pointerInput(title, value) {
        detectTapGestures(onLongPress = {
            clip.setText(AnnotatedString("$title：$value$unit"))
            Toast.makeText(ctx, "コピーしました", Toast.LENGTH_SHORT).show()
        })
    }.padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(title, modifier = Modifier.weight(1f))
            Text(value,
                style = if (big) MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                else MaterialTheme.typography.titleSmall,
                color = color ?: MaterialTheme.colorScheme.primary, textAlign = TextAlign.End)
            if (unit.isNotEmpty()) {
                Text(" $unit", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (note != null) {
            Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun MissingRow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
        Icon(Icons.Filled.EditNote, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

val Orange = Color(0xFFF08A24)

@Composable
fun WarningRow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
        Icon(Icons.Filled.Warning, null, tint = Orange, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = Orange, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun SwitchRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(title, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/** 選択肢（iOS のセグメント） */
@Composable
fun <T> Choice(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (v, label) ->
            FilterChip(selected = v == selected, onClick = { onSelect(v) }, label = { Text(label) })
        }
    }
}

@Composable
fun DateRow(title: String, date: LocalDate, onChange: (LocalDate) -> Unit, max: LocalDate? = null) {
    val ctx = LocalContext.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(title, modifier = Modifier.weight(1f))
        TextButton(onClick = {
            val dlg = DatePickerDialog(ctx, { _, y, m, d -> onChange(LocalDate.of(y, m + 1, d)) },
                date.year, date.monthValue - 1, date.dayOfMonth)
            if (max != null) {
                dlg.datePicker.maxDate = max.toEpochDay() * 86_400_000L + 86_399_000L
            }
            dlg.show()
        }) { Text(JPDate.text(date)) }
    }
}

/** 文字と値を左右に並べる行 */
@Composable
fun LabeledRow(label: String, value: String, valueColor: Color? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, modifier = Modifier.weight(1f))
        Text(value, color = valueColor ?: MaterialTheme.colorScheme.onSurface)
    }
}
