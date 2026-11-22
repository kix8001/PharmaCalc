// 刻印（識別コード）・色・形で錠剤を探す（錠剤の鑑別）。データは info.json の i（識別コード）・k（色）・m（剤形）・z（大きさ）・h（形）
import { useEffect, useState } from 'preact/hooks'
import { Search } from 'lucide-preact'
import { ButtonRow, Page, Section, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { loadOtc, productName, type OtcData } from '../otc/otcData'
import { figUrls, loadInfo, type InfoItem } from './info'
import { ScanSummary } from './summary'
import { PMDA } from './gs1'

/** 色の分け方（添付文書の「色調」の文にこの文字があれば、その色とみなす。「白色～微黄色」は白と黄の両方） */
const COLORS: [string, string, RegExp][] = [
  ['白', '#ffffff', /白/],
  ['黄', '#f5d742', /黄|クリーム/],
  ['橙', '#f39a3c', /だいだい|橙|オレンジ/],
  ['赤・桃', '#ef6b7b', /赤|紅|桃|ピンク|朱/],
  ['紫', '#9b6bd1', /紫/],
  ['青', '#4a8be0', /青|水色|空色/],
  ['緑', '#4cb36b', /緑/],
  ['茶', '#9a6a3a', /褐|茶|かっ/],
  ['灰・黒', '#7d7d82', /灰|黒|グレー/],
]
const SHAPES: [string, string][] = [
  ['r', '丸い'],
  ['o', '楕円・長い'],
  ['c', 'カプセル'],
]

/** 照合用：全角→半角、大文字、空白・記号を除く */
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-‐・/／.,:：()（）「」]/g, '')
    // ひらがなはカタカナに（製品名で探すとき用）
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

interface Hit {
  yj: string
  name: string
  info: InfoItem
  /** 刻印のデータが無く、製品名で当たった物 */
  byName?: boolean
}

export function IdentPage() {
  const nav = useNav()
  const [data, setData] = useState<{ otc: OtcData; items: Record<string, InfoItem> } | null>(null)
  const [code, setCode] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [shape, setShape] = useState('')
  const [score, setScore] = useState(false)
  const [noCode, setNoCode] = useState(false)
  const [size, setSize] = useState('')
  useEffect(() => {
    Promise.all([loadOtc(), loadInfo()]).then(([otc, inf]) => setData({ otc, items: inf.items }))
  }, [])

  const q = norm(code)
  // 大きさ（直径・長径、mm）。±0.5mm で当てる
  const mm = parseFloat(size.normalize('NFKC'))
  const active = q.length > 0 || colors.length > 0 || !!shape || score || noCode || mm > 0
  let hits: Hit[] = []
  let total = 0
  if (data && active) {
    const cs = COLORS.filter(([n]) => colors.includes(n))
    for (const [yj, it] of Object.entries(data.items)) {
      if (!data.otc.names[yj]) continue
      // 刻印のデータが無い薬（刻印が写真・図の中だけ）は製品名でも探す（錠剤に製品名が印字されていることが多い）
      const byName = !!q && !it.i && q.length >= 2 && norm(data.otc.names[yj]).includes(q)
      if (q && !(it.i && norm(it.i).includes(q)) && !byName) continue
      if (cs.length && !(it.k && cs.some(([, , re]) => re.test(it.k!)))) continue
      if (shape && it.h !== shape) continue
      if (score && !(it.m && /割線/.test(it.m))) continue
      // 刻印なし：識別コードの欄が「なし」の物と、刻印の文字のデータが無い物（図・写真だけの物も含む）
      if (noCode && (it.i || !(it.h || /錠|カプセル/.test(it.m ?? '')))) continue
      if (mm > 0) {
        const z = parseFloat((it.z ?? '').replace(/^[^0-9]*/, ''))
        if (!(Math.abs(z - mm) <= 0.5)) continue
      }
      if (!q && !it.i && !it.k && !it.h) continue
      total++
      hits.push({ yj, name: productName(data.otc, yj), info: it, byName })
    }
    // 刻印が「ちょうど同じ」物を先に、刻印で当たった物、製品名で当たった物の順。その中は名前の順
    const rank = (h: Hit) => (q && norm(h.info.i ?? '') === q ? 0 : h.byName ? 2 : noCode && !h.info.n ? 1.5 : 1)
    hits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ja'))
    hits = hits.slice(0, 60)
  }
  const toggle = (c: string) => setColors((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))
  const open = (h: Hit) =>
    nav.push(
      <Page title="刻印・外観で探した結果">
        <Section>
          <ScanSummary yj={[h.yj]} memo={h.name} detail="刻印・外観で探した結果" />
        </Section>
      </Page>,
    )

  return (
    <Page title="刻印・外観で探す">
      <Section header="刻印・識別コード" footer="錠剤やカプセルに書いてある文字・数字（例：SW F20、601、BA100）。空白やハイフンは無くても探せます。刻印のデータが無い薬は製品名（カタカナ・ひらがな可）でも探します。">
        <div class="row name-search">
          <Search size={18} class="sub" />
          <input class="text-input" type="search" autocomplete="off" autocapitalize="characters" placeholder="刻印の文字・数字" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        </div>
      </Section>
      <Section header="色（いくつでも）">
        <div class="row ident-chips">
          {COLORS.map(([n, c]) => (
            <button class={'ident-chip' + (colors.includes(n) ? ' on' : '')} onClick={() => toggle(n)}>
              <span class="ident-dot" style={{ background: c }} />
              {n}
            </button>
          ))}
        </div>
      </Section>
      <Section header="形">
        <div class="row ident-chips">
          {SHAPES.map(([k, n]) => (
            <button class={'ident-chip' + (shape === k ? ' on' : '')} onClick={() => setShape(shape === k ? '' : k)}>
              {n}
            </button>
          ))}
          <button class={'ident-chip' + (score ? ' on' : '')} onClick={() => setScore(!score)}>
            割線あり
          </button>
          <button class={'ident-chip' + (noCode ? ' on' : '')} onClick={() => setNoCode(!noCode)}>
            刻印なし
          </button>
        </div>
      </Section>
      <Section header="大きさ（直径・長径）" footer="ものさしで測った長さ（mm）。±0.5mm の物を出します。">
        <div class="row name-search">
          <input class="text-input" type="text" inputMode="decimal" autocomplete="off" placeholder="例：7.5" value={size} onInput={(e) => setSize((e.target as HTMLInputElement).value)} />
          <span class="sub">mm</span>
        </div>
      </Section>
      {!data && active && (
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      )}
      {data && active && (
        <Section
          header={total > hits.length ? `${total}件（はじめの${hits.length}件）` : `${total}件`}
          footer="刻印・色・形は添付文書の「性状」の文から探しています。「刻印なし」は、添付文書に識別コード「なし」とある薬（先に並べる）と、刻印の文字のデータが無い薬（図・写真の中には刻印や印字があることも）を出します。刻印が図・写真の中にしか無い薬は、刻印の英数字では見つかりません（錠剤に印字された製品名なら探せます）。そのときは色・形で絞るか、PMDA の医薬品検索で探してください。"
        >
          {hits.map((h) => (
            <button class="row ident-hit" onClick={() => open(h)}>
              <span class="ident-fig">
                {figUrls(h.info.f)[0] && <img src={figUrls(h.info.f)[0]} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
              </span>
              <span class="ident-txt">
                <b>{h.name}</b>
                <span class="small sub">{[h.info.i && `刻印 ${h.info.i}`, h.byName && '製品名で一致（刻印は図・写真のみ）', h.info.n && '刻印なし', h.info.k, h.info.z].filter(Boolean).join('・')}</span>
              </span>
            </button>
          ))}
          {total === 0 && <div class="row sub">見つかりませんでした。</div>}
          <ButtonRow icon={<Search size={20} />} onClick={() => openExternal(PMDA.searchURL)}>
            PMDA の医薬品検索で探す
          </ButtonRow>
        </Section>
      )}
    </Page>
  )
}
