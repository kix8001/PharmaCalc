package app.pharmacalc.android.barcode

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FlashlightOff
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.pharmacalc.android.ui.LabeledRow
import app.pharmacalc.android.ui.Section
import app.pharmacalc.android.ui.SwitchRow
import app.pharmacalc.android.ui.WarningRow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import zxingcpp.BarcodeReader

private fun prefs(ctx: Context) = ctx.getSharedPreferences("pharmacalc", Context.MODE_PRIVATE)

/** カメラでバーコードを読む（GS1データバー限定型・二層型、GS1-128、JAN、DataMatrix） */
@Composable
fun BarcodeCamera(torch: Boolean, paused: Boolean, onScan: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val scan by rememberUpdatedState(onScan)
    val isPaused by rememberUpdatedState(paused)
    var camera by remember { mutableStateOf<Camera?>(null) }

    DisposableEffect(owner) {
        val future = ProcessCameraProvider.getInstance(ctx)
        val executor = Executors.newSingleThreadExecutor()
        val main = Handler(Looper.getMainLooper())
        val reader = BarcodeReader().apply {
            options.formats = setOf(
                BarcodeReader.Format.DATA_BAR, BarcodeReader.Format.DATA_BAR_LIMITED,
                BarcodeReader.Format.DATA_BAR_EXPANDED, BarcodeReader.Format.CODE_128,
                BarcodeReader.Format.EAN_13, BarcodeReader.Format.EAN_8,
                BarcodeReader.Format.DATA_MATRIX, BarcodeReader.Format.QR_CODE,
            )
            options.tryHarder = true
            options.tryRotate = true
        }
        var last = ""
        var lastSeen = 0L
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder().setResolutionStrategy(
                        ResolutionStrategy(Size(1920, 1080), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)
                    ).build()
                )
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor) { img ->
                try {
                    val text = reader.read(img).firstOrNull { !it.text.isNullOrEmpty() }?.text
                    if (text != null && !isPaused) {
                        val now = System.currentTimeMillis()
                        // 同じコードを映し続けている間は繰り返し反応しない
                        if (text == last && now - lastSeen < 4000) {
                            lastSeen = now
                        } else {
                            last = text
                            lastSeen = now
                            main.post { scan(text) }
                        }
                    }
                } catch (_: Exception) {
                } finally {
                    img.close()
                }
            }
            runCatching {
                provider.unbindAll()
                camera = provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            }
        }, ContextCompat.getMainExecutor(ctx))
        onDispose {
            runCatching { future.get().unbindAll() }
            executor.shutdown()
        }
    }
    LaunchedEffect(torch, camera) { camera?.cameraControl?.enableTorch(torch) }
    AndroidView({ previewView }, modifier)
}

@Composable
fun ScanScreen() {
    val ctx = LocalContext.current
    val view = LocalView.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    var autoOpen by remember { mutableStateOf(prefs(ctx).getBoolean("autoOpen", true)) }
    var torch by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<GS1Result?>(null) }
    var manual by rememberSaveable { mutableStateOf("") }
    var lastOpened by remember { mutableStateOf("") }

    fun handle(code: String, fromCamera: Boolean) {
        val r = GS1.parse(code)
        result = r
        val gtin = r.gtin ?: return
        view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        ScanHistory.add(r)
        // 添付文書から戻ったあと、同じ薬を映したままでも再び開かないようにする
        if (autoOpen && (!fromCamera || gtin != lastOpened)) {
            lastOpened = gtin
            PMDA.open(ctx, PMDA.url(gtin))
        }
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(280.dp).background(Color.Black), contentAlignment = Alignment.Center) {
            if (granted) {
                BarcodeCamera(torch, false, { handle(it, true) }, Modifier.fillMaxSize())
                Box(Modifier.size(260.dp, 110.dp).border(2.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(12.dp)))
                IconButton(onClick = { torch = !torch }, modifier = Modifier.align(Alignment.TopEnd)) {
                    Icon(if (torch) Icons.Filled.FlashlightOn else Icons.Filled.FlashlightOff, "ライト", tint = Color.White)
                }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("カメラの使用が許可されていません", color = Color.White)
                    Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) { Text("許可する") }
                }
            }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            result?.let { r ->
                Section("読み取り結果") {
                    val gtin = r.gtin
                    if (gtin != null) {
                        val memo = ScanHistory.memo(gtin)
                        if (memo.isNotEmpty()) Text(memo, style = MaterialTheme.typography.titleMedium)
                        LabeledRow("GTIN", gtin)
                        r.expiry?.let { LabeledRow("有効期限", it) }
                        r.lot?.let { LabeledRow("ロット", it) }
                        r.quantity?.let { LabeledRow("数量", it) }
                        Button(onClick = { lastOpened = gtin; PMDA.open(ctx, PMDA.url(gtin)) }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Description, null)
                            Text("  添付文書を開く")
                        }
                    } else {
                        WarningRow("医薬品のコード（GTIN）が見つかりませんでした")
                        Text(r.raw, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Section(footer = "PTPシートのGS1データバー、箱のGS1-128・JANコードに対応しています。PTPのバーコードは小さいので、10cmほど離して枠いっぱいに写すと読みやすくなります。") {
                SwitchRow("読み取ったらすぐ添付文書を開く", autoOpen) {
                    autoOpen = it
                    prefs(ctx).edit().putBoolean("autoOpen", it).apply()
                }
            }
            Section("手入力") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(manual, { manual = it }, singleLine = true, modifier = Modifier.weight(1f),
                        placeholder = { Text("GTIN（14桁）またはJAN（13桁）") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    TextButton(onClick = { handle(manual, false) }, enabled = manual.isNotEmpty()) { Text("開く") }
                }
                TextButton(onClick = { PMDA.open(ctx, PMDA.SEARCH_URL) }) {
                    Icon(Icons.Filled.Search, null)
                    Text(" PMDAで薬品名から探す")
                }
            }
        }
    }
}

private val dateFmt = SimpleDateFormat("yyyy/M/d H:mm", Locale.JAPAN)

@Composable
fun HistoryScreen(onOpen: (String) -> Unit) {
    val ctx = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    val list = ScanHistory.items.filter {
        query.isEmpty() || it.memo.contains(query, ignoreCase = true) || it.gtin.contains(query)
    }
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("薬品名・GTINで探す") },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp))
        if (ScanHistory.items.isEmpty()) {
            Text("バーコードを読み取ると、ここに履歴が残ります", color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(24.dp))
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
            items(list, key = { it.id }) { item ->
                Row(Modifier.fillMaxWidth().clickable { onOpen(item.id) }.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.memo.ifEmpty { "名称未登録" },
                            color = if (item.memo.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                        Text(item.gtin, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(dateFmt.format(Date(item.date)), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { PMDA.open(ctx, PMDA.url(item.gtin)) }) {
                        Icon(Icons.Filled.Description, "添付文書", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
fun HistoryDetailScreen(id: String, onDeleted: () -> Unit) {
    val ctx = LocalContext.current
    val item = ScanHistory.items.firstOrNull { it.id == id }
    if (item == null) {
        Text("削除されました", modifier = Modifier.padding(24.dp))
        return
    }
    var memo by remember(id) { mutableStateOf(item.memo) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Section(footer = "薬品名を入れておくと、次に読み取ったときにも表示されます") {
            OutlinedTextField(memo, { memo = it; ScanHistory.setMemo(id, it) }, singleLine = true,
                label = { Text("薬品名（メモ）") }, modifier = Modifier.fillMaxWidth())
        }
        Section {
            LabeledRow("GTIN", item.gtin)
            item.expiry?.let { LabeledRow("有効期限", it) }
            item.lot?.let { LabeledRow("ロット", it) }
            LabeledRow("読み取り日時", dateFmt.format(Date(item.date)))
        }
        FilledTonalButton(onClick = { PMDA.open(ctx, PMDA.url(item.gtin)) }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Description, null); Text("  添付文書を開く")
        }
        OutlinedButton(onClick = { ScanHistory.remove(id); onDeleted() }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Delete, null); Text("  履歴から削除")
        }
    }
}
