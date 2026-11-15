import Foundation

/// 年齢別・体重別の用量（〜未満なら 1日 min〜max）。min・max とも0なら「この範囲は用量の記載なし」
struct AgeBand: Codable, Hashable, Identifiable {
    var id = UUID()
    var below: Double
    var min: Double
    var max: Double
    /// この範囲だけ1日の回数が違うとき
    var times: Int?
    /// true なら min・max は体重1kgあたり
    var perKg: Bool?
    /// true なら min・max は1回量（false・nil なら1日量）
    var perDose: Bool?

    var notIndicated: Bool { min <= 0 && max <= 0 }
}

/// 用量の決め方
enum DoseBasis: String, Codable, CaseIterable, Identifiable {
    case day    // mg/kg/日
    case dose   // mg/kg/回
    case age    // 年齢別の1日量
    case weight // 体重別の1日量
    case memo   // 用法のメモだけ
    var id: String { rawValue }
    var label: String {
        switch self {
        case .day: return "体重あたり（1日）"
        case .dose: return "体重あたり（1回）"
        case .age: return "年齢別"
        case .weight: return "体重別"
        case .memo: return "メモだけ"
        }
    }
}

/// 小児用量を計算する薬（ユーザーが追加・編集できる）
struct PedDrug: Codable, Hashable, Identifiable {
    var id = UUID()
    var name: String
    var ingredient: String = ""
    /// true: シロップ（mL）、false: 散・DS（g）。formUnit があればそちらを使う
    var isSyrup: Bool
    /// 製剤1g・1mL・1単位あたりの成分量。0なら製剤量は出さない
    var conc: Double
    var basis: DoseBasis
    var minPerKg: Double = 0
    var maxPerKg: Double = 0
    var times: Int = 3
    var maxDoseMg: Double?
    var maxDailyMg: Double?
    var maxDailyPerKg: Double?
    var bands: [AgeBand] = []
    var note: String = ""
    // 0.6.0 で追加（古い保存データには無いので任意項目）
    var category: String?
    /// 錠・包・個・枚など（散・シロップ以外）
    var formUnit: String?
    /// 成分量の単位（"mg" か "μg"）
    var amountUnit: String?
    /// PMDA の一般名ごとの一覧を開くための YJ コード先頭7桁
    var pmda: String?

    var pmdaURL: URL? {
        pmda.flatMap { URL(string: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/\($0)") }
    }

    var unit: String { formUnit ?? (isSyrup ? "mL" : "g") }
    var amount: String { amountUnit ?? "mg" }
    var hasProduct: Bool { conc > 0 }
}

struct PedDoseResult {
    var dailyLo: Double
    var dailyHi: Double
    var doseLo: Double
    var doseHi: Double
    var times: Int
    var capped: Bool
    /// 年齢別・体重別で、どの区切りの用量を使ったか（例：「1歳未満」）
    var bandLabel: String? = nil
}

/// 年齢（歳、小数）を「1歳6か月」「6か月」のように書く
func ageText(_ y: Double) -> String {
    let total = Int((y * 12).rounded())
    let yy = total / 12, mm = total % 12
    if yy == 0 { return "\(mm)か月" }
    return mm == 0 ? "\(yy)歳" : "\(yy)歳\(mm)か月"
}

enum PedDoseError: Error {
    case needWeight, needAge, outOfRange, notIndicated, memo
    var message: String {
        switch self {
        case .needWeight: return "体重を入れてください"
        case .needAge: return "年齢を入れてください"
        case .outOfRange: return "登録した範囲の外です"
        case .notIndicated: return "この年齢・体重では用量の記載がありません"
        case .memo: return ""
        }
    }
}

extension PedDrug {
    /// 年齢（歳）と体重（kg）から用量を出す
    func compute(age: Double?, weight: Double?) -> Result<PedDoseResult, PedDoseError> {
        let t = Swift.max(1, times)
        switch basis {
        case .memo:
            return .failure(.memo)
        case .day:
            guard let w = weight, w > 0 else { return .failure(.needWeight) }
            var hi = maxPerKg * w
            var capped = false
            if let m = maxDailyPerKg, hi > m * w { hi = m * w; capped = true }
            if let m = maxDailyMg, hi > m { hi = m; capped = true }
            let lo = Swift.min(minPerKg * w, hi)
            return .success(PedDoseResult(dailyLo: lo, dailyHi: hi, doseLo: lo / Double(t), doseHi: hi / Double(t),
                                          times: t, capped: capped))
        case .dose:
            guard let w = weight, w > 0 else { return .failure(.needWeight) }
            var hi = maxPerKg * w
            var capped = false
            if let m = maxDoseMg, hi > m { hi = m; capped = true }
            let lo = Swift.min(minPerKg * w, hi)
            var dHi = hi * Double(t)
            if let m = maxDailyPerKg, dHi > m * w { dHi = m * w; capped = true }
            if let m = maxDailyMg, dHi > m { dHi = m; capped = true }
            return .success(PedDoseResult(dailyLo: Swift.min(lo * Double(t), dHi), dailyHi: dHi, doseLo: lo, doseHi: hi,
                                          times: t, capped: capped))
        case .age, .weight:
            let key: Double
            if basis == .age {
                guard let a = age, a >= 0 else { return .failure(.needAge) }
                key = a
            } else {
                guard let w = weight, w > 0 else { return .failure(.needWeight) }
                key = w
            }
            let sorted = bands.sorted(by: { $0.below < $1.below })
            guard let i = sorted.firstIndex(where: { key < $0.below }) else {
                return .failure(.outOfRange)
            }
            let b = sorted[i]
            if b.notIndicated { return .failure(.notIndicated) }
            let bt = Swift.max(1, b.times ?? t)
            var lo = b.min, hi = b.max
            if b.perKg == true {
                guard let w = weight, w > 0 else { return .failure(.needWeight) }
                lo *= w
                hi *= w
            }
            // 上限（登録してあれば年齢別・体重別にも使う）
            var capped = false
            var dLo: Double, dHi: Double
            if b.perDose == true {
                if let m = maxDoseMg, hi > m { hi = m; capped = true }
                lo = Swift.min(lo, hi)
                dLo = lo * Double(bt); dHi = hi * Double(bt)
            } else {
                dLo = lo; dHi = hi
            }
            if let m = maxDailyPerKg, let w = weight, dHi > m * w { dHi = m * w; capped = true }
            if let m = maxDailyMg, dHi > m { dHi = m; capped = true }
            dLo = Swift.min(dLo, dHi)
            var oLo = dLo / Double(bt), oHi = dHi / Double(bt)
            if b.perDose != true, let m = maxDoseMg, oHi > m {
                oHi = m; oLo = Swift.min(oLo, m); dHi = m * Double(bt); dLo = Swift.min(dLo, dHi); capped = true
            }
            let f: (Double) -> String = basis == .age ? ageText : { "\(fmtTrim($0, 1))kg" }
            let lower = i > 0 ? sorted[i - 1].below : nil
            let label: String
            if let l = lower {
                label = b.below >= 100 ? "\(f(l))以上" : "\(f(l))〜\(f(b.below))未満"
            } else {
                label = "\(f(b.below))未満"
            }
            return .success(PedDoseResult(dailyLo: dLo, dailyHi: dHi, doseLo: oLo, doseHi: oHi,
                                          times: bt, capped: capped, bandLabel: sorted.count > 1 ? label : nil))
        }
    }
}

func range(_ a: Double, _ b: Double, _ digits: Int) -> String {
    abs(a - b) < 1e-9 ? fmtTrim(a, digits) : "\(fmtTrim(a, digits))〜\(fmtTrim(b, digits))"
}

// MARK: - 初期登録（data/ped_presets.json）

private struct PresetFile: Decodable {
    var version: Int
    /// 名前を変えた・適応症ごとに分けた初期登録の薬の旧名
    var replaced: [String]?
    var drugs: [PresetDrug]
}

private struct PresetBand: Decodable {
    var below: Double
    var min: Double
    var max: Double
    var times: Int?
    var perKg: Bool?
    var perDose: Bool?
}

private struct PresetDrug: Decodable {
    var category: String
    var name: String
    var ingredient: String
    var form: String
    var conc: Double
    var basis: String
    var unit: String?
    var amountUnit: String?
    var minPerKg: Double?
    var maxPerKg: Double?
    var times: Int?
    var maxDoseMg: Double?
    var maxDailyMg: Double?
    var maxDailyPerKg: Double?
    var bands: [PresetBand]?
    var note: String?
    var pmda: String?

    var drug: PedDrug {
        PedDrug(name: name, ingredient: ingredient, isSyrup: form == "syrup", conc: conc,
                basis: DoseBasis(rawValue: basis) ?? .memo, minPerKg: minPerKg ?? 0, maxPerKg: maxPerKg ?? minPerKg ?? 0,
                times: times ?? 3, maxDoseMg: maxDoseMg, maxDailyMg: maxDailyMg, maxDailyPerKg: maxDailyPerKg,
                bands: (bands ?? []).map { AgeBand(below: $0.below, min: $0.min, max: $0.max, times: $0.times, perKg: $0.perKg, perDose: $0.perDose) },
                note: note ?? "", category: category,
                formUnit: form == "other" ? (unit ?? "") : nil, amountUnit: amountUnit, pmda: pmda)
    }
}

enum PedPresets {
    private static let loaded: (Int, [PedDrug], Set<String>) = {
        guard let url = Bundle.main.url(forResource: "ped_presets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(PresetFile.self, from: data) else { return (0, [], []) }
        return (file.version, file.drugs.map(\.drug), Set(file.replaced ?? []))
    }()
    static var version: Int { loaded.0 }
    static var drugs: [PedDrug] { loaded.1 }
    static var replaced: Set<String> { loaded.2 }

    /// 0.5.0 の初期登録の名前（0.6.0 で名前を変えたので入れ替える）
    static let oldNames: Set<String> = [
        "ムコダインDS50%", "ムコダインシロップ5%", "ムコソルバンDS1.5%", "ムコソルバンシロップ0.3%", "トランサミンシロップ5%",
        "アスベリン散10%", "アスベリンシロップ0.5%", "カロナール細粒20%", "カロナールシロップ2%", "ワイドシリン細粒20%",
        "クラリスDS10%小児用", "メイアクトMS小児用細粒10%", "フロモックス小児用細粒100mg", "ジスロマック細粒小児用10%",
        "タミフルDS3%", "オノンDS10%", "ザジテンDS0.1%", "オゼックス錠小児用",
    ]
}

/// 小児用量の薬の一覧（端末に保存）
final class PedDrugStore: ObservableObject {
    @Published var drugs: [PedDrug] = [] {
        didSet { save() }
    }
    private let key = "pedDrugs"
    private let versionKey = "pedPresetVersion"

    init() {
        let d = UserDefaults.standard
        guard let data = d.data(forKey: key),
              var list = try? JSONDecoder().decode([PedDrug].self, from: data) else {
            drugs = PedPresets.drugs
            d.set(PedPresets.version, forKey: versionKey)
            return
        }
        let saved = d.integer(forKey: versionKey)
        if saved < PedPresets.version {
            // 初期登録の薬は新しい版（添付文書と照合して直した値）に入れ替え、自分で追加した薬は後ろに残す
            let presetNames = Set(PedPresets.drugs.map(\.name))
            let mine = list.filter { !presetNames.contains($0.name) && !PedPresets.oldNames.contains($0.name)
                && !PedPresets.replaced.contains($0.name) }
            list = PedPresets.drugs + mine
            d.set(PedPresets.version, forKey: versionKey)
        }
        drugs = list
    }

    func resetToPresets() { drugs = PedPresets.drugs }

    /// 一覧に出てくる分類（初期登録の順）
    var categories: [String] {
        var seen: [String] = []
        for c in drugs.map({ $0.category ?? "自分で追加" }) where !seen.contains(c) { seen.append(c) }
        return seen
    }

    private func save() {
        if let data = try? JSONEncoder().encode(drugs) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
