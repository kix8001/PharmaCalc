// 製品の薬価と識別コード（data/info.json、tools/make_info.py で作る）

export interface InfoItem {
  /** 薬価（円） */
  p?: string
  /** 薬価の単位（規格。「60mg1錠」など） */
  s?: string
  /** 識別コード（刻印・印字） */
  i?: string
  /** 錠剤の図：[添付文書番号, 表, 裏, 横]（"figNN" は「番号_figNN」、"!名前" はそのままの名前） */
  f?: string[]
  /** 先発品：薬価がいちばん安いジェネリック [名前, 薬価] */
  c?: [string, string]
}

/** 錠剤の図の URL（PMDA の添付文書の画像） */
export function figUrls(f: string[] | undefined): string[] {
  if (!f || f.length < 2) return []
  const doc = f[0]
  return f.slice(1).map((n) => `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/SimpleImageGIF/${doc}/${n.startsWith('!') ? n.slice(1) : `${doc}_${n}`}`)
}

/** 差額の文（a が b よりいくら安い・高いか）。同じなら「同じ薬価」 */
export function diffText(a: number, b: number, unit: string): string {
  const d = Math.round((b - a) * 100) / 100
  if (Math.abs(d) < 0.005) return '同じ薬価'
  const pct = Math.round((Math.abs(d) / b) * 100)
  return `${unit}${Math.abs(d)}円${d > 0 ? '安い' : '高い'}（${d > 0 ? '−' : '＋'}${pct}%）`
}

interface InfoData {
  source: string
  /** 先発品の薬価（ジェネリックと比べるため） */
  bp: Record<string, string>
  items: Record<string, InfoItem>
  /** 統一名収載の製品用：YJ 先頭9桁 → 薬価 */
  p9: Record<string, InfoItem>
}

let pr: Promise<InfoData> | null = null
export function loadInfo(): Promise<InfoData> {
  pr ??= import('../../../data/info.json').then((m) => (m.default ?? m) as unknown as InfoData).catch(() => ({ source: '', bp: {}, items: {}, p9: {} }))
  return pr
}

/** 1つの YJ コードの薬価・識別コード */
export function infoFor(d: InfoData, yj: string): InfoItem {
  const it = d.items[yj] ?? {}
  return it.p ? it : { ...d.p9[yj.slice(0, 9)], ...it }
}
