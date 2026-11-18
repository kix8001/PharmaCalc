import Foundation

/// 対象医薬品（厚労省の対象医薬品リスト。価格は円）
struct OTCTarget: Decodable {
    var name: String
    var ingredient: String
    var spec: String
    var maker: String
    /// 薬価
    var price: Double
    /// 対象医薬品の価格の4分の1（特別の料金の計算に使う）
    var quarter: Double
    /// 保険外併用療養費の算出に用いる価格
    var base: Double
}

/// OTC類似薬の判定データ（data/otc.json。tools/make_otc.py で作る。Android・Web と共通）
final class OTCData: Decodable {
    let source: String
    let hot: String
    let targets: [String: OTCTarget]
    /// YJ → 特別の料金の対象外となる効能・効果
    let effects: [String: [String]]
    /// 成分 → 特別の料金の対象外となる傷病名の例
    let diseases: [String: [String]]
    let pregnant: Set<String>
    let lactating: Set<String>
    /// YJ → 販売名（HOTコードマスターの全品目）
    let names: [String: String]
    /// 箱（販売包装単位）のGS1コード → YJ
    let box: [String: String]
    /// 名前で探すための（YJ, 検索用の文字）
    private(set) lazy var index: [(String, String)] = self.names.map { ($0.key, searchKey($0.value + (self.targets[$0.key]?.ingredient ?? ""))) }

    private enum CodingKeys: String, CodingKey {
        case source, hot, targets, effects, diseases, pregnant, lactating, names, box
    }

    func name(_ yj: String) -> String { targets[yj]?.name ?? names[yj] ?? yj }

    func search(_ q: String, limit: Int = 50) -> [String] {
        let k = searchKey(q.trimmingCharacters(in: .whitespaces))
        guard k.count >= 2 else { return [] }
        // 対象医薬品を先に
        let a = index.filter { targets[$0.0] != nil && $0.1.contains(k) }.map(\.0)
        let b = index.filter { targets[$0.0] == nil && $0.1.contains(k) }.map(\.0)
        return Array((a + b).prefix(limit))
    }
}

enum OTCLookup: Equatable {
    case found([String], viaPMDA: Bool)
    case notFound
    case offline
}

enum OTC {
    private static let loader = Loader()

    private actor Loader {
        var data: OTCData?
        func get() -> OTCData? {
            if let data { return data }
            guard let url = Bundle.main.url(forResource: "otc", withExtension: "json"),
                  let raw = try? Data(contentsOf: url),
                  let d = try? JSONDecoder().decode(OTCData.self, from: raw) else { return nil }
            data = d
            return d
        }
    }

    /// 3MB あるので、使うときに1回だけ読み込む
    static func load() async -> OTCData? { await loader.get() }

    /// GS1コード（GTIN）から製品（YJコード）を調べる。
    /// 箱（販売包装単位）のコードは HOTコードマスターで端末の中だけで分かる。
    /// PTPシート（調剤包装単位）のコードはマスターに無いので、PMDA の「バーコードから添付文書を開く」で添付文書を引き、
    /// その添付文書に載っている製品（錠・細粒など複数のことがある）を返す
    static func lookup(_ gtin: String) async -> OTCLookup {
        guard let d = await load() else { return .offline }
        let g = String(repeating: "0", count: max(0, 14 - gtin.count)) + gtin
        if let yj = d.box[g] { return .found([yj], viaPMDA: false) }
        let base = "https://www.pmda.go.jp/PmdaSearch/"
        guard let first = await fetch(base + "bookSearch/01/" + g) else { return .offline }
        let ids = Array(Set(matches(#"\d{6}_\d{7}[0-9A-Z]\d{4}_\d+_\d+"#, in: first.location + " " + first.body))).sorted().prefix(4)
        var yj: [String] = []
        for id in ids {
            let rep = id.split(separator: "_")[1]
            yj.append(String(rep))
            if let page = await fetch(base + "iyakuDetail/" + id), page.status == 200 {
                // 同じ添付文書に載る製品は、YJコードの先頭7桁（成分と剤形の分類）が同じ
                for code in matches(#"(?<![0-9A-Z])\d{7}[0-9A-Z]\d{4}(?![0-9A-Z])"#, in: page.body) where code.prefix(7) == rep.prefix(7) {
                    yj.append(code)
                }
            }
        }
        var seen = Set<String>()
        let list = yj.filter { seen.insert($0).inserted && (d.names[$0] != nil || d.targets[$0] != nil) }
        return list.isEmpty ? .notFound : .found(list, viaPMDA: true)
    }

    private static func matches(_ pattern: String, in s: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        return re.matches(in: s, range: NSRange(s.startIndex..., in: s)).compactMap { Range($0.range, in: s).map { String(s[$0]) } }
    }

    /// 転送をたどらずに取得する（PDF の中身は読まない）。つながらなければ nil
    private static func fetch(_ url: String) async -> (status: Int, location: String, body: String)? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u, timeoutInterval: 15)
        req.setValue("PharmaCalc/1.0", forHTTPHeaderField: "User-Agent")
        do {
            let (data, res) = try await session.data(for: req)
            guard let h = res as? HTTPURLResponse else { return nil }
            let type = h.value(forHTTPHeaderField: "Content-Type") ?? ""
            let body = type.contains("pdf") ? "" : (String(data: data, encoding: .utf8) ?? "")
            return (h.statusCode, h.value(forHTTPHeaderField: "Location") ?? "", body)
        } catch {
            return nil
        }
    }

    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    private static let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)

    /// 別途の負担（特別の料金）の対象外となる場合（厚労省のページより。令和9年3月1日施行時点）
    static let exemptions = [
        "こども（18歳に達する日以後の最初の3月31日までの間にある者）",
        "がん治療又はがん治療に関連して生じた状態に使う場合",
        "指定難病若しくは小児慢性特定疾病（18歳から20歳までの者に限る）又はこれらに関連して生じた状態に使う場合",
        "国の公費負担医療において使う場合",
        "入院中（退院時処方を含む）に使う場合",
        "侵襲を伴う検査、処置又は手術に伴って使う場合（その検査等の後、14日以内の使用に限る）",
        "医師が年間を通じた症状の持続と治療の継続性を確認し、長期の使用が医療上必要と認めた場合",
        "類似のOTC医薬品で承認されている効能・効果では対応できない状態に使う場合（この薬の該当する効能・効果・傷病名の例は上に）",
        "妊婦・妊娠している可能性がある者・授乳婦が、特定の対象医薬品を使う場合",
    ]

    /// 特別の料金（円）＝ 対象医薬品の価格の4分の1 × 投薬全量。
    /// 10円以上なら5円未満の端数は切り捨て、5円以上10円未満は10円に切り上げ。10円未満は10円
    static func fee(_ yen: Double) -> Int {
        let v = (yen * 100).rounded() / 100
        if v <= 0 { return 0 }
        if v < 10 { return 10 }
        let base = (v / 10).rounded(.down) * 10
        return Int(v - base < 5 ? base : base + 10)
    }

    /// 規格の末尾の単位（「60mg1錠」→「錠」、「5%1g」→「g」、「10mL」→「10mL」）
    static func unit(_ spec: String) -> String {
        guard let r = spec.range(of: #"[\d.]+[^\d.]+$"#, options: .regularExpression) else { return "単位" }
        let tail = String(spec[r])
        guard let u = tail.range(of: #"[^\d.]+$"#, options: .regularExpression) else { return tail }
        let num = String(tail[tail.startIndex..<u.lowerBound])
        return Double(num) == 1 ? String(tail[u]) : tail
    }
}
