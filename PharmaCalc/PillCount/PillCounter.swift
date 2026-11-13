import UIKit

/// 解析用に縮小した画像と、その画素（RGBA）
struct PreparedImage {
    let image: UIImage
    let rgba: [UInt8]
    let width: Int
    let height: Int

    /// 向きを直し、長辺を maxSide 画素に縮小する
    static func make(from src: UIImage, maxSide: CGFloat = 1200) -> PreparedImage? {
        let longSide = max(src.size.width, src.size.height)
        guard longSide > 0 else { return nil }
        let scale = min(1, maxSide / longSide)
        let size = CGSize(width: max(1, (src.size.width * scale).rounded(.down)),
                          height: max(1, (src.size.height * scale).rounded(.down)))
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = true
        fmt.preferredRange = .standard
        let img = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in
            src.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let cg = img.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ok: Bool = buf.withUnsafeMutableBytes { ptr in
            guard let ctx = CGContext(data: ptr.baseAddress, width: w, height: h, bitsPerComponent: 8,
                                      bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        return PreparedImage(image: img, rgba: buf, width: w, height: h)
    }
}

/// 錠剤1つ（またはくっついた塊）の印。座標は PreparedImage の画素。
struct PillMarker: Identifiable, Equatable {
    var id = UUID()
    var x: CGFloat
    var y: CGFloat
    var count: Int
    var manual = false
}

struct PillCountResult {
    var markers: [PillMarker]
    /// 推定した錠剤1つの半径（画素）
    var unitRadius: CGFloat
}

/// 画像から錠剤を数える
/// 1. 画像でいちばん多い色を背景色とみなし、背景との色の差で錠剤を拾う
/// 2. 距離変換（錠剤の縁からの距離）を計算し、塊ごとの最大値から錠剤の半径を推定
/// 3. 細すぎる物（袋のしわ・反射）や大きすぎる物（机の端・箱）は除く
/// 4. 距離変換の山を錠剤の中心とみなす。2つの山の間がくびれていれば別の錠剤、くびれていなければ同じ錠剤
/// 5. 山の数より面積が明らかに大きい塊（横並びの楕円錠など）は面積比で補う
enum PillCounter {
    private struct Comp {
        var area = 0
        var maxD: Float = 0
        var border = false
    }

    static func analyze(_ p: PreparedImage, sensitivity: Double, roi: CGRect? = nil) -> PillCountResult {
        let empty = PillCountResult(markers: [], unitRadius: 12)
        let full = CGRect(x: 0, y: 0, width: p.width, height: p.height)
        let r0 = (roi ?? full).intersection(full).integral
        let x0 = Int(r0.minX), y0 = Int(r0.minY)
        let w = Int(r0.width), h = Int(r0.height), n = w * h
        guard w >= 16, h >= 16 else { return empty }
        let W = p.width
        let px = p.rgba
        @inline(__always) func at(_ i: Int) -> Int { ((y0 + i / w) * W + x0 + i % w) * 4 }

        // 1. 背景色＝いちばん多い色（RGB各5ビットで集計）
        var bins = [Int](repeating: 0, count: 32 * 32 * 32)
        for i in 0..<n {
            let k = at(i)
            bins[(Int(px[k]) >> 3) << 10 | (Int(px[k + 1]) >> 3) << 5 | (Int(px[k + 2]) >> 3)] += 1
        }
        var mode = 0
        for k in 0..<bins.count where bins[k] > bins[mode] { mode = k }
        var sr = 0, sg = 0, sb = 0, sc = 0
        for i in 0..<n {
            let k = at(i)
            if (Int(px[k]) >> 3) << 10 | (Int(px[k + 1]) >> 3) << 5 | (Int(px[k + 2]) >> 3) == mode {
                sr += Int(px[k]); sg += Int(px[k + 1]); sb += Int(px[k + 2]); sc += 1
            }
        }
        guard sc > 0 else { return empty }
        let br = Double(sr) / Double(sc), bgc = Double(sg) / Double(sc), bb = Double(sb) / Double(sc)

        // 背景との色の差 → しきい値（背景のばらつき＋感度）
        var dist = [UInt8](repeating: 0, count: n)
        var hist = [Int](repeating: 0, count: 256)
        for i in 0..<n {
            let k = at(i)
            let dr = Double(px[k]) - br, dg = Double(px[k + 1]) - bgc, db = Double(px[k + 2]) - bb
            let v = UInt8(min(255, Int((dr * dr + dg * dg + db * db).squareRoot())))
            dist[i] = v
            hist[Int(v)] += 1
        }
        var noise = 0, acc = 0
        for v in 0..<256 {
            acc += hist[v]
            if acc * 10 >= n * 3 { noise = v; break }
        }
        let thr = max(15, noise * 3) + Int((1 - sensitivity) * 50)
        var mask = [UInt8](repeating: 0, count: n)
        for i in 0..<n where Int(dist[i]) >= thr { mask[i] = 1 }
        mask = dilate(erode(mask, w, h), w, h)

        // 2. 距離変換と塊 → 錠剤の半径
        var D = distanceTransform(mask, w, h)
        var (labels, comps) = components(mask, D, w, h)
        var elig = comps.filter { !$0.border && $0.maxD >= 2 && Double($0.area) < Double(n) * 0.3 }
        if elig.isEmpty { elig = comps.filter { $0.maxD >= 2 } }
        guard !elig.isEmpty else { return empty }
        elig.sort { $0.maxD < $1.maxD }
        let totalArea = elig.reduce(0) { $0 + $1.area }
        var R = elig[elig.count - 1].maxD
        var accA = 0
        for c in elig {
            accA += c.area
            if accA * 2 >= totalArea { R = c.maxD; break }
        }
        guard R >= 2 else { return empty }

        // 刻印などの小さい穴だけ埋めて計算し直す（錠剤の間のすき間は埋めない）
        if fillSmallHoles(&mask, w, h, maxArea: Int(0.06 * Float.pi * R * R)) {
            D = distanceTransform(mask, w, h)
            (labels, comps) = components(mask, D, w, h)
        }

        // 3. 錠剤らしい塊だけ残す
        let unitArea = Float.pi * R * R
        let keep = comps.map { c in
            c.maxD >= R * 0.45 && c.maxD <= R * 2.2 && !(c.border && Float(c.area) > unitArea * 3)
        }

        // 4. 距離変換の山を探す
        var cand: [(d: Float, i: Int)] = []
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                let d = D[i]
                guard d >= R * 0.5, labels[i] >= 0, keep[Int(labels[i])] else { continue }
                if d >= D[i - 1] && d >= D[i + 1] && d >= D[i - w] && d >= D[i + w]
                    && d >= D[i - w - 1] && d >= D[i - w + 1] && d >= D[i + w - 1] && d >= D[i + w + 1] {
                    cand.append((d, i))
                }
            }
        }
        cand.sort { $0.d > $1.d }

        func samePill(_ a: Int, _ c: Int) -> Bool {
            let ax = Float(a % w), ay = Float(a / w), cx = Float(c % w), cy = Float(c / w)
            let len = hypotf(ax - cx, ay - cy)
            if len < R * 0.5 { return true }
            if len > R * 2.6 { return false }
            let steps = Int(len) + 1
            var mn = Float.greatestFiniteMagnitude
            for t in 0...steps {
                let f = Float(t) / Float(steps)
                let xx = Int((cx + (ax - cx) * f).rounded()), yy = Int((cy + (ay - cy) * f).rounded())
                mn = min(mn, D[yy * w + xx])
            }
            return mn >= 0.9 * min(D[a], D[c])
        }

        let cell = max(1, Int(R))
        var grid: [Int: [Int]] = [:]
        var peaks: [Int] = []
        for c in cand {
            let gx = (c.i % w) / cell, gy = (c.i / w) / cell
            var dup = false
            search: for ix in (gx - 3)...(gx + 3) {
                for iy in (gy - 3)...(gy + 3) {
                    for a in grid[ix &* 100_000 &+ iy] ?? [] where samePill(a, c.i) {
                        dup = true
                        break search
                    }
                }
            }
            if !dup {
                peaks.append(c.i)
                grid[gx &* 100_000 &+ gy, default: []].append(c.i)
                if peaks.count > 3000 { break }
            }
        }

        // 5. 面積で補正（山が1つだけの塊の面積の中央値を1錠分とする）
        var perComp: [Int32: [Int]] = [:]
        for (k, i) in peaks.enumerated() { perComp[labels[i], default: []].append(k) }
        var counts = [Int](repeating: 1, count: peaks.count)
        let singles = perComp.filter { $0.value.count == 1 }.map { comps[Int($0.key)].area }.sorted()
        if !singles.isEmpty {
            let unit = Double(singles[singles.count / 2])
            for (c, ks) in perComp {
                let est = Int(Double(comps[Int(c)].area) / unit + 0.35)
                if est > ks.count { counts[ks[0]] += est - ks.count }
            }
        }

        let markers = peaks.enumerated().map { k, i in
            PillMarker(x: CGFloat(x0 + i % w), y: CGFloat(y0 + i / w), count: counts[k])
        }
        return PillCountResult(markers: markers, unitRadius: CGFloat(R))
    }

    // MARK: - 部品

    private static func erode(_ m: [UInt8], _ w: Int, _ h: Int) -> [UInt8] {
        var o = [UInt8](repeating: 0, count: w * h)
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                if m[i] != 0 && m[i - 1] != 0 && m[i + 1] != 0 && m[i - w] != 0 && m[i + w] != 0 { o[i] = 1 }
            }
        }
        return o
    }

    private static func dilate(_ m: [UInt8], _ w: Int, _ h: Int) -> [UInt8] {
        var o = [UInt8](repeating: 0, count: w * h)
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                if m[i] != 0 || m[i - 1] != 0 || m[i + 1] != 0 || m[i - w] != 0 || m[i + w] != 0 { o[i] = 1 }
            }
        }
        return o
    }

    /// 距離変換（縁からの距離。縦横1・斜め√2 の近似）
    private static func distanceTransform(_ m: [UInt8], _ w: Int, _ h: Int) -> [Float] {
        let a: Float = 1, b: Float = 1.4142
        var d = [Float](repeating: 0, count: w * h)
        for i in 0..<(w * h) where m[i] != 0 { d[i] = 1e9 }
        for y in 0..<h {
            for x in 0..<w {
                let i = y * w + x
                if d[i] == 0 { continue }
                var v = d[i]
                if x == 0 || y == 0 || x == w - 1 || y == h - 1 { v = min(v, 1) }
                if x > 0 { v = min(v, d[i - 1] + a) }
                if y > 0 {
                    v = min(v, d[i - w] + a)
                    if x > 0 { v = min(v, d[i - w - 1] + b) }
                    if x < w - 1 { v = min(v, d[i - w + 1] + b) }
                }
                d[i] = v
            }
        }
        for y in stride(from: h - 1, through: 0, by: -1) {
            for x in stride(from: w - 1, through: 0, by: -1) {
                let i = y * w + x
                if d[i] == 0 { continue }
                var v = d[i]
                if x < w - 1 { v = min(v, d[i + 1] + a) }
                if y < h - 1 {
                    v = min(v, d[i + w] + a)
                    if x < w - 1 { v = min(v, d[i + w + 1] + b) }
                    if x > 0 { v = min(v, d[i + w - 1] + b) }
                }
                d[i] = v
            }
        }
        return d
    }

    /// 4近傍でつながった塊に番号をつけ、面積・距離の最大値・縁に触れているかを集める
    private static func components(_ m: [UInt8], _ D: [Float], _ w: Int, _ h: Int) -> ([Int32], [Comp]) {
        var labels = [Int32](repeating: -1, count: w * h)
        var comps: [Comp] = []
        var stack: [Int] = []
        stack.reserveCapacity(4096)
        for start in 0..<(w * h) where m[start] != 0 && labels[start] < 0 {
            let id = Int32(comps.count)
            labels[start] = id
            stack.append(start)
            var c = Comp()
            while let j = stack.popLast() {
                c.area += 1
                c.maxD = max(c.maxD, D[j])
                let x = j % w, y = j / w
                if x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3 { c.border = true }
                if x > 0, m[j - 1] != 0, labels[j - 1] < 0 { labels[j - 1] = id; stack.append(j - 1) }
                if x < w - 1, m[j + 1] != 0, labels[j + 1] < 0 { labels[j + 1] = id; stack.append(j + 1) }
                if y > 0, m[j - w] != 0, labels[j - w] < 0 { labels[j - w] = id; stack.append(j - w) }
                if y < h - 1, m[j + w] != 0, labels[j + w] < 0 { labels[j + w] = id; stack.append(j + w) }
            }
            comps.append(c)
        }
        return (labels, comps)
    }

    /// 縁につながらない小さい背景（刻印・割線の穴）を埋める。埋めたら true
    private static func fillSmallHoles(_ m: inout [UInt8], _ w: Int, _ h: Int, maxArea: Int) -> Bool {
        var seen = [Bool](repeating: false, count: w * h)
        var stack: [Int] = []
        var pix: [Int] = []
        var changed = false
        for start in 0..<(w * h) where m[start] == 0 && !seen[start] {
            seen[start] = true
            stack.append(start)
            pix.removeAll(keepingCapacity: true)
            var edge = false
            while let j = stack.popLast() {
                pix.append(j)
                let x = j % w, y = j / w
                if x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2 { edge = true }
                if x > 0, m[j - 1] == 0, !seen[j - 1] { seen[j - 1] = true; stack.append(j - 1) }
                if x < w - 1, m[j + 1] == 0, !seen[j + 1] { seen[j + 1] = true; stack.append(j + 1) }
                if y > 0, m[j - w] == 0, !seen[j - w] { seen[j - w] = true; stack.append(j - w) }
                if y < h - 1, m[j + w] == 0, !seen[j + w] { seen[j + w] = true; stack.append(j + w) }
            }
            if !edge && pix.count <= maxArea {
                for j in pix { m[j] = 1 }
                changed = true
            }
        }
        return changed
    }
}
