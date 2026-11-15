import SwiftUI
import UIKit

/// 余り電卓の計算（四則と「割ってあまり」）
struct RemainderCalc: Equatable {
    var a = ""
    var op: String?      // "+", "−", "×", "÷", "mod"
    var b = ""
    var done = false

    struct Result {
        var plain: Double?
        var quotient: Double?
        var remainder: Double?
        var decimal: Double?
    }

    static func calc(_ a: String, _ op: String?, _ b: String) -> Result? {
        guard let x = Double(a), let y = Double(b), let op else { return nil }
        switch op {
        case "+": return Result(plain: x + y)
        case "−": return Result(plain: x - y)
        case "×": return Result(plain: x * y)
        case "÷": return Result(plain: y == 0 ? .nan : x / y)
        case "mod":
            if y == 0 { return Result(plain: .nan) }
            let q = (x / y + 1e-9).rounded(.down)
            var r = x - q * y
            if abs(r) < 1e-9 { r = 0 }
            return Result(quotient: q, remainder: r, decimal: x / y)
        default: return nil
        }
    }

    static func show(_ v: Double) -> String {
        guard v.isFinite else { return "エラー" }
        return fmtTrim(v, 3).replacingOccurrences(of: ",", with: "")
    }

    var result: Result? { done ? RemainderCalc.calc(a, op, b) : nil }

    /// 次の計算に引き継ぐ値（結果）
    private var carried: String? {
        guard let r = RemainderCalc.calc(a, op, b) else { return nil }
        return RemainderCalc.show(r.plain ?? r.quotient ?? 0)
    }

    mutating func press(_ key: String) {
        if key.allSatisfy({ $0.isNumber || $0 == "." }) {
            if done { self = RemainderCalc() }
            var v = op == nil ? a : b
            if key == "." && v.contains(".") { return }
            if v == "0" && key != "." { v = "" }
            v = String((v + key).prefix(9))
            if op == nil { a = v } else { b = v }
        } else if key == "C" {
            self = RemainderCalc()
        } else if key == "⌫" {
            if done { self = RemainderCalc() }
            else if !b.isEmpty { b.removeLast() }
            else if op != nil { op = nil }
            else if !a.isEmpty { a.removeLast() }
        } else if key == "=" {
            if op != nil && !b.isEmpty { done = true }
        } else {
            if done {
                a = carried ?? a
                b = ""
                done = false
            }
            if a.isEmpty { return }
            if op != nil && !b.isEmpty {
                a = carried ?? a
                b = ""
            }
            op = key
        }
    }

    mutating func divide(by n: Int) {
        var x = a.isEmpty ? "0" : a
        if done || (op != nil && !b.isEmpty) { x = carried ?? x }
        self = RemainderCalc(a: x, op: "mod", b: String(n), done: true)
    }

    var opLabel: String { op == "mod" ? "÷余" : (op ?? "") }

    var expression: String {
        var s = a
        if op != nil { s += " \(opLabel) " }
        s += b
        return done ? s + " =" : s
    }

    /// 履歴に残す1行
    var summary: String? {
        guard let r = result else { return nil }
        if let q = r.quotient, let rem = r.remainder {
            return "\(a) ÷ \(b) ＝ \(RemainderCalc.show(q)) あまり \(RemainderCalc.show(rem))"
        }
        return "\(a) \(opLabel) \(b) ＝ \(RemainderCalc.show(r.plain ?? 0))"
    }
}

struct RemainderView: View {
    @State private var c = RemainderCalc()
    @State private var history: [RemainderCalc] = []
    @State private var showHistory = false
    private let teal = Color(red: 0.06, green: 0.46, blue: 0.43)
    private let orange = Color(red: 0.76, green: 0.25, blue: 0.05)

    var body: some View {
        VStack(spacing: 14) {
            display
            chips
            keypad
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .background(Color(.systemGroupedBackground))
        .navigationTitle("余り電卓")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showHistory = true
                } label: {
                    Image(systemName: "clock.arrow.circlepath")
                }
                .accessibilityLabel("履歴")
                .disabled(history.isEmpty)
            }
        }
        .sheet(isPresented: $showHistory) {
            NavigationStack {
                List {
                    ForEach(Array(history.enumerated()), id: \.offset) { _, h in
                        Button {
                            c = h
                            showHistory = false
                        } label: {
                            Text(h.summary ?? "").font(.body.monospacedDigit())
                        }
                    }
                }
                .navigationTitle("履歴（タップで呼び出し）")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("消去", role: .destructive) { history.removeAll(); showHistory = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("閉じる") { showHistory = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: c) { new in
            // 答えが出たら履歴に残す（最新が上、30件まで）
            if new.done, new.summary != nil, history.first != new {
                history.insert(new, at: 0)
                if history.count > 30 { history.removeLast() }
            }
        }
    }

    private var display: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text(c.expression.isEmpty ? " " : c.expression)
                .font(.title3.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let r = c.result, let q = r.quotient, let rem = r.remainder {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(RemainderCalc.show(q)).font(.system(size: 56, weight: .bold).monospacedDigit())
                    Text("あまり").font(.title3.bold()).foregroundStyle(orange)
                    Text(RemainderCalc.show(rem)).font(.system(size: 56, weight: .bold).monospacedDigit()).foregroundStyle(orange)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                HStack(spacing: 8) {
                    Text("\(RemainderCalc.show(q))シート ＋ バラ\(RemainderCalc.show(rem))錠")
                        .font(.footnote)
                        .foregroundStyle(teal)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(teal.opacity(0.1)))
                    Text("小数 \(RemainderCalc.show(r.decimal ?? 0))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(Color(.systemGray6)))
                }
            } else {
                let value: String = {
                    if let r = c.result { return RemainderCalc.show(r.plain ?? 0) }
                    let v = c.op == nil ? c.a : c.b
                    return v.isEmpty ? "0" : v
                }()
                Text(value)
                    .font(.system(size: 56, weight: .bold).monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .bottomTrailing)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(.secondarySystemGroupedBackground)))
        .padding(.top, 4)
    }

    private var chips: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("シートの錠数で割る").font(.caption).foregroundStyle(.secondary).padding(.leading, 4)
            HStack(spacing: 8) {
                ForEach([6, 10, 14, 21, 28], id: \.self) { n in
                    let on = c.done && c.op == "mod" && c.b == String(n)
                    Button {
                        tap()
                        c.divide(by: n)
                    } label: {
                        Text("÷\(n)")
                            .font(.body.bold())
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(on ? Color.white : teal)
                            .background(RoundedRectangle(cornerRadius: 14).fill(on ? teal : Color(.secondarySystemGroupedBackground)))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(teal.opacity(on ? 1 : 0.3), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(n)で割ってあまりを出す")
                }
            }
        }
    }

    private var keypad: some View {
        let rows: [[String]] = [["C", "⌫", "÷余", "÷"], ["7", "8", "9", "×"], ["4", "5", "6", "−"],
                                ["1", "2", "3", "+"], ["0", "00", ".", "="]]
        return VStack(spacing: 10) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 10) {
                    ForEach(row, id: \.self) { k in key(k) }
                }
            }
        }
    }

    private func key(_ k: String) -> some View {
        let isNum = k.allSatisfy { $0.isNumber || $0 == "." }
        let isOp = ["÷", "×", "−", "+"].contains(k)
        let opOn = isOp && c.op == k && !c.done
        let bg: Color = k == "=" ? orange : k == "÷余" ? teal : opOn ? teal
            : isOp ? teal.opacity(0.12) : isNum ? Color(.secondarySystemGroupedBackground) : Color(.systemGray4)
        let fg: Color = (k == "=" || k == "÷余" || opOn) ? .white : isOp ? teal : .primary
        let size: CGFloat = isNum ? 28 : (k == "÷余" ? 22 : 26)
        return Button {
            tap()
            c.press(k == "÷余" ? "mod" : k)
        } label: {
            Text(k)
                .font(.system(size: size, weight: k == "÷余" || k == "=" ? .bold : .medium))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .foregroundStyle(fg)
                .background(RoundedRectangle(cornerRadius: 18).fill(bg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(k))
    }

    private func label(_ k: String) -> String {
        switch k {
        case "C": return "クリア"
        case "⌫": return "1文字消す"
        case "÷余": return "割ってあまりを出す"
        case "÷": return "割る"
        case "×": return "かける"
        case "−": return "ひく"
        case "+": return "たす"
        case ".": return "小数点"
        case "=": return "イコール"
        default: return k
        }
    }

    private func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
