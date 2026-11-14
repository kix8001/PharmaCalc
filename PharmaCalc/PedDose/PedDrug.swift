import Foundation

/// 年齢別の用量（〜歳未満なら 1日 min〜max mg）
struct AgeBand: Codable, Hashable, Identifiable {
    var id = UUID()
    var below: Double
    var min: Double
    var max: Double
}

/// 用量の決め方
enum DoseBasis: String, Codable, CaseIterable, Identifiable {
    case day    // mg/kg/日
    case dose   // mg/kg/回
    case age    // 年齢別の1日量
    var id: String { rawValue }
    var label: String {
        switch self {
        case .day: return "mg/kg/日"
        case .dose: return "mg/kg/回"
        case .age: return "年齢別"
        }
    }
}

/// 小児用量を計算する薬（ユーザーが追加・編集できる）
struct PedDrug: Codable, Hashable, Identifiable {
    var id = UUID()
    var name: String
    var ingredient: String = ""
    /// true: シロップ（mL）、false: 散・DS（g）
    var isSyrup: Bool
    /// 製剤1g（または1mL）あたりの成分量 mg
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

    var unit: String { isSyrup ? "mL" : "g" }
}

struct PedDoseResult {
    var dailyLo: Double
    var dailyHi: Double
    var doseLo: Double
    var doseHi: Double
    var times: Int
    var capped: Bool
}

extension PedDrug {
    /// 年齢（歳）と体重（kg）から用量を出す。必要な値が無ければ理由を返す
    func compute(age: Double?, weight: Double?) -> Result<PedDoseResult, PedDoseError> {
        let t = max(1, times)
        switch basis {
        case .day:
            guard let w = weight, w > 0 else { return .failure(.needWeight) }
            var lo = minPerKg * w, hi = maxPerKg * w
            var capped = false
            if let m = maxDailyPerKg, hi > m * w { hi = m * w; capped = true }
            if let m = maxDailyMg, hi > m { hi = m; capped = true }
            lo = min(lo, hi)
            return .success(PedDoseResult(dailyLo: lo, dailyHi: hi, doseLo: lo / Double(t), doseHi: hi / Double(t),
                                          times: t, capped: capped))
        case .dose:
            guard let w = weight, w > 0 else { return .failure(.needWeight) }
            var lo = minPerKg * w, hi = maxPerKg * w
            var capped = false
            if let m = maxDoseMg, hi > m { hi = m; capped = true }
            lo = min(lo, hi)
            var dHi = hi * Double(t)
            if let m = maxDailyPerKg, dHi > m * w { dHi = m * w; capped = true }
            if let m = maxDailyMg, dHi > m { dHi = m; capped = true }
            return .success(PedDoseResult(dailyLo: min(lo * Double(t), dHi), dailyHi: dHi, doseLo: lo, doseHi: hi,
                                          times: t, capped: capped))
        case .age:
            guard let a = age, a >= 0 else { return .failure(.needAge) }
            guard let b = bands.sorted(by: { $0.below < $1.below }).first(where: { a < $0.below }) else {
                return .failure(.outOfRange)
            }
            return .success(PedDoseResult(dailyLo: b.min, dailyHi: b.max, doseLo: b.min / Double(t), doseHi: b.max / Double(t),
                                          times: t, capped: false))
        }
    }

    /// 用量の決め方を文章にする
    var ruleText: String {
        var s: String
        switch basis {
        case .day: s = "1日 \(range(minPerKg, maxPerKg, 3))mg/kg を\(times)回に分ける"
        case .dose: s = "1回 \(range(minPerKg, maxPerKg, 3))mg/kg、1日\(times)回"
        case .age:
            s = bands.sorted { $0.below < $1.below }
                .map { "\(fmtTrim($0.below, 1))歳未満 \(range($0.min, $0.max, 1))mg" }
                .joined(separator: "、") + "（1日量、\(times)回に分ける）"
        }
        if let m = maxDoseMg { s += "／1回最大\(fmtTrim(m, 1))mg" }
        if let m = maxDailyPerKg { s += "／1日最大\(fmtTrim(m, 1))mg/kg" }
        if let m = maxDailyMg { s += "／1日最大\(fmtTrim(m, 1))mg" }
        return s
    }
}

enum PedDoseError: Error {
    case needWeight, needAge, outOfRange
    var message: String {
        switch self {
        case .needWeight: return "体重を入れてください"
        case .needAge: return "年齢を入れてください"
        case .outOfRange: return "登録した年齢の範囲外です"
        }
    }
}

func range(_ a: Double, _ b: Double, _ digits: Int) -> String {
    abs(a - b) < 1e-9 ? fmtTrim(a, digits) : "\(fmtTrim(a, digits))〜\(fmtTrim(b, digits))"
}

/// 小児用量の薬の一覧（端末に保存）
final class PedDrugStore: ObservableObject {
    @Published var drugs: [PedDrug] = [] {
        didSet { save() }
    }
    private let key = "pedDrugs"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let list = try? JSONDecoder().decode([PedDrug].self, from: data) {
            drugs = list
        } else {
            drugs = PedDrug.presets
        }
    }

    func resetToPresets() { drugs = PedDrug.presets }

    private func save() {
        if let data = try? JSONEncoder().encode(drugs) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

extension PedDrug {
    /// 初期登録（添付文書の小児用量をもとにした目安）
    static let presets: [PedDrug] = {
        let tranexamic = [AgeBand(below: 2, min: 75, max: 200), AgeBand(below: 4, min: 150, max: 350),
                          AgeBand(below: 7, min: 250, max: 650), AgeBand(below: 15, min: 400, max: 1000),
                          AgeBand(below: 200, min: 750, max: 2000)]
        let tipepidine = [AgeBand(below: 1, min: 5, max: 20), AgeBand(below: 3, min: 10, max: 25),
                          AgeBand(below: 6, min: 15, max: 40)]
        return [
            PedDrug(name: "ムコダインDS50%", ingredient: "カルボシステイン", isSyrup: false, conc: 500, basis: .day,
                    minPerKg: 30, maxPerKg: 30, times: 3, note: "1回10mg/kgを1日3回"),
            PedDrug(name: "ムコダインシロップ5%", ingredient: "カルボシステイン", isSyrup: true, conc: 50, basis: .day,
                    minPerKg: 30, maxPerKg: 30, times: 3, note: "1回10mg/kgを1日3回"),
            PedDrug(name: "ムコソルバンDS1.5%", ingredient: "アンブロキソール", isSyrup: false, conc: 15, basis: .day,
                    minPerKg: 0.9, maxPerKg: 0.9, times: 3),
            PedDrug(name: "ムコソルバンシロップ0.3%", ingredient: "アンブロキソール", isSyrup: true, conc: 3, basis: .day,
                    minPerKg: 0.9, maxPerKg: 0.9, times: 3),
            PedDrug(name: "トランサミンシロップ5%", ingredient: "トラネキサム酸", isSyrup: true, conc: 50, basis: .age,
                    times: 3, bands: tranexamic, note: "1日量を3〜4回に分ける"),
            PedDrug(name: "アスベリン散10%", ingredient: "チペピジンヒベンズ酸塩", isSyrup: false, conc: 100, basis: .age,
                    times: 3, bands: tipepidine),
            PedDrug(name: "アスベリンシロップ0.5%", ingredient: "チペピジンヒベンズ酸塩", isSyrup: true, conc: 5, basis: .age,
                    times: 3, bands: tipepidine),
            PedDrug(name: "カロナール細粒20%", ingredient: "アセトアミノフェン", isSyrup: false, conc: 200, basis: .dose,
                    minPerKg: 10, maxPerKg: 15, times: 4, maxDoseMg: 1000, maxDailyMg: 4000, maxDailyPerKg: 60,
                    note: "投与間隔は4〜6時間以上。1日総量60mg/kgまで（成人量を超えない）"),
            PedDrug(name: "カロナールシロップ2%", ingredient: "アセトアミノフェン", isSyrup: true, conc: 20, basis: .dose,
                    minPerKg: 10, maxPerKg: 15, times: 4, maxDoseMg: 1000, maxDailyMg: 4000, maxDailyPerKg: 60,
                    note: "投与間隔は4〜6時間以上。1日総量60mg/kgまで（成人量を超えない）"),
            PedDrug(name: "ワイドシリン細粒20%", ingredient: "アモキシシリン", isSyrup: false, conc: 200, basis: .day,
                    minPerKg: 20, maxPerKg: 40, times: 3, maxDailyPerKg: 90, note: "1日3〜4回。1日最大90mg/kg"),
            PedDrug(name: "クラリスDS10%小児用", ingredient: "クラリスロマイシン", isSyrup: false, conc: 100, basis: .day,
                    minPerKg: 10, maxPerKg: 15, times: 2, note: "1日2〜3回に分ける"),
            PedDrug(name: "メイアクトMS小児用細粒10%", ingredient: "セフジトレン ピボキシル", isSyrup: false, conc: 100, basis: .dose,
                    minPerKg: 3, maxPerKg: 3, times: 3, maxDoseMg: 200, note: "必要に応じて1回6mg/kgまで（1回200mgまで）"),
            PedDrug(name: "フロモックス小児用細粒100mg", ingredient: "セフカペン ピボキシル", isSyrup: false, conc: 100, basis: .dose,
                    minPerKg: 3, maxPerKg: 3, times: 3),
            PedDrug(name: "ジスロマック細粒小児用10%", ingredient: "アジスロマイシン", isSyrup: false, conc: 100, basis: .day,
                    minPerKg: 10, maxPerKg: 10, times: 1, maxDailyMg: 500, note: "1日1回3日間"),
            PedDrug(name: "タミフルDS3%", ingredient: "オセルタミビル", isSyrup: false, conc: 30, basis: .dose,
                    minPerKg: 2, maxPerKg: 2, times: 2, maxDoseMg: 75, note: "治療は1日2回5日間、予防は1日1回"),
            PedDrug(name: "オノンDS10%", ingredient: "プランルカスト", isSyrup: false, conc: 100, basis: .day,
                    minPerKg: 7, maxPerKg: 7, times: 2, maxDailyMg: 450, maxDailyPerKg: 10,
                    note: "朝・夕食後。1日最高10mg/kg（成人量450mg/日を超えない）"),
            PedDrug(name: "ザジテンDS0.1%", ingredient: "ケトチフェン", isSyrup: false, conc: 1, basis: .day,
                    minPerKg: 0.06, maxPerKg: 0.06, times: 2, note: "朝食後と就寝前"),
        ]
    }()
}
