package app.pharmacalc.android.pill

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.Rect
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Crop
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as GRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.pharmacalc.android.core.parseInt
import app.pharmacalc.android.ui.CalcPage
import app.pharmacalc.android.ui.NumField
import app.pharmacalc.android.ui.Orange
import app.pharmacalc.android.ui.ResultRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.WarningRow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** 向きを直し、長辺 1200 画素に縮小して読み込む */
private fun loadBitmap(ctx: Context, uri: Uri): Bitmap? = runCatching {
    val src = ImageDecoder.createSource(ctx.contentResolver, uri)
    ImageDecoder.decodeBitmap(src) { dec, info, _ ->
        val w = info.size.width; val h = info.size.height
        val s = min(1.0, 1200.0 / max(w, h))
        dec.setTargetSize(max(1, (w * s).toInt()), max(1, (h * s).toInt()))
        dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }.copy(Bitmap.Config.ARGB_8888, false)
}.getOrNull()

@Composable
fun PillCountScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var bmp by remember { mutableStateOf<Bitmap?>(null) }
    val markers = remember { mutableStateListOf<PillMarker>() }
    var radius by remember { mutableFloatStateOf(12f) }
    var sensitivity by rememberSaveable { mutableFloatStateOf(0.5f) }
    var busy by remember { mutableStateOf(false) }
    var expected by rememberSaveable { mutableStateOf("") }
    var roi by remember { mutableStateOf<Rect?>(null) }
    var selecting by remember { mutableStateOf(false) }

    fun analyze() {
        val b = bmp ?: return
        busy = true
        val s = sensitivity.toDouble()
        val area = roi
        scope.launch {
            val r = withContext(Dispatchers.Default) { PillCounter.analyze(b, s, area) }
            markers.clear(); markers.addAll(r.markers)
            radius = r.unitRadius
            busy = false
        }
    }

    fun load(uri: Uri) {
        busy = true
        markers.clear(); roi = null; selecting = false
        scope.launch {
            val b = withContext(Dispatchers.IO) { loadBitmap(ctx, uri) }
            bmp = b
            if (b == null) busy = false else analyze()
        }
    }

    val photoFile = remember { File(ctx.cacheDir, "photos/pill.jpg").apply { parentFile?.mkdirs() } }
    val photoUri = remember { FileProvider.getUriForFile(ctx, ctx.packageName + ".files", photoFile) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) load(photoUri) }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) load(uri) }

    CalcPage {
        Section(footer = "袋から出し、無地の紙やトレーの上に重ならないように広げて、真上から画面いっぱいに撮ってください。") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { takePicture.launch(photoUri) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.CameraAlt, null); Text("  撮影する")
                }
                FilledTonalButton(onClick = {
                    pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Photo, null); Text("  写真から選ぶ")
                }
            }
        }

        val b = bmp
        if (b != null) {
            Section(footer = if (selecting) "写真の上を指でなぞって、数える範囲を四角で囲んでください。"
            else "緑の点が自動で数えた錠剤です。点をタップすると消え、点のない錠剤をタップすると追加します（青の点）。机の端などが写っているときは「数える範囲を指定」で錠剤だけを囲んでください。") {
                Box(contentAlignment = Alignment.Center) {
                    MarkedImage(b, markers, radius, roi, selecting) { r ->
                        roi = r; selecting = false; analyze()
                    }
                    if (busy) CircularProgressIndicator()
                }
            }
            Section("結果") {
                val total = markers.sumOf { it.count }
                ResultRow("錠数", "$total", "錠", color = Orange)
                NumField("予定数（任意）", expected, { expected = it }, "錠", integer = true)
                val e = parseInt(expected)
                if (e != null && e > 0) {
                    if (e == total) Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = Color(0xFF2E9D4A))
                        Text("  予定数と一致しています", color = Color(0xFF2E9D4A))
                    } else WarningRow(if (total > e) "予定より${total - e}錠多い" else "予定より${e - total}錠足りない")
                }
            }
            Section {
                TextButton(onClick = { selecting = !selecting }) {
                    Icon(Icons.Filled.Crop, null)
                    Text(if (selecting) "  範囲の指定をやめる" else "  数える範囲を指定")
                }
                if (roi != null) TextButton(onClick = { roi = null; analyze() }) { Text("範囲を解除（全体を数える）") }
            }
            Section("感度", footer = "背景の模様や影を錠剤と間違えるときは感度を下げ、薄い色の錠剤を見落とすときは上げてください。") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("低")
                    Slider(sensitivity, { sensitivity = it }, onValueChangeFinished = { analyze() },
                        modifier = Modifier.weight(1f))
                    Text("高")
                }
                TextButton(onClick = { analyze() }) { Text("自動で数え直す") }
                TextButton(onClick = { markers.clear() }) { Text("印をすべて消す", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

/** 写真の上に点を重ねて表示し、タップで点を足し引きする。範囲指定中はなぞって四角を描く */
@Composable
private fun MarkedImage(bmp: Bitmap, markers: MutableList<PillMarker>, radius: Float, roi: Rect?,
                        selecting: Boolean, onSelect: (Rect) -> Unit) {
    val image = remember(bmp) { bmp.asImageBitmap() }
    var drag by remember { mutableStateOf<GRect?>(null) }
    val sel by rememberUpdatedState(selecting)
    val rad by rememberUpdatedState(radius)
    Box(Modifier.fillMaxWidth().aspectRatio(bmp.width.toFloat() / bmp.height).clip(RoundedCornerShape(10.dp))) {
        Image(image, null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
        Canvas(Modifier.fillMaxSize()
            .pointerInput(bmp) {
                detectTapGestures { p ->
                    if (sel) return@detectTapGestures
                    val s = size.width / bmp.width.toFloat()
                    val ix = p.x / s; val iy = p.y / s
                    val r = max(min(rad * s, 40f), 18f)
                    val nearest = markers.indices.minByOrNull { hypot(markers[it].x - ix, markers[it].y - iy) }
                    if (nearest != null && hypot(markers[nearest].x - ix, markers[nearest].y - iy) * s <= r) {
                        val m = markers[nearest]
                        if (m.count > 1) markers[nearest] = m.copy(count = m.count - 1) else markers.removeAt(nearest)
                    } else markers += PillMarker(ix, iy, 1, manual = true)
                }
            }
            .pointerInput(bmp, selecting) {
                if (!selecting) return@pointerInput
                var start = Offset.Zero
                detectDragGestures(
                    onDragStart = { start = it; drag = GRect(it, it) },
                    onDrag = { change, _ ->
                        val p = change.position
                        drag = GRect(min(start.x, p.x), min(start.y, p.y), max(start.x, p.x), max(start.y, p.y))
                    },
                    onDragEnd = {
                        val d = drag
                        val s = size.width / bmp.width.toFloat()
                        if (d != null && d.width > 20 && d.height > 20) {
                            onSelect(Rect((d.left / s).toInt(), (d.top / s).toInt(), (d.right / s).toInt(), (d.bottom / s).toInt()))
                        }
                        drag = null
                    }
                )
            }
        ) {
            val s = size.width / bmp.width.toFloat()
            val shown = drag ?: roi?.let { GRect(it.left * s, it.top * s, it.right * s, it.bottom * s) }
            if (shown != null) {
                val path = Path().apply {
                    fillType = PathFillType.EvenOdd
                    addRect(GRect(Offset.Zero, size))
                    addRect(shown)
                }
                drawPath(path, Color.Black.copy(alpha = 0.45f))
                drawRect(Color.Yellow, shown.topLeft, Size(shown.width, shown.height),
                    style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f))))
            }
            val dot = max(min(radius * s * 0.45f, 12.dp.toPx()), 6.dp.toPx()) / 2
            markers.forEach { m ->
                val c = Offset(m.x * s, m.y * s)
                drawCircle(Color.White, dot + 1.5.dp.toPx(), c)
                drawCircle(if (m.manual) Color(0xFF2F6FEB) else Color(0xFF2E9D4A), dot, c)
            }
        }
    }
}
