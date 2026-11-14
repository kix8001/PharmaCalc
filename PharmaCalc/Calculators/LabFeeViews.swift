import SwiftUI

/// 補正Ca・Child-Pugh分類
struct LabView: View {
    @State private var ca = ""
    @State private var alb = ""
    @State private var bil = ""
    @State private var alb2 = ""
    @State private var inr = ""
    @State private var ascites = 1
    @State private var enceph = 1

    var body: some View {
        Form {
            Section {
                NumField(title: "血清Ca", text: $ca, unit: "mg/dL")
                NumField(title: "アルブミン", text: $alb, unit: "g/dL")
                if let c = parseNum(ca), let a = parseNum(alb), c > 0, a > 0 {
                    let corr = a < 4 ? c + (4 - a) : c
                    ResultRow(title: "補正Ca", value: fmt(corr, 1), unit: "mg/dL", color: .orange,
                              note: corr > 10.4 ? "高カルシウム血症の目安（10.4mg/dL超）" : (corr < 8.5 ? "低カルシウム血症の目安（8.5mg/dL未満）" : nil))
                }
            } header: {
                Text("補正カルシウム（Payne式）")
            } footer: {
                Text("補正Ca = 血清Ca＋(4−アルブミン)。アルブミンが4g/dL以上なら補正しません。")
            }

            Section {
                NumField(title: "総ビリルビン", text: $bil, unit: "mg/dL")
                NumField(title: "アルブミン", text: $alb2, unit: "g/dL")
                NumField(title: "PT-INR", text: $inr)
                Picker("腹水", selection: $ascites) {
                    Text("なし").tag(1)
                    Text("軽度").tag(2)
                    Text("中等度以上").tag(3)
                }
                Picker("肝性脳症", selection: $enceph) {
                    Text("なし").tag(1)
                    Text("軽度（I・II度）").tag(2)
                    Text("昏睡（III度以上）").tag(3)
                }
                if let b = parseNum(bil), let a = parseNum(alb2), let i = parseNum(inr) {
                    let sb = b < 2 ? 1 : (b <= 3 ? 2 : 3)
                    let sa = a > 3.5 ? 1 : (a >= 2.8 ? 2 : 3)
                    let si = i < 1.7 ? 1 : (i <= 2.3 ? 2 : 3)
                    let total = sb + sa + si + ascites + enceph
                    let grade = total <= 6 ? "A" : (total <= 9 ? "B" : "C")
                    ResultRow(title: "Child-Pugh", value: "\(grade)（\(total)点）", color: .orange,
                              note: "ビリルビン\(sb)・アルブミン\(sa)・PT-INR\(si)・腹水\(ascites)・脳症\(enceph)点")
                }
            } header: {
                Text("Child-Pugh分類")
            } footer: {
                Text("ビリルビン：2未満1点、2〜3は2点、3超3点。アルブミン：3.5超1点、2.8〜3.5は2点、2.8未満3点。PT-INR：1.7未満1点、1.7〜2.3は2点、2.3超3点。A：5〜6点、B：7〜9点、C：10〜15点。")
            }
        }
        .calcForm("補正Ca・Child-Pugh")
    }
}

/// 薬剤料と窓口負担
struct FeeView: View {
    struct Row: Identifiable { let id = UUID(); var price = ""; var days = "" }
    @State private var rows: [Row] = [Row(), Row(), Row()]
    @State private var otherPoints = ""
    @State private var rate = 3

    /// 1剤1日分（1調剤単位）の薬価から点数：15円以下は1点、それを超えると10で割って五捨五超入
    static func points(_ yen: Double) -> Int {
        if yen <= 15 { return 1 }
        let x = yen / 10
        let fl = x.rounded(.down)
        return Int(x - fl > 0.5 + 1e-9 ? fl + 1 : fl)
    }

    var body: some View {
        Form {
            ForEach($rows) { $r in
                Section {
                    NumField(title: "1日分の薬価の合計", text: $r.price, unit: "円")
                    NumField(title: "日数・回数", text: $r.days, unit: "日", integer: true)
                    if let p = parseNum(r.price), p > 0, let d = parseInt(r.days), d > 0 {
                        ResultRow(title: "薬剤料", value: "\(Self.points(p) * d)", unit: "点", big: false,
                                  note: "\(Self.points(p))点 × \(d)")
                    }
                } header: {
                    Text("\((rows.firstIndex { $0.id == r.id } ?? 0) + 1)剤目")
                }
            }
            Section {
                Button("剤を追加") { rows.append(Row()) }
            }
            Section {
                NumField(title: "その他の点数（任意）", text: $otherPoints, unit: "点")
                Picker("負担割合", selection: $rate) {
                    Text("1割").tag(1)
                    Text("2割").tag(2)
                    Text("3割").tag(3)
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("その他の点数には、調剤基本料・薬剤調製料・調剤管理料・服薬管理指導料などの合計を入れます。")
            }
            let drug = rows.reduce(0) { acc, r in
                guard let p = parseNum(r.price), p > 0, let d = parseInt(r.days), d > 0 else { return acc }
                return acc + Self.points(p) * d
            }
            let total = drug + (parseInt(otherPoints) ?? 0)
            if total > 0 {
                let yen = total * 10
                let pay = Int((Double(yen) * Double(rate) / 10 / 10).rounded(.toNearestOrAwayFromZero)) * 10
                Section {
                    ResultRow(title: "薬剤料の合計", value: "\(drug)", unit: "点", big: false)
                    ResultRow(title: "合計", value: "\(total)", unit: "点", note: "\(yen)円")
                    ResultRow(title: "窓口負担（\(rate)割）", value: "\(pay)", unit: "円", color: .orange)
                } header: {
                    Text("結果")
                } footer: {
                    Text("内服薬は1剤の1日分、頓服・外用は1調剤分の薬価で計算します（日数・回数には頓服・外用なら1を入れます）。窓口負担は10円未満を四捨五入。公費・高額療養費・上限額は考慮していません。")
                }
            }
        }
        .calcForm("薬剤料・負担金")
    }
}
