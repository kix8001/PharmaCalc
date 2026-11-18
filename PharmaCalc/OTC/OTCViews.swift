import AVFoundation
import SwiftUI

private let otcOrange = Color(red: 0.76, green: 0.25, blue: 0.05)

/// 判定の札：対象（オレンジ）／対象外
struct OTCVerdict: View {
    let target: Bool
    var body: some View {
        Text(target ? "OTC類似薬（別途の負担の対象）" : "OTC類似薬ではない")
            .font(.caption.bold())
            .foregroundStyle(target ? otcOrange : Color.secondary)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(Capsule().fill(target ? Color.orange.opacity(0.16) : Color(.systemGray5)))
    }
}

/// 製品1つの行。押すと詳しい画面へ
struct OTCProductRow: View {
    let data: OTCData
    let yj: String

    var body: some View {
        NavigationLink {
            OTCDetailView(yj: yj)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(data.name(yj)).font(.headline)
                OTCVerdict(target: data.targets[yj] != nil)
                if let t = data.targets[yj] {
                    Text("\(t.spec)・薬価 \(fmtTrim(t.price))円 → 別途の負担 \(fmtTrim(t.quarter))円／\(OTC.unit(t.spec))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

/// 調べた結果（製品が複数のこともある）
struct OTCLookupRows: View {
    let data: OTCData
    let result: OTCLookup

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
            ForEach(list, id: \.self) { OTCProductRow(data: data, yj: $0) }
        }
    }
}

/// バーコード画面の読み取り結果に出す、OTC類似薬かどうか
struct OTCBadge: View {
    let gtin: String
    @State private var data: OTCData?
    @State private var result: OTCLookup?

    var body: some View {
        Group {
            if let data, let result {
                if case .found = result {
                    OTCLookupRows(data: data, result: result)
                } else {
                    Text(result == .offline ? "OTC類似薬：調べられませんでした（電波を確かめてください）" : "OTC類似薬：製品が見つかりませんでした")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("OTC類似薬かどうか調べています…").font(.caption).foregroundStyle(.secondary)
            }
        }
        .task(id: gtin) {
            result = nil
            data = await OTC.load()
            result = await OTC.lookup(gtin)
        }
    }
}

/// OTC類似薬チェック：PTPシートや箱のバーコード、または名前で、別途の負担（薬剤費の4分の1）の対象かどうかを出す
struct OTCView: View {
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
                            OTCLookupRows(data: data, result: result)
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
                    TextField("名前で探す（例：ロキソニン）", text: $query)
                    if let data, query.trimmingCharacters(in: .whitespaces).count >= 2 {
                        let hits = data.search(query)
                        if hits.isEmpty {
                            Text("見つかりませんでした").foregroundStyle(.secondary)
                        }
                        ForEach(hits, id: \.self) { OTCProductRow(data: data, yj: $0) }
                    }
                }
                Section {
                    Text("OTC医薬品との代替性が特に高い医療用医薬品（OTC類似薬）を保険診療で使うと、令和9年3月1日から、薬剤費の4分の1を「別途の負担（特別の料金）」として患者さんが支払います。こども・がん治療・入院中などは対象外です。")
                        .font(.callout)
                    Link("厚労省のページを開く", destination: URL(string: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html")!)
                } header: {
                    Text("制度のあらまし")
                } footer: {
                    if let data {
                        Text("\(data.source)、\(data.hot)をもとに判定しています。最終的な判断は、医師の診察（別途の負担の対象外に当たるか）と最新の厚労省の資料で確かめてください。")
                    }
                }
            }
        }
        .navigationTitle("OTC類似薬チェック")
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
    @State private var data: OTCData?
    @State private var qty = ""
    @State private var dq = ""

    var body: some View {
        Form {
            if let d = data {
                content(d)
            } else {
                Text("読み込んでいます…").foregroundStyle(.secondary)
            }
        }
        .calcForm("OTC類似薬", clearable: false)
        .task { data = await OTC.load() }
    }

    @ViewBuilder private func content(_ d: OTCData) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(d.name(yj)).font(.title3.bold())
                OTCVerdict(target: d.targets[yj] != nil)
                Text("YJコード \(yj)").font(.caption).foregroundStyle(.secondary)
            }
        }
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
        Section {
            Link("添付文書を見る（PMDA）", destination: URL(string: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/\(yj.prefix(7))")!)
        }
    }
}
