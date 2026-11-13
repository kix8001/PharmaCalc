package app.pharmacalc.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Functions
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import app.pharmacalc.android.barcode.HistoryDetailScreen
import app.pharmacalc.android.barcode.HistoryScreen
import app.pharmacalc.android.barcode.ScanScreen
import app.pharmacalc.android.calc.AgeScreen
import app.pharmacalc.android.calc.BodyScreen
import app.pharmacalc.android.calc.CycleScreen
import app.pharmacalc.android.calc.DripScreen
import app.pharmacalc.android.calc.EndDateScreen
import app.pharmacalc.android.calc.GammaScreen
import app.pharmacalc.android.calc.NextVisitScreen
import app.pharmacalc.android.calc.PatientScreen
import app.pharmacalc.android.calc.PediatricScreen
import app.pharmacalc.android.calc.PowderScreen
import app.pharmacalc.android.calc.RemainingScreen
import app.pharmacalc.android.calc.RenalScreen
import app.pharmacalc.android.calc.SheetScreen
import app.pharmacalc.android.calc.UnevenScreen
import app.pharmacalc.android.calc.ValidityScreen
import app.pharmacalc.android.calc.WeightDoseScreen
import app.pharmacalc.android.home.CalcItem
import app.pharmacalc.android.home.HomeScreen
import app.pharmacalc.android.home.TileEditScreen
import app.pharmacalc.android.pill.PillCountScreen

/** 画面（ナビゲーションライブラリは使わず、タブごとの積み重ねで管理する） */
sealed interface Screen {
    val title: String
    data class Calc(val item: CalcItem) : Screen { override val title get() = item.title }
    data object Patient : Screen { override val title = "患者情報" }
    data object EditTiles : Screen { override val title = "ホームの編集" }
    data class HistoryDetail(val id: String) : Screen { override val title get() = "履歴の詳細" }
}

enum class Tab(val label: String, val title: String, val icon: ImageVector) {
    CALC("計算", "薬剤師電卓", Icons.Filled.Functions),
    SCAN("バーコード", "バーコード", Icons.Filled.QrCodeScanner),
    HISTORY("履歴", "履歴", Icons.Filled.History),
    INFO("情報", "情報", Icons.Filled.Info),
}

@Composable
fun CalcContent(item: CalcItem, push: (Screen) -> Unit) {
    when (item) {
        CalcItem.RENAL -> RenalScreen()
        CalcItem.BODY -> BodyScreen()
        CalcItem.END_DATE -> EndDateScreen()
        CalcItem.NEXT_VISIT -> NextVisitScreen()
        CalcItem.VALIDITY -> ValidityScreen()
        CalcItem.CYCLE -> CycleScreen()
        CalcItem.AGE -> AgeScreen()
        CalcItem.PILL_COUNT -> PillCountScreen()
        CalcItem.REMAINING -> RemainingScreen()
        CalcItem.SHEET -> SheetScreen()
        CalcItem.UNEVEN -> UnevenScreen()
        CalcItem.POWDER -> PowderScreen()
        CalcItem.PEDIATRIC -> PediatricScreen()
        CalcItem.WEIGHT_DOSE -> WeightDoseScreen()
        CalcItem.DRIP -> DripScreen()
        CalcItem.GAMMA -> GammaScreen()
        CalcItem.BARCODE -> ScanScreen()
        CalcItem.SCAN_HISTORY -> HistoryScreen { push(Screen.HistoryDetail(it)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App() {
    var tab by rememberSaveable { mutableStateOf(Tab.CALC) }
    val stacks = remember { Tab.entries.associateWith { mutableStateListOf<Screen>() } }
    val stack = stacks.getValue(tab)
    val push: (Screen) -> Unit = { stack.add(it) }
    val pop: () -> Unit = { if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex) }
    BackHandler(enabled = stack.isNotEmpty()) { pop() }
    val top = stack.lastOrNull()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(top?.title ?: tab.title) },
                navigationIcon = {
                    if (top != null) IconButton(onClick = pop) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = t == tab,
                        onClick = { if (t == tab) stacks.getValue(t).clear() else tab = t },
                        icon = { Icon(t.icon, null) },
                        label = { Text(t.label) }
                    )
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            key(tab, stack.size) {
                when (top) {
                    null -> when (tab) {
                        Tab.CALC -> HomeScreen(
                            open = { push(Screen.Calc(it)) },
                            openPatient = { push(Screen.Patient) },
                            editTiles = { push(Screen.EditTiles) })
                        Tab.SCAN -> ScanScreen()
                        Tab.HISTORY -> HistoryScreen { push(Screen.HistoryDetail(it)) }
                        Tab.INFO -> AboutScreen()
                    }
                    is Screen.Calc -> CalcContent(top.item, push)
                    Screen.Patient -> PatientScreen()
                    Screen.EditTiles -> TileEditScreen()
                    is Screen.HistoryDetail -> HistoryDetailScreen(top.id, onDeleted = pop)
                }
            }
        }
    }
}
