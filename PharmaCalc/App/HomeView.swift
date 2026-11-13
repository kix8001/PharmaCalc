import SwiftUI

/// 計算の分類
enum CalcGroup: String, CaseIterable {
    case renal = "腎機能・体格"
    case days = "日数・日付"
    case quantity = "数量・残薬"
    case dose = "用量"
    case injection = "注射・点滴"
    case tools = "バーコード・その他"

    /// タイルの色
    var color: Color {
        switch self {
        case .renal: return .blue
        case .days: return .orange
        case .quantity: return .green
        case .dose: return .purple
        case .injection: return .pink
        case .tools: return .teal
        }
    }
}

/// 電卓の一覧（ホーム画面・検索・お気に入りで共通）
enum CalcItem: String, CaseIterable, Identifiable {
    case renal, body
    case endDate, nextVisit, validity, cycle, age
    case pillCount, remaining, sheet, uneven
    case powder, pediatric, weightDose
    case drip, gamma
    case barcode, scanHistory

    var id: String { rawValue }

    var title: String {
        switch self {
        case .renal: return "腎機能（CCr・eGFR）"
        case .body: return "体表面積・BMI・理想体重"
        case .endDate: return "服用終了日"
        case .nextVisit: return "次回受診までの日数"
        case .validity: return "処方箋の有効期限"
        case .cycle: return "休薬期間のある処方"
        case .age: return "年齢・月齢"
        case .pillCount: return "錠剤カウント（カメラ）"
        case .remaining: return "残薬調整"
        case .sheet: return "PTPシート換算"
        case .uneven: return "不均等投与の総数"
        case .powder: return "散剤の換算（mg ⇄ g）"
        case .pediatric: return "小児薬用量"
        case .weightDose: return "体重あたりの用量"
        case .drip: return "点滴の滴下速度"
        case .gamma: return "γ計算（μg/kg/min）"
        case .barcode: return "バーコード → 添付文書"
        case .scanHistory: return "読み取り履歴"
        }
    }

    /// タイル用の短い名前
    var shortTitle: String {
        switch self {
        case .renal: return "腎機能"
        case .body: return "体表面積"
        case .endDate: return "服用終了日"
        case .nextVisit: return "次回受診"
        case .validity: return "処方箋期限"
        case .cycle: return "休薬サイクル"
        case .age: return "年齢・月齢"
        case .pillCount: return "錠剤カウント"
        case .remaining: return "残薬調整"
        case .sheet: return "シート換算"
        case .uneven: return "不均等投与"
        case .powder: return "散剤換算"
        case .pediatric: return "小児薬用量"
        case .weightDose: return "体重あたり"
        case .drip: return "点滴速度"
        case .gamma: return "γ計算"
        case .barcode: return "添付文書"
        case .scanHistory: return "読取履歴"
        }
    }

    var subtitle: String {
        switch self {
        case .renal: return "Cockcroft-Gault・日本人eGFR・シスタチンC"
        case .body: return "DuBois・藤本・Mosteller"
        case .endDate: return "開始日＋処方日数 → 最終服用日"
        case .nextVisit: return "受診日までに必要な日数・錠数"
        case .validity: return "交付日を含めて4日"
        case .cycle: return "3週投与1週休薬など"
        case .age: return "生年月日から年齢・月齢・日齢"
        case .pillCount: return "バラ錠を撮影して数える"
        case .remaining: return "残薬を差し引いた処方日数・数量"
        case .sheet: return "錠数 → シート＋バラ"
        case .uneven: return "朝2・夕1など"
        case .powder: return "成分量 ⇄ 製剤量、1包あたり"
        case .pediatric: return "Augsberger・von Harnack・Young"
        case .weightDose: return "mg/kg/日 → 1回量"
        case .drip: return "mL/h・滴/分"
        case .gamma: return "γ ⇄ mL/h"
        case .barcode: return "PTPのGS1バーコードを読んで電子添文を開く"
        case .scanHistory: return "読み取った薬と薬品名メモ"
        }
    }

    var keywords: String {
        switch self {
        case .renal: return "ccr egfr クレアチニン 腎 シスタチン"
        case .body: return "bsa bmi ibw 体重 身長"
        case .endDate, .nextVisit: return "日数 日付 カレンダー"
        case .validity: return "処方せん 期限 4日"
        case .cycle: return "休薬 クール 抗がん剤"
        case .age: return "誕生日 月齢"
        case .pillCount: return "カウント 数える 写真 撮影 バラ 監査"
        case .remaining: return "残薬 余り 調整"
        case .sheet: return "ptp シート バラ"
        case .uneven: return "朝 昼 夕 寝る前"
        case .powder: return "散 力価 % 包"
        case .pediatric: return "小児 子供 こども"
        case .weightDose: return "mg/kg"
        case .drip: return "輸液 滴下"
        case .gamma: return "ガンマ 持続 シリンジ"
        case .barcode: return "バーコード gs1 jan 添文 添付文書 pmda ptp スキャン"
        case .scanHistory: return "履歴 バーコード"
        }
    }

    var icon: String {
        switch self {
        case .renal: return "drop"
        case .body: return "figure.stand"
        case .endDate: return "calendar"
        case .nextVisit: return "calendar.badge.clock"
        case .validity: return "doc.text"
        case .cycle: return "arrow.triangle.2.circlepath"
        case .age: return "birthday.cake"
        case .pillCount: return "camera.viewfinder"
        case .remaining: return "minus.forwardslash.plus"
        case .sheet: return "square.grid.3x3"
        case .uneven: return "sunrise"
        case .powder: return "scalemass"
        case .pediatric: return "figure.and.child.holdinghands"
        case .weightDose: return "person.badge.plus"
        case .drip: return "drop.triangle"
        case .gamma: return "syringe"
        case .barcode: return "barcode.viewfinder"
        case .scanHistory: return "clock.arrow.circlepath"
        }
    }

    var group: CalcGroup {
        switch self {
        case .renal, .body: return .renal
        case .endDate, .nextVisit, .validity, .cycle, .age: return .days
        case .pillCount, .remaining, .sheet, .uneven: return .quantity
        case .powder, .pediatric, .weightDose: return .dose
        case .drip, .gamma: return .injection
        case .barcode, .scanHistory: return .tools
        }
    }

    @ViewBuilder var destination: some View {
        switch self {
        case .renal: RenalView()
        case .body: BodyView()
        case .endDate: EndDateView()
        case .nextVisit: NextVisitView()
        case .validity: ValidityView()
        case .cycle: CycleView()
        case .age: AgeView()
        case .pillCount: PillCountView()
        case .remaining: RemainingView()
        case .sheet: SheetView()
        case .uneven: UnevenView()
        case .powder: PowderView()
        case .pediatric: PediatricView()
        case .weightDose: WeightDoseView()
        case .drip: DripView()
        case .gamma: GammaView()
        case .barcode: ScanScreen()
        case .scanHistory: HistoryScreen()
        }
    }
}

/// ホームに並べるタイルの設定（端末に保存）
enum HomeTiles {
    static let key = "homeTiles"
    static let defaults: [CalcItem] = [.barcode, .pillCount, .renal, .endDate, .remaining, .sheet, .powder]

    static func decode(_ raw: String) -> [CalcItem] {
        raw.split(separator: ",").compactMap { CalcItem(rawValue: String($0)) }
    }

    static func encode(_ items: [CalcItem]) -> String {
        items.map(\.rawValue).joined(separator: ",")
    }

    /// 初回は、以前の「よく使う」があればそれを、無ければ既定のタイルを使う
    /// 0.3.0 で並びを保存した人にも、新しいタイル（バーコード）を一度だけ先頭に足す
    static func migrate(_ raw: String) -> String {
        let d = UserDefaults.standard
        guard !d.bool(forKey: "homeTilesV2") else { return raw }
        d.set(true, forKey: "homeTilesV2")
        var t = decode(raw)
        if !t.contains(.barcode) { t.insert(.barcode, at: 0) }
        return encode(t)
    }

    static func initialRaw() -> String {
        let old = UserDefaults.standard.string(forKey: "favorites") ?? ""
        let fav = decode(old)
        return encode(fav.isEmpty ? defaults : fav)
    }
}

struct HomeView: View {
    @State private var query = ""
    @State private var path = NavigationPath()
    @State private var editing = false
    @AppStorage(HomeTiles.key) private var tilesRaw = HomeTiles.initialRaw()

    private var tiles: [CalcItem] { HomeTiles.decode(tilesRaw) }

    private var filtered: [CalcItem] {
        let q = query.lowercased()
        return CalcItem.allCases.filter {
            ($0.title + $0.subtitle + $0.keywords).lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if query.isEmpty {
                    Section {
                        NavigationLink { PatientView() } label: { PatientSummaryRow() }
                    } header: {
                        Text("患者情報（全計算で共通）")
                    }

                    Section {
                        if tiles.isEmpty {
                            Button {
                                editing = true
                            } label: {
                                Label("よく使う計算をホームに追加", systemImage: "plus.square.on.square")
                            }
                        } else {
                            TileGrid(items: tiles,
                                     open: { path.append($0) },
                                     remove: { toggleTile($0) })
                                .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                                .listRowBackground(Color.clear)
                        }
                    } header: {
                        HStack {
                            Text("ホーム")
                            Spacer()
                            Button("編集") { editing = true }
                                .font(.subheadline)
                                .textCase(nil)
                        }
                    }

                    ForEach(CalcGroup.allCases, id: \.self) { g in
                        Section(g.rawValue) {
                            ForEach(CalcItem.allCases.filter { $0.group == g }) { row($0) }
                        }
                    }
                } else {
                    ForEach(filtered) { row($0) }
                }
            }
            .navigationTitle("薬剤師電卓")
            .searchable(text: $query, prompt: "計算を探す")
            .navigationDestination(for: CalcItem.self) { $0.destination }
            .sheet(isPresented: $editing) {
                TileEditView(tilesRaw: $tilesRaw)
            }
            .onAppear { tilesRaw = HomeTiles.migrate(tilesRaw) }
        }
    }

    private func toggleTile(_ c: CalcItem) {
        var t = tiles
        if let i = t.firstIndex(of: c) { t.remove(at: i) } else { t.append(c) }
        tilesRaw = HomeTiles.encode(t)
    }

    private func row(_ c: CalcItem) -> some View {
        let onHome = tiles.contains(c)
        return NavigationLink(value: c) {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.title)
                    Text(c.subtitle).font(.caption).foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: c.icon).foregroundStyle(c.group.color)
            }
        }
        .swipeActions(edge: .trailing) {
            Button {
                toggleTile(c)
            } label: {
                Label(onHome ? "外す" : "ホームへ", systemImage: onHome ? "minus.square" : "plus.square")
            }
            .tint(onHome ? .gray : .accentColor)
        }
        .contextMenu {
            Button {
                toggleTile(c)
            } label: {
                Label(onHome ? "ホームから外す" : "ホームに追加",
                      systemImage: onHome ? "minus.square" : "plus.square")
            }
        }
    }
}

/// ホームのアイコンタイル
struct TileGrid: View {
    let items: [CalcItem]
    let open: (CalcItem) -> Void
    let remove: (CalcItem) -> Void

    private let columns = [GridItem(.adaptive(minimum: 96, maximum: 140), spacing: 12)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(items) { c in
                Button {
                    open(c)
                } label: {
                    VStack(spacing: 8) {
                        Image(systemName: c.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(RoundedRectangle(cornerRadius: 14).fill(c.group.color.gradient))
                        Text(c.shortTitle)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        remove(c)
                    } label: {
                        Label("ホームから外す", systemImage: "minus.square")
                    }
                }
            }
        }
    }
}

/// ホームのタイルを選ぶ・並べ替える
struct TileEditView: View {
    @Binding var tilesRaw: String
    @Environment(\.dismiss) private var dismiss

    private var tiles: [CalcItem] { HomeTiles.decode(tilesRaw) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if tiles.isEmpty {
                        Text("下の一覧から追加してください").foregroundStyle(.secondary)
                    }
                    ForEach(tiles) { c in
                        tileLabel(c)
                    }
                    .onMove { from, to in
                        var t = tiles
                        t.move(fromOffsets: from, toOffset: to)
                        tilesRaw = HomeTiles.encode(t)
                    }
                    .onDelete { idx in
                        var t = tiles
                        t.remove(atOffsets: idx)
                        tilesRaw = HomeTiles.encode(t)
                    }
                } header: {
                    Text("ホームに表示（\(tiles.count)個）")
                } footer: {
                    Text("右の三本線をドラッグして並べ替え、左の赤いボタンで外します。")
                }

                ForEach(CalcGroup.allCases, id: \.self) { g in
                    let rest = CalcItem.allCases.filter { $0.group == g && !tiles.contains($0) }
                    if !rest.isEmpty {
                        Section(g.rawValue) {
                            ForEach(rest) { c in
                                Button {
                                    tilesRaw = HomeTiles.encode(tiles + [c])
                                } label: {
                                    HStack {
                                        tileLabel(c)
                                        Spacer()
                                        Image(systemName: "plus.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(.green)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Section {
                    Button("最初の並びに戻す") {
                        tilesRaw = HomeTiles.encode(HomeTiles.defaults)
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("ホームの編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完了") { dismiss() }
                }
            }
        }
    }

    private func tileLabel(_ c: CalcItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: c.icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 7).fill(c.group.color.gradient))
            Text(c.title)
        }
    }
}
