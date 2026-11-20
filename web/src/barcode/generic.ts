// 先発品・後発品（ジェネリック）・準先発品・基礎的医薬品の判定（data/generic.json、tools/make_generic.py で作る）

export interface GenericItem {
  /** B＝先発品、Q＝準先発品、G＝後発品 */
  k?: 'B' | 'Q' | 'G'
  /** 先発品・準先発品：同じ剤形・規格の後発品があれば 1 */
  g?: 0 | 1
  /** 後発品：対応する先発品（準先発品を含む）の YJ コード */
  b?: string[]
  /** 後発品：1＝規格違いの先発品、2＝剤形違いの先発品 */
  o?: 1 | 2
  /** 基礎的医薬品の区分（不採算・安定確保など） */
  s?: string
}

export interface GenericData {
  source: string
  items: Record<string, GenericItem>
  names: Record<string, string>
}

let genericPromise: Promise<GenericData> | null = null
export function loadGeneric(): Promise<GenericData> {
  genericPromise ??= import('../../../data/generic.json').then((m) => (m.default ?? m) as unknown as GenericData)
  return genericPromise
}

/** 画面に出す区分 */
export interface GenericInfo {
  kind: '先発品' | '準先発品' | '後発品' | ''
  /** 先発品・準先発品：ジェネリックの有無 */
  hasGeneric?: boolean
  /** 後発品：先発品の名前（無ければ空） */
  brands: string[]
  /** 後発品：先発品が規格違い・剤形違いのとき */
  brandNote: string
  /** 基礎的医薬品の区分 */
  kiso: string
}

/** 読み取った製品の YJ コード（複数のこともある）から区分を出す。分からなければ null */
export function genericInfo(d: GenericData, yjs: string[]): GenericInfo | null {
  const recs = yjs.map((y) => d.items[y]).filter(Boolean) as GenericItem[]
  if (!recs.length) return null
  const r = recs.find((x) => x.k) ?? recs[0]
  const kiso = recs.find((x) => x.s)?.s ?? ''
  const kind = r.k === 'B' ? '先発品' : r.k === 'Q' ? '準先発品' : r.k === 'G' ? '後発品' : ''
  const brands = [...new Set(recs.flatMap((x) => x.b ?? []).map((y) => d.names[y] ?? y))]
  const o = recs.find((x) => x.b?.length)?.o
  return {
    kind,
    hasGeneric: r.k === 'B' || r.k === 'Q' ? recs.some((x) => x.g === 1) : undefined,
    brands,
    brandNote: o === 1 ? '規格違い' : o === 2 ? '剤形違い' : '',
    kiso,
  }
}
