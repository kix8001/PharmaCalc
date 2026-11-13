package app.pharmacalc.android.home

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pharmacalc.android.core.Patient
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.Divider
import app.pharmacalc.android.ui.Section

/** ホームに並べるタイル（端末に保存） */
object HomeTiles {
    val items = mutableStateListOf<CalcItem>()
    val defaults = listOf(CalcItem.BARCODE, CalcItem.PILL_COUNT, CalcItem.RENAL, CalcItem.END_DATE,
        CalcItem.REMAINING, CalcItem.SHEET, CalcItem.POWDER)
    private var prefs: SharedPreferences? = null

    fun init(ctx: Context) {
        if (prefs != null) return
        prefs = ctx.getSharedPreferences("pharmacalc", Context.MODE_PRIVATE)
        val raw = prefs?.getString("homeTiles", null)
        items.clear()
        items.addAll(raw?.split(",")?.mapNotNull { n -> CalcItem.entries.firstOrNull { it.name == n } } ?: defaults)
    }

    fun set(list: List<CalcItem>) {
        items.clear(); items.addAll(list)
        prefs?.edit()?.putString("homeTiles", list.joinToString(",") { it.name })?.apply()
    }

    fun toggle(c: CalcItem) = set(if (c in items) items - c else items + c)
}

@Composable
fun ItemIcon(c: CalcItem, size: Int) {
    Box(Modifier.size(size.dp).background(
        Brush.verticalGradient(listOf(c.group.color.copy(alpha = 0.85f), c.group.color)),
        RoundedCornerShape((size / 4).dp)), contentAlignment = Alignment.Center) {
        Icon(c.icon, null, tint = Color.White, modifier = Modifier.size((size * 0.55f).dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Tile(c: CalcItem, onOpen: () -> Unit, modifier: Modifier) {
    var menu by remember { mutableStateOf(false) }
    Box(modifier) {
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer,
            modifier = Modifier.fillMaxWidth().combinedClickable(onClick = onOpen, onLongClick = { menu = true })) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 10.dp)) {
                ItemIcon(c, 52)
                Spacer(Modifier.size(6.dp))
                Text(c.shortTitle, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        DropdownMenu(menu, { menu = false }) {
            DropdownMenuItem(text = { Text("ホームから外す") }, onClick = { menu = false; HomeTiles.toggle(c) })
        }
    }
}

@Composable
private fun ItemRow(c: CalcItem, onOpen: () -> Unit) {
    val onHome = c in HomeTiles.items
    Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically) {
        ItemIcon(c, 32)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(c.title)
            Text(c.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = { HomeTiles.toggle(c) }) {
            Icon(if (onHome) Icons.Filled.RemoveCircle else Icons.Filled.AddCircle,
                if (onHome) "ホームから外す" else "ホームに追加",
                tint = if (onHome) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
fun HomeScreen(open: (CalcItem) -> Unit, openPatient: () -> Unit, editTiles: () -> Unit) = CalcPage {
    var query by rememberSaveable { mutableStateOf("") }
    OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("計算を探す") },
        leadingIcon = { Icon(Icons.Filled.Search, null) }, modifier = Modifier.fillMaxWidth())
    if (query.isNotEmpty()) {
        Section {
            CalcItem.entries.filter { it.matches(query) }.forEach { ItemRow(it) { open(it) } }
        }
        return@CalcPage
    }
    Section("患者情報（全計算で共通）") {
        Row(Modifier.fillMaxWidth().clickable(onClick = openPatient).padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.PersonOutline, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Text(if (Patient.isEmpty) "未入力（タップして入力）" else Patient.summary,
                color = if (Patient.isEmpty) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("ホーム", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(start = 8.dp))
            TextButton(onClick = editTiles) { Text("編集") }
        }
        if (HomeTiles.items.isEmpty()) {
            TextButton(onClick = editTiles) { Text("よく使う計算をホームに追加") }
        }
        HomeTiles.items.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { c -> Tile(c, { open(c) }, Modifier.weight(1f)) }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
    CalcGroup.entries.forEach { g ->
        Section(g.label) {
            CalcItem.entries.filter { it.group == g }.forEachIndexed { i, c ->
                if (i > 0) Divider()
                ItemRow(c) { open(c) }
            }
        }
    }
}

@Composable
fun TileEditScreen() = CalcPage {
    val tiles = HomeTiles.items
    Section("ホームに表示（${tiles.size}個）", footer = "矢印で並べ替え、赤いボタンで外します。") {
        if (tiles.isEmpty()) Text("下の一覧から追加してください", color = MaterialTheme.colorScheme.onSurfaceVariant)
        tiles.toList().forEachIndexed { i, c ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { HomeTiles.toggle(c) }) {
                    Icon(Icons.Filled.RemoveCircle, "外す", tint = Color(0xFFE53935))
                }
                ItemIcon(c, 30)
                Text(c.title, modifier = Modifier.weight(1f).padding(start = 10.dp))
                IconButton(onClick = {
                    val l = tiles.toMutableList(); l.removeAt(i); l.add(i - 1, c); HomeTiles.set(l)
                }, enabled = i > 0) { Icon(Icons.Filled.KeyboardArrowUp, "上へ") }
                IconButton(onClick = {
                    val l = tiles.toMutableList(); l.removeAt(i); l.add(i + 1, c); HomeTiles.set(l)
                }, enabled = i < tiles.size - 1) { Icon(Icons.Filled.KeyboardArrowDown, "下へ") }
            }
        }
    }
    CalcGroup.entries.forEach { g ->
        val rest = CalcItem.entries.filter { it.group == g && it !in tiles }
        if (rest.isNotEmpty()) Section(g.label) {
            rest.forEach { c ->
                Row(Modifier.fillMaxWidth().clickable { HomeTiles.toggle(c) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    ItemIcon(c, 30)
                    Text(c.title, modifier = Modifier.weight(1f).padding(start = 10.dp))
                    Icon(Icons.Filled.AddCircle, "追加", tint = Color(0xFF2E9D4A))
                }
            }
        }
    }
    TextButton(onClick = { HomeTiles.set(HomeTiles.defaults) }) { Text("最初の並びに戻す") }
}
