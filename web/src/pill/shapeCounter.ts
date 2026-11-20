/**
 * 形を問わない錠剤カウント（楕円・長い錠剤・カプセル用）。丸い錠剤の円の検出（pillCounter.ts）とは別の手順
 * 1. 写真の縁の色を背景の色とし、各画素の背景との色の差を出す
 * 2. 差のしきい値を大津の方法で決め（感度で上下）、錠剤の部分を取り出す。小さな汚れは削り、穴（刻印）は埋める
 * 3. つながった部分ごとに面積を出し、面積の中央値を1錠の大きさとする
 * 4. くっついた錠剤は「面積÷1錠の面積」を四捨五入した数とし、その数の点をその部分の中に置く（k-means）
 */
import { box3, downscale, edges, nextMarkerId, type Edges, type PillMarker, type Plane, type Rect } from './pillCounter'

export function analyzeShapes(rgba: Uint8ClampedArray, W: number, H: number, sensitivity: number, roi: Rect | null): { markers: PillMarker[]; unitRadius: number } {
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

  // 1. 背景の色（縁の画素の中央値）
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = ((y0 + y) * W + x0 + x) * 4, i = y * w + x
      R[i] = rgba[k]
      G[i] = rgba[k + 1]
      B[i] = rgba[k + 2]
    }
  const bw = Math.max(2, Math.round(Math.min(w, h) * 0.03))
  const br: number[] = [], bg: number[] = [], bb: number[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= bw && x < w - bw && y >= bw && y < h - bw) continue
      const i = y * w + x
      br.push(R[i])
      bg.push(G[i])
      bb.push(B[i])
    }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  const r0 = med(br), g0 = med(bg), b0 = med(bb)

  // 背景との色の差（明るさの差と色みの差。少しぼかして刻印やざらつきを抑える）
  let d: Float32Array = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const dr = R[i] - r0, dg = G[i] - g0, db = B[i] - b0
    d[i] = Math.sqrt(dr * dr + dg * dg + db * db)
  }
  d = blur(d, w, h, Math.max(1, Math.round(Math.min(w, h) / 300)))

  // 2. しきい値（大津の方法）。感度 0.5 で大津の値、上げると低く（薄い錠剤も拾う）
  let thr = otsu(d) * (1.5 - sensitivity)
  thr = Math.max(thr, 12)
  let m: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) m[i] = d[i] > thr ? 1 : 0
  const rad = Math.max(1, Math.round(Math.min(w, h) / 250))
  m = dilate(erode(m, w, h, rad), w, h, rad) // 小さな汚れ・細い影を除く
  m = fillHoles(m, w, h)

  // 3. つながった部分
  const { label, comps } = components(m, w, h)
  if (!comps.length) return empty
  const areas = comps.map((c) => c.area).sort((a, b) => a - b)
  // 1錠の大きさ：大きい物（くっついた錠剤）や小さいかけらに引っ張られないよう、中くらいの物の中央値
  const big = areas.filter((a) => a >= areas[areas.length - 1] * 0.05)
  let unit = big[Math.floor(big.length * 0.4)]
  const singles = big.filter((a) => a > unit * 0.6 && a < unit * 1.45)
  if (singles.length) unit = singles[singles.length >> 1]
  const markers: PillMarker[] = []
  for (const c of comps) {
    if (c.area < unit * 0.35) continue // かけら・ごみ
    // 縁に大きくかかる物（机の端・袋など）は、1錠の6倍を超えたら除く
    if (c.touchesEdge && c.area > unit * 6) continue
    // 重なり気味にくっついた2錠は面積が2倍より少し小さいので、少し多めに丸める
    const k = Math.max(1, Math.round(c.area / unit + 0.12))
    for (const [cx, cy] of kmeans(label, w, c, k)) markers.push({ id: nextMarkerId(), x: x0 + cx, y: y0 + cy, count: 1 })
  }
  return { markers, unitRadius: Math.sqrt(unit / Math.PI) }
}

interface Comp {
  id: number
  area: number
  x0: number
  y0: number
  x1: number
  y1: number
  touchesEdge: boolean
}

function components(m: Uint8Array, w: number, h: number): { label: Int32Array; comps: Comp[] } {
  const label = new Int32Array(w * h)
  const comps: Comp[] = []
  const stack = new Int32Array(w * h)
  let next = 0
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || label[s]) continue
    const id = ++next
    const c: Comp = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, touchesEdge: false }
    let sp = 0
    stack[sp++] = s
    label[s] = id
    while (sp) {
      const i = stack[--sp]
      const x = i % w, y = (i / w) | 0
      c.area++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.touchesEdge = true
      if (x > 0 && m[i - 1] && !label[i - 1]) (label[i - 1] = id), (stack[sp++] = i - 1)
      if (x < w - 1 && m[i + 1] && !label[i + 1]) (label[i + 1] = id), (stack[sp++] = i + 1)
      if (y > 0 && m[i - w] && !label[i - w]) (label[i - w] = id), (stack[sp++] = i - w)
      if (y < h - 1 && m[i + w] && !label[i + w]) (label[i + w] = id), (stack[sp++] = i + w)
    }
    comps.push(c)
  }
  return { label, comps }
}

/** 部分の中に k 個の点を置く（画素の k-means。始めは長い向きに等間隔） */
function kmeans(label: Int32Array, w: number, c: Comp, k: number): [number, number][] {
  const xs: number[] = [], ys: number[] = []
  const step = c.area > 4000 ? 2 : 1
  for (let y = c.y0; y <= c.y1; y += step)
    for (let x = c.x0; x <= c.x1; x += step) if (label[y * w + x] === c.id) (xs.push(x), ys.push(y))
  let mx = 0, my = 0
  for (let i = 0; i < xs.length; i++) (mx += xs[i]), (my += ys[i])
  mx /= xs.length
  my /= ys.length
  if (k === 1) return [[mx, my]]
  // 主な向き
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(ang), uy = Math.sin(ang)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < xs.length; i++) {
    const t = (xs[i] - mx) * ux + (ys[i] - my) * uy
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  const cx: number[] = [], cy: number[] = []
  for (let j = 0; j < k; j++) {
    const t = lo + ((j + 0.5) * (hi - lo)) / k
    cx.push(mx + t * ux)
    cy.push(my + t * uy)
  }
  const asg = new Int32Array(xs.length)
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < xs.length; i++) {
      let best = 0, bd = Infinity
      for (let j = 0; j < k; j++) {
        const dx = xs[i] - cx[j], dy = ys[i] - cy[j], dd = dx * dx + dy * dy
        if (dd < bd) (bd = dd), (best = j)
      }
      asg[i] = best
    }
    const sx = new Float64Array(k), sy = new Float64Array(k), sn = new Float64Array(k)
    for (let i = 0; i < xs.length; i++) (sx[asg[i]] += xs[i]), (sy[asg[i]] += ys[i]), sn[asg[i]]++
    for (let j = 0; j < k; j++) if (sn[j]) (cx[j] = sx[j] / sn[j]), (cy[j] = sy[j] / sn[j])
  }
  return cx.map((x, j) => [x, cy[j]])
}

function otsu(d: Float32Array): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < d.length; i++) hist[Math.min(255, d[i] | 0)]++
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, best = 0, bestT = 30
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = d.length - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > best) (best = v), (bestT = t)
  }
  return bestT
}

function blur(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const t = new Float32Array(a.length), o = new Float32Array(a.length)
  for (let y = 0; y < h; y++) {
    let s = 0, c = 0
    for (let x = -r; x < w + r; x++) {
      if (x + r < w && x + r >= 0) (s += a[y * w + x + r]), c++
      if (x - r - 1 >= 0 && x - r - 1 < w) (s -= a[y * w + x - r - 1]), c--
      if (x >= 0 && x < w) t[y * w + x] = s / c
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, c = 0
    for (let y = -r; y < h + r; y++) {
      if (y + r < h && y + r >= 0) (s += t[(y + r) * w + x]), c++
      if (y - r - 1 >= 0 && y - r - 1 < h) (s -= t[(y - r - 1) * w + x]), c--
      if (y >= 0 && y < h) o[y * w + x] = s / c
    }
  }
  return o
}

function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(m, w, h, r, 0)
}
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(m, w, h, r, 1)
}
/** 四角の範囲の最小（0）・最大（1）。横と縦に分けて求める */
function morph(m: Uint8Array, w: number, h: number, r: number, want: 0 | 1): Uint8Array {
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = want ? 0 : 1
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++)
        if (m[y * w + k] === want) {
          v = want
          break
        }
      t[y * w + x] = v
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let v = want ? 0 : 1
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++)
        if (t[k * w + x] === want) {
          v = want
          break
        }
      o[y * w + x] = v
    }
  return o
}

/** 錠剤の中の穴（刻印・割線・反射）を埋める：縁からつながっていない背景を錠剤にする */
function fillHoles(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length).fill(1)
  const stack: number[] = []
  const push = (i: number) => {
    if (!m[i] && out[i]) {
      out[i] = 0
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x))
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1))
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w, y = (i / w) | 0
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }
  return out
}

// ---- 楕円・長い錠剤：輪郭の形（角を丸めた長方形＝カプセル形）を、いろいろな向きで探す ----

/** 1錠の大きさ（長さ・幅、画素）と向き（ラジアン） */
export interface PillSize {
  L: number
  W: number
  angle: number
  /** 錠剤の色（RGB） */
  color?: [number, number, number]
}

/**
 * 見本の1錠（タップした点、または囲んだ四角の中心）から、長さ・幅・色を測る。
 * 中心の色を錠剤の色とし、36方向へ進んで色が変わる所（錠剤の縁）までの距離を測り、
 * 向かい合う2方向の和（差し渡し）の最大を長さ、最小を幅とする
 */
export function measureSample(rgba: Uint8ClampedArray, W: number, H: number, r: Rect, hint?: PillSize): PillSize | null {
  const cx = Math.round(r.x + r.w / 2), cy = Math.round(r.y + r.h / 2)
  if (cx < 2 || cy < 2 || cx >= W - 2 || cy >= H - 2) return null
  // 3×3 の平均の色
  const at = (x: number, y: number): [number, number, number] | null => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) return null
    const c: [number, number, number] = [0, 0, 0]
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = ((yi + dy) * W + xi + dx) * 4
        c[0] += rgba[k] / 9
        c[1] += rgba[k + 1] / 9
        c[2] += rgba[k + 2] / 9
      }
    return c
  }
  // 錠剤の色：中心の周り（刻印を避けるため 5×5 の点の中央値）
  const pts: [number, number, number][] = []
  for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
    const c = at(cx + dx, cy + dy)
    if (c) pts.push(c)
  }
  const med = (i: number) => pts.map((p) => p[i]).sort((a, b) => a - b)[pts.length >> 1]
  const col: [number, number, number] = [med(0), med(1), med(2)]
  const maxR = hint ? Math.max(12, hint.L * 0.9) : Math.max(20, Math.min(W, H) / 4)
  // 輪郭（タップした点の周りだけ）
  const x0 = Math.max(0, Math.floor(cx - maxR - 2)), y0 = Math.max(0, Math.floor(cy - maxR - 2))
  const x1 = Math.min(W, Math.ceil(cx + maxR + 2)), y1 = Math.min(H, Math.ceil(cy + maxR + 2))
  const lw = x1 - x0, lh = y1 - y0
  const rgb: Plane[] = [0, 1, 2].map((c) => {
    const v = new Float32Array(lw * lh)
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) v[y * lw + x] = rgba[((y0 + y) * W + x0 + x) * 4 + c]
    return { w: lw, h: lh, v }
  })
  const e = edges(rgb, 1, 0.3)
  // 色の差の基準：周りでいちばん違う色との差の45%（30以上）
  let big = 0
  const prof: { d: number; edge: boolean }[][] = []
  for (let q = 0; q < 36; q++) {
    const th = (2 * Math.PI * q) / 36, dx = Math.cos(th), dy = Math.sin(th)
    const row: { d: number; edge: boolean }[] = []
    for (let t = 1; t < maxR; t += 1) {
      const px = cx + dx * t, py = cy + dy * t
      const c = at(px, py)
      if (!c) break
      const d = Math.hypot(c[0] - col[0], c[1] - col[1], c[2] - col[2])
      const li = Math.round(py - y0) * lw + Math.round(px - x0)
      const edge = !!e.isEdge[li] && Math.abs(e.ux[li] * dx + e.uy[li] * dy) > 0.6
      row.push({ d, edge })
      if (d > big) big = d
    }
    prof.push(row)
  }
  const T = Math.max(30, big * 0.45)
  const dist: number[] = []
  for (const row of prof) {
    // 色が2画素続けて変わる所か、外向きの強い輪郭（となりの錠剤とのくぼみ）の早い方。中心の3画素は刻印を避けて見ない
    let f = row.length
    for (let t = 3; t + 1 < row.length; t++)
      if ((row[t].d > T && row[t + 1].d > T) || (row[t].edge && row[t].d > T * 0.35)) {
        f = t + 1
        break
      }
    dist.push(f)
  }
  // 錠剤は左右対称なので、向かい合う2方向の短い方の2倍を差し渡しとする（となりの錠剤に突き抜けた方向を使わない）。
  // タップが中心からずれていても、幅の向きは両側の和で正しく出る
  let L = 0, Wd = Infinity, ang = 0
  for (let q = 0; q < 18; q++) {
    const a = dist[q], b = dist[q + 18]
    const sum = a + b
    const sym = 2 * Math.min(a, b)
    if (sum < Wd) Wd = sum
    // 長さ：片側が突き抜けていなければ和、突き抜けていそうなら短い方の2倍
    const D = Math.max(a, b) > 1.6 * Math.min(a, b) && Math.max(a, b) > 0.9 * maxR ? sym : sum
    if (D > L) (L = D), (ang = (2 * Math.PI * q) / 36)
  }
  if (!isFinite(Wd) || Wd < 4) return null
  // 仕上げ：長さ・幅・向き・中心を少しずつ変えて、縁に輪郭がいちばんよく乗る形を選ぶ
  // 中が錠剤の色か（1/0）
  const colAt = (lx: number, ly: number) => {
    const c = at(lx + x0, ly + y0)
    return c && Math.hypot(c[0] - col[0], c[1] - col[1], c[2] - col[2]) < T ? 1 : 0
  }
  const lx = cx - x0, ly = cy - y0
  const range = (lo: number, hi: number, st: number) => Array.from({ length: Math.round((hi - lo) / st) + 1 }, (_, i) => lo + i * st)
  const deg = Math.PI / 180
  let g
  if (hint) {
    // 測り直し：見本の大きさの近くだけ
    g = fitPill(e, colAt, lx, ly, hint.W, range(0.9, 1.1, 0.05).map((k) => (hint.L / hint.W) * k), range(0.85, 1.15, 0.05), range(-10, 10, 10).map((d) => hint.angle + d * deg), hint.W * 0.2, Math.max(1, hint.W / 8))
  } else {
    // 粗く：幅は光線の測りの前後、長さは幅の1〜3.6倍、向き10°ごと、中心はタップから幅の0.6倍まで
    const c = fitPill(e, colAt, lx, ly, Wd, range(1, 3.5, 0.25), [0.8, 0.9, 1, 1.1, 1.2], range(0, 165, 15).map((d) => d * deg), Wd * 0.6, Math.max(1, Wd / 4))
    // 細かく
    const rt = c.L / c.W
    g = fitPill(e, colAt, c.x, c.y, c.W, range(rt * 0.9, rt * 1.1, rt * 0.025), range(0.9, 1.1, 0.025), range(-10, 10, 2.5).map((d) => c.ang + d * deg), Math.max(2, c.W / 6), 1)
  }
  if (g.sc <= 0) return null
  return { L: g.L, W: g.W, angle: g.ang, color: col }
}

/**
 * 楕円・長い錠剤を数える。いったん数えたあと、はっきり見つかった錠剤（強い順に6つ）で大きさを測り直し、
 * 見本の大きさと5%以上違えば、測り直した大きさでもう一度数える（タップした見本がずれていても合うように）
 */
export function analyzeOblong(rgba: Uint8ClampedArray, W: number, H: number, sensitivity: number, roi: Rect | null, size: PillSize): { markers: PillMarker[]; unitRadius: number } {
  // 長さの選び直し：見本の1錠だけでは、となりの錠剤とくっついた端が分かりにくい。
  // 幅は見本のまま、長さを幅の1.4〜3.4倍で試しに数え、見つかった錠剤の縁がいちばんよく合う長さを選ぶ
  let cur = size
  let bestFit = analyzeOblongOnce(rgba, W, H, sensitivity, roi, cur, true).fit
  const tryL = (L: number) => {
    const f = analyzeOblongOnce(rgba, W, H, sensitivity, roi, { ...size, L }, true).fit
    if (f > bestFit + 0.01) (bestFit = f), (cur = { ...size, L })
  }
  // 粗く（0.4きざみ）→ いちばん良い長さの前後（±0.2）
  for (let rho = 1.4; rho <= 3.41; rho += 0.4) if (Math.abs(size.W * rho - size.L) > size.W * 0.15) tryL(size.W * rho)
  const c0 = cur.L / size.W
  for (const d of [-0.2, 0.2]) tryL(size.W * (c0 + d))
  // 幅も（タップした場所で少しずれるので）前後を試す
  const base = cur
  for (const ws of [0.8, 0.9, 1.1, 1.2]) {
    const z = { ...base, W: base.W * ws }
    const f = analyzeOblongOnce(rgba, W, H, sensitivity, roi, z, true).fit
    if (f > bestFit + 0.01) (bestFit = f), (cur = z)
  }
  let res = analyzeOblongOnce(rgba, W, H, sensitivity, roi, cur)
  if (DEBUG) DEBUG.push({ x: cur.L, y: cur.W, why: 'size1', v: bestFit })
  // 測り直しは1回だけ（長さは上で選んだので、主に幅を合わせる）
  for (let it = 0; it < 1; it++) {
    if (res.markers.length < 4) break
    const Ls: number[] = [], Ws: number[] = []
    res.markers.slice(0, 5).forEach((m, i) => {
      const z = measureSample(rgba, W, H, { x: m.x, y: m.y, w: 0, h: 0 }, { ...cur, angle: res.angles[i] })
      if (z) (Ls.push(z.L), Ws.push(z.W))
    })
    if (Ls.length < 3) break
    const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
    const L2 = med(Ls), W2 = med(Ws)
    if (Math.abs(L2 - cur.L) < cur.L * 0.06 && Math.abs(W2 - cur.W) < cur.W * 0.06) break
    cur = { ...cur, L: L2, W: W2 }
    if (DEBUG) DEBUG.push({ x: cur.L, y: cur.W, why: 'size2', v: 0 })
    res = analyzeOblongOnce(rgba, W, H, sensitivity, roi, cur)
  }
  return { markers: res.markers, unitRadius: res.unitRadius }
}

/**
 * 長さ・幅・向き・中心を変えて、カプセル形の縁（40か所）に向きのそろった輪郭が乗り、中（15か所）が錠剤の色である割合が
 * いちばん高い形を選ぶ。粗く探してから、いちばん良い形の近くを細かく探す
 */
function fitPill(
  e: Edges,
  colAt: (x: number, y: number) => number,
  cx: number,
  cy: number,
  Wg: number,
  ratios: number[],
  wScale: number[],
  angles: number[],
  off: number,
  offStep: number,
): { L: number; W: number; ang: number; x: number; y: number; sc: number } {
  let best = { L: Wg * 2, W: Wg, ang: 0, x: cx, y: cy, sc: -1 }
  const N = 40
  for (const ws of wScale) {
    const W = Wg * ws, r = W / 2
    for (const rt of ratios) {
      const L = W * rt, a = Math.max(0, (L - W) / 2)
      for (const ang of angles) {
        const ux = Math.cos(ang), uy = Math.sin(ang)
        for (let oy = -off; oy <= off + 1e-6; oy += offStep)
          for (let ox = -off; ox <= off + 1e-6; ox += offStep) {
            const x = cx + ox, y = cy + oy
            let hit = 0
            for (let q = 0; q < N; q++) {
              const th = (2 * Math.PI * q) / N
              const nx0 = Math.cos(th), ny0 = Math.sin(th)
              const along = nx0 > 0.25 ? a : nx0 < -0.25 ? -a : ((q % 4) / 1.5 - 1) * a
              const bx = along + r * nx0, by = r * ny0
              const px = x + bx * ux - by * uy, py = y + bx * uy + by * ux
              const nx = nx0 * ux - ny0 * uy, ny = nx0 * uy + ny0 * ux
              for (const s of [0, -1, 1]) {
                const xi = Math.round(px + s * nx), yi = Math.round(py + s * ny)
                if (xi < 0 || yi < 0 || xi >= e.w || yi >= e.h) continue
                const i = yi * e.w + xi
                if (e.isEdge[i] && Math.abs(e.ux[i] * nx + e.uy[i] * ny) > 0.7) {
                  hit++
                  break
                }
              }
            }
            // 中が錠剤の色か（縁の0.6倍の内側）
            let inside = 0
            for (let i = -2; i <= 2; i++)
              for (let j = -1; j <= 1; j++) {
                const al = (i / 2) * (a + r * 0.6), ac = j * r * 0.6
                inside += colAt(x + al * ux - ac * uy, y + al * uy + ac * ux)
              }
            // 縁に乗る割合×中が錠剤の色の割合（長さは数えるときに選び直す）
            const sc = (hit / N) * (inside / 15)
            if (sc > best.sc) best = { L, W, ang, x, y, sc }
          }
      }
    }
  }
  return best
}

/** 調整用：理由つきで落とした候補を集める（ふだんは null） */
export let DEBUG: { x: number; y: number; why: string; v: number }[] | null = null
export const setDebug = (d: typeof DEBUG) => (DEBUG = d)

const NT = 18 // 向きの数（10°ずつ）

/**
 * 1錠の大きさが分かっているときの数え方。輪郭の各点から「この点がカプセル形の縁なら中心はここ」という点に
 * 向きごとに投票し、票の山を錠剤とする（丸い錠剤の円の検出を、細長い形に広げたもの）
 */
function analyzeOblongOnce(
  rgba: Uint8ClampedArray,
  W: number,
  H: number,
  sensitivity: number,
  roi: Rect | null,
  size: PillSize,
  quick = false,
): { markers: PillMarker[]; unitRadius: number; angles: number[]; fit: number } {
  const empty = { markers: [] as PillMarker[], unitRadius: 12, angles: [] as number[], fit: 0 }
  let x0 = 0, y0 = 0, x1 = W, y1 = H
  if (roi) {
    x0 = Math.max(0, Math.floor(roi.x))
    y0 = Math.max(0, Math.floor(roi.y))
    x1 = Math.min(W, Math.ceil(roi.x + roi.w))
    y1 = Math.min(H, Math.ceil(roi.y + roi.h))
  }
  const w0 = x1 - x0, h0 = y1 - y0
  if (w0 < 24 || h0 < 24) return empty
  // 錠剤の幅が 14 画素くらいになるよう縮める
  // 錠剤の幅が 14 画素（試しに数えるときは 9 画素）くらいになるよう縮める
  const k = Math.max(1, Math.floor(size.W / (quick ? 8 : 14)))
  let rgb: Plane[] = [0, 1, 2].map((c) => {
    const v = new Float32Array(w0 * h0)
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) v[y * w0 + x] = rgba[((y0 + y) * W + x0 + x) * 4 + c]
    return { w: w0, h: h0, v }
  })
  if (k > 1) rgb = rgb.map((p) => downscale(p, k))
  const w = rgb[0].w, h = rgb[0].h
  const L = size.L / k, Wd = size.W / k
  const r = Wd / 2, a = Math.max(0, (L - Wd) / 2)
  const e = edges(rgb, 1, 0.12)

  // 投票（向きごと）
  const acc: Float32Array[] = Array.from({ length: NT }, () => new Float32Array(w * h))
  const cosT = Array.from({ length: NT }, (_, t) => Math.cos((Math.PI * t) / NT))
  const sinT = Array.from({ length: NT }, (_, t) => Math.sin((Math.PI * t) / NT))
  const add = (A: Float32Array, x: number, y: number, v: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi >= 0 && xi < w && yi >= 0 && yi < h) A[yi * w + xi] += v
  }
  // 大きさが見本と少し違っても拾えるよう、3つの大きさで投票する
  const scales = quick ? [1] : [0.88, 1, 1.12]
  for (let j = 0; j < e.xs.length; j++) {
    const px = e.xs[j], py = e.ys[j]
    for (const s of [1, -1]) {
      // 外向きの法線（錠剤が背景より明るいか暗いか分からないので両向き）
      const nx = s * e.ex[j], ny = s * e.ey[j]
      for (const sc of scales) {
        const rr = r * sc, aa = a * sc
        const bx = px - rr * nx, by = py - rr * ny
        for (let t = 0; t < NT; t++) {
          const ux = cosT[t], uy = sinT[t]
          const dd = nx * ux + ny * uy
          const A = acc[t]
          if (Math.abs(dd) < 0.3) {
            // 平らな側面：中心は長い向きの線の上のどこか
            const steps = Math.max(1, Math.round(aa))
            for (let q = -steps; q <= steps; q++) add(A, bx - (q / steps) * aa * ux, by - (q / steps) * aa * uy, 1 / Math.sqrt(steps))
          } else {
            // 丸い端
            const sg = dd > 0 ? 1 : -1
            add(A, bx - sg * aa * ux, by - sg * aa * uy, 1)
          }
        }
      }
    }
  }
  // 少しぼかして山を作る
  const sm = acc.map((A) => box3(box3({ w, h, v: A })).v)
  // 山を探す：各画素で一番強い向き
  const best = new Float32Array(w * h), bestT = new Uint8Array(w * h)
  for (let t = 0; t < NT; t++) {
    const A = sm[t]
    for (let i = 0; i < w * h; i++) if (A[i] > best[i]) (best[i] = A[i]), (bestT[i] = t)
  }
  // 票の多さの基準：上位の山の中央値を「よく見える1錠」とする
  const cands: { i: number; v: number }[] = []
  const nr = Math.max(1, Math.round(r * 0.6))
  for (let y = nr; y < h - nr; y++)
    for (let x = nr; x < w - nr; x++) {
      const i = y * w + x, v = best[i]
      if (v <= 0) continue
      let ok = true
      for (let dy = -nr; dy <= nr && ok; dy++) for (let dx = -nr; dx <= nr; dx++) if ((dx || dy) && best[i + dy * w + dx] > v) {
        ok = false
        break
      }
      if (ok) cands.push({ i, v })
    }
  if (!cands.length) return empty
  cands.sort((p, q) => q.v - p.v)
  const ref = cands[Math.min(cands.length - 1, 4)].v // 強い山（5番目）を基準に
  const minV = ref * (0.45 - 0.3 * (sensitivity - 0.5))
  // 強い順に、すでに採った錠剤の中に入る物は除く
  const taken: { x: number; y: number; t: number; v: number }[] = []
  const fits: number[] = []
  const inside = (x: number, y: number, c: { x: number; y: number; t: number }, shrink: number) => {
    const ux = cosT[c.t], uy = sinT[c.t]
    const dx = x - c.x, dy = y - c.y
    const along = Math.abs(dx * ux + dy * uy), across = Math.abs(-dx * uy + dy * ux)
    // 中心どうしが、相手のカプセル形の内側（少し縮めた物）にあるか
    const ea = a * shrink, er = r * shrink
    const ax = Math.max(0, along - ea)
    return ax * ax + across * across < er * er
  }
  for (const c of cands) {
    if (c.v < minV * (DEBUG ? 0.6 : 1)) break
    const x = c.i % w, y = (c.i / w) | 0, t = bestT[c.i]
    const me = { x, y, t, v: c.v }
    const why = (s: string) => DEBUG && DEBUG.push({ x: x0 + (x + 0.5) * k, y: y0 + (y + 0.5) * k, why: s, v: c.v / ref })
    if (c.v < minV) {
      why('weak')
      continue
    }
    // 採った錠剤と重なる物、中心どうしが幅の0.75倍より近い物（2錠の隙間に乗った物）は除く
    if (taken.some((o) => inside(x, y, o, 1) || inside(o.x, o.y, me, 1) || (o.x - x) ** 2 + (o.y - y) ** 2 < (1.5 * r) ** 2)) {
      if (c.v >= minV) why('nms')
      continue
    }
    const of = outlineFrac(e, x, y, t, a, r, cosT, sinT)
    if (of < 0.55) {
      why('outline')
      continue
    }
    if (quick) {
      taken.push(me)
      fits.push(outlineFrac(e, x, y, t, a, r, cosT, sinT, true))
      continue
    }
    if (!contrastOk(rgb, x, y, t, a, r, cosT, sinT, size.color)) {
      why('contrast')
      continue
    }
    if (size.color && !colorOk(rgb, x, y, t, a, r, cosT, sinT, size.color, sensitivity)) {
      why('color')
      continue
    }
    taken.push(me)
  }
  // 離れてぽつんとあり、票も弱い物はトレーの傷・反射とみなす（1錠だけ離れて置かれた錠剤は輪郭が全部見えるので票が強い）
  const far = (L * 1.6) ** 2
  const kept = taken.filter((c) => c.v >= ref * 0.75 || taken.some((o) => o !== c && o.v >= ref * 0.7 && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < far))
  taken.length = 0
  taken.push(...kept)
  return {
    markers: taken.map((c) => ({ id: nextMarkerId(), x: x0 + (c.x + 0.5) * k, y: y0 + (c.y + 0.5) * k, count: 1 })),
    unitRadius: (size.W / 2) * 0.9,
    angles: taken.map((c) => (Math.PI * c.t) / NT),
    // 試しに数えたときの「縁の合い方」：強い順に10錠の平均（見つかった数が少なければ0）
    fit: fits.length >= 5 ? fits.slice(0, 10).reduce((p, q) => p + q, 0) / Math.min(10, fits.length) : 0,
  }
}

/**
 * 縁のすぐ内側とすぐ外側の明るさの差が、ぐるりと同じ向きか（錠剤は周りの隙間・影より明るい、または暗い）。
 * トレーの傷や反射は向きがばらばら
 */
function contrastOk(rgb: Plane[], x: number, y: number, t: number, a: number, r: number, cosT: number[], sinT: number[], col?: [number, number, number]): boolean {
  const ux = cosT[t], uy = sinT[t]
  const w = rgb[0].w, h = rgb[0].h
  const gray = (px: number, py: number) => {
    const xi = Math.round(px), yi = Math.round(py)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return NaN
    const k = yi * w + xi
    return (rgb[0].v[k] + rgb[1].v[k] + rgb[2].v[k]) / 3
  }
  let pos = 0, neg = 0, tot = 0
  const din = r * 0.3, dout = Math.max(2, r * 0.22)
  for (let q = 0; q < 16; q++) {
    const th = (2 * Math.PI * q) / 16
    const nx0 = Math.cos(th), ny0 = Math.sin(th)
    const along = nx0 > 0.3 ? a : nx0 < -0.3 ? -a : (q % 2 ? 0.5 : -0.5) * a
    const bx = along + r * nx0, by = r * ny0
    const px = x + bx * ux - by * uy, py = y + bx * uy + by * ux
    const nx = nx0 * ux - ny0 * uy, ny = nx0 * uy + ny0 * ux
    const vi = gray(px - nx * din, py - ny * din), vo = gray(px + nx * dout, py + ny * dout)
    if (isNaN(vi) || isNaN(vo)) continue
    // すぐ外がとなりの錠剤（見本の色）なら、隙間が無いだけなので数えない
    if (col) {
      const xi = Math.round(px + nx * dout), yi = Math.round(py + ny * dout)
      const k2 = yi * w + xi
      const dc = Math.hypot(rgb[0].v[k2] - col[0], rgb[1].v[k2] - col[1], rgb[2].v[k2] - col[2])
      if (dc < 30 && Math.abs(vi - vo) <= 5) continue
    }
    tot++
    if (vi - vo > 5) pos++
    else if (vo - vi > 5) neg++
  }
  return tot >= 6 && Math.max(pos, neg) >= tot * 0.5
}

/** 中の色が見本の錠剤の色に近く、むらが少ないか（トレーの反射・傷を除く） */
function colorOk(rgb: Plane[], x: number, y: number, t: number, a: number, r: number, cosT: number[], sinT: number[], col: [number, number, number], sens: number): boolean {
  const ux = cosT[t], uy = sinT[t]
  const w = rgb[0].w, h = rgb[0].h
  const s = [0, 0, 0], s2 = [0, 0, 0]
  let n = 0
  for (let i = -4; i <= 4; i++)
    for (let j = -2; j <= 2; j++) {
      const al = (i / 4) * (a + r * 0.4), ac = (j / 2) * r * 0.5
      const px = Math.round(x + al * ux - ac * uy), py = Math.round(y + al * uy + ac * ux)
      if (px < 0 || py < 0 || px >= w || py >= h) continue
      const k = py * w + px
      for (let c = 0; c < 3; c++) {
        const v = rgb[c].v[k]
        s[c] += v
        s2[c] += v * v
      }
      n++
    }
  if (n < 10) return false
  // 中心（隙間に乗っていないか）
  {
    const xi = Math.round(x), yi = Math.round(y)
    let cd = 0
    for (let c = 0; c < 3; c++) {
      let m = 0, cnt = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = Math.min(w - 1, Math.max(0, xi + dx)), py = Math.min(h - 1, Math.max(0, yi + dy))
          m += rgb[c].v[py * w + px]
          cnt++
        }
      cd += (m / cnt - col[c]) ** 2
    }
    if (Math.sqrt(cd) > 50 + 40 * (sens - 0.5)) return false
  }
  let dist = 0, sd = 0
  for (let c = 0; c < 3; c++) {
    const m = s[c] / n
    dist += (m - col[c]) ** 2
    sd += Math.max(0, s2[c] / n - m * m)
  }
  dist = Math.sqrt(dist)
  sd = Math.sqrt(sd / 3)
  // 明るさは場所で変わるので、色の差は 45＋感度、むらは 22 まで
  return dist < 45 + 40 * (sens - 0.5) && sd < 22
}

/** 予想したカプセル形の縁の20か所のうち、輪郭がある所の割合 */
function outlineFrac(e: Edges, x: number, y: number, t: number, a: number, r: number, cosT: number[], sinT: number[], graded = false): number {
  const ux = cosT[t], uy = sinT[t]
  let hit = 0, tot = 0
  for (let q = 0; q < 20; q++) {
    const th = (2 * Math.PI * q) / 20
    const nx0 = Math.cos(th), ny0 = Math.sin(th) // 錠剤の向きでの法線
    // 縁の点（端の半円か側面）
    const along = nx0 > 0.3 ? a : nx0 < -0.3 ? -a : (q % 2 ? 0.5 : -0.5) * a
    const ex0 = along + r * nx0, ey0 = r * ny0
    const px = x + ex0 * ux - ey0 * uy, py = y + ex0 * uy + ey0 * ux
    const nx = nx0 * ux - ny0 * uy, ny = nx0 * uy + ny0 * ux
    tot++
    // graded：縁ちょうどに輪郭があれば1、1画素ずれで0.6、2画素ずれで0.25（大きさの合い方を細かく比べる）
    for (const s of [0, -1, 1, -2, 2]) {
      const xi = Math.round(px + s * nx), yi = Math.round(py + s * ny)
      if (xi < 0 || yi < 0 || xi >= e.w || yi >= e.h) continue
      const i = yi * e.w + xi
      if (e.isEdge[i] && Math.abs(e.ux[i] * nx + e.uy[i] * ny) > 0.6) {
        hit += graded ? [1, 0.6, 0.6, 0.25, 0.25][[0, -1, 1, -2, 2].indexOf(s)] : 1
        break
      }
    }
  }
  return hit / tot
}
