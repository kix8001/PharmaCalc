import SwiftUI

/// 持続皮下注・PCA
struct PCAView: View {
    @State private var daily = ""
    @State private var concMode = 0  // 0: 濃度で入力, 1: 薬の量と全量で入力
    @State private var conc = ""
    @State private var drugMg = ""
    @State private var totalMl = ""
    @State private var rescueTimes = ""
    @State private var container = ""

    private var concentration: Double? {
        if concMode == 0 { return parseNum(conc) }
        guard let m = parseNum(drugMg), let v = parseNum(totalMl), v > 0 else { return nil }
        return m / v
    }

    var body: some View {
        Form {
            Section {
                NumField(title: "1日量", text: $daily, unit: "mg/日")
                Picker("薬液", selection: $concMode) {
                    Text("濃度で入力").tag(0)
                    Text("薬の量と全量").tag(1)
                }
                .pickerStyle(.segmented)
                if concMode == 0 {
                    NumField(title: "濃度", text: $conc, unit: "mg/mL")
                } else {
                    NumField(title: "薬の量", text: $drugMg, unit: "mg")
                    NumField(title: "全量", text: $totalMl, unit: "mL")
                }
            }
            Section {
                NumField(title: "早送りの回数（1日・任意）", text: $rescueTimes, unit: "回", integer: true)
                NumField(title: "容器の容量（任意）", text: $container, unit: "mL")
            }
            if let d = parseNum(daily), d > 0, let c = concentration, c > 0 {
                let mlDay = d / c
                let bolus = mlDay / 24
                let used = mlDay + bolus * Double(parseInt(rescueTimes) ?? 0)
                Section {
                    if concMode == 1 { ResultRow(title: "濃度", value: fmtTrim(c, 3), unit: "mg/mL", big: false) }
                    ResultRow(title: "1日の液量", value: fmtTrim(mlDay, 2), unit: "mL/日")
                    ResultRow(title: "流量", value: fmtTrim(mlDay / 24, 3), unit: "mL/h", color: .orange)
                    ResultRow(title: "早送り1回（1時間量）", value: fmtTrim(bolus, 3), unit: "mL",
                              note: "薬の量 \(fmtTrim(d / 24, 2))mg")
                    if let r = parseInt(rescueTimes), r > 0 {
                        ResultRow(title: "早送り込みの1日の液量", value: fmtTrim(used, 2), unit: "mL/日", big: false,
                                  note: "薬の量 \(fmtTrim(used * c, 2))mg/日")
                    }
                    if let v = parseNum(container), v > 0 {
                        ResultRow(title: "容器が空になるまで", value: fmtTrim(v / used, 1), unit: "日",
                                  note: "約\(fmtTrim(v / used * 24, 0))時間")
                    }
                } header: {
                    Text("結果")
                } footer: {
                    Text("流量 = 1日量 ÷ 濃度 ÷ 24。早送り（レスキュー）は1時間量が目安で、ロックアウト時間は15〜30分程度が一般的です。")
                }
            }
        }
        .calcForm("持続皮下注・PCA")
    }
}

/// 必要エネルギー・水分・たんぱく質、輸液のカロリー
struct NutritionView: View {
    @EnvironmentObject var p: PatientStore
    @State private var activity = "1.2"
    @State private var stress = "1.0"
    @State private var glucose = ""
    @State private var amino = ""
    @State private var fat = ""

    var body: some View {
        Form {
            Section("患者情報（共通）") {
                PatientFields(fields: [.age, .sex, .height, .weight])
            }
            Section {
                NumField(title: "活動係数", text: $activity)
                QuickButtons(values: [1.0, 1.1, 1.2, 1.3, 1.5], text: $activity)
                NumField(title: "ストレス係数", text: $stress)
                QuickButtons(values: [1.0, 1.1, 1.2, 1.3, 1.5], text: $stress)
            } footer: {
                Text("活動係数：寝たきり1.0、ベッド上安静1.2、ベッド外活動1.3。ストレス係数：なし1.0、軽い手術・褥瘡1.1〜1.2、感染症・発熱1.2〜1.3。")
            }
            if let a = p.ageV, let w = p.weightV, let h = p.heightV, a > 0, w > 0, h > 0 {
                let bee = p.sex == .male
                    ? 66.47 + 13.75 * w + 5.0 * h - 6.76 * a
                    : 655.1 + 9.56 * w + 1.85 * h - 4.68 * a
                let af = parseNum(activity) ?? 1, sf = parseNum(stress) ?? 1
                Section {
                    ResultRow(title: "基礎エネルギー消費量", value: fmtTrim(bee, 0), unit: "kcal/日", big: false)
                    ResultRow(title: "必要エネルギー", value: fmtTrim(bee * af * sf, 0), unit: "kcal/日", color: .orange,
                              note: "簡易法（25〜30kcal/kg）なら \(fmtTrim(w * 25, 0))〜\(fmtTrim(w * 30, 0))kcal/日")
                    ResultRow(title: "必要水分量", value: "\(fmtTrim(w * 30, 0))〜\(fmtTrim(w * 35, 0))", unit: "mL/日", big: false,
                              note: "30〜35mL/kg/日（心不全・腎不全では制限することがあります）")
                    ResultRow(title: "必要たんぱく質", value: "\(fmtTrim(w * 1.0, 0))〜\(fmtTrim(w * 1.2, 0))", unit: "g/日", big: false,
                              note: "1.0〜1.2g/kg/日（腎機能に合わせて調整）")
                } header: {
                    Text("必要量（Harris-Benedict式）")
                } footer: {
                    Text("男性：66.47＋13.75×体重＋5.0×身長−6.76×年齢\n女性：655.1＋9.56×体重＋1.85×身長−4.68×年齢\n必要エネルギー＝基礎エネルギー×活動係数×ストレス係数")
                }
            } else {
                Section { MissingRow("年齢・性別・身長・体重を入力してください") }
            }
            Section {
                NumField(title: "ブドウ糖", text: $glucose, unit: "g")
                NumField(title: "アミノ酸", text: $amino, unit: "g")
                NumField(title: "脂肪", text: $fat, unit: "g")
                let g = parseNum(glucose) ?? 0, aa = parseNum(amino) ?? 0, f = parseNum(fat) ?? 0
                if g + aa + f > 0 {
                    let npc = g * 4 + f * 9
                    ResultRow(title: "総エネルギー", value: fmtTrim(npc + aa * 4, 0), unit: "kcal", color: .orange)
                    ResultRow(title: "非たんぱくカロリー（NPC）", value: fmtTrim(npc, 0), unit: "kcal", big: false)
                    if aa > 0 {
                        ResultRow(title: "NPC/N比", value: fmtTrim(npc / (aa * 0.16), 0), big: false,
                                  note: "一般に150〜200。腎不全では高め、侵襲が大きいときは低め")
                    }
                }
            } header: {
                Text("輸液・経腸栄養のカロリー（1日分）")
            } footer: {
                Text("ブドウ糖4kcal/g、アミノ酸4kcal/g、脂肪9kcal/g。窒素量＝アミノ酸×0.16。")
            }
        }
        .calcForm("栄養・輸液")
    }
}

/// 在宅酸素ボンベの残り時間
struct OxygenView: View {
    @State private var capacity = "500"
    @State private var fullPressure = "14.7"
    @State private var pressure = ""
    @State private var flow = ""
    @State private var conserver = false
    @State private var ratio = "3"

    var body: some View {
        Form {
            Section {
                NumField(title: "ボンベの容量（満充填）", text: $capacity, unit: "L")
                QuickButtons(values: [150, 200, 300, 500], text: $capacity, suffix: "L")
                NumField(title: "満充填の圧力", text: $fullPressure, unit: "MPa")
                NumField(title: "いまの圧力", text: $pressure, unit: "MPa")
                NumField(title: "流量", text: $flow, unit: "L/分")
                QuickButtons(values: [0.5, 1, 1.5, 2, 3], text: $flow, suffix: "L")
                Toggle("呼吸同調器を使う", isOn: $conserver)
                if conserver {
                    NumField(title: "節約倍率", text: $ratio, unit: "倍")
                }
            } footer: {
                Text("呼吸同調器は機種と呼吸数で変わりますが、2〜3倍長持ちするのが目安です。")
            }
            if let cap = parseNum(capacity), let fp = parseNum(fullPressure), let pr = parseNum(pressure),
               let f = parseNum(flow), cap > 0, fp > 0, pr >= 0, f > 0 {
                let remain = cap * pr / fp
                let r = conserver ? (parseNum(ratio) ?? 1) : 1
                let minutes = remain / f * r
                let safe = minutes * 0.8
                Section {
                    ResultRow(title: "残りの酸素量", value: fmtTrim(remain, 0), unit: "L")
                    ResultRow(title: "使える時間", value: hm(minutes), color: .orange)
                    ResultRow(title: "安全を見た時間（8割）", value: hm(safe), big: false,
                              note: "移動や外出の計画はこちらで")
                } header: {
                    Text("結果")
                } footer: {
                    Text("残量 = 容量 × いまの圧力 ÷ 満充填の圧力、使える時間 = 残量 ÷ 流量（× 同調器の倍率）")
                }
            }
        }
        .calcForm("酸素ボンベ")
    }

    private func hm(_ m: Double) -> String {
        let total = Int(m.rounded(.down))
        return "\(total / 60)時間\(total % 60)分"
    }
}

/// 消毒液の希釈（次亜塩素酸ナトリウムなど）
struct DilutionView: View {
    @State private var stock = "6"
    @State private var target = "0.1"
    @State private var amount = "1000"

    var body: some View {
        Form {
            Section {
                NumField(title: "原液の濃度", text: $stock, unit: "%")
                QuickButtons(values: [1, 5, 6, 12], text: $stock, suffix: "%")
                NumField(title: "作りたい濃度", text: $target, unit: "%")
                QuickButtons(values: [0.02, 0.05, 0.1], text: $target, suffix: "%")
                NumField(title: "作る量", text: $amount, unit: "mL")
                QuickButtons(values: [500, 1000, 2000, 5000], text: $amount, suffix: "mL")
            } footer: {
                Text("次亜塩素酸ナトリウムの目安：ノロウイルスの吐物・便の処理は0.1%（1000ppm）、ドアノブや手すりなどの拭き取りは0.02〜0.05%（200〜500ppm）。家庭用塩素系漂白剤は約5〜6%。")
            }
            if let s = parseNum(stock), let t = parseNum(target), let v = parseNum(amount), s > 0, t > 0, v > 0 {
                Section("結果") {
                    if t >= s {
                        WarningRow("作りたい濃度が原液以上です")
                    } else {
                        let x = v * t / s
                        ResultRow(title: "原液", value: fmtTrim(x, 1), unit: "mL", color: .orange,
                                  note: "ペットボトルのキャップ1杯は約5mL → 約\(fmtTrim(x / 5, 1))杯")
                        ResultRow(title: "水", value: fmtTrim(v - x, 1), unit: "mL")
                        ResultRow(title: "濃度（ppm）", value: fmtTrim(t * 10000, 0), unit: "ppm", big: false)
                    }
                }
            }
        }
        .calcForm("消毒液の希釈")
    }
}
