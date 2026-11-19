import AVFoundation
import SwiftUI

private let otcOrange = Color(red: 0.76, green: 0.25, blue: 0.05)

/// 画面の名前・制度の説明（制度ごと）
extension OTCKind {
    var title: String { self == .otc ? "OTC類似薬チェック" : "選定療養チェック" }
    var short: String { self == .otc ? "OTC類似薬" : "選定療養" }
    var yes: String { self == .otc ? "OTC類似薬（別途の負担の対象）" : "長期収載品（選定療養の対象）" }
    var no: String { self == .otc ? "OTC類似薬ではない" : "選定療養の対象ではない" }
    var url: String {
        self == .otc
            ? "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html"
            : "https://www.mhlw.go.jp/stf/newpage_39830.html"
    }
    var about: String {
        self == .otc
            ? "OTC医薬品との代替性が特に高い医療用医薬品（OTC類似薬）を保険診療で使うと、令和9年3月1日から、薬剤費の4分の1を「別途の負担（特別の料金）」として患者さんが支払います。こども・がん治療・入院中などは対象外です。"
            : "後発医薬品のある先発医薬品（長期収載品）を患者さんの希望で使うと、先発医薬品と後発医薬品（いちばん高いもの）の価格差の2分の1（令和8年6月から）を「特別の料金」として、消費税を加えて患者さんが支払います。医療上必要な場合・後発医薬品を提供できない場合・入院中は対象外です。"
    }
    var searchHint: String { self == .otc ? "名前で探す（例：ロキソニン）" : "名前で探す（例：ムコスタ）" }
}

/// 判定の札：対象（オレンジ）／対象外
struct OTCVerdict: View {
    var kind: OTCKind = .otc
    let target: Bool
    var body: some View {
        Text(target ? kind.yes : kind.no)
            .font(.caption.bold())
            .foregroundStyle(target ? otcOrange : Color.secondary)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(Capsule().fill(target ? Color.orange.opacity(0.16) : Color(.systemGray5)))
    }
}

/// 対象のときの価格の1行
private struct OTCPriceLine: View {
    let data: OTCData
    let kind: OTCKind
    let yj: String
    var body: some View {
        if kind == .otc, let t = data.targets[yj] {
            Text("\(t.spec)・薬価 \(fmtTrim(t.price))円 → 別途の負担 \(fmtTrim(t.quarter))円／\(OTC.unit(t.spec))")
                .font(.caption).foregroundStyle(.secondary)
        } else if kind == .sentei, let t = data.sentei[yj] {
            Text("\(t.spec)・薬価 \(fmtTrim(t.price))円・後発品 \(fmtTrim(t.generic))円 → 特別の料金 \(fmtTrim(t.half))円／\(OTC.unit(t.spec))（税別）")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// 製品1つの行。押すと詳しい画面へ。kinds に並べた制度の判定を出す
struct OTCProductRow: View {
    let data: OTCData
    let yj: String
    var kinds: [OTCKind] = [.otc]

    var body: some View {
        // 詳しい画面は、対象になっている制度のほうを開く
        let open = kinds.first { data.isTarget($0, yj) } ?? kinds[0]
        NavigationLink {
            OTCDetailView(yj: yj, kind: open)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(data.name(yj)).font(.headline)
                ForEach(kinds, id: \.self) { OTCVerdict(kind: $0, target: data.isTarget($0, yj)) }
                ForEach(kinds, id: \.self) { OTCPriceLine(data: data, kind: $0, yj: yj) }
            }
            .padding(.vertical, 2)
        }
    }
}

/// 同じ成分・剤形・規格の長期収載品（選定療養の対象）への行
struct OTCBrandRow: View {
    let data: OTCData
    let yj: String
    var body: some View {
        NavigationLink {
            OTCDetailView(yj: yj, kind: .sentei)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(data.name(yj)).font(.headline)
                OTCVerdict(kind: .sentei, target: true)
                OTCPriceLine(data: data, kind: .sentei, yj: yj)
            }
            .padding(.vertical, 2)
        }
    }
}

/// 後発医薬品などを読んだとき：同じ成分・剤形・規格の長期収載品（選定療養の対象）を並べる
struct OTCBrandRows: View {
    let data: OTCData
    let yj: String
    var body: some View {
        let brands = data.senteiBrands(yj)
        if !brands.isEmpty {
            Text("同じ成分・剤形・規格の先発医薬品（長期収載品）：患者さんの希望でこちらを使うと選定療養の対象")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(brands, id: \.self) { OTCBrandRow(data: data, yj: $0).padding(.leading, 16) }
        }
    }
}

/// 調べた結果（製品が複数のこともある）
struct OTCLookupRows: View {
    let data: OTCData
    let result: OTCLookup
    var kinds: [OTCKind] = [.otc]

    var body: some View {
        switch result {
        case .offline:
            WarningRow("この製品は端末の中の表に無く、PMDA にも問い合わせられませんでした。電波のあるところで読み直すか、下の「名前で探す」を使ってください。")
        case .notFound:
            WarningRow("このコードの医療用医薬品が見つかりませんでした。下の「名前で探す」を使ってください。")
        case .found(let list, _):
            if list.count > 1 {
                Text("この添付文書には\(list.count)製品が載っています。手元の製品を確かめてください。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(list, id: \.self) { y in
                OTCProductRow(data: data, yj: y, kinds: kinds)
                if kinds.contains(.sentei) { OTCBrandRows(data: data, yj: y) }
            }
        }
    }
}

/// バーコード画面の読み取り結果に出す、OTC類似薬・選定療養の対象かどうか
struct OTCBadge: View {
    let gtin: String
    @State private var data: OTCData?
    @State private var result: OTCLookup?

    var body: some View {
        Group {
            if let data, let result {
                if case .found = result {
                    OTCLookupRows(data: data, result: result, kinds: [.otc, .sentei])
                } else {
                    Text(result == .offline ? "OTC類似薬・選定療養：調べられませんでした（電波を確かめてください）" : "OTC類似薬・選定療養：製品が見つかりませんでした")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("OTC類似薬・選定療養の対象か調べています…").font(.caption).foregroundStyle(.secondary)
            }
        }
        .task(id: gtin) {
            result = nil
            data = await OTC.load()
            result = await OTC.lookup(gtin)
        }
    }
}

/// PTPシートや箱のバーコード、または名前で、その制度の特別の料金の対象かどうかを出す
struct OTCView: View {
    var kind: OTCKind = .otc
    @State private var data: OTCData?
    @State private var gtin: String?
    @State private var result: OTCLookup?
    @State private var manual = ""
    @State private var query = ""
    @State private var auth = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        VStack(spacing: 0) {
            camera
                .frame(maxWidth: .infinity)
                .frame(height: 240)
                .clipped()
            Form {
                if let g = gtin {
                    Section("読み取り結果（GTIN \(g)）") {
                        if let data, let result {
                            OTCLookupRows(data: data, result: result, kinds: [kind])
                        } else {
                            Text("調べています…").foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    HStack {
                        TextField("GTIN（14桁）を手入力", text: $manual)
                            .keyboardType(.numberPad)
                        Button("調べる") { handle(manual) }
                            .disabled(manual.isEmpty)
                    }
                } footer: {
                    Text("PTPシートのGS1データバー、箱のGS1-128・GS1データバーを読めます。箱のコードは端末の中の表で、PTPシートのコードはPMDAの添付文書（電波が必要）で製品を調べます。")
                }
                Section {
                    TextField(kind.searchHint, text: $query)
                    if let data, query.trimmingCharacters(in: .whitespaces).count >= 2 {
                        let hits = data.search(query, kind: kind)
                        if hits.isEmpty {
                            Text("見つかりませんでした").foregroundStyle(.secondary)
                        }
                        ForEach(hits, id: \.self) { y in
                            OTCProductRow(data: data, yj: y, kinds: [kind])
                            if kind == .sentei { OTCBrandRows(data: data, yj: y) }
                        }
                    }
                }
                Section {
                    Text(kind.about).font(.callout)
                    Link("厚労省のページを開く", destination: URL(string: kind.url)!)
                } header: {
                    Text("制度のあらまし")
                } footer: {
                    if let data {
                        Text("\(kind == .otc ? data.source : data.senteiSource)、\(data.hot)をもとに判定しています。最終的な判断は、処方箋の記載・医師の判断（対象外に当たるか）と最新の厚労省の資料で確かめてください。")
                    }
                }
            }
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { data = await OTC.load() }
        .onAppear {
            if auth == .notDetermined {
                AVCaptureDevice.requestAccess(for: .video) { _ in
                    DispatchQueue.main.async { auth = AVCaptureDevice.authorizationStatus(for: .video) }
                }
            }
        }
    }

    @ViewBuilder private var camera: some View {
        if auth == .authorized {
            ZStack {
                BarcodeScanner(torch: false, paused: false) { handle($0) }
                RoundedRectangle(cornerRadius: 12)
                    .stroke(.white.opacity(0.85), lineWidth: 2)
                    .frame(width: 260, height: 110)
                    .allowsHitTesting(false)
            }
        } else {
            Color.black.overlay(Text("カメラの使用が許可されていません").foregroundStyle(.white))
        }
    }

    private func handle(_ code: String) {
        guard let g = GS1.parse(code).gtin, g != gtin else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        gtin = g
        result = nil
        Task { result = await OTC.lookup(g) }
    }
}

/// 製品ごとの詳しい画面：判定・価格・特別の料金の計算・対象外になる場合
struct OTCDetailView: View {
    let yj: String
    var kind: OTCKind = .otc
    @State private var data: OTCData?
    @State private var qty = ""
    @State private var dq = ""

    var body: some View {
        Form {
            if let d = data {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(d.name(yj)).font(.title3.bold())
                        OTCVerdict(kind: kind, target: d.isTarget(kind, yj))
                        Text("YJコード \(yj)").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if kind == .otc {
                    otcContent(d)
                } else {
                    senteiContent(d)
                }
                if d.targets[yj] != nil && d.sentei[yj] != nil {
                    Section("OTC類似薬で、長期収載品でもある薬") {
                        Text("OTC類似薬の別途の負担（4分の1）の対象になるときは、選定療養の特別の料金はかかりません。OTC類似薬の対象外に当たり、患者さんの希望で長期収載品を使うときは、選定療養の特別の料金の対象です。同じ処方箋に両方の対象があるときは、特別の料金をそれぞれ計算します（選定療養の分だけ消費税がかかる）。")
                            .font(.callout)
                    }
                }
                Section {
                    Link("添付文書を見る（PMDA）", destination: URL(string: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/\(yj.prefix(7))")!)
                }
            } else {
                Text("読み込んでいます…").foregroundStyle(.secondary)
            }
        }
        .calcForm(kind.short, clearable: false)
        .task { data = await OTC.load() }
    }

    @ViewBuilder private func otcContent(_ d: OTCData) -> some View {
        if let t = d.targets[yj] {
            Section("価格（厚労省マスタ）") {
                LabeledContent("成分", value: t.ingredient)
                LabeledContent("規格", value: t.spec)
                LabeledContent("メーカー", value: t.maker)
                LabeledContent("薬価", value: "\(fmtTrim(t.price))円")
                LabeledContent("価格の4分の1（別途の負担）", value: "\(fmtTrim(t.quarter))円")
                LabeledContent("保険外併用療養費の算出に用いる価格", value: "\(fmtTrim(t.base))円")
            }
            Section {
                NumField(title: "投薬全量", text: $qty, unit: OTC.unit(t.spec))
                if let q = parseNum(qty), q > 0 {
                    ResultRow(title: "特別の料金", value: "\(OTC.fee(t.quarter * q))", unit: "円",
                              note: "\(fmtTrim(t.quarter))円 × \(fmtTrim(q)) ＝ \(fmtTrim(t.quarter * q))円", color: otcOrange)
                    ResultRow(title: "保険の対象となる価格の合計", value: fmtTrim(t.base * q), unit: "円",
                              note: "薬剤料の点数はこの価格で算定（1剤1日分ごとに五捨五超入）", big: false)
                }
            } header: {
                Text("別途の負担（特別の料金）の計算")
            } footer: {
                Text("特別の料金 ＝ 価格の4分の1 × 投薬全量。10円以上なら5円未満の端数は切り捨て、5円以上は10円に切り上げ、10円未満は10円。同じ処方箋に対象医薬品が複数あるときは合算してから丸めます。保険の分（自己負担）は「保険外併用療養費の算出に用いる価格」で薬剤料を算定します。")
            }
            Section("この製品で対象外になる場合") {
                LabeledContent("妊婦・妊娠の可能性がある者", value: d.pregnant.contains(yj) ? "対象外になる" : "該当なし")
                LabeledContent("授乳婦", value: d.lactating.contains(yj) ? "対象外になる" : "該当なし")
            }
            let eff = d.effects[yj] ?? []
            if !eff.isEmpty {
                Section {
                    ForEach(eff, id: \.self) { Text($0) }
                } header: {
                    Text("この効能・効果で使うときは対象外")
                } footer: {
                    Text("類似のOTC医薬品では承認されていない効能・効果です。")
                }
            }
            let dis = d.diseases[t.ingredient] ?? []
            if !dis.isEmpty {
                Section("この傷病名で使うときは対象外（例 \(dis.count)件・成分 \(t.ingredient)）") {
                    TextField("傷病名で絞り込む", text: $dq)
                    let shown = dis.filter { matchesSearch($0, dq) }
                    ForEach(shown.prefix(100), id: \.self) { Text($0).font(.callout) }
                    if shown.count > 100 {
                        Text("ほか\(shown.count - 100)件（絞り込んでください）").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        } else {
            Section {
                Text("この製品は別途の負担（薬剤費の4分の1）の対象ではありません。")
            } footer: {
                Text("厚労省の対象医薬品リストに無い製品です。通常どおりの保険給付です。")
            }
        }
        Section("次のいずれかに当たるときは、どの対象医薬品も別途の負担の対象外") {
            ForEach(Array(OTC.exemptions.enumerated()), id: \.offset) { i, x in
                Text("\(i + 1). \(x)").font(.callout)
            }
        }
    }

    @ViewBuilder private func senteiContent(_ d: OTCData) -> some View {
        if let t = d.sentei[yj] {
            Section("価格（厚労省マスタ）") {
                LabeledContent("成分", value: t.ingredient)
                LabeledContent("規格", value: t.spec)
                LabeledContent("メーカー", value: t.maker)
                LabeledContent("薬価", value: "\(fmtTrim(t.price))円")
                LabeledContent("後発医薬品の最高価格", value: "\(fmtTrim(t.generic))円")
                LabeledContent("価格差の2分の1（特別の料金）", value: "\(fmtTrim(t.half))円")
                LabeledContent("保険外併用療養費の算出に用いる価格", value: "\(fmtTrim(t.base))円")
            }
            Section {
                NumField(title: "投薬全量", text: $qty, unit: OTC.unit(t.spec))
                if let q = parseNum(qty), q > 0 {
                    let f = OTC.senteiFee(t.half * q)
                    ResultRow(title: "特別の料金（消費税込み）", value: "\(f.withTax)", unit: "円",
                              note: "\(fmtTrim(t.half))円 × \(fmtTrim(q)) ＝ \(fmtTrim(t.half * q))円 → \(f.fee)円 × 1.1", color: otcOrange)
                    ResultRow(title: "特別の料金（税抜き）", value: "\(f.fee)", unit: "円", big: false)
                    ResultRow(title: "保険の対象となる価格の合計", value: fmtTrim(t.base * q), unit: "円",
                              note: "薬剤料の点数はこの価格で算定（1剤1日分ごとに五捨五超入）", big: false)
                }
            } header: {
                Text("特別の料金の計算")
            } footer: {
                Text("特別の料金 ＝ 価格差の2分の1 × 投薬全量（10円以上なら5円未満の端数は切り捨て、5円以上は10円に切り上げ、10円未満は10円）に消費税（10%）を加える。同じ処方箋に対象の長期収載品が複数あるときは合算してから丸めます。保険の分（自己負担）は「保険外併用療養費の算出に用いる価格」で薬剤料を算定します。")
            }
            Section {
                Text("・処方箋の「患者希望」欄に「✓」又は「×」がある銘柄名処方").font(.callout)
                Text("・一般名処方、または「変更不可（医療上必要）」「患者希望」のどちらにも記載の無い銘柄名処方で、患者さんが長期収載品を希望したとき").font(.callout)
            } header: {
                Text("選定療養の対象になるとき")
            } footer: {
                Text("患者さんの希望で長期収載品を使う場合に限ります。調剤時にも選定療養について説明し、希望を確かめます。")
            }
        } else {
            Section {
                Text("この製品は長期収載品の選定療養（特別の料金）の対象ではありません。")
            } footer: {
                Text("厚労省の対象医薬品リストに無い製品です（後発医薬品、後発医薬品の無い先発医薬品、後発医薬品との価格差の無いものなど）。通常どおりの保険給付です。")
            }
            let brands = d.senteiBrands(yj)
            if !brands.isEmpty {
                Section {
                    ForEach(brands, id: \.self) { OTCBrandRow(data: d, yj: $0) }
                } header: {
                    Text("同じ成分・剤形・規格の先発医薬品（長期収載品）")
                } footer: {
                    Text("YJコードの先頭9桁（成分・剤形・規格）が同じ製品です。患者さんの希望でこちらを使うと選定療養の対象です。")
                }
            }
        }
        Section("次のいずれかに当たるときは選定療養の対象外（通常の保険給付）") {
            ForEach(Array(OTC.senteiExemptions.enumerated()), id: \.offset) { i, x in
                Text("\(i + 1). \(x)").font(.callout)
            }
        }
    }
}
