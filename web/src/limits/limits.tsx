import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, Search } from 'lucide-preact'
import { ButtonRow, LabeledRow, Page, Section, WarningRow, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { searchKey } from '../core/format'
import { CameraBox, useCameraOn, useScanner } from '../barcode/scan'
import { parseGS1 } from '../barcode/gs1'
import { loadOtc, lookupGtin, productName, type Lookup, type OtcData } from '../otc/otcData'

/** 成分（YJコードの先頭7桁）ごとの、投与日数の上限（data/limits.json。tools/make_limits.py で作る） */
export interface LimitGroup {
  /** 一般名 */
  ing: string
  route: '内用' | '注射' | '外用'
  /** 規制区分（麻薬・第一種〜第三種向精神薬・覚醒剤原料など） */
  reg: string[]
  /** 1回の投薬の上限（日分）。0 は上限なし */
  days: number
  /** 告示の区分 */
  basis: string
  /** 効能・効果の見出し（同じ適応症の薬を探すのに使う） */
  ind: string[]
}

interface LimitData {
  source: string
  made: string
  groups: Record<string, LimitGroup>
}

let limitsPromise: Promise<LimitData> | null = null
export function loadLimits(): Promise<LimitData> {
  limitsPromise ??= import('../../../data/limits.json').then((m) => (m.default ?? m) as unknown as LimitData)
  return limitsPromise
}

/** その製品の上限（調べた分類に入っていない製品は null＝上限なし） */
export const groupOf = (l: LimitData, yj: string): LimitGroup | null => l.groups[yj.slice(0, 7)] ?? null

const KOKUJI_URL = 'https://www.mhlw.go.jp/web/t_doc?dataId=84aa7837&dataType=0&pageNo=1'

function useData() {
  const [d, setD] = useState<{ otc: OtcData; lim: LimitData } | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all([loadOtc(), loadLimits()]).then(([otc, lim]) => alive && setD({ otc, lim }))
    return () => {
      alive = false
    }
  }, [])
  return d
}

/** 上限の札 */
function DaysBadge({ g }: { g: LimitGroup | null }) {
  if (!g || !g.days) return <span class="otc-verdict no">投与日数の上限なし</span>
  return (
    <span class={'otc-verdict yes limit-' + g.days}>
      1回{g.days}日分まで（{g.reg.join('・') || '告示'}）
    </span>
  )
}

function ProductRow({ d, yj }: { d: { otc: OtcData; lim: LimitData }; yj: string }) {
  const nav = useNav()
  const g = groupOf(d.lim, yj)
  return (
    <button class="row otc-row" onClick={() => nav.push(<LimitDetailPage yj={yj} />)}>
      <span class="otc-main">
        <b>{productName(d.otc, yj)}</b>
        <DaysBadge g={g} />
        {g && <span class="small sub">{g.ing}・{g.route === '内用' ? '内服薬' : g.route === '注射' ? '注射薬' : '外用薬'}</span>}
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

function LookupResult({ d, r }: { d: { otc: OtcData; lim: LimitData }; r: Lookup }) {
  if (r.kind === 'offline') return <WarningRow>この製品は端末の中の表に無く、PMDA にも問い合わせられませんでした。電波のあるところで読み直すか、下の「名前で探す」を使ってください。</WarningRow>
  if (r.kind === 'notFound') return <WarningRow>このコードの医療用医薬品が見つかりませんでした。下の「名前で探す」を使ってください。</WarningRow>
  return (
    <>
      {r.yj.length > 1 && <div class="row small sub">この添付文書には{r.yj.length}製品が載っています。手元の製品を確かめてください。</div>}
      {r.yj.map((y) => (
        <ProductRow d={d} yj={y} />
      ))}
    </>
  )
}

/** バーコード画面の読み取り結果に出す、投与日数の上限（上限のある薬だけ） */
export function LimitBadge({ gtin }: { gtin: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    let alive = true
    setText('')
    Promise.all([lookupGtin(gtin), loadLimits(), loadOtc()]).then(([r, lim, otc]) => {
      if (!alive || r.kind !== 'found') return
      const hits = r.yj.map((y) => groupOf(lim, y)).filter((g): g is LimitGroup => !!g && g.days > 0)
      if (!hits.length) return
      const g = hits[0]
      setText(`投与日数の上限：1回${g.days}日分まで（${g.reg.join('・')}、${g.ing}）` + (r.yj.length > 1 ? `　※${productName(otc, r.yj[0])}ほか` : ''))
    })
    return () => {
      alive = false
    }
  }, [gtin])
  if (!text) return null
  return <div class="row small limit-line">{text}</div>
}

/** 名前で探す：対象の製品（上限のある物を先に） */
function searchLimitProducts(d: { otc: OtcData; lim: LimitData }, q: string): string[] {
  const k = searchKey(q.trim())
  if (k.length < 2) return []
  const a: string[] = []
  const b: string[] = []
  for (const [yj, n] of Object.entries(d.otc.names)) {
    const g = groupOf(d.lim, yj)
    if (!searchKey(n + (g?.ing ?? '')).includes(k)) continue
    ;(g && g.days ? a : b).push(yj)
  }
  return [...a, ...b].slice(0, 50)
}

/** 投与日数制限チェック：バーコードや名前で、1回に出せる日数の上限（14日・30日・90日）を調べる */
export function LimitsPage() {
  const d = useData()
  const [gtin, setGtin] = useState<string | null>(null)
  const [r, setR] = useState<Lookup | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState('')

  const handle = (code: string) => {
    const g = parseGS1(code).gtin
    if (!g) return
    try {
      navigator.vibrate?.(30)
    } catch {
      /* 振動できない端末 */
    }
    setGtin(g)
    setR(null)
    setBusy(true)
    lookupGtin(g).then((x) => {
      setR(x)
      setBusy(false)
    })
  }
  const cam = useScanner(handle, busy, useCameraOn())
  const hits = d && query ? searchLimitProducts(d, query) : []

  return (
    <Page title="投与日数制限チェック">
      <CameraBox cam={cam} />
      {gtin && (
        <Section header={`読み取り結果（GTIN ${gtin}）`}>
          {!d || busy || !r ? <div class="row sub">調べています…</div> : <LookupResult d={d} r={r} />}
        </Section>
      )}
      <Section footer="PTPシートのGS1データバー、箱のGS1-128・GS1データバーを読めます。">
        <div class="row">
          <input
            class="text-input"
            inputMode="numeric"
            placeholder="GTIN（14桁）を手入力"
            value={manual}
            onInput={(e) => setManual((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual) handle(manual)
            }}
          />
          <button class="bar-btn strong" disabled={!manual} onClick={() => handle(manual)}>
            調べる
          </button>
        </div>
      </Section>
      <label class="search" style={{ marginTop: '18px' }}>
        <Search size={18} />
        <input type="search" placeholder="名前で探す（例：マイスリー、ゾルピデム）" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      {d && query.trim().length >= 2 && (
        <Section>{hits.length === 0 ? <div class="row sub">見つかりませんでした</div> : hits.map((y) => <ProductRow d={d} yj={y} />)}</Section>
      )}
      <Section header="投与日数の上限（告示）" footer={d ? `${d.lim.source}をもとに判定しています（データ作成 ${d.lim.made}）。` : undefined}>
        <div class="row small" style={{ display: 'block' }}>
          <b>14日分まで</b>：麻薬・向精神薬（下の30日・90日の物を除く）、新医薬品（薬価収載の翌月から1年。このアプリでは判定しません）
        </div>
        <div class="row small" style={{ display: 'block' }}>
          <b>30日分まで</b>：ゾルピデム・トリアゾラム・ブロチゾラム・エチゾラム・アルプラゾラムなどの内服薬、フェンタニル・モルヒネの外用薬など
        </div>
        <div class="row small" style={{ display: 'block' }}>
          <b>90日分まで</b>：ジアゼパム・ニトラゼパム・フェノバルビタール・クロナゼパム・クロバザムの内服薬など
        </div>
        <ButtonRow onClick={() => openExternal(KOKUJI_URL)}>告示（厚労省 法令等データベース）を開く</ButtonRow>
      </Section>
    </Page>
  )
}

const ROUTE_NAME = { 内用: '内服薬', 注射: '注射薬', 外用: '外用薬' } as const

/** 同じ適応症で投与日数の上限がない成分（同じ剤形の区分＝内服・外用・注射の中で） */
function freeAlternatives(d: { otc: OtcData; lim: LimitData }, tag: string, route: string): { ing: string; yj: string[] }[] {
  const byIng = new Map<string, string[]>()
  for (const [y7, g] of Object.entries(d.lim.groups)) {
    if (g.days || g.reg.length || g.route !== route || !g.ind.includes(tag) || !g.ing) continue
    const list = byIng.get(g.ing) ?? []
    for (const yj of Object.keys(d.otc.names)) if (yj.startsWith(y7)) list.push(yj)
    if (list.length) byIng.set(g.ing, list)
  }
  return [...byIng.entries()].map(([ing, yj]) => ({ ing, yj })).sort((a, b) => a.ing.localeCompare(b.ing, 'ja'))
}

function AltRow({ d, ing, yj }: { d: { otc: OtcData; lim: LimitData }; ing: string; yj: string[] }) {
  const nav = useNav()
  const names = [...new Set(yj.map((y) => productName(d.otc, y)))]
  return (
    <button class="row otc-row" onClick={() => nav.push(<LimitDetailPage yj={yj[0]} />)}>
      <span class="otc-main">
        <b>{ing}</b>
        <span class="small sub">
          {names.slice(0, 3).join('、')}
          {names.length > 3 ? ` ほか${names.length - 3}製品` : ''}
        </span>
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

/** 製品ごとの画面：上限・規制区分・根拠・同じ適応症で上限のない薬 */
export function LimitDetailPage({ yj }: { yj: string }) {
  const d = useData()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!d) {
    return (
      <Page title="投与日数">
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      </Page>
    )
  }
  const g = groupOf(d.lim, yj)
  return (
    <Page title="投与日数">
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{productName(d.otc, yj)}</b>
          <DaysBadge g={g} />
          <span class="small sub">YJコード {yj}</span>
        </div>
      </Section>
      {g ? (
        <Section header="この薬の区分">
          <LabeledRow label="一般名" value={g.ing} />
          <LabeledRow label="剤形の区分" value={ROUTE_NAME[g.route]} />
          <LabeledRow label="規制区分" value={g.reg.join('・') || 'なし'} />
          <LabeledRow label="1回の投薬の上限" value={g.days ? `${g.days}日分` : 'なし'} />
          {g.basis && <LabeledRow label="根拠" value={g.basis} />}
        </Section>
      ) : (
        <Section footer="中枢神経系・末梢神経系・呼吸器・麻薬の薬効分類に入っていない製品です。">
          <div class="row">麻薬・向精神薬ではなく、投与日数の上限はありません（新医薬品の14日制限は除く）。</div>
        </Section>
      )}
      {g && g.days === 14 && (
        <Section header="14日分の薬を30日分まで出せるとき">
          <div class="row small" style={{ display: 'block' }}>
            海外への渡航、年末・年始、ゴールデンウィークなど、長期の旅行等の特殊な事情があり必要と認められるときは、旅程などを考えて必要最小限の範囲で1回30日分まで投与できます（診療報酬明細書の摘要欄に理由を書く）。
          </div>
        </Section>
      )}
      {g && g.days > 0 &&
        g.ind.map((tag) => {
          const alts = freeAlternatives(d, tag, g.route)
          if (!alts.length) return null
          const all = open[tag]
          return (
            <Section header={`同じ適応症（${tag}）で投与日数の上限がない${ROUTE_NAME[g.route]}`} footer="効能・効果の文言が同じ見出しに当たる薬です。薬価収載から1年以内の新医薬品は14日分までのことがあります（このアプリでは判定しません）。切り替えるかどうかは、効能・効果の細部・用法用量・患者さんの状態を添付文書で確かめてください。">
              {(all ? alts : alts.slice(0, 15)).map((a) => (
                <AltRow d={d} ing={a.ing} yj={a.yj} />
              ))}
              {!all && alts.length > 15 && <ButtonRow onClick={() => setOpen({ ...open, [tag]: true })}>ほか{alts.length - 15}成分を表示</ButtonRow>}
            </Section>
          )
        })}
      <Section>
        <ButtonRow onClick={() => openExternal(`https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yj.slice(0, 7)}`)}>添付文書を見る（PMDA）</ButtonRow>
        <ButtonRow onClick={() => openExternal(KOKUJI_URL)}>告示（厚労省 法令等データベース）を開く</ButtonRow>
      </Section>
    </Page>
  )
}
