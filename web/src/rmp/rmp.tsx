import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, FileText, Search, Star } from 'lucide-preact'
import { ButtonRow, Page, Section, Toggle, WarningRow, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { persistedStore, useStore } from '../core/store'
import { CameraBox, useCameraOn, useScanner } from '../barcode/scan'
import { parseGS1 } from '../barcode/gs1'
import { loadOtc, lookupGtin, productName, type Lookup } from '../otc/otcData'

/**
 * 患者向けRMP資材（data/rmp.json）。PMDA「RMP提出品目一覧」の全品目から、患者向けのRMP資材がある品目だけをまとめた物。
 * 元はハローナビの HTML ブロック（tools/rmp_src/）の DATA と同じ並び：
 * [販売名（|区切り）, 会社, 一般名, RMP提出（更新）, PDFのパス, RMP本体の版, YJコード先頭7桁, [[資材名, ファイル]], 効能, [[規格, 効能]]?, {ファイル: [[対象/対象外/一部対象, 内容]]}?]
 */
type Row = [string, string, string, string, string, string, string, [string, string][], string, [string, string][]?, Record<string, [string, string][]>?]

export interface RmpItem {
  id: string
  names: string[]
  label: string
  company: string
  generic: string
  date: string
  code: string
  /** PDF のパスの末尾の YJ コード */
  pathYj: string
  ind: string
  bySpec: [string, string][]
  mats: { title: string; url: string; scope: [string, string][] | null }[]
  rmpUrl: string
  pageUrl: string
  inj: boolean
  onc: boolean
  partial: boolean
  key: string
}

interface RmpData {
  source: string
  fetched: string
  items: RmpItem[]
}

const P = 'https://www.pmda.go.jp'
const kata = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
const base = (s: string) => kata(s).normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC')

/** 販売名をまとめて短くする（「〇〇錠2.5mg / 5mg」など。元の HTML ブロックと同じ手順） */
function label(names: string[]): string {
  let parts: string[] = []
  names.forEach((n) =>
    n.split(/\s*[／、，,]\s*|\s*\/\s*(?=[ァ-ヶ一-龠])/).forEach((x) => {
      x = x.trim()
      if (x) parts.push(x.normalize('NFKC'))
    }),
  )
  if (parts.length < 2) return parts.join('')
  let tail = ''
  const sm = parts[0].match(/(「[^」]+」)$/)
  if (sm && parts.every((p) => p.endsWith(sm[1]))) {
    tail = sm[1]
    parts = parts.map((p) => p.slice(0, -tail.length))
  }
  const groups: { stem: string; s: string[] }[] = []
  parts.forEach((p) => {
    const m = p.match(/^(.*?[^\d０-９.．\s])\s*([\d０-９][\s\S]*)$/)
    let stem = m ? m[1] : p
    let str = m ? m[2] : ''
    if (!m && /^[\d０-９]/.test(p)) {
      stem = ''
      str = p
    }
    if (stem === '' && groups.length) {
      groups[groups.length - 1].s.push(str)
      return
    }
    const g = groups.find((x) => x.stem === stem)
    if (g) {
      if (str) g.s.push(str)
    } else groups.push({ stem, s: str ? [str] : [] })
  })
  let brand = groups[0].stem
  groups.forEach((g) => {
    while (brand && !g.stem.startsWith(brand)) brand = brand.slice(0, -1)
  })
  const run = (groups[0].stem.match(/^[ァ-ヶー・®A-Za-zＡ-Ｚａ-ｚ]+/) || [''])[0]
  if (brand.length > run.length) brand = run
  return (
    groups
      .map((g, i) => {
        const st = i && brand && g.stem.length > brand.length ? g.stem.slice(brand.length) : g.stem
        return st + g.s.join(' / ')
      })
      .join('、') + tail
  )
}

function toItem(r: Row): RmpItem {
  const [nm, co, gen, date, path, rv, code, pts, ind, sd, lab] = r
  const names = nm.split('|')
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  const url = (f: string) => P + '/RMP/www/' + (f[0] === '!' ? dir + f.slice(1) : path + '_' + f) + 'RMPm.pdf'
  return {
    id: path.slice(path.indexOf('/') + 1, path.lastIndexOf('/')),
    names,
    label: label(names),
    company: co,
    generic: gen,
    date: date.replace(/\((.+)\)/, '（更新 $1）'),
    code,
    pathYj: path.slice(path.lastIndexOf('_') + 1),
    ind,
    bySpec: sd ?? [],
    mats: pts.map(([t, f]) => ({ title: t, url: url(f), scope: lab?.[f] ?? null })),
    rmpUrl: P + '/RMP/www/' + path + '_' + rv + 'RMP.pdf',
    pageUrl: P + '/PmdaSearch/iyakuDetail/GeneralList/' + code,
    inj: names.every((n) => /注/.test(n.replace(/注腸/g, ''))),
    onc: code.startsWith('42'),
    partial: !!lab && Object.keys(lab).length > 0,
    key: kata([nm, gen, co, ind, (sd ?? []).flat().join(' ')].join(' ')).replace(/\s+/g, ''),
  }
}

let rmpPromise: Promise<RmpData> | null = null
export function loadRmp(): Promise<RmpData> {
  rmpPromise ??= import('../../../data/rmp.json').then((m) => {
    const raw = (m.default ?? m) as unknown as { source: string; fetched: string; items: Row[] }
    const items = raw.items.map(toItem).sort((a, b) => base(a.names[0]).localeCompare(base(b.names[0]), 'ja'))
    return { source: raw.source, fetched: raw.fetched, items }
  })
  return rmpPromise
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '')

/**
 * 製品（YJコード）に当たる品目。販売名が一致する品目があればそれだけを、無ければ同じ成分・投与経路
 * （YJコードの先頭7桁）の品目（先発品・他社の後発品）を出す
 */
export function rmpForYj(d: RmpData, yj: string[], names: string[]): { items: RmpItem[]; exact: boolean } {
  const k = new Set(yj.map((y) => y.slice(0, 7)))
  const same = d.items.filter((i) => k.has(i.code) || k.has(i.pathYj.slice(0, 7)))
  const want = new Set(names.map(norm))
  const exact = same.filter((i) => i.names.some((n) => want.has(norm(n))))
  return exact.length ? { items: exact, exact: true } : { items: same, exact: false }
}

/** バーコードの読み取り結果から、当たる品目を調べる */
export async function rmpForLookup(r: Lookup): Promise<{ items: RmpItem[]; exact: boolean }> {
  if (r.kind !== 'found') return { items: [], exact: false }
  const [d, otc] = await Promise.all([loadRmp(), loadOtc()])
  return rmpForYj(d, r.yj, r.yj.map((y) => productName(otc, y)))
}

/** 登録した品目（このブラウザに保存） */
const favStore = persistedStore<string[]>('rmpFavorites', [])
const onlyFavStore = persistedStore<boolean>('rmpOnlyFav', false)
const injStore = persistedStore<boolean>('rmpShowInj', true)
const oncStore = persistedStore<boolean>('rmpShowOnc', true)

function useRmp() {
  const [d, setD] = useState<RmpData | null>(null)
  useEffect(() => {
    let alive = true
    loadRmp().then((x) => alive && setD(x))
    return () => {
      alive = false
    }
  }, [])
  return d
}

function Tags({ i }: { i: RmpItem }) {
  return (
    <>
      {i.partial && <span class="rmp-tag part">一部RMP対象</span>}
      {i.inj && <span class="rmp-tag inj">注射</span>}
      {i.onc && <span class="rmp-tag onc">抗がん</span>}
    </>
  )
}

function ItemRow({ i }: { i: RmpItem }) {
  const nav = useNav()
  const favs = useStore(favStore)
  return (
    <button class="row otc-row" onClick={() => nav.push(<RmpDetailPage id={i.id} />)}>
      <span class="otc-main">
        <b>
          {favs.includes(i.id) && <Star size={14} class="rmp-star-on" />} {i.label}
        </b>
        <span class="rmp-tags">
          <Tags i={i} />
          <span class="small sub">資材 {i.mats.length}件</span>
        </span>
        <span class="small sub">{i.ind}</span>
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

/** バーコード画面の読み取り結果に出す、患者向けRMP資材のある品目 */
export function RmpBadge({ gtin }: { gtin: string }) {
  const nav = useNav()
  const [hits, setHits] = useState<RmpItem[]>([])
  useEffect(() => {
    let alive = true
    setHits([])
    lookupGtin(gtin)
      .then(rmpForLookup)
      .then((x) => alive && setHits(x.items))
    return () => {
      alive = false
    }
  }, [gtin])
  if (!hits.length) return null
  return (
    <>
      {hits.map((i) => (
        <MatButtons i={i} withName={hits.length > 1} onMore={() => nav.push(<RmpDetailPage id={i.id} />)} />
      ))}
    </>
  )
}

/** 患者向け資材（PDF）を直接開くボタン */
function MatButtons({ i, withName, onMore }: { i: RmpItem; withName?: boolean; onMore?: () => void }) {
  return (
    <>
      {withName && <div class="row small sub">{i.label}</div>}
      {i.mats.map((m) => (
        <ButtonRow icon={<FileText size={20} />} onClick={() => openExternal(m.url)}>
          患者向けRMP資材：{m.title}
        </ButtonRow>
      ))}
      {onMore && (
        <button class="row small sub rmp-more" onClick={onMore}>
          効能・RMPの対象などを見る
          <ChevronRight size={16} class="chev" />
        </button>
      )}
    </>
  )
}

/** 患者向けRMP資材：品目の一覧・検索・バーコード */
export function RmpPage() {
  const d = useRmp()
  const nav = useNav()
  const [query, setQuery] = useState('')
  const [gtin, setGtin] = useState<string | null>(null)
  const [r, setR] = useState<Lookup | null>(null)
  const [scanned, setScanned] = useState<{ items: RmpItem[]; exact: boolean }>({ items: [], exact: false })
  const [busy, setBusy] = useState(false)
  const [scanOn, setScanOn] = useState(false)
  const favs = useStore(favStore)
  const onlyFav = useStore(onlyFavStore)
  const showInj = useStore(injStore)
  const showOnc = useStore(oncStore)

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
    lookupGtin(g).then(async (x) => {
      setScanned(await rmpForLookup(x))
      setR(x)
      setBusy(false)
    })
  }
  const cameraOn = useCameraOn()
  const cam = useScanner(handle, busy, cameraOn && scanOn)

  const q = kata(query).replace(/\s+/g, '')
  const list = d
    ? d.items.filter((i) => (onlyFav ? favs.includes(i.id) : (showInj || !i.inj) && (showOnc || !i.onc)) && (!q || i.key.includes(q)))
    : []

  return (
    <Page title="患者向けRMP資材">
      {scanOn ? (
        <>
          <CameraBox cam={cam} />
          <Section>
            <ButtonRow onClick={() => setScanOn(false)}>バーコードの読み取りを閉じる</ButtonRow>
          </Section>
        </>
      ) : (
        <Section>
          <ButtonRow onClick={() => setScanOn(true)}>バーコードで探す</ButtonRow>
        </Section>
      )}
      {gtin && (
        <Section header={`読み取り結果（GTIN ${gtin}）`}>
          {!d || busy || !r ? (
            <div class="row sub">調べています…</div>
          ) : r.kind !== 'found' ? (
            <WarningRow>{r.kind === 'offline' ? '製品を調べられませんでした（電波を確かめてください）。' : 'このコードの医療用医薬品が見つかりませんでした。'}下の検索を使ってください。</WarningRow>
          ) : scanned.items.length ? (
            <>
              {!scanned.exact && <div class="row small sub">この製品と同じ成分の品目です（販売名の一致する品目はありません）。</div>}
              {scanned.items.map((i) => (
                <MatButtons i={i} withName onMore={() => nav.push(<RmpDetailPage id={i.id} />)} />
              ))}
            </>
          ) : (
            <div class="row">この製品には患者向けのRMP資材がありません。</div>
          )}
        </Section>
      )}
      <label class="search" style={{ marginTop: '18px' }}>
        <Search size={18} />
        <input type="search" placeholder="販売名・一般名・会社名・効能で検索（ひらがな可）" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      <Section>
        <Toggle label={`登録品目のみ（${favs.length}）`} value={onlyFav} onChange={(v) => onlyFavStore.set(v)} />
        {!onlyFav && <Toggle label="注射剤も表示" value={showInj} onChange={(v) => injStore.set(v)} />}
        {!onlyFav && <Toggle label="抗悪性腫瘍薬も表示" value={showOnc} onChange={(v) => oncStore.set(v)} />}
      </Section>
      <Section header={d ? `${list.length}品目` : undefined}>
        {!d ? (
          <div class="row sub">読み込んでいます…</div>
        ) : list.length ? (
          list.map((i) => <ItemRow i={i} />)
        ) : (
          <div class="row sub">{onlyFav && !favs.length ? 'まだ登録した品目がありません。品目の画面で「登録」を押してください。' : '条件に合う品目がありません。'}</div>
        )}
      </Section>
      {d && (
        <Section
          footer={`出典：PMDA「RMP提出品目一覧」（${d.fetched}取得）から、患者向けのRMP資材がある品目をまとめた物です（PMDA が提供・監修する物ではありません）。資材は随時改訂されるので、使う前にリンク先の最新版を確かめてください。`}
        >
          <ButtonRow onClick={() => openExternal('https://www.pmda.go.jp/safety/info-services/drugs/items-information/rmp/0001.html')}>PMDA の RMP提出品目一覧を開く</ButtonRow>
        </Section>
      )}
    </Page>
  )
}

const SCOPE_CLASS: Record<string, string> = { 対象: 'in', 対象外: 'out' }

/** 品目ごとの画面：効能・患者向け資材（PDF）・RMP本体 */
export function RmpDetailPage({ id }: { id: string }) {
  const d = useRmp()
  const favs = useStore(favStore)
  const i = d?.items.find((x) => x.id === id)
  if (!d || !i) {
    return (
      <Page title="RMP資材">
        <Section>
          <div class="row sub">{d ? '見つかりませんでした' : '読み込んでいます…'}</div>
        </Section>
      </Page>
    )
  }
  const on = favs.includes(i.id)
  return (
    <Page title="RMP資材">
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{i.label}</b>
          <span class="rmp-tags">
            <Tags i={i} />
          </span>
          <span class="small">{i.generic}</span>
          <span class="small sub">
            {i.company}・RMP提出 {i.date}
          </span>
        </div>
        <ButtonRow icon={<Star size={20} class={on ? 'rmp-star-on' : ''} />} onClick={() => favStore.set(on ? favs.filter((x) => x !== i.id) : [...favs, i.id])}>
          {on ? '登録済み（押すと解除）' : '登録する（「登録品目のみ」で表示）'}
        </ButtonRow>
      </Section>
      <Section header="効能（添付文書の要約）" footer="用法や対象の条件は省略しています。正確な内容は添付文書で確かめてください。">
        <div class="row" style={{ display: 'block' }}>
          {i.ind}
        </div>
        {i.bySpec.map(([s, t]) => (
          <div class="row small" style={{ display: 'block' }}>
            <b>{s}</b>：{t}
          </div>
        ))}
      </Section>
      <Section header={`患者向け資材（${i.mats.length}件・PDF）`}>
        {i.mats.map((m) => (
          <button class="row otc-row" onClick={() => openExternal(m.url)}>
            <span class="otc-main">
              <span>
                <FileText size={16} class="rmp-pdf" /> {m.title}
              </span>
              {m.scope?.map(([k, v]) => (
                <span class={'small rmp-scope ' + (SCOPE_CLASS[k] ?? 'part')}>
                  <b>RMP{k}</b> {v}
                </span>
              ))}
            </span>
            <ChevronRight size={18} class="chev" />
          </button>
        ))}
      </Section>
      <Section>
        <ButtonRow onClick={() => openExternal(i.pageUrl)}>PMDA 品目ページ（添付文書・医療従事者向け資材）</ButtonRow>
      </Section>
    </Page>
  )
}
