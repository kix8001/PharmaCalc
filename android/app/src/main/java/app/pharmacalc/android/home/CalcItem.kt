package app.pharmacalc.android.home

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.EventRepeat
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material.icons.filled.Opacity
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material.icons.filled.Vaccines
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

/** 計算の分類 */
enum class CalcGroup(val label: String, val color: Color) {
    RENAL("腎機能・体格", Color(0xFF2F6FEB)),
    DAYS("日数・日付", Color(0xFFF08A24)),
    QUANTITY("数量・残薬", Color(0xFF2E9D4A)),
    DOSE("用量", Color(0xFF8E44D9)),
    INJECTION("注射・点滴", Color(0xFFE0457B)),
    TOOLS("バーコード・その他", Color(0xFF14918A)),
}

/** 電卓の一覧（ホームのタイル・一覧・検索で共通） */
enum class CalcItem(
    val title: String, val shortTitle: String, val subtitle: String, val keywords: String,
    val icon: ImageVector, val group: CalcGroup,
) {
    RENAL("腎機能（CCr・eGFR）", "腎機能", "Cockcroft-Gault・日本人eGFR・シスタチンC", "ccr egfr クレアチニン 腎 シスタチン", Icons.Filled.WaterDrop, CalcGroup.RENAL),
    BODY("体表面積・BMI・理想体重", "体表面積", "DuBois・藤本・Mosteller", "bsa bmi ibw 体重 身長", Icons.Filled.Accessibility, CalcGroup.RENAL),
    END_DATE("服用終了日", "服用終了日", "開始日＋処方日数 → 最終服用日", "日数 日付 カレンダー", Icons.Filled.Event, CalcGroup.DAYS),
    NEXT_VISIT("次回受診までの日数", "次回受診", "受診日までに必要な日数・錠数", "日数 日付 カレンダー", Icons.Filled.EventRepeat, CalcGroup.DAYS),
    VALIDITY("処方箋の有効期限", "処方箋期限", "交付日を含めて4日", "処方せん 期限 4日", Icons.Filled.Description, CalcGroup.DAYS),
    CYCLE("休薬期間のある処方", "休薬サイクル", "3週投与1週休薬など", "休薬 クール 抗がん剤", Icons.Filled.Autorenew, CalcGroup.DAYS),
    AGE("年齢・月齢", "年齢・月齢", "生年月日から年齢・月齢・日齢", "誕生日 月齢", Icons.Filled.Cake, CalcGroup.DAYS),
    PILL_COUNT("錠剤カウント（カメラ）", "錠剤カウント", "バラ錠を撮影して数える", "カウント 数える 写真 撮影 バラ 監査", Icons.Filled.CameraAlt, CalcGroup.QUANTITY),
    REMAINING("残薬調整", "残薬調整", "残薬を差し引いた処方日数・数量", "残薬 余り 調整", Icons.Filled.Calculate, CalcGroup.QUANTITY),
    SHEET("PTPシート換算", "シート換算", "錠数 → シート＋バラ", "ptp シート バラ", Icons.Filled.GridOn, CalcGroup.QUANTITY),
    UNEVEN("不均等投与の総数", "不均等投与", "朝2・夕1など", "朝 昼 夕 寝る前", Icons.Filled.WbSunny, CalcGroup.QUANTITY),
    POWDER("散剤の換算（mg ⇄ g）", "散剤換算", "成分量 ⇄ 製剤量、1包あたり", "散 力価 % 包", Icons.Filled.Scale, CalcGroup.DOSE),
    PEDIATRIC("小児薬用量", "小児薬用量", "Augsberger・von Harnack・Young", "小児 子供 こども", Icons.Filled.ChildCare, CalcGroup.DOSE),
    WEIGHT_DOSE("体重あたりの用量", "体重あたり", "mg/kg/日 → 1回量", "mg/kg", Icons.Filled.MonitorWeight, CalcGroup.DOSE),
    DRIP("点滴の滴下速度", "点滴速度", "mL/h・滴/分", "輸液 滴下", Icons.Filled.Opacity, CalcGroup.INJECTION),
    GAMMA("γ計算（μg/kg/min）", "γ計算", "γ ⇄ mL/h", "ガンマ 持続 シリンジ", Icons.Filled.Vaccines, CalcGroup.INJECTION),
    BARCODE("バーコード → 添付文書", "添付文書", "PTPのGS1バーコードを読んで電子添文を開く", "バーコード gs1 jan 添文 添付文書 pmda ptp スキャン", Icons.Filled.QrCodeScanner, CalcGroup.TOOLS),
    SCAN_HISTORY("読み取り履歴", "読取履歴", "読み取った薬と薬品名メモ", "履歴 バーコード", Icons.Filled.History, CalcGroup.TOOLS);

    fun matches(q: String): Boolean = (title + subtitle + keywords).lowercase().contains(q.lowercase())
}
