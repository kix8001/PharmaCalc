/** 文字列を数値にする（全角数字・カンマにも対応） */
export function parseNum(s: string | undefined | null): number | null {
  if (s == null) return null
  let t = s.trim()
  t = t.replace(/[０-９．，]/g, (c) => '0123456789..'['０１２３４５６７８９．，'.indexOf(c)])
  t = t.replace(/,/g, '.')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export function parseIntNum(s: string | undefined | null): number | null {
  const v = parseNum(s)
  if (v == null || v < 0 || v !== Math.round(v)) return null
  return v
}

const fixedCache = new Map<number, Intl.NumberFormat>()
const trimCache = new Map<number, Intl.NumberFormat>()

/** 小数点以下 digits 桁で表示（末尾の0は残す） */
export function fmt(v: number, digits = 1): string {
  let f = fixedCache.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    fixedCache.set(digits, f)
  }
  return f.format(v)
}

/** 必要な桁だけ表示（12.50 → 12.5、3.0 → 3） */
export function fmtTrim(v: number, maxDigits = 2): string {
  let f = trimCache.get(maxDigits)
  if (!f) {
    f = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: maxDigits })
    trimCache.set(maxDigits, f)
  }
  return f.format(v)
}

/** 検索用に文字をそろえる（全角・半角、ひらがな・カタカナ、大文字・小文字の違いをなくす） */
export function searchKey(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase()
}

/** text に query が含まれるか（searchKey でそろえて比べる） */
export function matchesSearch(text: string, query: string): boolean {
  const q = searchKey(query.trim())
  return q === '' || searchKey(text).includes(q)
}
