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
/// 1. 少しぼかして刻印の文字を消し、色の輪郭（RGBのうち最も強い勾配）を拾う
/// 2. 輪郭の各点から、勾配の向きの両側へ半径ぶん先の点に投票する → 丸い錠剤の中心に票が集まる
///    （背景の色に頼らないので、透明な袋や照明のむらがあっても使える）
/// 3. 半径は「円の数が急に減る手前の大きさ」から決める（錠剤の外周。刻印の輪は内側なので選ばれない）
/// 4. 票の山を中心候補とし、周り16方向の多くに輪郭がある物だけを錠剤とする。
///    錠剤どうしは直径以上離れているので、近すぎる候補（すき間）は除く
enum PillCounter {
    /// 1チャンネルの画像
    private struct Plane {
        var w: Int
        var h: Int
        var v: [Float]
    }

    /// 輪郭（勾配の単位ベクトルつき）
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

        // RGB を別々の面に取り出す
        let W = p.width
        var rgb = [Plane](repeating: Plane(w: w, h: h, v: [Float](repeating: 0, count: n)), count: 3)
        for y in 0..<h {
            for x in 0..<w {
                let k = ((y0 + y) * W + x0 + x) * 4
                let i = y * w + x
                rgb[0].v[i] = Float(p.rgba[k])
                rgb[1].v[i] = Float(p.rgba[k + 1])
                rgb[2].v[i] = Float(p.rgba[k + 2])
            }
        }

        // 半径
        let R = estimateRadius(rgb)
        guard R >= 3 else { return empty }

        // 半径 R±15% で投票
        let e = edges(rgb, blur: max(1, Int(R / 8)))
        guard e.xs.count > 20 else { return empty }
        let radii = Array(Set((0..<7).map { Int((R * (0.85 + 0.05 * Float($0))).rounded()) })).filter { $0 > 0 }
        let acc = box3(vote(e, radii))
        var peaks = localMaxima(acc, minValue: 1)
        guard !peaks.isEmpty else { return empty }
        peaks.sort { $0.v > $1.v }
        let topN = max(5, peaks.count / 20)
        let top = peaks.prefix(topN).map { $0.v }.sorted()
        let ref = top[top.count / 2]
        let thr = Float(0.75 - 0.5 * sensitivity) * ref
        let secMin = 13 + (sensitivity < 0.3 ? 1 : 0) - (sensitivity > 0.7 ? 1 : 0)

        let cell = max(1, Int(R))
        var grid: [Int: [Int]] = [:]
        var accepted: [Int] = []
        let minDist2 = (1.6 * R) * (1.6 * R)
        for pk in peaks {
            if pk.v < thr { break }
            let i = pk.i
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
            let ring = ringCheck(x, y, R, e, lo: 0.75, hi: 1.25)
            let bonus = ring.sectors >= 12 && ring.polarity >= 9 ? 1 : 0
            if ring.sectors + bonus < secMin { continue }
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

    private static func estimateRadius(_ rgb: [Plane]) -> Float {
        let w = rgb[0].w, h = rgb[0].h
        // 縮小画像で、半径ごとに円の数を数える
        let k = max(1, Int((Double(max(w, h)) / 480).rounded(.up)))
        let small = k > 1 ? rgb.map { downscale($0, k) } : rgb
        let es = edges(small, blur: 1)
        var counts: [(r: Int, c: Int)] = []
        for r in 4...59 {
            counts.append((r, circleCount(es, Float(r), lo: 0.75, hi: 1.25)))
        }
        guard let M = counts.map({ $0.c }).max(), M > 0 else { return 0 }
        // 円の数が急に減る手前＝錠剤の外周（判定の幅が ±25% なので 1.3 で割る）
        let need = max(3, Int((0.2 * Float(M)).rounded(.up)))
        guard let rc = counts.filter({ $0.c >= need }).map({ $0.r }).max() else { return 0 }
        let rough = Float(rc) / 1.3 * Float(k)

        // 原寸で細かく合わせる（狭い幅で円周を確かめ、ほぼ最多の中で一番大きい半径）
        let ef = edges(rgb, blur: max(1, Int(rough / 8)))
        var fine: [(r: Float, c: Int)] = []
        var f: Float = 0.65
        while f <= 1.201 {
            let r = rough * f
            if r >= 3 { fine.append((r, circleCount(ef, r, lo: 0.9, hi: 1.1))) }
            f += 0.05
        }
        guard let M2 = fine.map({ $0.c }).max(), M2 > 0 else { return rough }
        return fine.filter { Float($0.c) >= 0.85 * Float(M2) }.map { $0.r }.max() ?? rough
    }

    /// 半径 r の円がいくつ見つかるか（重なりを除き、周りの輪郭がそろっている物だけ）
    private static func circleCount(_ e: Edges, _ r: Float, lo: Float, hi: Float) -> Int {
        let ri = Int(r.rounded())
        guard ri > 0 else { return 0 }
        let acc = box3(vote(e, [ri]))
        let circ = 2 * Float.pi * Float(ri)
        var pk = localMaxima(acc, minValue: 0.15 * circ * 0.33)
        pk.sort { $0.v > $1.v }
        var found: [(x: Int, y: Int)] = []
        let minD2 = (1.6 * r) * (1.6 * r)
        for p in pk.prefix(400) {
            let x = p.i % e.w, y = p.i / e.w
            if found.contains(where: { Float(($0.x - x) * ($0.x - x) + ($0.y - y) * ($0.y - y)) < minD2 }) { continue }
            if ringCheck(x, y, r, e, lo: lo, hi: hi).sectors >= 12 { found.append((x, y)) }
        }
        return found.count
    }

    // MARK: - 部品

    /// 3×3 の平均（縁は端の値をくり返す）
    private static func box3(_ p: Plane) -> Plane {
        let w = p.w, h = p.h
        var t = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            let row = y * w
            for x in 0..<w {
                t[row + x] = (p.v[row + max(0, x - 1)] + p.v[row + x] + p.v[row + min(w - 1, x + 1)]) / 3
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

    /// RGB それぞれをぼかして Sobel をかけ、いちばん強い勾配を採用。上位1%の強さの25%以上を輪郭とする
    private static func edges(_ rgb: [Plane], blur: Int) -> Edges {
        let w = rgb[0].w, h = rgb[0].h, n = w * h
        var bgx = [Float](repeating: 0, count: n)
        var bgy = [Float](repeating: 0, count: n)
        var bm = [Float](repeating: 0, count: n)
        for ch in rgb {
            var p = ch
            for _ in 0..<blur { p = box3(p) }
            guard w >= 3, h >= 3 else { continue }
            for y in 1..<(h - 1) {
                for x in 1..<(w - 1) {
                    let i = y * w + x
                    let a = p.v[i - w - 1], b = p.v[i - w], c = p.v[i - w + 1]
                    let d = p.v[i - 1], f = p.v[i + 1]
                    let g = p.v[i + w - 1], hh = p.v[i + w], k = p.v[i + w + 1]
                    let gx = (c + 2 * f + k) - (a + 2 * d + g)
                    let gy = (g + 2 * hh + k) - (a + 2 * b + c)
                    let m = (gx * gx + gy * gy).squareRoot()
                    if m > bm[i] { bm[i] = m; bgx[i] = gx; bgy[i] = gy }
                }
            }
        }
        let T = max(1, 0.25 * percentile(bm, 0.99))
        var e = Edges(w: w, h: h, isEdge: [Bool](repeating: false, count: n),
                      ux: [Float](repeating: 0, count: n), uy: [Float](repeating: 0, count: n))
        for i in 0..<n where bm[i] > T {
            let ux = bgx[i] / bm[i], uy = bgy[i] / bm[i]
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

    /// 輪郭の各点から、勾配の向きの両側へ r だけ進んだ点に1票ずつ
    private static func vote(_ e: Edges, _ radii: [Int]) -> Plane {
        let w = e.w, h = e.h
        var acc = [Float](repeating: 0, count: w * h)
        for j in 0..<e.xs.count {
            let x = Float(e.xs[j]), y = Float(e.ys[j]), ux = e.ex[j], uy = e.ey[j]
            for r in radii {
                let fr = Float(r)
                var cx = Int((x + ux * fr).rounded()), cy = Int((y + uy * fr).rounded())
                if cx >= 0 && cx < w && cy >= 0 && cy < h { acc[cy * w + cx] += 1 }
                cx = Int((x - ux * fr).rounded()); cy = Int((y - uy * fr).rounded())
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
                if v < minValue || v <= 0 { continue }
                if v >= p.v[i - 1] && v >= p.v[i + 1] && v >= p.v[i - w] && v >= p.v[i + w]
                    && v >= p.v[i - w - 1] && v >= p.v[i - w + 1] && v >= p.v[i + w - 1] && v >= p.v[i + w + 1] {
                    out.append((v, i))
                }
            }
        }
        return out
    }

    /// 中心の周り16方向について、半径付近に「中心を向いた（または外を向いた）輪郭」があるか。
    /// sectors：輪郭のある方向の数（4つの象限のうち3つ以上にまたがらなければ0）
    /// polarity：向きがそろっている方向の数（錠剤なら内向きか外向きのどちらかにそろう）
    private static func ringCheck(_ x: Int, _ y: Int, _ R: Float, _ e: Edges,
                                  lo: Float, hi: Float) -> (sectors: Int, polarity: Int) {
        var hit = 0, pos = 0, neg = 0
        var quad = [false, false, false, false]
        for k in 0..<16 {
            let t = 2 * Float.pi * Float(k) / 16
            let ct = cos(t), st = sin(t)
            for j in 0..<9 {
                let rr = R * (lo + (hi - lo) * Float(j) / 8)
                let px = Int((Float(x) + ct * rr).rounded()), py = Int((Float(y) + st * rr).rounded())
                guard px >= 0, px < e.w, py >= 0, py < e.h else { continue }
                let i = py * e.w + px
                guard e.isEdge[i] else { continue }
                let dt = e.ux[i] * ct + e.uy[i] * st
                if abs(dt) > 0.8 {
                    hit += 1
                    quad[k * 4 / 16] = true
                    if dt > 0 { pos += 1 } else { neg += 1 }
                    break
                }
            }
        }
        let q = quad.filter { $0 }.count
        return (q >= 3 ? hit : 0, max(pos, neg))
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
