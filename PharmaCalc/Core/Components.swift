import SwiftUI
import UIKit

/// 文字列を数値にする（全角数字・カンマにも対応）
func parseNum(_ s: String) -> Double? {
    var t = s.trimmingCharacters(in: .whitespaces)
    let full = "０１２３４５６７８９．，"
    let half = "0123456789.."
    for (f, h) in zip(full, half) { t = t.replacingOccurrences(of: String(f), with: String(h)) }
    t = t.replacingOccurrences(of: ",", with: ".")
    guard !t.isEmpty, let v = Double(t), v.isFinite else { return nil }
    return v
}

func parseInt(_ s: String) -> Int? {
    guard let v = parseNum(s), v >= 0, v == v.rounded() else { return nil }
    return Int(v)
}

/// 小数点以下 digits 桁で表示（末尾の0は残す）
func fmt(_ v: Double, _ digits: Int = 1) -> String {
    Formatters.fixed(digits).string(from: NSNumber(value: v)) ?? String(v)
}

/// 数値の書式は作るのに時間がかかるので、桁数ごとに使い回す（入力のたびに作ると反応が遅くなる）
private enum Formatters {
    private static var fixedCache: [Int: NumberFormatter] = [:]
    private static var trimCache: [Int: NumberFormatter] = [:]

    static func fixed(_ digits: Int) -> NumberFormatter {
        if let f = fixedCache[digits] { return f }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = digits
        f.maximumFractionDigits = digits
        f.roundingMode = .halfUp
        fixedCache[digits] = f
        return f
    }

    static func trim(_ digits: Int) -> NumberFormatter {
        if let f = trimCache[digits] { return f }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = digits
        f.roundingMode = .halfUp
        trimCache[digits] = f
        return f
    }
}

/// 検索用に文字をそろえる（全角・半角、ひらがな・カタカナ、大文字・小文字の違いをなくす）
func searchKey(_ s: String) -> String {
    let n = s.precomposedStringWithCompatibilityMapping
    return (n.applyingTransform(.hiraganaToKatakana, reverse: false) ?? n).lowercased()
}

/// text に query が含まれるか（searchKey でそろえて比べる）
func matchesSearch(_ text: String, _ query: String) -> Bool {
    let q = searchKey(query.trimmingCharacters(in: .whitespaces))
    return q.isEmpty || searchKey(text).contains(q)
}

/// 必要な桁だけ表示（12.50 → 12.5、3.0 → 3）
func fmtTrim(_ v: Double, _ maxDigits: Int = 2) -> String {
    Formatters.trim(maxDigits).string(from: NSNumber(value: v)) ?? String(v)
}

/// キーボードの「前へ」「次へ」：画面の入力欄を上から順に並べて、前後の欄に移る
enum KeyboardNav {
    static func move(_ step: Int) {
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
        var fields: [UITextField] = []
        func collect(_ v: UIView) {
            if let t = v as? UITextField, !t.isHidden, t.isEnabled, t.alpha > 0 { fields.append(t) }
            v.subviews.forEach(collect)
        }
        collect(window)
        let frames = fields.map { $0.convert($0.bounds, to: window) }
        let order = fields.indices.sorted { a, b in
            abs(frames[a].minY - frames[b].minY) > 4 ? frames[a].minY < frames[b].minY : frames[a].minX < frames[b].minX
        }
        guard let cur = order.firstIndex(where: { fields[$0].isFirstResponder }) else { return }
        let next = cur + step
        if order.indices.contains(next) {
            fields[order[next]].becomeFirstResponder()
        } else {
            dismiss()
        }
    }

    static func dismiss() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct NumField: View {
    let title: String
    @Binding var text: String
    var unit: String = ""
    var integer: Bool = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            TextField("—", text: $text)
                .keyboardType(integer ? .numberPad : .decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.body.monospacedDigit())
                .frame(maxWidth: 130)
            if !unit.isEmpty {
                Text(unit)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 52, alignment: .leading)
            }
        }
    }
}

/// よく使う値をワンタップで入れるボタン列
struct QuickButtons: View {
    let values: [Double]
    @Binding var text: String
    var suffix: String = ""

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(values, id: \.self) { v in
                    Button(fmtTrim(v) + suffix) { text = fmtTrim(v) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
    }
}

/// 計算結果の1行。長押しでコピーできる。
struct ResultRow: View {
    let title: String
    let value: String
    var unit: String = ""
    var note: String? = nil
    var big: Bool = true
    var color: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                Spacer()
                Text(value)
                    .font(big ? .title2.monospacedDigit().bold() : .headline.monospacedDigit())
                    .foregroundStyle(color.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.tint))
                if !unit.isEmpty {
                    Text(unit).font(.callout).foregroundStyle(.secondary)
                }
            }
            if let note {
                Text(note).font(.caption).foregroundStyle(.secondary)
            }
        }
        .contextMenu {
            Button {
                UIPasteboard.general.string = "\(title)：\(value)\(unit)"
            } label: {
                Label("コピー", systemImage: "doc.on.doc")
            }
        }
    }
}

struct MissingRow: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Label(text, systemImage: "square.and.pencil").foregroundStyle(.secondary)
    }
}

struct WarningRow: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(.orange)
    }
}

extension View {
    /// 電卓画面の共通設定（タイトル・キーボードを閉じるボタン）
    func calcForm(_ title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Button {
                        KeyboardNav.move(-1)
                    } label: {
                        Image(systemName: "chevron.up")
                    }
                    Button {
                        KeyboardNav.move(1)
                    } label: {
                        Label("次へ", systemImage: "chevron.down")
                            .labelStyle(.titleAndIcon)
                    }
                    Spacer()
                    Button("完了") { KeyboardNav.dismiss() }
                        .fontWeight(.semibold)
                }
            }
    }
}
