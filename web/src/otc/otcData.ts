import { searchKey } from '../core/format'

/** 対象医薬品（厚労省の対象医薬品リスト。価格は円） */
export interface OtcTarget {
  name: string
  ingredient: string
  spec: string
  maker: string
  /** 薬価 */
  price: number
  /** 対象医薬品の価格の4分の1（特別の料金の計算に使う） */
  quarter: number
  /** 保険外併用療養費の算出に用いる価格 */
  base: number
}

export interface OtcData {
  source: string
  hot: string
  targets: Record<string, OtcTarget>
  /** YJ → 特別の料金の対象外となる効能・効果 */
  effects: Record<string, string[]>
  /** 成分 → 特別の料金の対象外となる傷病名の例 */
  diseases: Record<string, string[]>
  pregnant: string[]
  lactating: string[]
  /** YJ → 販売名（HOTコードマスターの全品目） */
  names: Record<string, string>
  /** 箱（販売包装単位）のGS1コード → YJ */
  box: Record<string, string>
  pregnantSet: Set<string>
  lactatingSet: Set<string>
  /** 名前で探すための [YJ, 検索用の文字] */
  index: [string, string][]
}

let dataPromise: Promise<OtcData> | null = null
/** 3MB あるので、使うときに1回だけ読み込む */
export function loadOtc(): Promise<OtcData> {
  dataPromise ??= import('../../../data/otc.json').then((m) => {
    const d = (m.default ?? m) as unknown as OtcData
    d.pregnantSet = new Set(d.pregnant)
    d.lactatingSet = new Set(d.lactating)
    d.index = Object.entries(d.names).map(([yj, n]) => [yj, searchKey(n + (d.targets[yj]?.ingredient ?? ''))])
    return d
  })
  return dataPromise
}

/** 別途の負担（特別の料金）の対象外となる場合（厚労省のページより。令和9年3月1日施行時点） */
export const OTC_EXEMPTIONS = [
  'こども（18歳に達する日以後の最初の3月31日までの間にある者）',
  'がん治療又はがん治療に関連して生じた状態に使う場合',
  '指定難病若しくは小児慢性特定疾病（18歳から20歳までの者に限る）又はこれらに関連して生じた状態に使う場合',
  '国の公費負担医療において使う場合',
  '入院中（退院時処方を含む）に使う場合',
  '侵襲を伴う検査、処置又は手術に伴って使う場合（その検査等の後、14日以内の使用に限る）',
  '医師が年間を通じた症状の持続と治療の継続性を確認し、長期の使用が医療上必要と認めた場合',
  '類似のOTC医薬品で承認されている効能・効果では対応できない状態に使う場合（この薬の該当する効能・効果・傷病名の例は下に）',
  '妊婦・妊娠している可能性がある者・授乳婦が、特定の対象医薬品を使う場合',
]

/**
 * 特別の料金（円）＝ 対象医薬品の価格の4分の1 × 投薬全量。
 * 10円以上なら5円未満の端数は切り捨て、5円以上10円未満は10円に切り上げ。10円未満は10円
 * （同じ処方箋に対象医薬品が複数あるときは、合算してから丸める）
 */
export function otcFee(yen: number): number {
  const v = Math.round(yen * 100) / 100
  if (v <= 0) return 0
  if (v < 10) return 10
  const base = Math.floor(v / 10) * 10
  return v - base < 5 ? base : base + 10
}

export type Lookup =
  | { kind: 'found'; yj: string[]; via: 'box' | 'pmda' }
  | { kind: 'notFound' }
  | { kind: 'offline' }

/**
 * GS1コード（GTIN）から製品（YJコード）を調べる。
 * 箱（販売包装単位）のコードは HOTコードマスターで端末の中だけで分かる。
 * PTPシート（調剤包装単位）のコードはマスターに無いので、サーバー経由で PMDA の添付文書を引き、
 * その添付文書に載っている製品（錠・細粒など複数のことがある）を返す
 */
export async function lookupGtin(gtin: string): Promise<Lookup> {
  const d = await loadOtc()
  const g = gtin.padStart(14, '0')
  const yj = d.box[g]
  if (yj) return { kind: 'found', yj: [yj], via: 'box' }
  try {
    const r = await fetch(`./pmda-yj/${g}`, { cache: 'no-store' })
    if (!r.ok) return { kind: 'offline' }
    const j = (await r.json()) as { yj?: string[] }
    const list = (j.yj ?? []).filter((y) => d.names[y] || d.targets[y])
    return list.length ? { kind: 'found', yj: list, via: 'pmda' } : { kind: 'notFound' }
  } catch {
    return { kind: 'offline' }
  }
}

/** 規格の末尾の単位（「60mg1錠」→「錠」、「5%1g」→「g」、「10mL」→「10mL」） */
export function unitOfSpec(spec: string): string {
  const m = /([\d.]+)([^\d.]+)$/.exec(spec)
  if (!m) return '単位'
  return Number(m[1]) === 1 ? m[2] : m[1] + m[2]
}

export function searchProducts(d: OtcData, q: string, limit = 50): string[] {
  const k = searchKey(q.trim())
  if (k.length < 2) return []
  const hits: string[] = []
  // 対象医薬品を先に
  for (const [yj, s] of d.index) if (d.targets[yj] && s.includes(k)) hits.push(yj)
  for (const [yj, s] of d.index) if (!d.targets[yj] && s.includes(k)) hits.push(yj)
  return hits.slice(0, limit)
}
