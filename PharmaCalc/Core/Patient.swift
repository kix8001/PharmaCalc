import SwiftUI

enum Sex: String, CaseIterable, Identifiable {
    case male = "男性"
    case female = "女性"
    var id: String { rawValue }
}

/// 患者情報。一度入れれば全部の電卓で使い回す。
/// 個人情報なので端末には保存せず、アプリを終了すると消える。
final class PatientStore: ObservableObject {
    @Published var age = ""
    /// 1歳未満などのための「か月」（年齢に足す）
    @Published var months = ""
    @Published var sex: Sex = .male
    @Published var weight = ""
    @Published var height = ""
    @Published var scr = ""
    @Published var cys = ""

    /// 年齢（歳）。か月が入っていれば足す（例：1歳＋6か月 → 1.5）
    var ageV: Double? {
        let y = parseNum(age), m = parseNum(months)
        if y == nil && m == nil { return nil }
        return (y ?? 0) + (m ?? 0) / 12
    }
    var weightV: Double? { parseNum(weight) }
    var heightV: Double? { parseNum(height) }
    var scrV: Double? { parseNum(scr) }
    var cysV: Double? { parseNum(cys) }

    var isEmpty: Bool {
        [age, months, weight, height, scr, cys].allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var summary: String {
        var parts: [String] = []
        if let a = ageV { parts.append(parseNum(months) == nil ? "\(fmt(a, 0))歳" : ageText(a)) }
        parts.append(sex.rawValue)
        if let h = heightV { parts.append("\(fmt(h, 1))cm") }
        if let w = weightV { parts.append("\(fmt(w, 1))kg") }
        if let c = scrV { parts.append("Cr \(fmt(c, 2))") }
        if let c = cysV { parts.append("CysC \(fmt(c, 2))") }
        return parts.joined(separator: "・")
    }

    func clear() {
        age = ""; months = ""; sex = .male; weight = ""; height = ""; scr = ""; cys = ""
    }
}

enum PField: Hashable { case age, months, sex, weight, height, scr, cys }

/// 患者情報の入力欄（必要な項目だけ出す）
struct PatientFields: View {
    @EnvironmentObject var p: PatientStore
    var fields: Set<PField>

    var body: some View {
        if fields.contains(.age) { NumField(title: "年齢", text: $p.age, unit: "歳") }
        if fields.contains(.months) { NumField(title: "＋か月（1歳未満など）", text: $p.months, unit: "か月") }
        if fields.contains(.sex) {
            Picker("性別", selection: $p.sex) {
                ForEach(Sex.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
        }
        if fields.contains(.height) { NumField(title: "身長", text: $p.height, unit: "cm") }
        if fields.contains(.weight) { NumField(title: "体重", text: $p.weight, unit: "kg") }
        if fields.contains(.scr) { NumField(title: "血清Cr", text: $p.scr, unit: "mg/dL") }
        if fields.contains(.cys) { NumField(title: "シスタチンC", text: $p.cys, unit: "mg/L") }
    }
}

struct PatientSummaryRow: View {
    @EnvironmentObject var p: PatientStore
    var body: some View {
        Label {
            Text(p.isEmpty ? "未入力（タップして入力）" : p.summary)
                .foregroundStyle(p.isEmpty ? .secondary : .primary)
        } icon: {
            Image(systemName: "person.text.rectangle").foregroundStyle(.tint)
        }
    }
}

struct PatientView: View {
    @EnvironmentObject var p: PatientStore
    var body: some View {
        Form {
            Section {
                PatientFields(fields: [.age, .months, .sex, .height, .weight, .scr, .cys])
            } footer: {
                Text("ここで入れた値は、腎機能・体表面積・用量などすべての計算で使われます。端末には保存されず、アプリを終了すると消えます。")
            }
            Section {
                Button("すべてクリア", role: .destructive) { p.clear() }
            }
        }
        .calcForm("患者情報")
    }
}
