/**
 * 画像から錠剤を数える（円の検出＝ハフ変換）。iOS の PillCounter.swift・Android の PillCounter.kt と同じ手順
 * 1. 少しぼかして刻印の文字を消し、色の輪郭（RGBのうち最も強い勾配）を拾う
 * 2. 輪郭の各点から、勾配の向きの両側へ半径ぶん先の点に投票する → 丸い錠剤の中心に票が集まる
 * 3. 半径は「円の数が急に減る手前の大きさ」から決める（錠剤の外周。刻印の輪は内側なので選ばれない）
 * 4. 票の山を中心候補とし、周り16方向の多くに輪郭がある物だけを錠剤とする。直径より近い候補は除く
 * 5. 通常の輪郭と薄い輪郭の両方で数え、白い錠剤×白っぽい背景で刻印を1錠ずつ数える誤りを防ぐ
 * 6. 外周の輪郭がほかの錠剤よりずっと薄い物（トレーの水滴の跡・汚れ・反射など）は除く
 */

export interface PillMarker {
  id: number
  x: number
  y: number
  count: number
  manual?: boolean
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Plane {
  w: number
  h: number
  v: Float32Array
}

export interface Edges {
  w: number
  h: number
  xs: Int32Array
  ys: Int32Array
  ex: Float32Array
  ey: Float32Array
  isEdge: Uint8Array
  /** 各画素の勾配の強さ（しきい値の前） */
  mag: Float32Array
  ux: Float32Array
  uy: Float32Array
}

let markerSeq = 0
export const nextMarkerId = () => ++markerSeq

export function analyze(rgba: Uint8ClampedArray, W: number, H: number, sensitivity: number, roi: Rect | null): { markers: PillMarker[]; unitRadius: number } {
  const empty = { markers: [], unitRadius: 12 }
  let x0 = 0, y0 = 0, x1 = W, y1 = H
  if (roi) {
    x0 = Math.max(0, Math.floor(roi.x))
    y0 = Math.max(0, Math.floor(roi.y))
    x1 = Math.min(W, Math.ceil(roi.x + roi.w))
    y1 = Math.min(H, Math.ceil(roi.y + roi.h))
  }
  const w = x1 - x0, h = y1 - y0, n = w * h
  if (w < 24 || h < 24) return empty

  const rgb: Plane[] = [0, 1, 2].map(() => ({ w, h, v: new Float32Array(n) }))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = ((y0 + y) * W + x0 + x) * 4
      const i = y * w + x
      rgb[0].v[i] = rgba[k]
      rgb[1].v[i] = rgba[k + 1]
      rgb[2].v[i] = rgba[k + 2]
    }
  }

  // 通常の輪郭と、薄い輪郭の両方で数える。
  // 白い錠剤が白っぽい背景にあると外周の輪郭が薄く、通常の輪郭では刻印の文字やマークだけが拾われて
  // 1錠を何個にも数えてしまう。薄い輪郭のほうでもっと大きい円が見つかり、通常の検出の多くが
  // その円の内側にあるなら、通常の検出は刻印なので、大きい円（錠剤の外周）を採る
  let { pts, R } = detect(rgb, w, 0.25, sensitivity)
  const b = detect(rgb, w, 0.1, sensitivity)
  if (b.pts.length > 0 && b.R >= 1.4 * R) {
    const rb2 = b.R * b.R
    const inside = pts.filter((a) =>
      b.pts.some((q) => {
        const dx = (a % w) - (q % w), dy = Math.floor(a / w) - Math.floor(q / w)
        return dx * dx + dy * dy < rb2
      }),
    ).length
    if (pts.length === 0 || inside >= 0.6 * pts.length) {
      pts = b.pts
      R = b.R
    }
  }
  if (R < 3) return empty
  return {
    markers: pts.map((i) => ({ id: nextMarkerId(), x: x0 + (i % w), y: y0 + Math.floor(i / w), count: 1 })),
    unitRadius: R,
  }
}

/** 輪郭のしきい値（上位1%の強さに対する割合）を決めて、錠剤の中心（範囲内の画素番号）と半径を出す */
function detect(rgb: Plane[], w: number, edgeFrac: number, sensitivity: number): { pts: number[]; R: number } {
  const R = estimateRadius(rgb, edgeFrac)
  if (R < 3) return { pts: [], R: 0 }

  // 半径 R±15% で投票
  const e = edges(rgb, Math.max(1, Math.trunc(R / 8)), edgeFrac)
  if (e.xs.length <= 20) return { pts: [], R }
  const radii = Array.from(new Set([0, 1, 2, 3, 4, 5, 6].map((j) => Math.round(R * (0.85 + 0.05 * j))))).filter((r) => r > 0)
  const acc = box3(vote(e, radii))
  const peaks = localMaxima(acc, 1)
  if (peaks.length === 0) return { pts: [], R }
  peaks.sort((a, b) => b.v - a.v)
  const topN = Math.max(5, Math.floor(peaks.length / 20))
  const top = peaks
    .slice(0, topN)
    .map((p) => p.v)
    .sort((a, b) => a - b)
  const ref = top[Math.floor(top.length / 2)]
  const thr = (0.75 - 0.5 * sensitivity) * ref
  const secMin = 13 + (sensitivity < 0.3 ? 1 : 0) - (sensitivity > 0.7 ? 1 : 0)

  const cell = Math.max(1, Math.trunc(R))
  const grid = new Map<number, number[]>()
  const accepted: number[] = []
  const minD2 = 1.6 * R * (1.6 * R)
  for (const pk of peaks) {
    if (pk.v < thr) break
    const i = pk.i
    const x = i % w, y = Math.floor(i / w)
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell)
    let near = false
    search: for (let ix = gx - 2; ix <= gx + 2; ix++) {
      for (let iy = gy - 2; iy <= gy + 2; iy++) {
        const list = grid.get(ix * 100000 + iy)
        if (!list) continue
        for (const a of list) {
          const dx = (a % w) - x, dy = Math.floor(a / w) - y
          if (dx * dx + dy * dy < minD2) {
            near = true
            break search
          }
        }
      }
    }
    if (near) continue
    const ring = ringCheck(x, y, R, e, 0.75, 1.25)
    const bonus = ring.sectors >= 12 && ring.polarity >= 9 ? 1 : 0
    if (ring.sectors + bonus < secMin) continue
    accepted.push(i)
    const key = gx * 100000 + gy
    const l = grid.get(key)
    if (l) l.push(i)
    else grid.set(key, [i])
    if (accepted.length >= 3000) break
  }
  return { pts: faintFilter(accepted, R, e), R }
}

/**
 * 外周の輪郭がほかの錠剤よりずっと薄い検出を除く（トレーの水滴の跡・汚れ・反射の丸い影など）。
 * 16方向それぞれで半径付近（0.85R〜1.15R）の勾配の最大を取り、その中央値を「輪郭の濃さ」とする。
 * 全体の中央値の45%未満の物が少数（2割以下）のときだけ除く
 */
function faintFilter(pts: number[], R: number, e: Edges): number[] {
  if (pts.length < 5) return pts
  const w = e.w
  const strength = pts.map((i) => {
    const x = i % w, y = Math.floor(i / w)
    const dir: number[] = []
    for (let k = 0; k < 16; k++) {
      let mx = 0
      for (let j = 0; j <= 6; j++) {
        const rr = R * (0.85 + 0.05 * j)
        const px = Math.round(x + COS[k] * rr), py = Math.round(y + SIN[k] * rr)
        if (px < 0 || px >= w || py < 0 || py >= e.h) continue
        mx = Math.max(mx, e.mag[py * w + px])
      }
      dir.push(mx)
    }
    dir.sort((a, b) => a - b)
    return dir[8]
  })
  const med = [...strength].sort((a, b) => a - b)[Math.floor(strength.length / 2)]
  const keep = pts.filter((_, j) => strength[j] >= 0.45 * med)
  return pts.length - keep.length <= 0.2 * pts.length ? keep : pts
}

// ---- 半径の推定 ----

function estimateRadius(rgb: Plane[], edgeFrac: number): number {
  const w = rgb[0].w, h = rgb[0].h
  // 縮小画像で、半径ごとに円の数を数える
  const k = Math.max(1, Math.ceil(Math.max(w, h) / 480))
  const small = k > 1 ? rgb.map((p) => downscale(p, k)) : rgb
  const es = edges(small, 1, edgeFrac)
  const counts: { r: number; c: number }[] = []
  for (let r = 4; r <= 59; r++) counts.push({ r, c: circleCount(es, r, 0.75, 1.25) })
  const M = Math.max(...counts.map((x) => x.c))
  if (M <= 0) return 0
  // 円の数が急に減る手前＝錠剤の外周（判定の幅が ±25% なので 1.3 で割る）
  const need = Math.max(3, Math.ceil(0.2 * M))
  const ok = counts.filter((x) => x.c >= need).map((x) => x.r)
  if (ok.length === 0) return 0
  const rough = (Math.max(...ok) / 1.3) * k

  // 原寸で細かく合わせる（狭い幅で円周を確かめ、ほぼ最多の中で一番大きい半径）
  const ef = edges(rgb, Math.max(1, Math.trunc(rough / 8)), edgeFrac)
  const fine: { r: number; c: number }[] = []
  for (let f = 0.65; f <= 1.201; f += 0.05) {
    const r = rough * f
    if (r >= 3) fine.push({ r, c: circleCount(ef, r, 0.9, 1.1) })
  }
  const M2 = fine.length ? Math.max(...fine.map((x) => x.c)) : 0
  if (M2 <= 0) return rough
  return Math.max(...fine.filter((x) => x.c >= 0.85 * M2).map((x) => x.r))
}

/** 半径 r の円がいくつ見つかるか（重なりを除き、周りの輪郭がそろっている物だけ） */
function circleCount(e: Edges, r: number, lo: number, hi: number): number {
  const ri = Math.round(r)
  if (ri <= 0) return 0
  const acc = box3(vote(e, [ri]))
  const circ = 2 * Math.PI * ri
  const pk = localMaxima(acc, 0.15 * circ * 0.33)
  pk.sort((a, b) => b.v - a.v)
  const found: [number, number][] = []
  const minD2 = 1.6 * r * (1.6 * r)
  for (const p of pk.slice(0, 400)) {
    const x = p.i % e.w, y = Math.floor(p.i / e.w)
    let near = false
    for (const [fx, fy] of found) {
      const dx = fx - x, dy = fy - y
      if (dx * dx + dy * dy < minD2) {
        near = true
        break
      }
    }
    if (near) continue
    if (ringCheck(x, y, r, e, lo, hi).sectors >= 12) found.push([x, y])
  }
  return found.length
}

// ---- 部品 ----

/** 3×3 の平均（縁は端の値をくり返す） */
export function box3(p: Plane): Plane {
  const { w, h, v } = p
  const t = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      t[row + x] = (v[row + Math.max(0, x - 1)] + v[row + x] + v[row + Math.min(w - 1, x + 1)]) / 3
    }
  }
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w, mid = y * w, dn = Math.min(h - 1, y + 1) * w
    for (let x = 0; x < w; x++) o[mid + x] = (t[up + x] + t[mid + x] + t[dn + x]) / 3
  }
  return { w, h, v: o }
}

/** k×k の平均で縮小 */
export function downscale(p: Plane, k: number): Plane {
  const w = Math.floor(p.w / k), h = Math.floor(p.h / k)
  const o = new Float32Array(w * h)
  const inv = 1 / (k * k)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let yy = 0; yy < k; yy++) {
        const row = (y * k + yy) * p.w + x * k
        for (let xx = 0; xx < k; xx++) s += p.v[row + xx]
      }
      o[y * w + x] = s * inv
    }
  }
  return { w, h, v: o }
}

/** RGB それぞれをぼかして Sobel をかけ、いちばん強い勾配を採用。上位1%の強さの frac（通常25%、薄い輪郭用は10%）以上を輪郭とする */
export function edges(rgb: Plane[], blur: number, frac: number): Edges {
  const w = rgb[0].w, h = rgb[0].h, n = w * h
  const bgx = new Float32Array(n), bgy = new Float32Array(n), bm = new Float32Array(n)
  for (const ch of rgb) {
    let p = ch
    for (let b = 0; b < blur; b++) p = box3(p)
    if (w < 3 || h < 3) continue
    const v = p.v
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const a = v[i - w - 1], b = v[i - w], c = v[i - w + 1]
        const d = v[i - 1], f = v[i + 1]
        const g = v[i + w - 1], hh = v[i + w], k = v[i + w + 1]
        const gx = c + 2 * f + k - (a + 2 * d + g)
        const gy = g + 2 * hh + k - (a + 2 * b + c)
        const m = Math.sqrt(gx * gx + gy * gy)
        if (m > bm[i]) {
          bm[i] = m
          bgx[i] = gx
          bgy[i] = gy
        }
      }
    }
  }
  const T = Math.max(1, frac * percentile(bm, 0.99))
  const isEdge = new Uint8Array(n), ux = new Float32Array(n), uy = new Float32Array(n)
  let cnt = 0
  for (let i = 0; i < n; i++) if (bm[i] > T) cnt++
  const xs = new Int32Array(cnt), ys = new Int32Array(cnt), ex = new Float32Array(cnt), ey = new Float32Array(cnt)
  let j = 0
  for (let i = 0; i < n; i++) {
    if (bm[i] <= T) continue
    const a = bgx[i] / bm[i], b = bgy[i] / bm[i]
    isEdge[i] = 1
    ux[i] = a
    uy[i] = b
    xs[j] = i % w
    ys[j] = Math.floor(i / w)
    ex[j] = a
    ey[j] = b
    j++
  }
  return { w, h, xs, ys, ex, ey, isEdge, mag: bm, ux, uy }
}

/** 輪郭の各点から、勾配の向きの両側へ r だけ進んだ点に1票ずつ */
function vote(e: Edges, radii: number[]): Plane {
  const { w, h } = e
  const acc = new Float32Array(w * h)
  for (let j = 0; j < e.xs.length; j++) {
    const x = e.xs[j], y = e.ys[j], ux = e.ex[j], uy = e.ey[j]
    for (const r of radii) {
      let cx = Math.round(x + ux * r), cy = Math.round(y + uy * r)
      if (cx >= 0 && cx < w && cy >= 0 && cy < h) acc[cy * w + cx] += 1
      cx = Math.round(x - ux * r)
      cy = Math.round(y - uy * r)
      if (cx >= 0 && cx < w && cy >= 0 && cy < h) acc[cy * w + cx] += 1
    }
  }
  return { w, h, v: acc }
}

/** 8近傍で最大の点 */
function localMaxima(p: Plane, minValue: number): { v: number; i: number }[] {
  const { w, h, v: a } = p
  const out: { v: number; i: number }[] = []
  if (w < 3 || h < 3) return out
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = a[i]
      if (v < minValue || v <= 0) continue
      if (v >= a[i - 1] && v >= a[i + 1] && v >= a[i - w] && v >= a[i + w] && v >= a[i - w - 1] && v >= a[i - w + 1] && v >= a[i + w - 1] && v >= a[i + w + 1]) {
        out.push({ v, i })
      }
    }
  }
  return out
}

const COS = Array.from({ length: 16 }, (_, k) => Math.cos((2 * Math.PI * k) / 16))
const SIN = Array.from({ length: 16 }, (_, k) => Math.sin((2 * Math.PI * k) / 16))

/**
 * 中心の周り16方向について、半径付近に「中心を向いた（または外を向いた）輪郭」があるか。
 * sectors：輪郭のある方向の数（4つの象限のうち3つ以上にまたがらなければ0）
 * polarity：向きがそろっている方向の数（錠剤なら内向きか外向きのどちらかにそろう）
 */
function ringCheck(x: number, y: number, R: number, e: Edges, lo: number, hi: number): { sectors: number; polarity: number } {
  let hit = 0, pos = 0, neg = 0
  const quad = [false, false, false, false]
  for (let k = 0; k < 16; k++) {
    const ct = COS[k], st = SIN[k]
    for (let j = 0; j < 9; j++) {
      const rr = R * (lo + ((hi - lo) * j) / 8)
      const px = Math.round(x + ct * rr), py = Math.round(y + st * rr)
      if (px < 0 || px >= e.w || py < 0 || py >= e.h) continue
      const i = py * e.w + px
      if (!e.isEdge[i]) continue
      const dt = e.ux[i] * ct + e.uy[i] * st
      if (Math.abs(dt) > 0.8) {
        hit++
        quad[Math.floor((k * 4) / 16)] = true
        if (dt > 0) pos++
        else neg++
        break
      }
    }
  }
  const q = quad.filter(Boolean).length
  return { sectors: q >= 3 ? hit : 0, polarity: Math.max(pos, neg) }
}

/** 0〜1 の分位点（ヒストグラムで近似） */
export function percentile(v: Float32Array, q: number): number {
  let mx = 0
  for (let i = 0; i < v.length; i++) if (v[i] > mx) mx = v[i]
  if (mx <= 0) return 0
  const bins = 2048
  const hist = new Int32Array(bins)
  const scale = (bins - 1) / mx
  for (let i = 0; i < v.length; i++) hist[Math.trunc(Math.max(0, v[i]) * scale)]++
  const target = Math.trunc(v.length * q)
  let acc = 0
  for (let b = 0; b < bins; b++) {
    acc += hist[b]
    if (acc >= target) return b / scale
  }
  return mx
}
