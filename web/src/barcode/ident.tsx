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

interface Hit {
  yj: string
  name: string
  info: InfoItem
}

export function IdentPage() {
  const nav = useNav()
  const [data, setData] = useState<{ otc: OtcData; items: Record<string, InfoItem> } | null>(null)
  const [code, setCode] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [shape, setShape] = useState('')
  const [score, setScore] = useState(false)
  useEffect(() => {
    Promise.all([loadOtc(), loadInfo()]).then(([otc, inf]) => setData({ otc, items: inf.items }))
  }, [])

  const q = norm(code)
  const active = q.length > 0 || colors.length > 0 || !!shape || score
  let hits: Hit[] = []
  let total = 0
  if (data && active) {
    const cs = COLORS.filter(([n]) => colors.includes(n))
    for (const [yj, it] of Object.entries(data.items)) {
      if (!data.otc.names[yj]) continue
      if (q && !(it.i && norm(it.i).includes(q))) continue
      if (cs.length && !(it.k && cs.some(([, , re]) => re.test(it.k!)))) continue
      if (shape && it.h !== shape) continue
      if (score && !(it.m && /割線/.test(it.m))) continue
      if (!q && !it.i && !it.k && !it.h) continue
      total++
      if (hits.length < 60) hits.push({ yj, name: productName(data.otc, yj), info: it })
    }
    // 刻印が「ちょうど同じ」物を先に、そのあと名前の順
    hits.sort((a, b) => Number(q && norm(b.info.i ?? '') === q) - Number(q && norm(a.info.i ?? '') === q) || a.name.localeCompare(b.name, 'ja'))
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
      <Section header="刻印・識別コード" footer="錠剤やカプセルに書いてある文字・数字（例：SW F20、601、SANKYO 157）。空白やハイフンは無くても探せます。">
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
          footer="刻印・色・形は添付文書の「性状」の文から探しています。刻印が図の中にしか書かれていない薬（約6割）は、刻印では見つかりません。そのときは色・形で絞るか、PMDA の医薬品検索で探してください。"
        >
          {hits.map((h) => (
            <button class="row ident-hit" onClick={() => open(h)}>
              <span class="ident-fig">
                {figUrls(h.info.f)[0] && <img src={figUrls(h.info.f)[0]} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
              </span>
              <span class="ident-txt">
                <b>{h.name}</b>
                <span class="small sub">{[h.info.i && `刻印 ${h.info.i}`, h.info.k, h.info.z].filter(Boolean).join('・')}</span>
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
