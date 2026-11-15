import SwiftUI

/// 腎機能で用量調節・禁忌がある薬（data/renal_drugs.json。添付文書の該当箇所をそのまま載せる）
struct RenalDrug: Decodable, Identifiable, Hashable {
    struct Excerpt: Decodable, Hashable {
        var section: String
        var text: String
    }
    var category: String
    var name: String
    var products: String
    var generic: String
    var pmda: String?
    var excerpts: [Excerpt]
    /// 添付文書に腎機能の数値の基準が無い（腎機能に触れた記載だけ）
    var noNumbers: Bool?

    var id: String { name }
    var pmdaURL: URL? {
        pmda.flatMap { URL(string: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/\($0)") }
    }
}

enum RenalDrugData {
    private struct File: Decodable {
        var source: String
        var drugs: [RenalDrug]
    }

    private static let file: File? = {
        guard let url = Bundle.main.url(forResource: "renal_drugs", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(File.self, from: data)
    }()

    static var drugs: [RenalDrug] { file?.drugs ?? [] }
    static var source: String { file?.source ?? "" }
    static var categories: [String] {
        var seen: [String] = []
        for d in drugs where !seen.contains(d.category) { seen.append(d.category) }
        return seen
    }
}

/// 患者情報から出した腎機能（入力が足りなければ nil）
struct PatientRenalSummary: View {
    @EnvironmentObject var p: PatientStore

    var body: some View {
        let age = p.ageV, w = p.weightV, h = p.heightV, cr = p.scrV
        if let age, let cr, age > 0, cr > 0 {
            if let w, w > 0 {
                ResultRow(title: "CCr（実体重）", value: fmt(Renal.cockcroftGault(age: age, weight: w, scr: cr, sex: p.sex)), unit: "mL/min")
            }
            let e = Renal.egfrCr(age: age, scr: cr, sex: p.sex)
            ResultRow(title: "eGFR", value: fmt(e), unit: "mL/min/1.73m²", big: false)
            if let w, let h, w > 0, h > 0 {
                ResultRow(title: "eGFR（体表面積未補正）", value: fmt(Renal.deindex(e, bsa: BodyCalc.bsaDuBois(weight: w, height: h))),
                          unit: "mL/min", big: false)
            }
        } else {
            MissingRow("腎機能の画面で年齢・体重・血清Crを入れると、ここに表示します")
        }
    }
}

struct RenalDrugsView: View {
    @State private var query = ""
    @State private var category: String?

    private func list(_ c: String) -> [RenalDrug] {
        RenalDrugData.drugs.filter {
            $0.category == c && (query.isEmpty || ($0.name + $0.products + $0.generic).localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        Form {
            Section("この患者の腎機能") {
                PatientRenalSummary()
            }
            Section {
                TextField("薬の名前・成分で探す", text: $query)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        chip("すべて", selected: category == nil) { category = nil }
                        ForEach(RenalDrugData.categories, id: \.self) { c in
                            chip(c, selected: category == c) { category = c }
                        }
                    }
                }
            }
            ForEach(RenalDrugData.categories.filter { category == nil || $0 == category }, id: \.self) { c in
                let l = list(c)
                if !l.isEmpty {
                    Section(c) {
                        ForEach(l) { d in
                            NavigationLink {
                                RenalDrugDetailView(drug: d)
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(d.name).font(.headline)
                                    Text(d.generic).font(.caption).foregroundStyle(.secondary)
                                    HStack(spacing: 6) {
                                        if d.noNumbers == true {
                                            Text("数値の基準なし")
                                                .font(.caption2.bold())
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Capsule().fill(Color.gray.opacity(0.15)))
                                                .foregroundStyle(.secondary)
                                        }
                                        ForEach(Array(Set(d.excerpts.map(\.section))).sorted(), id: \.self) { s in
                                            Text(badge(s))
                                                .font(.caption2.bold())
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Capsule().fill(s == "禁忌" ? Color.red.opacity(0.15) : Color.accentColor.opacity(0.12)))
                                                .foregroundStyle(s == "禁忌" ? Color.red : Color.accentColor)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Section {
                EmptyView()
            } footer: {
                Text("\(RenalDrugData.source)の「禁忌」「効能又は効果に関連する注意」「用法及び用量」「用法及び用量に関連する注意」「重要な基本的注意」「9.2 腎機能障害患者」と、参考として「16.6 薬物動態」から、クレアチニン・CCr・eGFR などの基準が書かれた項目をそのまま載せています。数値の基準が無い薬は、腎機能に触れた記載（禁忌・用量の注意・9.2 など）を載せています。同じ成分でも製品によって記載が違うことがあるので、処方された製品の添付文書で確認してください。")
            }
        }
        .calcForm("腎機能で注意する薬")
    }

    private func badge(_ s: String) -> String {
        switch s {
        case "禁忌": return "禁忌"
        case "用法及び用量": return "用量"
        case "用法及び用量に関連する注意": return "用量の注意"
        case "効能又は効果に関連する注意": return "効能の注意"
        case "重要な基本的注意": return "重要な注意"
        case "9.2 腎機能障害患者": return "腎機能障害"
        default: return "薬物動態（参考）"
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.caption)
            .buttonStyle(.bordered)
            .tint(selected ? .accentColor : .gray)
    }
}

struct RenalDrugDetailView: View {
    let drug: RenalDrug
    @State private var web: WebPage?

    var body: some View {
        Form {
            Section {
                Text(drug.products).font(.callout)
                Text(drug.generic).font(.caption).foregroundStyle(.secondary)
            }
            Section("この患者の腎機能") {
                PatientRenalSummary()
            }
            ForEach(Array(drug.excerpts.enumerated()), id: \.offset) { _, e in
                Section(e.section) {
                    Text(e.text)
                        .font(.callout)
                        .textSelection(.enabled)
                        .foregroundStyle(e.section == "禁忌" ? Color.red : Color.primary)
                }
            }
            if let url = drug.pmdaURL {
                Section {
                    Button {
                        web = WebPage(url: url)
                    } label: {
                        Label("添付文書を見る（PMDA）", systemImage: "doc.text.magnifyingglass")
                    }
                } footer: {
                    Text("同じ成分の製品の一覧が開きます。処方された製品の添付文書を確認してください。")
                }
            }
        }
        .navigationTitle(drug.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $web) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }
}
