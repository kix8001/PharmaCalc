import SwiftUI

/// 小児用量（薬剤別）：年齢・体重から登録した薬の用量を一覧で出す
struct PedDoseView: View {
    @EnvironmentObject var p: PatientStore
    @EnvironmentObject var store: PedDrugStore
    @State private var query = ""
    @State private var category: String?
    @State private var adding = false
    @State private var web: WebPage?

    private func filtered(_ c: String) -> [PedDrug] {
        store.drugs.filter { d in
            (d.category ?? "自分で追加") == c &&
            matchesSearch(d.name + d.ingredient, query)
        }
    }

    var body: some View {
        Form {
            Section {
                NumField(title: "年齢", text: $p.age, unit: "歳")
                NumField(title: "＋か月（1歳未満など）", text: $p.months, unit: "か月")
                NumField(title: "体重", text: $p.weight, unit: "kg")
            } header: {
                Text("患者情報（共通）")
            } footer: {
                Text("1歳未満は「か月」だけ入れてください（例：6か月 → 年齢は空欄、か月に6）。1歳6か月なら 1歳＋6か月。")
            }
            Section {
                TextField("薬の名前・成分で絞り込む", text: $query)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        chip("すべて", selected: category == nil) { category = nil }
                        ForEach(store.categories, id: \.self) { c in
                            chip(c, selected: category == c) { category = c }
                        }
                    }
                }
            }
            ForEach(store.categories.filter { category == nil || $0 == category }, id: \.self) { c in
                let list = filtered(c)
                if !list.isEmpty {
                    Section(c) {
                        ForEach(list) { d in
                            NavigationLink {
                                PedDrugEditView(original: d)
                            } label: {
                                PedDrugRow(drug: d, age: p.ageV, weight: p.weightV)
                            }
                            .contextMenu {
                                if let url = d.pmdaURL {
                                    Button {
                                        web = WebPage(url: url)
                                    } label: {
                                        Label("添付文書を見る（PMDA）", systemImage: "doc.text.magnifyingglass")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Section {
                Button {
                    adding = true
                } label: {
                    Label("薬を追加", systemImage: "plus.circle")
                }
                Button("初期の薬に戻す", role: .destructive) { store.resetToPresets() }
            } footer: {
                Text("初期登録は PMDA の電子添文（2026年11月）の用法及び用量と照合しています。適応症で用量が違う薬もあるので、迷ったら長押し→「添付文書を見る」で確認してください。「用量未登録」の薬は、タップして用量を入れられます。")
            }
        }
        .calcForm("小児用量（薬剤別）")
        .sheet(isPresented: $adding) {
            NavigationStack {
                PedDrugEditView(original: nil)
            }
            .environmentObject(store)
            .environmentObject(p)
        }
        .sheet(item: $web) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.caption)
            .buttonStyle(.bordered)
            .tint(selected ? .accentColor : .gray)
    }
}

struct PedDrugRow: View {
    let drug: PedDrug
    let age: Double?
    let weight: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(drug.name).font(.headline)
                if !drug.ingredient.isEmpty {
                    Text(drug.ingredient).font(.caption).foregroundStyle(.secondary)
                }
            }
            switch drug.compute(age: age, weight: weight) {
            case .success(let r):
                if let l = r.bandLabel {
                    Text("\(l)の用量").font(.caption.bold()).foregroundStyle(.secondary)
                }
                let a = drug.amount, u = drug.unit, d = drug.isSyrup ? 1 : 2
                let ad = a == "μg" ? 1 : 2
                if drug.hasProduct {
                    Text("1日 \(range(r.dailyLo, r.dailyHi, ad))\(a) → \(range(r.dailyLo / drug.conc, r.dailyHi / drug.conc, d))\(u)")
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.tint)
                    Text("1回 \(range(r.doseLo, r.doseHi, ad))\(a) → \(range(r.doseLo / drug.conc, r.doseHi / drug.conc, d))\(u)（1日\(r.times)回）")
                        .font(.callout.monospacedDigit())
                } else {
                    Text("1日 \(range(r.dailyLo, r.dailyHi, ad))\(a)")
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.tint)
                    Text("1回 \(range(r.doseLo, r.doseHi, ad))\(a)（1日\(r.times)回）")
                        .font(.callout.monospacedDigit())
                }
                if r.capped {
                    Text("上限で頭打ちにしています").font(.caption).foregroundStyle(.orange)
                }
            case .failure(let e):
                if e == .memo {
                    if drug.note.contains("添付文書で用量を確認") {
                        Text("用量未登録").font(.caption.bold()).foregroundStyle(.orange)
                    }
                } else {
                    Text(e.message).font(.callout).foregroundStyle(.secondary)
                }
            }
            if !drug.note.isEmpty {
                Text(drug.note).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// 薬の追加・編集
struct PedDrugEditView: View {
    @EnvironmentObject var store: PedDrugStore
    @Environment(\.dismiss) private var dismiss
    let original: PedDrug?

    enum Form3: Hashable { case powder, syrup, other }

    @State private var name = ""
    @State private var ingredient = ""
    @State private var category = ""
    @State private var form = Form3.powder
    @State private var formUnit = "錠"
    @State private var conc = ""
    @State private var microgram = false
    @State private var basis = DoseBasis.day
    @State private var minPerKg = ""
    @State private var maxPerKg = ""
    @State private var times = "3"
    @State private var maxDose = ""
    @State private var maxDaily = ""
    @State private var maxDailyPerKg = ""
    @State private var bands: [BandText] = []
    @State private var note = ""
    @State private var loaded = false
    @State private var web: WebPage?

    struct BandText: Identifiable {
        var id = UUID()
        var below = ""
        var min = ""
        var max = ""
        var times = ""
        var perKg = false
        var perDose = false
    }

    private var amountUnit: String { microgram ? "μg" : "mg" }

    private var built: PedDrug? {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty, let t = parseInt(times), t > 0 else { return nil }
        let c = parseNum(conc) ?? 0
        var d = PedDrug(id: original?.id ?? UUID(), name: name, ingredient: ingredient, isSyrup: form == .syrup, conc: max(0, c),
                        basis: basis, times: t, note: note,
                        category: category.trimmingCharacters(in: .whitespaces).isEmpty ? nil : category,
                        formUnit: form == .other ? formUnit : nil, amountUnit: microgram ? "μg" : nil, pmda: original?.pmda)
        switch basis {
        case .day, .dose:
            guard let lo = parseNum(minPerKg), lo > 0 else { return nil }
            d.minPerKg = lo
            d.maxPerKg = max(lo, parseNum(maxPerKg) ?? lo)
        case .age, .weight:
            let list = bands.compactMap { b -> AgeBand? in
                guard let bl = parseNum(b.below), bl > 0 else { return nil }
                let lo = parseNum(b.min) ?? 0
                return AgeBand(below: bl, min: lo, max: max(lo, parseNum(b.max) ?? lo),
                               times: parseInt(b.times).flatMap { $0 > 0 ? $0 : nil }, perKg: b.perKg ? true : nil,
                               perDose: b.perDose ? true : nil)
            }
            guard !list.isEmpty else { return nil }
            d.bands = list
        case .memo:
            break
        }
        d.maxDoseMg = parseNum(maxDose).flatMap { $0 > 0 ? $0 : nil }
        d.maxDailyMg = parseNum(maxDaily).flatMap { $0 > 0 ? $0 : nil }
        d.maxDailyPerKg = parseNum(maxDailyPerKg).flatMap { $0 > 0 ? $0 : nil }
        return d
    }

    var body: some View {
        Form {
            Section {
                TextField("薬の名前（例：ムコダインDS50%）", text: $name)
                TextField("成分名（任意）", text: $ingredient)
                TextField("分類（任意、例：抗菌薬）", text: $category)
            }
            Section {
                Picker("剤形", selection: $form) {
                    Text("散・DS（g）").tag(Form3.powder)
                    Text("シロップ（mL）").tag(Form3.syrup)
                    Text("その他").tag(Form3.other)
                }
                .pickerStyle(.segmented)
                if form == .other {
                    TextField("単位（錠・包・個・枚など）", text: $formUnit)
                }
                Picker("成分量の単位", selection: $microgram) {
                    Text("mg").tag(false)
                    Text("μg").tag(true)
                }
                .pickerStyle(.segmented)
                NumField(title: "1\(form == .other ? formUnit : (form == .syrup ? "mL" : "g"))あたりの成分量", text: $conc, unit: amountUnit)
            } header: {
                Text("剤形")
            } footer: {
                Text("例：50%散 → 500mg、10%DS → 100mg、5%シロップ → 50mg（1mLあたり）。0や空欄なら製剤量は出さず、成分量だけ出します。")
            }
            Section("用量") {
                Picker("決め方", selection: $basis) {
                    ForEach(DoseBasis.allCases) { Text($0.label).tag($0) }
                }
                switch basis {
                case .age, .weight:
                    let k = basis == .age ? "歳" : "kg"
                    ForEach($bands) { $b in
                        VStack(alignment: .leading) {
                            HStack {
                                TextField(k, text: $b.below).keyboardType(.decimalPad).frame(width: 48)
                                Text("\(k)未満").font(.caption)
                                TextField("最小", text: $b.min).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                                Text("〜")
                                TextField("最大", text: $b.max).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                                Text("\(amountUnit)\(b.perKg ? "/kg" : "")/\(b.perDose ? "回" : "日")").font(.caption)
                            }
                            Toggle("体重1kgあたりの量", isOn: $b.perKg).font(.caption)
                            Toggle("1回量で入れる（オフなら1日量）", isOn: $b.perDose).font(.caption)
                            HStack {
                                Text("この範囲の1日の回数（任意）").font(.caption).foregroundStyle(.secondary)
                                TextField("回", text: $b.times).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                            }
                        }
                    }
                    .onDelete { bands.remove(atOffsets: $0) }
                    Button("区切りを追加") { bands.append(BandText()) }
                    Text("最小・最大を0にすると「用量の記載なし」と表示します（対象年齢外など）。\(basis == .age ? "1歳未満の区切りは小数で（6か月 → 0.5、3か月 → 0.25）。" : "")").font(.caption).foregroundStyle(.secondary)
                case .day, .dose:
                    let u = basis == .day ? "\(amountUnit)/kg/日" : "\(amountUnit)/kg/回"
                    NumField(title: "最小", text: $minPerKg, unit: u)
                    NumField(title: "最大（任意）", text: $maxPerKg, unit: u)
                case .memo:
                    Text("用量は計算せず、メモだけ表示します。").font(.caption).foregroundStyle(.secondary)
                }
                NumField(title: "1日の回数", text: $times, unit: "回", integer: true)
            }
            if basis != .memo {
                Section("上限（任意）") {
                    NumField(title: "1回の上限", text: $maxDose, unit: amountUnit)
                    NumField(title: "1日の上限", text: $maxDaily, unit: amountUnit)
                    NumField(title: "1日の上限（体重あたり）", text: $maxDailyPerKg, unit: "\(amountUnit)/kg")
                }
            }
            Section("メモ") {
                TextField("用法の注意など", text: $note, axis: .vertical)
            }
            if let url = original?.pmdaURL {
                Section {
                    Button {
                        web = WebPage(url: url)
                    } label: {
                        Label("添付文書を見る（PMDA）", systemImage: "doc.text.magnifyingglass")
                    }
                } footer: {
                    Text("同じ成分の製品の一覧が開きます。目的の製品の「HTML」か「PDF」を選んでください。")
                }
            }
            if original != nil {
                Section {
                    Button("この薬を削除", role: .destructive) {
                        store.drugs.removeAll { $0.id == original?.id }
                        dismiss()
                    }
                }
            }
        }
        .calcForm(original == nil ? "薬を追加" : "薬を編集")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    guard let d = built else { return }
                    if let i = store.drugs.firstIndex(where: { $0.id == d.id }) {
                        store.drugs[i] = d
                    } else {
                        store.drugs.append(d)
                    }
                    dismiss()
                }
                .disabled(built == nil)
            }
            if original == nil {
                ToolbarItem(placement: .cancellationAction) {
                    Button("やめる") { dismiss() }
                }
            }
        }
        .onAppear(perform: load)
        .sheet(item: $web) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let d = original else {
            bands = [BandText()]
            return
        }
        name = d.name
        ingredient = d.ingredient
        category = d.category ?? ""
        form = d.formUnit != nil ? .other : (d.isSyrup ? .syrup : .powder)
        formUnit = d.formUnit ?? "錠"
        microgram = d.amountUnit == "μg"
        conc = d.conc > 0 ? fmtTrim(d.conc, 3) : ""
        basis = d.basis
        minPerKg = d.minPerKg > 0 ? fmtTrim(d.minPerKg, 3) : ""
        maxPerKg = d.maxPerKg > 0 ? fmtTrim(d.maxPerKg, 3) : ""
        times = "\(d.times)"
        maxDose = d.maxDoseMg.map { fmtTrim($0, 2) } ?? ""
        maxDaily = d.maxDailyMg.map { fmtTrim($0, 2) } ?? ""
        maxDailyPerKg = d.maxDailyPerKg.map { fmtTrim($0, 2) } ?? ""
        bands = d.bands.map {
            BandText(below: fmtTrim($0.below, 3), min: fmtTrim($0.min, 2), max: fmtTrim($0.max, 2),
                     times: $0.times.map { "\($0)" } ?? "", perKg: $0.perKg == true, perDose: $0.perDose == true)
        }
        if bands.isEmpty { bands = [BandText()] }
        note = d.note
    }
}
