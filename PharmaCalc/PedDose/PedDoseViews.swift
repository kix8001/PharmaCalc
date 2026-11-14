import SwiftUI

/// 小児用量（薬剤別）：年齢・体重から登録した薬の用量を一覧で出す
struct PedDoseView: View {
    @EnvironmentObject var p: PatientStore
    @EnvironmentObject var store: PedDrugStore
    @State private var query = ""
    @State private var adding = false

    private var list: [PedDrug] {
        guard !query.isEmpty else { return store.drugs }
        return store.drugs.filter { ($0.name + $0.ingredient).localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        Form {
            Section {
                NumField(title: "年齢", text: $p.age, unit: "歳")
                NumField(title: "体重", text: $p.weight, unit: "kg")
            } header: {
                Text("患者情報（共通）")
            } footer: {
                Text("年齢は小数でも入れられます（例：1歳6か月 → 1.5）。")
            }
            Section {
                TextField("薬の名前・成分で絞り込む", text: $query)
            }
            Section {
                ForEach(list) { d in
                    NavigationLink {
                        PedDrugEditView(original: d)
                    } label: {
                        PedDrugRow(drug: d, age: p.ageV, weight: p.weightV)
                    }
                }
                .onDelete { idx in
                    let ids = idx.map { list[$0].id }
                    store.drugs.removeAll { ids.contains($0.id) }
                }
                Button {
                    adding = true
                } label: {
                    Label("薬を追加", systemImage: "plus.circle")
                }
            } header: {
                Text("薬（タップで編集、左にスワイプで削除）")
            } footer: {
                Text("初期登録は添付文書の小児用量をもとにした目安です。適応症・剤形で用量が違う場合があるので、必ず最新の添付文書で確認してください。")
            }
            Section {
                Button("初期の薬に戻す", role: .destructive) { store.resetToPresets() }
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
                let u = drug.unit, d = drug.isSyrup ? 1 : 2
                Text("1日 \(range(r.dailyLo, r.dailyHi, 1))mg → \(range(r.dailyLo / drug.conc, r.dailyHi / drug.conc, d))\(u)")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.tint)
                Text("1回 \(range(r.doseLo, r.doseHi, 1))mg → \(range(r.doseLo / drug.conc, r.doseHi / drug.conc, d))\(u)（1日\(r.times)回）")
                    .font(.callout.monospacedDigit())
                if r.capped {
                    Text("上限で頭打ちにしています").font(.caption).foregroundStyle(.orange)
                }
            case .failure(let e):
                Text(e.message).font(.callout).foregroundStyle(.secondary)
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

    @State private var name = ""
    @State private var ingredient = ""
    @State private var isSyrup = false
    @State private var conc = ""
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

    struct BandText: Identifiable {
        var id = UUID()
        var below = ""
        var min = ""
        var max = ""
    }

    private var built: PedDrug? {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty, let c = parseNum(conc), c > 0,
              let t = parseInt(times), t > 0 else { return nil }
        var d = PedDrug(id: original?.id ?? UUID(), name: name, ingredient: ingredient, isSyrup: isSyrup, conc: c,
                        basis: basis, times: t, note: note)
        switch basis {
        case .day, .dose:
            guard let lo = parseNum(minPerKg), lo > 0 else { return nil }
            d.minPerKg = lo
            d.maxPerKg = max(lo, parseNum(maxPerKg) ?? lo)
        case .age:
            let list = bands.compactMap { b -> AgeBand? in
                guard let bl = parseNum(b.below), let lo = parseNum(b.min), bl > 0, lo > 0 else { return nil }
                return AgeBand(below: bl, min: lo, max: max(lo, parseNum(b.max) ?? lo))
            }
            guard !list.isEmpty else { return nil }
            d.bands = list
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
                Picker("剤形", selection: $isSyrup) {
                    Text("散・DS（g）").tag(false)
                    Text("シロップ（mL）").tag(true)
                }
                .pickerStyle(.segmented)
                NumField(title: isSyrup ? "1mLあたりの成分量" : "1gあたりの成分量", text: $conc, unit: "mg")
            } footer: {
                Text("例：50%散 → 500mg、10%DS → 100mg、5%シロップ → 50mg（1mLあたり）")
            }
            Section("用量") {
                Picker("決め方", selection: $basis) {
                    ForEach(DoseBasis.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                if basis == .age {
                    ForEach($bands) { $b in
                        HStack {
                            TextField("歳", text: $b.below).keyboardType(.decimalPad).frame(width: 44)
                            Text("歳未満").font(.caption)
                            TextField("最小", text: $b.min).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("〜")
                            TextField("最大", text: $b.max).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("mg/日").font(.caption)
                        }
                    }
                    .onDelete { bands.remove(atOffsets: $0) }
                    Button("年齢の区切りを追加") { bands.append(BandText()) }
                } else {
                    NumField(title: "最小", text: $minPerKg, unit: basis == .day ? "mg/kg/日" : "mg/kg/回")
                    NumField(title: "最大（任意）", text: $maxPerKg, unit: basis == .day ? "mg/kg/日" : "mg/kg/回")
                }
                NumField(title: "1日の回数", text: $times, unit: "回", integer: true)
            }
            Section("上限（任意）") {
                NumField(title: "1回の上限", text: $maxDose, unit: "mg")
                NumField(title: "1日の上限", text: $maxDaily, unit: "mg")
                NumField(title: "1日の上限（体重あたり）", text: $maxDailyPerKg, unit: "mg/kg")
            }
            Section("メモ") {
                TextField("用法の注意など", text: $note, axis: .vertical)
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
        isSyrup = d.isSyrup
        conc = fmtTrim(d.conc, 3)
        basis = d.basis
        minPerKg = d.minPerKg > 0 ? fmtTrim(d.minPerKg, 3) : ""
        maxPerKg = d.maxPerKg > 0 ? fmtTrim(d.maxPerKg, 3) : ""
        times = "\(d.times)"
        maxDose = d.maxDoseMg.map { fmtTrim($0, 2) } ?? ""
        maxDaily = d.maxDailyMg.map { fmtTrim($0, 2) } ?? ""
        maxDailyPerKg = d.maxDailyPerKg.map { fmtTrim($0, 2) } ?? ""
        bands = d.bands.map { BandText(below: fmtTrim($0.below, 1), min: fmtTrim($0.min, 1), max: fmtTrim($0.max, 1)) }
        if bands.isEmpty { bands = [BandText()] }
        note = d.note
    }
}
