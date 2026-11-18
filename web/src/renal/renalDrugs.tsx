import { useEffect, useState } from 'preact/hooks'
import { FileText, Search, Star } from 'lucide-preact'
import { ButtonRow, MissingRow, Page, ResultRow, Section, Segmented, SelectRow } from '../ui/components'
import { useNav } from '../ui/nav'
import { persistedStore, useStore } from '../core/store'
import { ageV, heightV, patientStore, scrV, weightV } from '../core/patient'
import { BodyCalc, Renal } from '../core/formulas'
import { fmt, searchKey } from '../core/format'
import { openExternal } from '../ui/components'

/** 腎機能で用量調節・禁忌がある薬（data/renal_drugs.json。添付文書の該当箇所をそのまま載せる） */
export interface RenalDrug {
  category: string
  name: string
  products: string
  generic: string
  pmda?: string
  excerpts: { section: string; text: string }[]
  /** 添付文書に腎機能の数値の基準が無い（腎機能に触れた記載だけ） */
  noNumbers?: boolean
  /** 同じ成分のほかの先発品の販売名（検索用） */
  aliases?: string
}

interface Data {
  source: string
  drugs: RenalDrug[]
  keys: Map<RenalDrug, string>
  categories: string[]
}

const drugId = (d: RenalDrug) => (d.pmda ?? '') + '|' + d.name
const renalURL = (d: RenalDrug) => (d.pmda ? `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${d.pmda}` : null)

let dataPromise: Promise<Data> | null = null
/** 1,000件以上あるので、開いたときに1回だけ読み込んで検索用の文字列も作っておく */
function loadData(): Promise<Data> {
  dataPromise ??= import('../../../data/renal_drugs.json').then((m) => {
    const f = (m.default ?? m) as unknown as { source: string; drugs: RenalDrug[] }
    const keys = new Map<RenalDrug, string>()
    const categories: string[] = []
    for (const d of f.drugs) {
      keys.set(d, searchKey(d.name + d.products + d.generic + (d.aliases ?? '')))
      if (!categories.includes(d.category)) categories.push(d.category)
    }
    return { source: f.source, drugs: f.drugs, keys, categories }
  })
  return dataPromise
}

function useRenalData() {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    let alive = true
    loadData().then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [])
  return data
}

/** よく使う薬（このブラウザに保存。成分ごとの ID） */
export const renalFavorites = persistedStore<string[]>('renalFavorites', [])
function toggleFavorite(id: string) {
  renalFavorites.set((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].sort()))
}

/** 患者情報から出した腎機能 */
function PatientRenalSummary() {
  const p = useStore(patientStore)
  const age = ageV(p), w = weightV(p), h = heightV(p), cr = scrV(p)
  if (age == null || cr == null || age <= 0 || cr <= 0) return <MissingRow>腎機能の画面で年齢・体重・血清Crを入れると、ここに表示します</MissingRow>
  const e = Renal.egfrCr(age, cr, p.sex)
  return (
    <>
      {w != null && w > 0 && <ResultRow title="CCr（実体重）" value={fmt(Renal.cockcroftGault(age, w, cr, p.sex))} unit="mL/min" />}
      <ResultRow title="eGFR" value={fmt(e)} unit="mL/min/1.73m²" big={false} />
      {w != null && h != null && w > 0 && h > 0 && <ResultRow title="eGFR（体表面積未補正）" value={fmt(Renal.deindex(e, BodyCalc.bsaDuBois(w, h)))} unit="mL/min" big={false} />}
    </>
  )
}

function badge(s: string) {
  switch (s) {
    case '禁忌':
      return '禁忌'
    case '用法及び用量':
      return '用量'
    case '用法及び用量に関連する注意':
      return '用量の注意'
    case '効能又は効果に関連する注意':
      return '効能の注意'
    case '重要な基本的注意':
      return '重要な注意'
    case '9.2 腎機能障害患者':
      return '腎機能障害'
    case '警告':
      return '警告'
    default:
      return '薬物動態（参考）'
  }
}
const isAlert = (s: string) => s === '禁忌' || s === '警告'

function DrugRow({ d, fav }: { d: RenalDrug; fav: boolean }) {
  const nav = useNav()
  const sections = Array.from(new Set(d.excerpts.map((e) => e.section))).sort()
  return (
    <div class="row renal-row">
      <button class="renal-main" onClick={() => nav.push(<RenalDrugDetailPage drug={d} />)}>
        <b>{d.name}</b>
        <span class="small sub">{d.generic}</span>
        {d.excerpts
          .filter((e) => e.section === '禁忌')
          .map((e) => (
            <span class="small red clamp2">禁忌：{e.text.replace(/\n/g, ' ')}</span>
          ))}
        <span class="badges">
          {d.noNumbers && <span class="badge gray">数値の基準なし</span>}
          {sections.map((s) => (
            <span class={'badge ' + (isAlert(s) ? 'alert' : '')}>{badge(s)}</span>
          ))}
        </span>
      </button>
      <button class={'star ' + (fav ? 'on' : '')} aria-label={fav ? 'よく使う薬から外す' : 'よく使う薬に登録'} aria-pressed={fav} onClick={() => toggleFavorite(drugId(d))}>
        <Star size={22} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

export function RenalDrugsPage() {
  const data = useRenalData()
  const favs = useStore(renalFavorites)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [filter, setFilter] = useState(0) // 0: すべて, 1: 禁忌・警告あり, 2: 数値の基準あり
  const [limit, setLimit] = useState(60)
  useEffect(() => setLimit(60), [query, category, filter])

  if (!data) {
    return (
      <Page title="腎機能で注意する薬">
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      </Page>
    )
  }
  const q = searchKey(query.trim())
  const matches = (d: RenalDrug) =>
    (q === '' || (data.keys.get(d) ?? '').includes(q)) &&
    (filter !== 1 || d.excerpts.some((e) => isAlert(e.section))) &&
    (filter !== 2 || d.noNumbers !== true)
  const favSet = new Set(favs)
  const favList = data.drugs.filter((d) => favSet.has(drugId(d)) && matches(d))
  // 件数が多いので、少しずつ表示する
  let shown = 0
  const groups = data.categories
    .filter((c) => category === '' || c === category)
    .map((c) => {
      if (shown >= limit) return null
      const list = data.drugs.filter((d) => d.category === c && matches(d))
      if (list.length === 0) return null
      const part = list.slice(0, limit - shown)
      shown += part.length
      return { c, part }
    })
    .filter((x) => x != null)
  const total = data.drugs.filter((d) => (category === '' || d.category === category) && matches(d)).length

  return (
    <Page title="腎機能で注意する薬">
      <Section header="この患者の腎機能">
        <PatientRenalSummary />
      </Section>
      <label class="search" style={{ marginTop: '18px' }}>
        <Search size={18} />
        <input type="search" placeholder="薬の名前・成分で探す" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      <Section>
        <SelectRow<string> label="薬効分類" options={[['', 'すべて'], ...data.categories.map((c) => [c, c] as [string, string])]} value={category} onChange={setCategory} />
        <Segmented<number>
          label="絞り込み"
          options={[
            [0, 'すべて'],
            [1, '禁忌・警告あり'],
            [2, '数値の基準あり'],
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Section>
      {favList.length > 0 && (
        <Section header="よく使う薬">
          {favList.map((d) => (
            <DrugRow d={d} fav />
          ))}
        </Section>
      )}
      {groups.map((g) => (
        <Section header={g!.c}>
          {g!.part.map((d) => (
            <DrugRow d={d} fav={favSet.has(drugId(d))} />
          ))}
        </Section>
      ))}
      {total > shown && (
        <Section>
          <ButtonRow onClick={() => setLimit((l) => l + 200)}>さらに表示（残り{total - shown}件）</ButtonRow>
        </Section>
      )}
      {total === 0 && (
        <Section>
          <div class="row sub">見つかりませんでした</div>
        </Section>
      )}
      <Section
        footer={`${data.source}の「警告」「禁忌」「効能又は効果に関連する注意」「用法及び用量」「用法及び用量に関連する注意」「重要な基本的注意」のうち腎機能（CCr・eGFR・クレアチニン・腎・透析）に触れた項目と「9.2 腎機能障害患者」の全文を、文言を変えずに載せています。「16.6 薬物動態」は腎機能の数値があるものだけ参考として載せています。同じ成分でも製品によって記載が違うことがあるので、処方された製品の添付文書で確認してください。`}
      />
    </Page>
  )
}

export function RenalDrugDetailPage({ drug }: { drug: RenalDrug }) {
  const favs = useStore(renalFavorites)
  const fav = favs.includes(drugId(drug))
  const url = renalURL(drug)
  return (
    <Page
      title={drug.name}
      right={
        <button class={'bar-btn star ' + (fav ? 'on' : '')} aria-label={fav ? 'よく使う薬から外す' : 'よく使う薬に登録'} aria-pressed={fav} onClick={() => toggleFavorite(drugId(drug))}>
          <Star size={22} fill={fav ? 'currentColor' : 'none'} />
        </button>
      }
    >
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px', paddingTop: '10px', paddingBottom: '10px' }}>
          <span>{drug.products}</span>
          <span class="small sub">{drug.generic}</span>
        </div>
      </Section>
      <Section header="この患者の腎機能">
        <PatientRenalSummary />
      </Section>
      {drug.excerpts.map((e) => (
        <Section header={e.section}>
          <div class={'row excerpt ' + (isAlert(e.section) ? 'red' : '')}>{e.text}</div>
        </Section>
      ))}
      {url && (
        <Section footer="同じ成分の製品の一覧が開きます。処方された製品の添付文書を確認してください。">
          <ButtonRow icon={<FileText size={20} />} onClick={() => openExternal(url)}>
            添付文書を見る（PMDA）
          </ButtonRow>
        </Section>
      )}
    </Page>
  )
}
