package app.pharmacalc.android.pill

import android.graphics.Bitmap
import android.graphics.Rect
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** 錠剤1つの印。座標は解析用画像の画素 */
data class PillMarker(val x: Float, val y: Float, val count: Int = 1, val manual: Boolean = false,
                      val id: Long = nextId()) {
    companion object {
        private var seq = 0L
        @Synchronized fun nextId() = ++seq
    }
}

class PillCountResult(val markers: List<PillMarker>, val unitRadius: Float)

/**
 * 画像から錠剤を数える（円の検出＝ハフ変換）。iOS 版の PillCounter と同じ手順。
 * 1. 少しぼかして刻印の文字を消し、色の輪郭（RGBのうち最も強い勾配）を拾う
 * 2. 輪郭の各点から、勾配の向きの両側へ半径ぶん先の点に投票する → 丸い錠剤の中心に票が集まる
 * 3. 半径は「円の数が急に減る手前の大きさ」から決める（刻印の輪は内側なので選ばれない）
 * 4. 票の山を中心候補とし、周り16方向の多くに輪郭がある物だけを錠剤とする。直径より近い候補は除く
 */
object PillCounter {
    private class Plane(val w: Int, val h: Int, val v: FloatArray)

    private class Edges(val w: Int, val h: Int, val xs: IntArray, val ys: IntArray, val ex: FloatArray, val ey: FloatArray,
                        val isEdge: BooleanArray, val ux: FloatArray, val uy: FloatArray)

    fun analyze(bmp: Bitmap, sensitivity: Double, roi: Rect? = null): PillCountResult {
        val empty = PillCountResult(emptyList(), 12f)
        val full = Rect(0, 0, bmp.width, bmp.height)
        val r0 = Rect(roi ?: full)
        if (!r0.intersect(full)) return empty
        val w = r0.width(); val h = r0.height(); val n = w * h
        if (w < 24 || h < 24) return empty

        val px = IntArray(n)
        bmp.getPixels(px, 0, w, r0.left, r0.top, w, h)
        val rgb = Array(3) { Plane(w, h, FloatArray(n)) }
        for (i in 0 until n) {
            val c = px[i]
            rgb[0].v[i] = ((c shr 16) and 0xFF).toFloat()
            rgb[1].v[i] = ((c shr 8) and 0xFF).toFloat()
            rgb[2].v[i] = (c and 0xFF).toFloat()
        }

        val R = estimateRadius(rgb)
        if (R < 3) return empty

        val e = edges(rgb, max(1, (R / 8).toInt()))
        if (e.xs.size <= 20) return empty
        val radii = (0 until 7).map { (R * (0.85f + 0.05f * it)).roundToInt() }.filter { it > 0 }.distinct()
        val acc = box3(vote(e, radii))
        val peaks = localMaxima(acc, 1f).sortedByDescending { it.first }
        if (peaks.isEmpty()) return empty
        val topN = max(5, peaks.size / 20)
        val top = peaks.take(topN).map { it.first }.sorted()
        val ref = top[top.size / 2]
        val thr = (0.75 - 0.5 * sensitivity).toFloat() * ref
        val secMin = 13 + (if (sensitivity < 0.3) 1 else 0) - (if (sensitivity > 0.7) 1 else 0)

        val cell = max(1, R.toInt())
        val grid = HashMap<Long, MutableList<Int>>()
        val accepted = ArrayList<Int>()
        val minD2 = (1.6f * R) * (1.6f * R)
        for ((v, i) in peaks) {
            if (v < thr) break
            val x = i % w; val y = i / w
            val gx = x / cell; val gy = y / cell
            var near = false
            loop@ for (ix in gx - 2..gx + 2) for (iy in gy - 2..gy + 2) {
                val list = grid[key(ix, iy)] ?: continue
                for (a in list) {
                    val dx = (a % w - x).toFloat(); val dy = (a / w - y).toFloat()
                    if (dx * dx + dy * dy < minD2) { near = true; break@loop }
                }
            }
            if (near) continue
            val (sec, pol) = ringCheck(x, y, R, e, 0.75f, 1.25f)
            val bonus = if (sec >= 12 && pol >= 9) 1 else 0
            if (sec + bonus < secMin) continue
            accepted += i
            grid.getOrPut(key(gx, gy)) { ArrayList() }.add(i)
            if (accepted.size >= 3000) break
        }
        return PillCountResult(accepted.map { PillMarker((r0.left + it % w).toFloat(), (r0.top + it / w).toFloat()) }, R)
    }

    private fun key(x: Int, y: Int) = x.toLong() * 100_000L + y

    // ---- 半径の推定 ----

    private fun estimateRadius(rgb: Array<Plane>): Float {
        val w = rgb[0].w; val h = rgb[0].h
        val k = max(1, ceil(max(w, h) / 480.0).toInt())
        val small = if (k > 1) Array(3) { downscale(rgb[it], k) } else rgb
        val es = edges(small, 1)
        val counts = (4..59).map { it to circleCount(es, it.toFloat(), 0.75f, 1.25f) }
        val m = counts.maxOf { it.second }
        if (m <= 0) return 0f
        // 円の数が急に減る手前＝錠剤の外周（判定の幅が ±25% なので 1.3 で割る）
        val need = max(3, ceil(0.2 * m).toInt())
        val rc = counts.filter { it.second >= need }.maxOfOrNull { it.first } ?: return 0f
        val rough = rc / 1.3f * k

        // 原寸で細かく合わせる（狭い幅で円周を確かめ、ほぼ最多の中で一番大きい半径）
        val ef = edges(rgb, max(1, (rough / 8).toInt()))
        val fine = ArrayList<Pair<Float, Int>>()
        var f = 0.65f
        while (f <= 1.201f) {
            val r = rough * f
            if (r >= 3) fine += r to circleCount(ef, r, 0.9f, 1.1f)
            f += 0.05f
        }
        val m2 = fine.maxOfOrNull { it.second } ?: return rough
        if (m2 <= 0) return rough
        return fine.filter { it.second >= 0.85f * m2 }.maxOf { it.first }
    }

    /** 半径 r の円がいくつ見つかるか（重なりを除き、周りの輪郭がそろっている物だけ） */
    private fun circleCount(e: Edges, r: Float, lo: Float, hi: Float): Int {
        val ri = r.roundToInt()
        if (ri <= 0) return 0
        val acc = box3(vote(e, listOf(ri)))
        val circ = 2f * PI.toFloat() * ri
        val pk = localMaxima(acc, 0.15f * circ * 0.33f).sortedByDescending { it.first }.take(400)
        val found = ArrayList<IntArray>()
        val minD2 = (1.6f * r) * (1.6f * r)
        for ((_, i) in pk) {
            val x = i % e.w; val y = i / e.w
            var near = false
            for (p in found) {
                val dx = (p[0] - x).toFloat(); val dy = (p[1] - y).toFloat()
                if (dx * dx + dy * dy < minD2) { near = true; break }
            }
            if (near) continue
            if (ringCheck(x, y, r, e, lo, hi).first >= 12) found += intArrayOf(x, y)
        }
        return found.size
    }

    // ---- 部品 ----

    /** 3×3 の平均（縁は端の値をくり返す） */
    private fun box3(p: Plane): Plane {
        val w = p.w; val h = p.h
        val t = FloatArray(w * h)
        for (y in 0 until h) {
            val row = y * w
            for (x in 0 until w) {
                t[row + x] = (p.v[row + max(0, x - 1)] + p.v[row + x] + p.v[row + min(w - 1, x + 1)]) / 3f
            }
        }
        val o = FloatArray(w * h)
        for (y in 0 until h) {
            val up = max(0, y - 1) * w; val mid = y * w; val dn = min(h - 1, y + 1) * w
            for (x in 0 until w) o[mid + x] = (t[up + x] + t[mid + x] + t[dn + x]) / 3f
        }
        return Plane(w, h, o)
    }

    /** k×k の平均で縮小 */
    private fun downscale(p: Plane, k: Int): Plane {
        val w = p.w / k; val h = p.h / k
        val o = FloatArray(w * h)
        val inv = 1f / (k * k)
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0f
            for (yy in 0 until k) {
                val row = (y * k + yy) * p.w + x * k
                for (xx in 0 until k) s += p.v[row + xx]
            }
            o[y * w + x] = s * inv
        }
        return Plane(w, h, o)
    }

    /** RGB それぞれをぼかして Sobel をかけ、いちばん強い勾配を採用。上位1%の強さの25%以上を輪郭とする */
    private fun edges(rgb: Array<Plane>, blur: Int): Edges {
        val w = rgb[0].w; val h = rgb[0].h; val n = w * h
        val bgx = FloatArray(n); val bgy = FloatArray(n); val bm = FloatArray(n)
        for (ch in rgb) {
            var p = ch
            repeat(blur) { p = box3(p) }
            if (w < 3 || h < 3) continue
            val v = p.v
            for (y in 1 until h - 1) for (x in 1 until w - 1) {
                val i = y * w + x
                val a = v[i - w - 1]; val b = v[i - w]; val c = v[i - w + 1]
                val d = v[i - 1]; val f = v[i + 1]
                val g = v[i + w - 1]; val hh = v[i + w]; val k = v[i + w + 1]
                val gx = (c + 2 * f + k) - (a + 2 * d + g)
                val gy = (g + 2 * hh + k) - (a + 2 * b + c)
                val m = sqrt(gx * gx + gy * gy)
                if (m > bm[i]) { bm[i] = m; bgx[i] = gx; bgy[i] = gy }
            }
        }
        val t = max(1f, 0.25f * percentile(bm, 0.99f))
        val isEdge = BooleanArray(n); val ux = FloatArray(n); val uy = FloatArray(n)
        var cnt = 0
        for (i in 0 until n) if (bm[i] > t) cnt++
        val xs = IntArray(cnt); val ys = IntArray(cnt); val ex = FloatArray(cnt); val ey = FloatArray(cnt)
        var j = 0
        for (i in 0 until n) {
            if (bm[i] <= t) continue
            val a = bgx[i] / bm[i]; val b = bgy[i] / bm[i]
            isEdge[i] = true; ux[i] = a; uy[i] = b
            xs[j] = i % w; ys[j] = i / w; ex[j] = a; ey[j] = b
            j++
        }
        return Edges(w, h, xs, ys, ex, ey, isEdge, ux, uy)
    }

    /** 輪郭の各点から、勾配の向きの両側へ r だけ進んだ点に1票ずつ */
    private fun vote(e: Edges, radii: List<Int>): Plane {
        val w = e.w; val h = e.h
        val acc = FloatArray(w * h)
        for (j in e.xs.indices) {
            val x = e.xs[j].toFloat(); val y = e.ys[j].toFloat(); val ux = e.ex[j]; val uy = e.ey[j]
            for (r in radii) {
                val fr = r.toFloat()
                var cx = (x + ux * fr).roundToInt(); var cy = (y + uy * fr).roundToInt()
                if (cx in 0 until w && cy in 0 until h) acc[cy * w + cx] += 1f
                cx = (x - ux * fr).roundToInt(); cy = (y - uy * fr).roundToInt()
                if (cx in 0 until w && cy in 0 until h) acc[cy * w + cx] += 1f
            }
        }
        return Plane(w, h, acc)
    }

    /** 8近傍で最大の点（値, 位置） */
    private fun localMaxima(p: Plane, minValue: Float): List<Pair<Float, Int>> {
        val w = p.w; val h = p.h; val v = p.v
        val out = ArrayList<Pair<Float, Int>>()
        if (w < 3 || h < 3) return out
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val c = v[i]
            if (c < minValue || c <= 0f) continue
            if (c >= v[i - 1] && c >= v[i + 1] && c >= v[i - w] && c >= v[i + w] &&
                c >= v[i - w - 1] && c >= v[i - w + 1] && c >= v[i + w - 1] && c >= v[i + w + 1]) out += c to i
        }
        return out
    }

    /**
     * 中心の周り16方向について、半径付近に「中心を向いた（または外を向いた）輪郭」があるか。
     * 戻り値：(輪郭のある方向の数（4象限のうち3つ以上にまたがらなければ0）, 向きがそろっている方向の数)
     */
    private fun ringCheck(x: Int, y: Int, R: Float, e: Edges, lo: Float, hi: Float): Pair<Int, Int> {
        var hit = 0; var pos = 0; var neg = 0
        val quad = BooleanArray(4)
        for (k in 0 until 16) {
            val t = 2f * PI.toFloat() * k / 16f
            val ct = cos(t); val st = sin(t)
            for (j in 0 until 9) {
                val rr = R * (lo + (hi - lo) * j / 8f)
                val px = (x + ct * rr).roundToInt(); val py = (y + st * rr).roundToInt()
                if (px < 0 || px >= e.w || py < 0 || py >= e.h) continue
                val i = py * e.w + px
                if (!e.isEdge[i]) continue
                val dt = e.ux[i] * ct + e.uy[i] * st
                if (abs(dt) > 0.8f) {
                    hit++
                    quad[k * 4 / 16] = true
                    if (dt > 0) pos++ else neg++
                    break
                }
            }
        }
        return (if (quad.count { it } >= 3) hit else 0) to max(pos, neg)
    }

    /** 0〜1 の分位点（ヒストグラムで近似） */
    private fun percentile(v: FloatArray, q: Float): Float {
        var mx = 0f
        for (x in v) if (x > mx) mx = x
        if (mx <= 0f) return 0f
        val bins = 2048
        val hist = IntArray(bins)
        val scale = (bins - 1) / mx
        for (x in v) hist[(max(0f, x) * scale).toInt()]++
        val target = (v.size * q).toInt()
        var acc = 0
        for (b in 0 until bins) {
            acc += hist[b]
            if (acc >= target) return b / scale
        }
        return mx
    }
}
