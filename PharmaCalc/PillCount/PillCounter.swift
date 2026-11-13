import UIKit

/// 解析用に縮小した画像と、その画素（RGBA）
struct PreparedImage {
    let image: UIImage
    let rgba: [UInt8]
    let width: Int
    let height: Int

    /// 向きを直し、長辺を maxSide 画素に縮小する
    static func make(from src: UIImage, maxSide: CGFloat = 900) -> PreparedImage? {
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
/// 1. 画像の縁の色を背景色とみなす
/// 2. 背景との色の差を大津の方法で2値化（錠剤の刻印などの穴は埋める）
/// 3. 塊の面積の中央値から1錠の大きさを推定
/// 4. 少し削って（収縮）くっついた錠剤を分け、それでも大きい塊は面積比で数える
enum PillCounter {
    private struct Comp {
        var area: Int
        var cx: Double
        var cy: Double
    }

    static func analyze(_ p: PreparedImage, sensitivity: Double) -> PillCountResult {
        let w = p.width, h = p.height, n = w * h
        guard w > 8, h > 8 else { return PillCountResult(markers: [], unitRadius: 12) }
        let px = p.rgba

        // 1. 背景色（縁の画素の中央値）
        let margin = max(2, min(w, h) / 25)
        var hr = [Int](repeating: 0, count: 256)
        var hg = hr, hb = hr
        var edgeCount = 0
        for y in 0..<h {
            let edgeRow = y < margin || y >= h - margin
            for x in 0..<w where edgeRow || x < margin || x >= w - margin {
                let i = (y * w + x) * 4
                hr[Int(px[i])] += 1
                hg[Int(px[i + 1])] += 1
                hb[Int(px[i + 2])] += 1
                edgeCount += 1
            }
        }
        let br = median(hr, edgeCount), bg = median(hg, edgeCount), bb = median(hb, edgeCount)

        // 2. 背景との色の差 → 2値化
        var dist = [UInt8](repeating: 0, count: n)
        for i in 0..<n {
            let r = Int(px[i * 4]) - br
            let g = Int(px[i * 4 + 1]) - bg
            let b = Int(px[i * 4 + 2]) - bb
            dist[i] = UInt8(min(255, Int(Double(r * r + g * g + b * b).squareRoot())))
        }
        let thr = max(12, Int(Double(otsu(dist)) * (1.5 - sensitivity)))
        var mask = [UInt8](repeating: 0, count: n)
        for i in 0..<n where Int(dist[i]) >= thr { mask[i] = 1 }
        mask = dilate(erode(mask, w, h), w, h)
        mask = fillHoles(mask, w, h)

        // 3. 塊を拾って1錠の大きさを推定
        let (labels, all) = components(mask, w, h)
        let minArea = max(15, n / 15000)
        var keep = [Bool](repeating: false, count: all.count)
        var areas: [Int] = []
        for (k, c) in all.enumerated() where c.area >= minArea && c.area < n / 4 {
            keep[k] = true
            areas.append(c.area)
        }
        guard !areas.isEmpty else { return PillCountResult(markers: [], unitRadius: 12) }
        let unit = robustUnit(areas)
        let radius = (Double(unit) / Double.pi).squareRoot()

        // 対象の塊だけ残したマスク
        var clean = [UInt8](repeating: 0, count: n)
        for i in 0..<n where labels[i] >= 0 && keep[Int(labels[i])] { clean[i] = 1 }

        // 4. 削ってくっついた錠剤を分ける
        let r = Int(min(12, max(1, radius * 0.3)))
        var eroded = clean
        for _ in 0..<r { eroded = erode(eroded, w, h) }
        let expected = Double.pi * pow(max(1, radius - Double(r)), 2)
        var parts = components(eroded, w, h).1.filter { Double($0.area) >= expected * 0.2 }

        var markers: [PillMarker]
        if parts.isEmpty {
            parts = all.enumerated().filter { keep[$0.offset] }.map(\.element)
            markers = parts.map { c in
                PillMarker(x: c.cx, y: c.cy, count: max(1, Int((Double(c.area) / Double(unit)).rounded())))
            }
        } else {
            let eUnit = Double(robustUnit(parts.map(\.area)))
            markers = parts.map { c in
                PillMarker(x: c.cx, y: c.cy, count: max(1, Int((Double(c.area) / eUnit).rounded())))
            }
        }
        return PillCountResult(markers: markers, unitRadius: CGFloat(radius))
    }

    // MARK: - 部品

    private static func median(_ hist: [Int], _ total: Int) -> Int {
        var acc = 0
        for (v, c) in hist.enumerated() {
            acc += c
            if acc * 2 >= total { return v }
        }
        return 0
    }

    /// 面積の中央値の近くだけで取り直した中央値（くっついた塊や欠片に引っぱられにくくする）
    private static func robustUnit(_ areas: [Int]) -> Int {
        let s = areas.sorted()
        let m0 = s[s.count / 2]
        let near = s.filter { Double($0) >= Double(m0) * 0.6 && Double($0) <= Double(m0) * 1.4 }
        return max(1, near.isEmpty ? m0 : near[near.count / 2])
    }

    /// 大津の方法でしきい値を求める
    private static func otsu(_ v: [UInt8]) -> Int {
        var hist = [Int](repeating: 0, count: 256)
        for x in v { hist[Int(x)] += 1 }
        let total = v.count
        var sum = 0.0
        for i in 0..<256 { sum += Double(i * hist[i]) }
        var sumB = 0.0, wB = 0, best = 0.0, thr = 0
        for t in 0..<256 {
            wB += hist[t]
            if wB == 0 { continue }
            let wF = total - wB
            if wF == 0 { break }
            sumB += Double(t * hist[t])
            let mB = sumB / Double(wB)
            let mF = (sum - sumB) / Double(wF)
            let between = Double(wB) * Double(wF) * (mB - mF) * (mB - mF)
            if between > best { best = between; thr = t }
        }
        return thr + 1
    }

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

    /// 外とつながっていない背景（刻印や割線の穴）を埋める
    private static func fillHoles(_ m: [UInt8], _ w: Int, _ h: Int) -> [UInt8] {
        var outside = [Bool](repeating: false, count: w * h)
        var stack: [Int] = []
        func push(_ i: Int) {
            if m[i] == 0 && !outside[i] {
                outside[i] = true
                stack.append(i)
            }
        }
        for x in 0..<w { push(x); push((h - 1) * w + x) }
        for y in 0..<h { push(y * w); push(y * w + w - 1) }
        while let j = stack.popLast() {
            let x = j % w, y = j / w
            if x > 0 { push(j - 1) }
            if x < w - 1 { push(j + 1) }
            if y > 0 { push(j - w) }
            if y < h - 1 { push(j + w) }
        }
        var o = [UInt8](repeating: 0, count: w * h)
        for i in 0..<(w * h) where m[i] != 0 || !outside[i] { o[i] = 1 }
        return o
    }

    /// 4近傍でつながった塊に番号をつける
    private static func components(_ m: [UInt8], _ w: Int, _ h: Int) -> ([Int32], [Comp]) {
        var labels = [Int32](repeating: -1, count: w * h)
        var comps: [Comp] = []
        var stack: [Int] = []
        stack.reserveCapacity(4096)
        for start in 0..<(w * h) where m[start] != 0 && labels[start] < 0 {
            let id = Int32(comps.count)
            labels[start] = id
            stack.append(start)
            var area = 0, sx = 0, sy = 0
            while let j = stack.popLast() {
                area += 1
                let x = j % w, y = j / w
                sx += x
                sy += y
                if x > 0, m[j - 1] != 0, labels[j - 1] < 0 { labels[j - 1] = id; stack.append(j - 1) }
                if x < w - 1, m[j + 1] != 0, labels[j + 1] < 0 { labels[j + 1] = id; stack.append(j + 1) }
                if y > 0, m[j - w] != 0, labels[j - w] < 0 { labels[j - w] = id; stack.append(j - w) }
                if y < h - 1, m[j + w] != 0, labels[j + w] < 0 { labels[j + w] = id; stack.append(j + w) }
            }
            comps.append(Comp(area: area, cx: Double(sx) / Double(area), cy: Double(sy) / Double(area)))
        }
        return (labels, comps)
    }
}
