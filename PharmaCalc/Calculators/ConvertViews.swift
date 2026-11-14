import SwiftUI

/// オピオイドの種類と、経口モルヒネに換算するときの係数（1日量 × 係数 = 経口モルヒネ mg/日）
enum OpioidDrug: String, CaseIterable, Identifiable {
    case morphineOral, morphineSupp, morphineInj
    case oxycodoneOral, oxycodoneInj
    case hydromorphoneOral, hydromorphoneInj
    case fentanylPatch, fentanylInj
    case tapentadol, tramadol, codeine

    var id: String { rawValue }

    var name: String {
        switch self {
        case .morphineOral: return "モルヒネ 経口"
        case .morphineSupp: return "モルヒネ 坐剤"
        case .morphineInj: return "モルヒネ 注射（静注・皮下）"
        case .oxycodoneOral: return "オキシコドン 経口"
        case .oxycodoneInj: return "オキシコドン 注射"
        case .hydromorphoneOral: return "ヒドロモルフォン 経口"
        case .hydromorphoneInj: return "ヒドロモルフォン 注射"
        case .fentanylPatch: return "フェンタニル 貼付（1日型の表示量）"
        case .fentanylInj: return "フェンタニル 注射"
        case .tapentadol: return "タペンタドール 経口"
        case .tramadol: return "トラマドール 経口"
        case .codeine: return "コデイン 経口"
        }
    }

    var factor: Double {
        switch self {
        case .morphineOral: return 1
        case .morphineSupp: return 1.5
        case .morphineInj: return 2
        case .oxycodoneOral: return 1.5
        case .oxycodoneInj: return 2
        case .hydromorphoneOral: return 5
        case .hydromorphoneInj: return 25
        case .fentanylPatch: return 30
        case .fentanylInj: return 100
        case .tapentadol: return 0.3
        case .tramadol: return 0.2
        case .codeine: return 1.0 / 6
        }
    }

    enum Kind { case oral, injection, patch }
    var kind: Kind {
        switch self {
        case .morphineInj, .oxycodoneInj, .hydromorphoneInj, .fentanylInj: return .injection
        case .fentanylPatch: return .patch
        default: return .oral
        }
    }

    /// 経口モルヒネ 60mg/日 に相当する量
    var equivalentText: String { "\(fmtTrim(60 / factor, 2))mg" }
}

struct OpioidView: View {
    @State private var from = OpioidDrug.oxycodoneOral
    @State private var dose = ""
    @State private var to = OpioidDrug.fentanylPatch
    @State private var reduce = false

    var body: some View {
        Form {
            Section("いまの薬") {
                Picker("薬", selection: $from) {
                    ForEach(OpioidDrug.allCases) { Text($0.name).tag($0) }
                }
                NumField(title: "1日量", text: $dose, unit: "mg/日")
            }
            if let d = parseNum(dose), d > 0 {
                let mme = d * from.factor
                Section {
                    ResultRow(title: "経口モルヒネ換算", value: fmtTrim(mme, 1), unit: "mg/日", color: .orange)
                }
                Section {
                    Picker("変更先", selection: $to) {
                        ForEach(OpioidDrug.allCases) { Text($0.name).tag($0) }
                    }
                    Toggle("交差耐性を考えて25%減らす", isOn: $reduce)
                    let target = mme / to.factor * (reduce ? 0.75 : 1)
                    ResultRow(title: "1日量", value: fmtTrim(target, 2), unit: "mg/日")
                    switch to.kind {
                    case .oral:
                        ResultRow(title: "レスキュー1回量（1日量の1/6）", value: fmtTrim(target / 6, 2), unit: "mg", big: false)
                    case .injection:
                        ResultRow(title: "レスキュー（1時間量）", value: fmtTrim(target / 24, 3), unit: "mg", big: false)
                    case .patch:
                        ResultRow(title: "レスキュー：モルヒネ速放", value: fmtTrim(mme / 6, 1), unit: "mg/回", big: false)
                        ResultRow(title: "レスキュー：オキシコドン速放", value: fmtTrim(mme / 6 / 1.5, 1), unit: "mg/回", note: "貼付剤のときは経口の速放性製剤をレスキューに使います（1日量の1/6が目安）",
                                  big: false)
                    }
                } header: {
                    Text("変更先")
                }
                Section("各薬の相当量") {
                    ForEach(OpioidDrug.allCases) { o in
                        HStack {
                            Text(o.name).font(.callout)
                            Spacer()
                            Text("\(fmtTrim(mme / o.factor, 2)) mg/日").monospacedDigit()
                        }
                    }
                }
            }
            Section {
                ForEach(OpioidDrug.allCases) { o in
                    HStack {
                        Text(o.name).font(.caption)
                        Spacer()
                        Text(o.equivalentText).font(.caption.monospacedDigit())
                    }
                }
            } header: {
                Text("換算比（経口モルヒネ 60mg/日 に相当）")
            } footer: {
                Text("がん疼痛の治療で一般的に使われる換算比の目安です。個人差が大きく、切り替え直後は効果と副作用をよく観察してください。フェンタニル貼付はフェントステープ（1日型）の表示量で、デュロテップMTパッチ（3日型）2.1mg ≒ フェントステープ1mg。メサドンは換算が一定でないため対象外です。")
            }
        }
        .calcForm("オピオイド換算")
    }
}

/// ステロイドの種類と、プレドニゾロン5mgに相当する量
enum SteroidDrug: String, CaseIterable, Identifiable {
    case hydrocortisone, cortisone, prednisolone, methylprednisolone, triamcinolone, dexamethasone, betamethasone
    var id: String { rawValue }
    var name: String {
        switch self {
        case .hydrocortisone: return "ヒドロコルチゾン"
        case .cortisone: return "コルチゾン"
        case .prednisolone: return "プレドニゾロン"
        case .methylprednisolone: return "メチルプレドニゾロン"
        case .triamcinolone: return "トリアムシノロン"
        case .dexamethasone: return "デキサメタゾン"
        case .betamethasone: return "ベタメタゾン"
        }
    }
    /// プレドニゾロン5mgに相当する量（mg）
    var equivalent: Double {
        switch self {
        case .hydrocortisone: return 20
        case .cortisone: return 25
        case .prednisolone: return 5
        case .methylprednisolone, .triamcinolone: return 4
        case .dexamethasone, .betamethasone: return 0.75
        }
    }
    var note: String {
        switch self {
        case .hydrocortisone, .cortisone: return "短時間型・鉱質作用あり"
        case .prednisolone, .methylprednisolone, .triamcinolone: return "中間型"
        case .dexamethasone, .betamethasone: return "長時間型"
        }
    }
}

struct SteroidView: View {
    @State private var from = SteroidDrug.prednisolone
    @State private var dose = ""

    var body: some View {
        Form {
            Section {
                Picker("薬", selection: $from) {
                    ForEach(SteroidDrug.allCases) { Text($0.name).tag($0) }
                }
                NumField(title: "量", text: $dose, unit: "mg")
            }
            if let d = parseNum(dose), d > 0 {
                let pred = d / from.equivalent * 5
                Section {
                    ForEach(SteroidDrug.allCases) { s in
                        ResultRow(title: s.name, value: fmtTrim(pred / 5 * s.equivalent, 2), unit: "mg", note: s.note,
                                  big: s == .prednisolone, color: s == from ? Color.orange : nil)
                    }
                } header: {
                    Text("相当量（抗炎症作用）")
                }
            }
            Section {
                ForEach(SteroidDrug.allCases) { s in
                    HStack {
                        Text(s.name).font(.caption)
                        Spacer()
                        Text("\(fmtTrim(s.equivalent, 2))mg").font(.caption.monospacedDigit())
                    }
                }
            } header: {
                Text("換算表（プレドニゾロン5mg相当）")
            } footer: {
                Text("抗炎症作用で比べた一般的な目安です。鉱質コルチコイド作用や作用時間は薬ごとに違います。")
            }
        }
        .calcForm("ステロイド換算")
    }
}
