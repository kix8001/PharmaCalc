// 先発品と効能効果・用法用量に違いのある後発品（data/gediff.json、tools/make_gediff.py で作る。元は日本ジェネリック製薬協会のリスト）と、
// オーソライズド・ジェネリック（AG。data/ag.json、tools/make_if.py が各社のインタビューフォームの記載から作る）
import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, Search } from 'lucide-preact'
import { Page, Section } from '../ui/components'
import { useNav } from '../ui/nav'
import { matchesSearch } from '../core/format'
import { ScanSummary } from './summary'

export interface GediffProduct {
  /** 販売名・会社名・規格 */
  n: string
  c: string
  k: string
  /** 1＝後発品 */
  g?: 1
  /** 効能の有無（「①②」＝その番号の効能効果等を持つ、「―」＝持たない） */
  a: string
  /** 1＝経過措置品目 */
  x?: 1
  y?: string[]
}
export interface GediffGroup {
  /** 有効成分名・違いのある効能効果等（①②…）・1＝先発品のみ、2＝先発品と一部の後発品 */
  n: string
  d: string
  s: 1 | 2
  p: GediffProduct[]
}
interface GediffData {
  source: string
  date: string
  groups: GediffGroup[]
}

let gp: Promise<GediffData> | null = null
export function loadGediff(): Promise<GediffData> {
  gp ??= import('../../../data/gediff.json').then((m) => (m.default ?? m) as unknown as GediffData).catch(() => ({ source: '', date: '', groups: [] }))
  return gp
}
let ap: Promise<Record<string, string>> | null = null
/** AG の製品の YJ → インタビューフォームの記載（「…と原薬、添加剤及び製法等が同一のオーソライズド・ジェネリックである」） */
export function loadAg(): Promise<Record<string, string>> {
  ap ??= import('../../../data/ag.json').then((m) => ((m.default ?? m) as unknown as { yj: Record<string, string> }).yj).catch(() => ({}))
  return ap
}

/** 製品の YJ が載っているグループと、その製品の行 */
export function gediffFor(d: GediffData, yjs: string[]): { g: GediffGroup; p: GediffProduct } | null {
  for (const g of d.groups) for (const p of g.p) if (p.y?.some((y) => yjs.includes(y))) return { g, p }
  return null
}

const SEC = { 1: '先発品だけが持つ効能効果・用法', 2: '先発品と一部の後発品だけが持つ効能効果・用法' } as const
const has = (a: string) => a && a !== '―' && a !== '-' && a !== '－'
const marks = (a: string) => (has(a) ? a : 'なし')

/** スキャンの結果に出す1行（違いのある製品のとき） */
export function GediffBadge({ g, p }: { g: GediffGroup; p: GediffProduct }) {
  const nav = useNav()
  // 同じ規格の先発品の効能の有無
  const brand = g.p.find((x) => !x.g && x.k === p.k) ?? g.p.find((x) => !x.g)
  const text = p.g
    ? has(p.a) && brand && p.a === brand.a
      ? '先発品と同じ効能効果・用法あり（一部の後発品には無い）'
      : `先発品にある効能効果・用法が${has(p.a) ? '一部' : ''}ありません`
    : 'この製品にある効能効果・用法が無いジェネリックがあります'
  return (
    <button class={'row gediff-badge' + (p.g && !(has(p.a) && brand && p.a === brand.a) ? ' warn' : '')} onClick={() => nav.push(<GediffDetailPage g={g} yj={p.y ?? []} />)}>
      <span class="gediff-main">
        <b>効能効果の違い</b>
        <span class="small">{text}</span>
        <span class="small sub">この製品：{marks(p.a)}{p.g && brand ? `・先発品：${marks(brand.a)}` : ''}</span>
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

/** 1つの成分の違いと、製品ごとの有無 */
export function GediffDetailPage({ g, yj }: { g: GediffGroup; yj: string[] }) {
  const nav = useNav()
  const [ag, setAg] = useState<Record<string, string>>({})
  const [src, setSrc] = useState('')
  useEffect(() => {
    loadAg().then(setAg)
    loadGediff().then((d) => setSrc(`${d.source}${d.date ? `（${d.date.replace(/^(\d+)-(\d+)-(\d+)$/, (_, a, b, c) => `${a}年${Number(b)}月${Number(c)}日`)}版）` : ''}`))
  }, [])
  const specs = [...new Set(g.p.map((p) => p.k))]
  const open = (p: GediffProduct) =>
    p.y?.length &&
    nav.push(
      <Page title="効能効果の違い">
        <Section>
          <ScanSummary yj={p.y} memo={p.n} detail="効能効果に違いのある後発品の一覧から" />
        </Section>
      </Page>,
    )
  return (
    <Page title="効能効果の違い">
      <Section header={g.n} footer={SEC[g.s]}>
        <div class="row label-text">{g.d}</div>
      </Section>
      {specs.map((k) => (
        <Section header={k || '規格'}>
          {g.p
            .filter((p) => p.k === k)
            .map((p) => (
              <button class={'row gediff-prod' + (p.y?.some((y) => yj.includes(y)) ? ' cur' : '')} onClick={() => open(p)} disabled={!p.y?.length}>
                <span class="gediff-main">
                  <span>
                    <span class={'scan-chip ' + (p.g ? 'gen' : 'brand')}>{p.g ? '後発品' : '先発品'}</span>
                    {p.y?.some((y) => ag[y]) && <span class="scan-chip ag">AG</span>} <b>{p.n}</b>
                  </span>
                  <span class="small sub">
                    {p.c}
                    {p.x ? '・経過措置品目' : ''}
                  </span>
                </span>
                <span class={'gediff-mark' + (has(p.a) ? '' : ' none')}>{marks(p.a)}</span>
              </button>
            ))}
        </Section>
      ))}
      <Section footer={`右の番号は、上の①②…の効能効果・用法を持っていること（「なし」は持たない）。${src}。すべての違いを網羅した物ではありません。必ず添付文書で確かめてください。`}>
        <></>
      </Section>
    </Page>
  )
}

/** メインメニューの「効能効果に違いのあるジェネリック」 */
export function GediffPage() {
  const nav = useNav()
  const [d, setD] = useState<GediffData | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    loadGediff().then(setD)
  }, [])
  const hit = d ? d.groups.filter((g) => !q.trim() || matchesSearch(g.n + ' ' + g.d + ' ' + g.p.map((p) => p.n).join(' '), q)) : []
  const row = (g: GediffGroup) => {
    const gens = g.p.filter((p) => p.g)
    const lack = gens.filter((p) => !has(p.a)).length
    return (
      <button class="row otc-row" onClick={() => nav.push(<GediffDetailPage g={g} yj={[]} />)}>
        <span class="otc-main">
          <b>{g.n}</b>
          <span class="small">{g.d.split('\n').filter((x) => x.trim())[0]?.trim()}</span>
          <span class="small sub">
            先発品：{[...new Set(g.p.filter((p) => !p.g).map((p) => p.n.replace(/[0-9０-９.]+(mg|μg|g|mL|%).*$/, '')))].slice(0, 2).join('、')}・後発品 {gens.length}製品（違いあり {lack}）
          </span>
        </span>
        <ChevronRight size={18} class="chev" />
      </button>
    )
  }
  return (
    <Page title="効能効果に違いのあるジェネリック">
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="成分名・製品名・効能で探す" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {!d ? (
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      ) : (
        <>
          {([1, 2] as const).map((s) => {
            const gs = hit.filter((g) => g.s === s)
            return gs.length ? (
              <Section header={`${SEC[s]}（${gs.length}成分）`}>{gs.map(row)}</Section>
            ) : null
          })}
          {!hit.length && (
            <Section>
              <div class="row sub">見つかりませんでした。</div>
            </Section>
          )}
          <Section footer={`${d.source}（${d.date}版）による。先発品にある効能効果・用法（再審査期間・特許などのため）が後発品に無い物。押すと製品ごとの有無。すべての違いを網羅した物ではありません。`}>
            <></>
          </Section>
        </>
      )}
    </Page>
  )
}
