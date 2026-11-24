import { useState } from 'preact/hooks'
import { CirclePlus, FileText, Search, Star, Trash2 } from 'lucide-preact'
import { ButtonRow, NumField, Page, Section, Segmented, SelectRow, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { persistedStore, useStore } from '../core/store'
import { ageV, patientStore, setPatient, weightV } from '../core/patient'
import { fmtTrim, matchesSearch, parseIntNum, parseNum } from '../core/format'
import {
  amountOf,
  basisLabel,
  categoriesOf,
  compute,
  errorMessage,
  newId,
  pedStore,
  pmdaURL,
  presetDrugs,
  range,
  unitOf,
  type AgeBand,
  type DoseBasis,
  type PedDrug,
} from './pedDrug'

/** ☆をつけた薬（薬の名前。初期登録の薬が新しい値に入れ替わっても残るよう、id ではなく名前で持つ） */
const pedFavorites = persistedStore<string[]>('pedFavorites', [])
const pedFavOnly = persistedStore<boolean>('pedFavOnly', false)
const toggleFav = (name: string) => pedFavorites.set((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))

/** 小児用量（薬剤別）：年齢・体重から登録した薬の用量を一覧で出す */
export function PedDosePage() {
  const p = useStore(patientStore)
  const drugs = useStore(pedStore)
  const nav = useNav()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const favs = useStore(pedFavorites)
  const favOnly = useStore(pedFavOnly)
  const favSet = new Set(favs)
  const cats = categoriesOf(drugs)
  const age = ageV(p), w = weightV(p)
  return (
    <Page title="小児用量（薬剤別）">
      <Section header="患者情報（共通）" footer="1歳未満は「か月」だけ入れてください（例：6か月 → 年齢は空欄、か月に6）。1歳6か月なら 1歳＋6か月。">
        <NumField title="年齢" value={p.age} onChange={(v) => setPatient('age', v)} unit="歳" />
        <NumField title="＋か月（1歳未満など）" value={p.months} onChange={(v) => setPatient('months', v)} unit="か月" />
        <NumField title="体重" value={p.weight} onChange={(v) => setPatient('weight', v)} unit="kg" />
      </Section>
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="薬の名前・成分で絞り込む" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      <div class="row quick" style={{ padding: '10px 0 0' }}>
        <button class={'chip ' + (favOnly ? 'on' : '')} onClick={() => pedFavOnly.set(!favOnly)}>
          ★ だけ（{favs.length}）
        </button>
        <button class={'chip ' + (category == null ? 'on' : '')} onClick={() => setCategory(null)}>
          すべて
        </button>
        {cats.map((c) => (
          <button class={'chip ' + (category === c ? 'on' : '')} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      {cats
        .filter((c) => category == null || c === category)
        .map((c) => {
          const list = drugs.filter((d) => (d.category ?? '自分で追加') === c && matchesSearch(d.name + d.ingredient, query) && (!favOnly || favSet.has(d.name)))
          if (list.length === 0) return null
          return (
            <Section header={c}>
              {list.map((d) => (
                <PedDrugRow drug={d} age={age} weight={w} fav={favSet.has(d.name)} onOpen={() => nav.push(<PedDrugEditPage id={d.id} />)} />
              ))}
            </Section>
          )
        })}
      {favOnly && !drugs.some((d) => favSet.has(d.name)) && (
        <Section>
          <div class="row sub">☆をつけた薬はまだありません。「★ だけ」を外して、薬の右の☆を押してください。</div>
        </Section>
      )}
      <Section footer="初期登録は PMDA の電子添文（2026年11月）の用法及び用量と照合しています。適応症で用量が違う薬もあるので、迷ったら「添付文書」で確認してください。「用量未登録」の薬は、タップして用量を入れられます。">
        <ButtonRow icon={<CirclePlus size={20} />} onClick={() => nav.push(<PedDrugEditPage id={null} />)}>
          薬を追加
        </ButtonRow>
        <ButtonRow
          danger
          onClick={() => {
            if (confirm('初期の薬に戻しますか？自分で追加・編集した薬は消えます。')) pedStore.set(presetDrugs())
          }}
        >
          初期の薬に戻す
        </ButtonRow>
      </Section>
    </Page>
  )
}

function PedDrugRow({ drug, age, weight, fav, onOpen }: { drug: PedDrug; age: number | null; weight: number | null; fav: boolean; onOpen: () => void }) {
  const r = compute(drug, age, weight)
  const a = amountOf(drug), u = unitOf(drug), dg = drug.isSyrup ? 1 : 2, ad = a === 'μg' ? 1 : 2
  const url = pmdaURL(drug)
  return (
    <div class="row ped-row">
      <button class="ped-main" onClick={onOpen}>
        <div class="ped-name">
          <b>{drug.name}</b>
          {drug.ingredient && <span class="small sub"> {drug.ingredient}</span>}
        </div>
        {typeof r === 'object' ? (
          <>
            {r.bandLabel && <div class="small sub" style={{ fontWeight: 600 }}>{r.bandLabel}の用量</div>}
            {drug.conc > 0 ? (
              <>
                <div class="num" style={{ color: 'var(--accent)' }}>
                  1日 {range(r.dailyLo, r.dailyHi, ad)}
                  {a} → {range(r.dailyLo / drug.conc, r.dailyHi / drug.conc, dg)}
                  {u}
                </div>
                <div class="num" style={{ color: 'var(--orange)' }}>
                  1回 {range(r.doseLo, r.doseHi, ad)}
                  {a} → {range(r.doseLo / drug.conc, r.doseHi / drug.conc, dg)}
                  {u}（1日{r.times}回）
                </div>
              </>
            ) : (
              <>
                <div class="num" style={{ color: 'var(--accent)' }}>
                  1日 {range(r.dailyLo, r.dailyHi, ad)}
                  {a}
                </div>
                <div class="num" style={{ color: 'var(--orange)' }}>
                  1回 {range(r.doseLo, r.doseHi, ad)}
                  {a}（1日{r.times}回）
                </div>
              </>
            )}
            {r.capped && <div class="small" style={{ color: 'var(--orange)' }}>上限で頭打ちにしています</div>}
          </>
        ) : r === 'memo' ? (
          drug.note.includes('添付文書で用量を確認') && <div class="small" style={{ color: 'var(--orange)', fontWeight: 700 }}>用量未登録</div>
        ) : (
          <div class="sub">{errorMessage[r]}</div>
        )}
        {drug.note && <div class="small sub">{drug.note}</div>}
      </button>
      <button class={'star ped-star ' + (fav ? 'on' : '')} aria-label={fav ? 'よく使う薬から外す' : 'よく使う薬に登録'} aria-pressed={fav} onClick={() => toggleFav(drug.name)}>
        <Star size={22} fill={fav ? 'currentColor' : 'none'} />
      </button>
      {url && (
        <button class="ped-doc" aria-label={`${drug.name}の添付文書を見る（PMDA）`} onClick={() => openExternal(url)}>
          <FileText size={20} />
          <span>添付文書</span>
        </button>
      )}
    </div>
  )
}

interface BandText {
  key: number
  below: string
  min: string
  max: string
  times: string
  perKg: boolean
  perDose: boolean
}
let bandSeq = 0
const blankBand = (): BandText => ({ key: ++bandSeq, below: '', min: '', max: '', times: '', perKg: false, perDose: false })

type Form3 = 'powder' | 'syrup' | 'other'

/** 薬の追加・編集 */
export function PedDrugEditPage({ id }: { id: string | null }) {
  const nav = useNav()
  const original = id ? pedStore.get().find((d) => d.id === id) ?? null : null
  const o = original
  const [name, setName] = useState(o?.name ?? '')
  const [ingredient, setIngredient] = useState(o?.ingredient ?? '')
  const [category, setCategory] = useState(o?.category ?? '')
  const [form, setForm] = useState<Form3>(o?.formUnit != null ? 'other' : o?.isSyrup ? 'syrup' : 'powder')
  const [formUnit, setFormUnit] = useState(o?.formUnit ?? '錠')
  const [microgram, setMicrogram] = useState(o?.amountUnit === 'μg')
  const [conc, setConc] = useState(o && o.conc > 0 ? fmtTrim(o.conc, 3).replace(/,/g, '') : '')
  const [basis, setBasis] = useState<DoseBasis>(o?.basis ?? 'day')
  const [minPerKg, setMinPerKg] = useState(o && o.minPerKg > 0 ? String(o.minPerKg) : '')
  const [maxPerKg, setMaxPerKg] = useState(o && o.maxPerKg > 0 ? String(o.maxPerKg) : '')
  const [times, setTimes] = useState(String(o?.times ?? 3))
  const [maxDose, setMaxDose] = useState(o?.maxDoseMg != null ? String(o.maxDoseMg) : '')
  const [maxDaily, setMaxDaily] = useState(o?.maxDailyMg != null ? String(o.maxDailyMg) : '')
  const [maxDailyPerKg, setMaxDailyPerKg] = useState(o?.maxDailyPerKg != null ? String(o.maxDailyPerKg) : '')
  const [note, setNote] = useState(o?.note ?? '')
  const [bands, setBands] = useState<BandText[]>(() => {
    const l = (o?.bands ?? []).map((b) => ({
      key: ++bandSeq,
      below: String(b.below),
      min: String(b.min),
      max: String(b.max),
      times: b.times != null ? String(b.times) : '',
      perKg: !!b.perKg,
      perDose: !!b.perDose,
    }))
    return l.length ? l : [blankBand()]
  })
  const au = microgram ? 'μg' : 'mg'
  const setBand = (k: number, patch: Partial<BandText>) => setBands((bs) => bs.map((b) => (b.key === k ? { ...b, ...patch } : b)))

  const built = ((): PedDrug | null => {
    const t = parseIntNum(times)
    if (name.trim() === '' || t == null || t <= 0) return null
    const d: PedDrug = {
      id: o?.id ?? newId(),
      name: name.trim(),
      ingredient: ingredient.trim(),
      isSyrup: form === 'syrup',
      conc: Math.max(0, parseNum(conc) ?? 0),
      basis,
      minPerKg: 0,
      maxPerKg: 0,
      times: t,
      bands: [],
      note: note.trim(),
      category: category.trim() === '' ? undefined : category.trim(),
      formUnit: form === 'other' ? formUnit.trim() : undefined,
      amountUnit: microgram ? 'μg' : undefined,
      pmda: o?.pmda,
    }
    if (basis === 'day' || basis === 'dose') {
      const lo = parseNum(minPerKg)
      if (lo == null || lo <= 0) return null
      d.minPerKg = lo
      d.maxPerKg = Math.max(lo, parseNum(maxPerKg) ?? lo)
    } else if (basis === 'age' || basis === 'weight') {
      const list: AgeBand[] = []
      for (const b of bands) {
        const bl = parseNum(b.below)
        if (bl == null || bl <= 0) continue
        const lo = parseNum(b.min) ?? 0
        const bt = parseIntNum(b.times)
        list.push({ below: bl, min: lo, max: Math.max(lo, parseNum(b.max) ?? lo), times: bt != null && bt > 0 ? bt : undefined, perKg: b.perKg || undefined, perDose: b.perDose || undefined })
      }
      if (list.length === 0) return null
      d.bands = list
    }
    const pos = (s: string) => {
      const v = parseNum(s)
      return v != null && v > 0 ? v : undefined
    }
    d.maxDoseMg = pos(maxDose)
    d.maxDailyMg = pos(maxDaily)
    d.maxDailyPerKg = pos(maxDailyPerKg)
    return d
  })()

  const save = () => {
    if (!built) return
    pedStore.set((list) => (list.some((x) => x.id === built.id) ? list.map((x) => (x.id === built.id ? built : x)) : [...list, built]))
    nav.back()
  }
  const per = form === 'powder' ? 'g' : form === 'syrup' ? 'mL' : formUnit
  const url = o ? pmdaURL(o) : null

  return (
    <Page
      title={o ? '薬を編集' : '薬を追加'}
      right={
        <button class="bar-btn strong" disabled={!built} onClick={save}>
          保存
        </button>
      }
    >
      <Section>
        <div class="row">
          <input class="text-input" placeholder="薬の名前（例：ムコダインDS50%）" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </div>
        <div class="row">
          <input class="text-input" placeholder="成分名（任意）" value={ingredient} onInput={(e) => setIngredient((e.target as HTMLInputElement).value)} />
        </div>
        <div class="row">
          <input class="text-input" placeholder="分類（任意、例：抗菌薬）" value={category} onInput={(e) => setCategory((e.target as HTMLInputElement).value)} />
        </div>
      </Section>
      <Section header="剤形" footer="例：50%散 → 500mg、10%DS → 100mg、5%シロップ → 50mg（1mLあたり）。0や空欄なら製剤量は出さず、成分量だけ出します。">
        <Segmented<Form3>
          label="剤形"
          options={[
            ['powder', '散・DS（g）'],
            ['syrup', 'シロップ（mL）'],
            ['other', 'その他'],
          ]}
          value={form}
          onChange={setForm}
        />
        {form === 'other' && (
          <div class="row">
            <input class="text-input" placeholder="単位（錠・包・個・枚など）" value={formUnit} onInput={(e) => setFormUnit((e.target as HTMLInputElement).value)} />
          </div>
        )}
        <Segmented<boolean>
          label="成分量の単位"
          options={[
            [false, 'mg'],
            [true, 'μg'],
          ]}
          value={microgram}
          onChange={setMicrogram}
        />
        <NumField title={`1${per}あたりの成分量`} value={conc} onChange={setConc} unit={au} />
      </Section>
      <Section header="用量">
        <SelectRow<DoseBasis> label="決め方" options={(Object.keys(basisLabel) as DoseBasis[]).map((b) => [b, basisLabel[b]])} value={basis} onChange={setBasis} />
        {(basis === 'age' || basis === 'weight') && (
          <>
            {bands.map((b) => {
              const k = basis === 'age' ? '歳' : 'kg'
              return (
                <div class="row band">
                  <div class="band-line">
                    <input class="band-in" inputMode="decimal" placeholder={k} value={b.below} onInput={(e) => setBand(b.key, { below: (e.target as HTMLInputElement).value })} aria-label={`${k}未満`} />
                    <span class="small">{k}未満</span>
                    <input class="band-in grow" inputMode="decimal" placeholder="最小" value={b.min} onInput={(e) => setBand(b.key, { min: (e.target as HTMLInputElement).value })} aria-label="最小" />
                    <span>〜</span>
                    <input class="band-in grow" inputMode="decimal" placeholder="最大" value={b.max} onInput={(e) => setBand(b.key, { max: (e.target as HTMLInputElement).value })} aria-label="最大" />
                    <span class="small">
                      {au}
                      {b.perKg ? '/kg' : ''}/{b.perDose ? '回' : '日'}
                    </span>
                    <button class="band-del" aria-label="この区切りを消す" onClick={() => setBands((bs) => bs.filter((x) => x.key !== b.key))}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <label class="band-opt">
                    <input type="checkbox" checked={b.perKg} onChange={(e) => setBand(b.key, { perKg: (e.target as HTMLInputElement).checked })} /> 体重1kgあたりの量
                  </label>
                  <label class="band-opt">
                    <input type="checkbox" checked={b.perDose} onChange={(e) => setBand(b.key, { perDose: (e.target as HTMLInputElement).checked })} /> 1回量で入れる（オフなら1日量）
                  </label>
                  <label class="band-opt">
                    この範囲の1日の回数（任意）
                    <input class="band-in" inputMode="numeric" placeholder="回" value={b.times} onInput={(e) => setBand(b.key, { times: (e.target as HTMLInputElement).value })} />
                  </label>
                </div>
              )
            })}
            <ButtonRow onClick={() => setBands((bs) => [...bs, blankBand()])}>区切りを追加</ButtonRow>
            <div class="row small sub">
              最小・最大を0にすると「用量の記載なし」と表示します（対象年齢外など）。{basis === 'age' ? '1歳未満の区切りは小数で（6か月 → 0.5、3か月 → 0.25）。' : ''}
            </div>
          </>
        )}
        {(basis === 'day' || basis === 'dose') && (
          <>
            <NumField title="最小" value={minPerKg} onChange={setMinPerKg} unit={basis === 'day' ? `${au}/kg/日` : `${au}/kg/回`} />
            <NumField title="最大（任意）" value={maxPerKg} onChange={setMaxPerKg} unit={basis === 'day' ? `${au}/kg/日` : `${au}/kg/回`} />
          </>
        )}
        {basis === 'memo' && <div class="row small sub">用量は計算せず、メモだけ表示します。</div>}
        <NumField title="1日の回数" value={times} onChange={setTimes} unit="回" integer />
      </Section>
      {basis !== 'memo' && (
        <Section header="上限（任意）">
          <NumField title="1回の上限" value={maxDose} onChange={setMaxDose} unit={au} />
          <NumField title="1日の上限" value={maxDaily} onChange={setMaxDaily} unit={au} />
          <NumField title="1日の上限（体重あたり）" value={maxDailyPerKg} onChange={setMaxDailyPerKg} unit={`${au}/kg`} />
        </Section>
      )}
      <Section header="メモ">
        <div class="row">
          <textarea class="text-input" rows={3} placeholder="用法の注意など" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        </div>
      </Section>
      {url && (
        <Section footer="同じ成分の製品の一覧が開きます。目的の製品の「HTML」か「PDF」を選んでください。">
          <ButtonRow icon={<FileText size={20} />} onClick={() => openExternal(url)}>
            添付文書を見る（PMDA）
          </ButtonRow>
        </Section>
      )}
      <Section>
        <button class="primary-btn" disabled={!built} onClick={save} style={{ opacity: built ? 1 : 0.4 }}>
          保存
        </button>
      </Section>
      {o && (
        <Section>
          <ButtonRow
            danger
            onClick={() => {
              if (!confirm(`「${o.name}」を削除しますか？`)) return
              pedStore.set((l) => l.filter((x) => x.id !== o.id))
              nav.back()
            }}
          >
            この薬を削除
          </ButtonRow>
        </Section>
      )}
    </Page>
  )
}
