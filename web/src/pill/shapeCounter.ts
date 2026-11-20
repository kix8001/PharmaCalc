/**
 * 形を問わない錠剤カウント（楕円・長い錠剤・カプセル用）。丸い錠剤の円の検出（pillCounter.ts）とは別の手順
 * 1. 写真の縁の色を背景の色とし、各画素の背景との色の差を出す
 * 2. 差のしきい値を大津の方法で決め（感度で上下）、錠剤の部分を取り出す。小さな汚れは削り、穴（刻印）は埋める
 * 3. つながった部分ごとに面積を出し、面積の中央値を1錠の大きさとする
 * 4. くっついた錠剤は「面積÷1錠の面積」を四捨五入した数とし、その数の点をその部分の中に置く（k-means）
 */
import { nextMarkerId, type PillMarker, type Rect } from './pillCounter'

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
