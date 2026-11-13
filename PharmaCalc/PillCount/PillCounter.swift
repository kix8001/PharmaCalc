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

/// 画像から錠剤を数える（円の検出＝ハフ変換）
/// 1. 画像でいちばん多い色を背景とし、各画素の「背景との色の差」を求める
/// 2. 色の差がふくらむ向き（背景→錠剤）の輪郭を拾い、輪郭から内側へ半径ぶん先の点に投票する
///    → 円い錠剤の中心に票が集まる。くっついていても、袋や刻印があっても中心は残る
/// 3. 半径は、縮小画像で半径を変えながら「円がいちばんたくさん見つかる半径」を探して決める
/// 4. 票の山を中心候補とし、周りの16方向のうち多くに輪郭がある物だけを錠剤とする
///    （袋のチャックや机の端などの直線は、1〜2方向にしか輪郭が無いので除かれる）
enum PillCounter {
    /// 1チャンネルの画像
    private struct Plane {
        var w: Int
        var h: Int
        var v: [Float]
    }

    /// 輪郭（背景→錠剤の向きの単位ベクトルつき）
    private struct Edges {
        var w: Int
        var h: Int
        var xs: [Int32] = []
        var ys: [Int32] = []
        var ex: [Float] = []
        var ey: [Float] = []
        var isEdge: [Bool]
        var ux: [Float]
        var uy: [Float]
    }

    static func analyze(_ p: PreparedImage, sensitivity: Double, roi: CGRect? = nil) -> PillCountResult {
        let empty = PillCountResult(markers: [], unitRadius: 12)
        let full = CGRect(x: 0, y: 0, width: p.width, height: p.height)
        let r0 = (roi ?? full).intersection(full).integral
        let x0 = Int(r0.minX), y0 = Int(r0.minY)
        let w = Int(r0.width), h = Int(r0.height), n = w * h
        guard w >= 24, h >= 24 else { return empty }

        // 1. 背景色＝いちばん多い色（RGB各5ビットで集計）→ 背景との色の差
        let W = p.width
        let px = p.rgba
        var bins = [Int](repeating: 0, count: 32 * 32 * 32)
        for y in 0..<h {
            for x in 0..<w {
                let k = ((y0 + y) * W + x0 + x) * 4
                bins[(Int(px[k]) >> 3) << 10 | (Int(px[k + 1]) >> 3) << 5 | (Int(px[k + 2]) >> 3)] += 1
            }
        }
        var mode = 0
        for k in 0..<bins.count where bins[k] > bins[mode] { mode = k }
        var sr = 0, sg = 0, sb = 0, sc = 0
        for y in 0..<h {
            for x in 0..<w {
                let k = ((y0 + y) * W + x0 + x) * 4
                if (Int(px[k]) >> 3) << 10 | (Int(px[k + 1]) >> 3) << 5 | (Int(px[k + 2]) >> 3) == mode {
                    sr += Int(px[k]); sg += Int(px[k + 1]); sb += Int(px[k + 2]); sc += 1
                }
            }
        }
        guard sc > 0 else { return empty }
        let br = Float(sr) / Float(sc), bg = Float(sg) / Float(sc), bb = Float(sb) / Float(sc)
        var F = Plane(w: w, h: h, v: [Float](repeating: 0, count: n))
        for y in 0..<h {
            for x in 0..<w {
                let k = ((y0 + y) * W + x0 + x) * 4
                let dr = Float(px[k]) - br, dg = Float(px[k + 1]) - bg, db = Float(px[k + 2]) - bb
                F.v[y * w + x] = (dr * dr + dg * dg + db * db).squareRoot()
            }
        }
        let bgThr = percentile(F.v, 0.3) * 3 + 15

        // 2. 輪郭
        let fs = box3(box3(F))
        let edges = edgeField(fs)
        guard edges.xs.count > 20 else { return empty }

        // 3. 錠剤の半径
        let R = estimateRadius(F, edges)
        guard R >= 3 else { return empty }

        // 4. 半径 R±15% で投票し、山を探す
        let radii = Array(Set((0..<7).map { Int((R * (0.85 + 0.05 * Float($0))).rounded()) })).filter { $0 > 0 }
        let acc = box3(vote(edges, radii))
        var peaks = localMaxima(acc, minValue: 1)
        guard !peaks.isEmpty else { return empty }
        peaks.sort { $0.v > $1.v }
        let topN = max(5, peaks.count / 20)
        let top = peaks.prefix(topN).map { $0.v }.sorted()
        let ref = top[top.count / 2]
        let thr = Float(0.75 - 0.5 * sensitivity) * ref

        let cell = max(1, Int(R))
        var grid: [Int: [Int]] = [:]
        var accepted: [Int] = []
        let minDist2 = (1.2 * R) * (1.2 * R)
        for pk in peaks {
            if pk.v < thr { break }
            let i = pk.i
            if fs.v[i] < bgThr { continue }
            let x = i % w, y = i / w
            let gx = x / cell, gy = y / cell
            var near = false
            search: for ix in (gx - 2)...(gx + 2) {
                for iy in (gy - 2)...(gy + 2) {
                    for a in grid[ix &* 100_000 &+ iy] ?? [] {
                        let dx = Float(a % w - x), dy = Float(a / w - y)
                        if dx * dx + dy * dy < minDist2 { near = true; break search }
                    }
                }
            }
            if near { continue }
            if sectors(x, y, R, edges) < 11 { continue }
            accepted.append(i)
            grid[gx &* 100_000 &+ gy, default: []].append(i)
            if accepted.count >= 3000 { break }
        }

        let markers = accepted.map { i in
            PillMarker(x: CGFloat(x0 + i % w), y: CGFloat(y0 + i / w), count: 1)
        }
        return PillCountResult(markers: markers, unitRadius: CGFloat(R))
    }

    // MARK: - 半径の推定

    /// 縮小画像で半径4〜59画素を試し、円らしい山がいちばん多く出る半径を選ぶ。そのあと原寸で細かく合わせる
    private static func estimateRadius(_ F: Plane, _ fullEdges: Edges) -> Float {
        let k = max(1, Int((Double(max(F.w, F.h)) / 480).rounded(.up)))
        var coarse: Float = 0
        if k > 1 {
            let d = downscale(F, k)
            let e = edgeField(box3(box3(d)))
            var best: Float = -1
            for r in 4...59 {
                let s = circleScore(e, Float(r))
                if s > best { best = s; coarse = Float(r * k) }
            }
        } else {
            var best: Float = -1
            for r in 4...59 {
                let s = circleScore(fullEdges, Float(r))
                if s > best { best = s; coarse = Float(r) }
            }
        }
        var R = coarse
        var best: Float = -1
        var f: Float = 0.70
        while f <= 1.351 {
            let r = coarse * f
            if r >= 3 {
                let s = circleScore(fullEdges, r)
                if s > best { best = s; R = r }
            }
            f += 0.05
        }
        return R
    }

    /// 半径 r の円がどれだけ見つかるか（円周に対する票の割合の合計、上位200個まで）
    private static func circleScore(_ e: Edges, _ r: Float) -> Float {
        let ri = Int(r.rounded())
        guard ri > 0 else { return 0 }
        let acc = box3(vote(e, [ri]))
        let circ = 2 * Float.pi * Float(ri)
        var pk = localMaxima(acc, minValue: 0.30 * circ * 0.33)
        pk.sort { $0.v > $1.v }
        return pk.prefix(200).reduce(0) { $0 + min(1, $1.v / circ) }
    }

    // MARK: - 部品

    /// 3×3 の平均（縁は端の値をくり返す）
    private static func box3(_ p: Plane) -> Plane {
        let w = p.w, h = p.h
        var t = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            let row = y * w
            for x in 0..<w {
                let a = p.v[row + max(0, x - 1)], b = p.v[row + x], c = p.v[row + min(w - 1, x + 1)]
                t[row + x] = (a + b + c) / 3
            }
        }
        var o = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            let up = max(0, y - 1) * w, mid = y * w, dn = min(h - 1, y + 1) * w
            for x in 0..<w {
                o[mid + x] = (t[up + x] + t[mid + x] + t[dn + x]) / 3
            }
        }
        return Plane(w: w, h: h, v: o)
    }

    /// k×k の平均で縮小
    private static func downscale(_ p: Plane, _ k: Int) -> Plane {
        let w = p.w / k, h = p.h / k
        var o = [Float](repeating: 0, count: w * h)
        let inv = 1 / Float(k * k)
        for y in 0..<h {
            for x in 0..<w {
                var s: Float = 0
                for yy in 0..<k {
                    let row = (y * k + yy) * p.w + x * k
                    for xx in 0..<k { s += p.v[row + xx] }
                }
                o[y * w + x] = s * inv
            }
        }
        return Plane(w: w, h: h, v: o)
    }

    /// Sobel で勾配を求め、強い所（上位1%の強さの25%以上）を輪郭とする
    private static func edgeField(_ p: Plane) -> Edges {
        let w = p.w, h = p.h, n = w * h
        var gxs = [Float](repeating: 0, count: n)
        var gys = [Float](repeating: 0, count: n)
        var mag = [Float](repeating: 0, count: n)
        if w >= 3 && h >= 3 {
            for y in 1..<(h - 1) {
                for x in 1..<(w - 1) {
                    let i = y * w + x
                    let a = p.v[i - w - 1], b = p.v[i - w], c = p.v[i - w + 1]
                    let d = p.v[i - 1], f = p.v[i + 1]
                    let g = p.v[i + w - 1], hh = p.v[i + w], k = p.v[i + w + 1]
                    let gx = (c + 2 * f + k) - (a + 2 * d + g)
                    let gy = (g + 2 * hh + k) - (a + 2 * b + c)
                    gxs[i] = gx
                    gys[i] = gy
                    mag[i] = (gx * gx + gy * gy).squareRoot()
                }
            }
        }
        let T = max(1, 0.25 * percentile(mag, 0.99))
        var e = Edges(w: w, h: h, isEdge: [Bool](repeating: false, count: n),
                      ux: [Float](repeating: 0, count: n), uy: [Float](repeating: 0, count: n))
        for i in 0..<n where mag[i] > T {
            let ux = gxs[i] / mag[i], uy = gys[i] / mag[i]
            e.isEdge[i] = true
            e.ux[i] = ux
            e.uy[i] = uy
            e.xs.append(Int32(i % w))
            e.ys.append(Int32(i / w))
            e.ex.append(ux)
            e.ey.append(uy)
        }
        return e
    }

    /// 輪郭の各点から、勾配の向き（錠剤の内側）へ r だけ進んだ点に1票
    private static func vote(_ e: Edges, _ radii: [Int]) -> Plane {
        let w = e.w, h = e.h
        var acc = [Float](repeating: 0, count: w * h)
        for j in 0..<e.xs.count {
            let x = Float(e.xs[j]), y = Float(e.ys[j]), ux = e.ex[j], uy = e.ey[j]
            for r in radii {
                let cx = Int((x + ux * Float(r)).rounded()), cy = Int((y + uy * Float(r)).rounded())
                if cx >= 0 && cx < w && cy >= 0 && cy < h { acc[cy * w + cx] += 1 }
            }
        }
        return Plane(w: w, h: h, v: acc)
    }

    /// 8近傍で最大の点
    private static func localMaxima(_ p: Plane, minValue: Float) -> [(v: Float, i: Int)] {
        let w = p.w, h = p.h
        var out: [(v: Float, i: Int)] = []
        guard w >= 3, h >= 3 else { return out }
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                let v = p.v[i]
                if v < minValue { continue }
                if v >= p.v[i - 1] && v >= p.v[i + 1] && v >= p.v[i - w] && v >= p.v[i + w]
                    && v >= p.v[i - w - 1] && v >= p.v[i - w + 1] && v >= p.v[i + w - 1] && v >= p.v[i + w + 1] {
                    out.append((v, i))
                }
            }
        }
        return out
    }

    /// 中心の周り16方向のうち、半径付近に「中心を向いた輪郭」がある方向の数。
    /// 4つの象限のうち3つ以上にまたがっていなければ0（直線の縁を除くため）
    private static func sectors(_ x: Int, _ y: Int, _ R: Float, _ e: Edges) -> Int {
        var hit = 0
        var quad = [false, false, false, false]
        for k in 0..<16 {
            let t = 2 * Float.pi * Float(k) / 16
            let ct = cos(t), st = sin(t)
            for j in 0..<9 {
                let rr = R * (0.75 + 0.0625 * Float(j))
                let px = Int((Float(x) + ct * rr).rounded()), py = Int((Float(y) + st * rr).rounded())
                guard px >= 0, px < e.w, py >= 0, py < e.h else { continue }
                let i = py * e.w + px
                if e.isEdge[i] && -(e.ux[i] * ct + e.uy[i] * st) > 0.6 {
                    hit += 1
                    quad[k * 4 / 16] = true
                    break
                }
            }
        }
        return quad.filter { $0 }.count >= 3 ? hit : 0
    }

    /// 0〜1 の分位点（ヒストグラムで近似）
    private static func percentile(_ v: [Float], _ q: Float) -> Float {
        guard let mx = v.max(), mx > 0 else { return 0 }
        let bins = 2048
        var hist = [Int](repeating: 0, count: bins)
        let scale = Float(bins - 1) / mx
        for x in v { hist[Int(max(0, x) * scale)] += 1 }
        let target = Int(Float(v.count) * q)
        var acc = 0
        for b in 0..<bins {
            acc += hist[b]
            if acc >= target { return Float(b) / scale }
        }
        return mx
    }
}
