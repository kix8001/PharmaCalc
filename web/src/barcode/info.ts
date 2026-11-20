// 製品の薬価と識別コード（data/info.json、tools/make_info.py で作る）

export interface InfoItem {
  /** 薬価（円） */
  p?: string
  /** 薬価の単位（規格。「60mg1錠」など） */
  s?: string
  /** 識別コード（刻印・印字） */
  i?: string
}
interface InfoData {
  source: string
  items: Record<string, InfoItem>
  /** 統一名収載の製品用：YJ 先頭9桁 → 薬価 */
  p9: Record<string, InfoItem>
}

let pr: Promise<InfoData> | null = null
export function loadInfo(): Promise<InfoData> {
  pr ??= import('../../../data/info.json').then((m) => (m.default ?? m) as unknown as InfoData).catch(() => ({ source: '', items: {}, p9: {} }))
  return pr
}

/** 1つの YJ コードの薬価・識別コード */
export function infoFor(d: InfoData, yj: string): InfoItem {
  const it = d.items[yj] ?? {}
  return it.p ? it : { ...d.p9[yj.slice(0, 9)], ...it }
}
