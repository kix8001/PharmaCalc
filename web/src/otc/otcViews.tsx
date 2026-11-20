import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, Search } from 'lucide-preact'
import { ButtonRow, LabeledRow, NumField, Page, ResultRow, Section, WarningRow, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { fmtTrim, matchesSearch, parseNum } from '../core/format'
import { CameraBox, useCameraOn, useScanner } from '../barcode/scan'
import { parseGS1 } from '../barcode/gs1'
import {
  OTC_EXEMPTIONS,
  SENTEI_EXEMPTIONS,
  isTarget,
  loadOtc,
  lookupGtin,
  otcFee,
  productName,
  searchProducts,
  senteiBrands,
  senteiFee,
  unitOfSpec,
  type Kind,
  type Lookup,
  type OtcData,
} from './otcData'

function useOtc() {
  const [d, setD] = useState<OtcData | null>(null)
  useEffect(() => {
    let alive = true
    loadOtc().then((x) => alive && setD(x))
    return () => {
      alive = false
    }
  }, [])
  return d
}

/** 画面の名前・制度の説明（制度ごと） */
const KIND = {
  otc: {
    title: 'OTC類似薬チェック',
    short: 'OTC類似薬',
    yes: 'OTC類似薬（別途の負担の対象）',
    no: 'OTC類似薬ではない',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html',
    about:
      'OTC医薬品との代替性が特に高い医療用医薬品（OTC類似薬）を保険診療で使うと、令和9年3月1日から、薬剤費の4分の1を「別途の負担（特別の料金）」として患者さんが支払います。こども・がん治療・入院中などは対象外です。',
    search: '名前で探す（例：ロキソニン、ヘパリン類似物質）',
  },
  sentei: {
    title: '選定療養チェック',
    short: '選定療養',
    yes: '長期収載品（選定療養の対象）',
    no: '選定療養の対象ではない',
    url: 'https://www.mhlw.go.jp/stf/newpage_39830.html',
    about:
      '後発医薬品のある先発医薬品（長期収載品）を患者さんの希望で使うと、先発医薬品と後発医薬品（いちばん高いもの）の価格差の2分の1（令和8年6月から）を「特別の料金」として、消費税を加えて患者さんが支払います。医療上必要な場合・後発医薬品を提供できない場合・入院中は対象外です。',
    search: '名前で探す（例：ネキシウム、クレストール）',
  },
} as const

/** 判定の札：対象（オレンジ）／対象外 */
function Verdict({ kind, target }: { kind: Kind; target: boolean }) {
  return <span class={'otc-verdict ' + (target ? 'yes' : 'no')}>{target ? KIND[kind].yes : KIND[kind].no}</span>
}

/** 対象のときの価格の1行 */
function PriceLine({ d, kind, yj }: { d: OtcData; kind: Kind; yj: string }) {
  if (kind === 'otc') {
    const t = d.targets[yj]
    if (!t) return null
    return (
      <span class="small sub">
        {t.spec}・薬価 {fmtTrim(t.price, 2)}円 → 別途の負担 {fmtTrim(t.quarter, 2)}円／{unitOfSpec(t.spec)}
      </span>
    )
  }
  const t = d.sentei[yj]
  if (!t) return null
  return (
    <span class="small sub">
      {t.spec}・薬価 {fmtTrim(t.price, 2)}円・後発品 {fmtTrim(t.generic, 2)}円 → 特別の料金 {fmtTrim(t.half, 2)}円／{unitOfSpec(t.spec)}（税別）
    </span>
  )
}

/** 製品1つの行。押すと詳しい画面へ。kinds に並べた制度の判定を出す */
function ProductRow({ d, yj, kinds }: { d: OtcData; yj: string; kinds: Kind[] }) {
  const nav = useNav()
  // 詳しい画面は、対象になっている制度のほうを開く
  const open = kinds.find((k) => isTarget(d, k, yj)) ?? kinds[0]
  return (
    <button class="row otc-row" onClick={() => nav.push(<OtcDetailPage yj={yj} kind={open} />)}>
      <span class="otc-main">
        <b>{productName(d, yj)}</b>
        {kinds.map((k) => (
          <Verdict kind={k} target={isTarget(d, k, yj)} />
        ))}
        {kinds.map((k) => (
          <PriceLine d={d} kind={k} yj={yj} />
        ))}
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

/** 後発医薬品などを読んだとき：同じ成分・剤形・規格の長期収載品（選定療養の対象）を並べる */
function BrandRows({ d, yj }: { d: OtcData; yj: string }) {
  const nav = useNav()
  const brands = senteiBrands(d, yj)
  if (!brands.length) return null
  return (
    <>
      <div class="row small sub otc-brand-head">同じ成分・剤形・規格の先発医薬品（長期収載品）：患者さんの希望でこちらを使うと選定療養の対象</div>
      {brands.map((b) => (
        <button class="row otc-row otc-brand" onClick={() => nav.push(<OtcDetailPage yj={b} kind="sentei" />)}>
          <span class="otc-main">
            <b>{productName(d, b)}</b>
            <Verdict kind="sentei" target />
            <PriceLine d={d} kind="sentei" yj={b} />
          </span>
          <ChevronRight size={18} class="chev" />
        </button>
      ))}
    </>
  )
}

/** 調べた結果（製品が複数のこともある） */
function LookupResult({ d, r, kinds }: { d: OtcData; r: Lookup; kinds: Kind[] }) {
  if (r.kind === 'offline') return <WarningRow>この製品は端末の中の表に無く、PMDA にも問い合わせられませんでした。電波のあるところで読み直すか、下の「名前で探す」を使ってください。</WarningRow>
  if (r.kind === 'notFound') return <WarningRow>このコードの医療用医薬品が見つかりませんでした。下の「名前で探す」を使ってください。</WarningRow>
  return (
    <>
      {r.yj.length > 1 && <div class="row small sub">この添付文書には{r.yj.length}製品が載っています。手元の製品を確かめてください。</div>}
      {r.yj.map((y) => (
        <>
          <ProductRow d={d} yj={y} kinds={kinds} />
          {kinds.includes('sentei') && <BrandRows d={d} yj={y} />}
        </>
      ))}
    </>
  )
}

/** バーコード画面の読み取り結果に出す、OTC類似薬・選定療養の対象かどうか */
export function OtcBadge({ gtin }: { gtin: string }) {
  const d = useOtc()
  const [r, setR] = useState<Lookup | null>(null)
  useEffect(() => {
    setR(null)
    let alive = true
    lookupGtin(gtin).then((x) => alive && setR(x))
    return () => {
      alive = false
    }
  }, [gtin])
  if (!d || !r) return <div class="row small sub">OTC類似薬・選定療養の対象か調べています…</div>
  if (r.kind !== 'found') return <div class="row small sub">OTC類似薬・選定療養：{r.kind === 'offline' ? '調べられませんでした（電波を確かめてください）' : '製品が見つかりませんでした'}</div>
  return <LookupResult d={d} r={r} kinds={['otc', 'sentei']} />
}

/** PTPシートや箱のバーコード、または名前で、その制度の特別の料金の対象かどうかを出す */
function CheckPage({ kind }: { kind: Kind }) {
  const k = KIND[kind]
  const d = useOtc()
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
  const hits = d && query ? searchProducts(d, query, kind) : []

  return (
    <Page title={k.title}>
      <CameraBox cam={cam} />
      {gtin && (
        <Section header={`読み取り結果（GTIN ${gtin}）`}>
          {!d || busy || !r ? <div class="row sub">調べています…</div> : <LookupResult d={d} r={r} kinds={[kind]} />}
        </Section>
      )}
      <Section
        footer="PTPシートのGS1データバー、箱のGS1-128・GS1データバーを読めます。箱のコードは端末の中の表で、PTPシートのコードはPMDAの添付文書（電波が必要）で製品を調べます。"
      >
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
        <input type="search" placeholder={k.search} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      {d && query.trim().length >= 2 && (
        <Section>
          {hits.length === 0 ? (
            <div class="row sub">見つかりませんでした</div>
          ) : (
            hits.map((y) => (
              <>
                <ProductRow d={d} yj={y} kinds={[kind]} />
                {kind === 'sentei' && <BrandRows d={d} yj={y} />}
              </>
            ))
          )}
        </Section>
      )}
      <Section
        header="制度のあらまし"
        footer={
          d
            ? `${kind === 'otc' ? d.source : d.senteiSource}、${d.hot}をもとに判定しています。最終的な判断は、処方箋の記載・医師の判断（対象外に当たるか）と最新の厚労省の資料で確かめてください。`
            : undefined
        }
      >
        <div class="row small" style={{ display: 'block' }}>
          {k.about}
        </div>
        <ButtonRow onClick={() => openExternal(k.url)}>厚労省のページを開く</ButtonRow>
      </Section>
    </Page>
  )
}

export function OtcPage() {
  return <CheckPage kind="otc" />
}

export function SenteiPage() {
  return <CheckPage kind="sentei" />
}

/** OTC類似薬でも長期収載品でもある薬：2つの制度は重ならない */
function BothNote({ d, yj }: { d: OtcData; yj: string }) {
  if (!d.targets[yj] || !d.sentei[yj]) return null
  return (
    <Section header="OTC類似薬で、長期収載品でもある薬">
      <div class="row small" style={{ display: 'block' }}>
        OTC類似薬の別途の負担（4分の1）の対象になるときは、選定療養の特別の料金はかかりません。OTC類似薬の対象外に当たり、患者さんの希望で長期収載品を使うときは、選定療養の特別の料金の対象です。同じ処方箋に両方の対象があるときは、特別の料金をそれぞれ計算します（選定療養の分だけ消費税がかかる）。
      </div>
    </Section>
  )
}

/** 製品ごとの詳しい画面：判定・価格・特別の料金の計算・対象外になる場合 */
export function OtcDetailPage({ yj, kind = 'otc' }: { yj: string; kind?: Kind }) {
  const d = useOtc()
  const [qty, setQty] = useState('')
  const [dq, setDq] = useState('')
  const short = KIND[kind].short
  if (!d) {
    return (
      <Page title={short}>
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      </Page>
    )
  }
  const q = parseNum(qty)
  return (
    <Page title={short}>
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{productName(d, yj)}</b>
          <Verdict kind={kind} target={isTarget(d, kind, yj)} />
          <span class="small sub">YJコード {yj}</span>
        </div>
      </Section>
      {kind === 'otc' ? <OtcBody d={d} yj={yj} q={q} qty={qty} setQty={setQty} dq={dq} setDq={setDq} /> : <SenteiBody d={d} yj={yj} q={q} qty={qty} setQty={setQty} />}
      <BothNote d={d} yj={yj} />
      <Section>
        <ButtonRow onClick={() => openExternal(`https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yj.slice(0, 7)}`)}>添付文書を見る（PMDA）</ButtonRow>
      </Section>
    </Page>
  )
}

type BodyProps = { d: OtcData; yj: string; q: number | null; qty: string; setQty: (v: string) => void }

function OtcBody({ d, yj, q, qty, setQty, dq, setDq }: BodyProps & { dq: string; setDq: (v: string) => void }) {
  const t = d.targets[yj]
  const eff = d.effects[yj] ?? []
  const dis = t ? d.diseases[t.ingredient] ?? [] : []
  const disShown = dis.filter((x) => matchesSearch(x, dq))
  return (
    <>
      {!t ? (
        <Section footer="厚労省の対象医薬品リストに無い製品です。通常どおりの保険給付です。">
          <div class="row">この製品は別途の負担（薬剤費の4分の1）の対象ではありません。</div>
        </Section>
      ) : (
        <>
          <Section header="価格（厚労省マスタ）">
            <LabeledRow label="成分" value={t.ingredient} />
            <LabeledRow label="規格" value={t.spec} />
            <LabeledRow label="メーカー" value={t.maker} />
            <LabeledRow label="薬価" value={`${fmtTrim(t.price, 2)}円`} />
            <LabeledRow label="価格の4分の1（別途の負担）" value={`${fmtTrim(t.quarter, 2)}円`} />
            <LabeledRow label="保険外併用療養費の算出に用いる価格" value={`${fmtTrim(t.base, 2)}円`} />
          </Section>
          <Section
            header="別途の負担（特別の料金）の計算"
            footer="特別の料金 ＝ 価格の4分の1 × 投薬全量。10円以上なら5円未満の端数は切り捨て、5円以上は10円に切り上げ、10円未満は10円。同じ処方箋に対象医薬品が複数あるときは合算してから丸めます。保険の分（自己負担）は「保険外併用療養費の算出に用いる価格」で薬剤料を算定します。"
          >
            <NumField title="投薬全量" value={qty} onChange={setQty} unit={unitOfSpec(t.spec)} />
            {q != null && q > 0 && (
              <>
                <ResultRow title="特別の料金" value={String(otcFee(t.quarter * q))} unit="円" note={`${fmtTrim(t.quarter, 2)}円 × ${fmtTrim(q, 2)} ＝ ${fmtTrim(t.quarter * q, 2)}円`} color="orange" />
                <ResultRow title="保険の対象となる価格の合計" value={fmtTrim(t.base * q, 2)} unit="円" note="薬剤料の点数はこの価格で算定（1剤1日分ごとに五捨五超入）" big={false} />
              </>
            )}
          </Section>
          <Section header="この製品で対象外になる場合">
            <div class="row">
              <span>妊婦・妊娠の可能性がある者</span>
              <span class={'otc-flag ' + (d.pregnantSet.has(yj) ? 'on' : '')}>{d.pregnantSet.has(yj) ? '対象外になる' : '該当なし'}</span>
            </div>
            <div class="row">
              <span>授乳婦</span>
              <span class={'otc-flag ' + (d.lactatingSet.has(yj) ? 'on' : '')}>{d.lactatingSet.has(yj) ? '対象外になる' : '該当なし'}</span>
            </div>
          </Section>
          {eff.length > 0 && (
            <Section header={<span class="otc-exempt">この効能・効果で使うときは対象外</span>} footer="類似のOTC医薬品では承認されていない効能・効果です。">
              {eff.map((x) => (
                <div class="row otc-exempt">{x}</div>
              ))}
            </Section>
          )}
          {dis.length > 0 && (
            <Section header={<span class="otc-exempt">この傷病名で使うときは対象外（例 {dis.length}件・成分 {t.ingredient}）</span>}>
              <div class="row">
                <input class="text-input" placeholder="傷病名で絞り込む" value={dq} onInput={(e) => setDq((e.target as HTMLInputElement).value)} />
              </div>
              {disShown.slice(0, 100).map((x) => (
                <div class="row small otc-exempt">{x}</div>
              ))}
              {disShown.length > 100 && <div class="row small sub">ほか{disShown.length - 100}件（絞り込んでください）</div>}
            </Section>
          )}
        </>
      )}
      <Section header="次のいずれかに当たるときは、どの対象医薬品も別途の負担の対象外">
        {OTC_EXEMPTIONS.map((x, i) => (
          <div class="row small">
            {i + 1}. {x}
          </div>
        ))}
      </Section>
    </>
  )
}

function BrandLink({ d, yj }: { d: OtcData; yj: string }) {
  const nav = useNav()
  return (
    <button class="row otc-row" onClick={() => nav.push(<OtcDetailPage yj={yj} kind="sentei" />)}>
      <span class="otc-main">
        <b>{productName(d, yj)}</b>
        <Verdict kind="sentei" target />
        <PriceLine d={d} kind="sentei" yj={yj} />
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

function SenteiBody({ d, yj, q, qty, setQty }: BodyProps) {
  const t = d.sentei[yj]
  const f = t && q != null && q > 0 ? senteiFee(t.half * q) : null
  return (
    <>
      {!t ? (
        <>
          <Section footer="厚労省の対象医薬品リストに無い製品です（後発医薬品、後発医薬品の無い先発医薬品、後発医薬品との価格差の無いものなど）。通常どおりの保険給付です。">
            <div class="row">この製品は長期収載品の選定療養（特別の料金）の対象ではありません。</div>
          </Section>
          {senteiBrands(d, yj).length > 0 && (
            <Section header="同じ成分・剤形・規格の先発医薬品（長期収載品）" footer="YJコードの先頭9桁（成分・剤形・規格）が同じ製品です。患者さんの希望でこちらを使うと選定療養の対象です。">
              {senteiBrands(d, yj).map((b) => (
                <BrandLink d={d} yj={b} />
              ))}
            </Section>
          )}
        </>
      ) : (
        <>
          <Section header="価格（厚労省マスタ）">
            <LabeledRow label="成分" value={t.ingredient} />
            <LabeledRow label="規格" value={t.spec} />
            <LabeledRow label="メーカー" value={t.maker} />
            <LabeledRow label="薬価" value={`${fmtTrim(t.price, 2)}円`} />
            <LabeledRow label="後発医薬品の最高価格" value={`${fmtTrim(t.generic, 2)}円`} />
            <LabeledRow label="価格差の2分の1（特別の料金）" value={`${fmtTrim(t.half, 2)}円`} />
            <LabeledRow label="保険外併用療養費の算出に用いる価格" value={`${fmtTrim(t.base, 2)}円`} />
          </Section>
          <Section
            header="特別の料金の計算"
            footer="特別の料金 ＝ 価格差の2分の1 × 投薬全量（10円以上なら5円未満の端数は切り捨て、5円以上は10円に切り上げ、10円未満は10円）に消費税（10%）を加える。同じ処方箋に対象の長期収載品が複数あるときは合算してから丸めます。保険の分（自己負担）は「保険外併用療養費の算出に用いる価格」で薬剤料を算定します。"
          >
            <NumField title="投薬全量" value={qty} onChange={setQty} unit={unitOfSpec(t.spec)} />
            {f && q != null && (
              <>
                <ResultRow title="特別の料金（消費税込み）" value={String(f.withTax)} unit="円" note={`${fmtTrim(t.half, 2)}円 × ${fmtTrim(q, 2)} ＝ ${fmtTrim(t.half * q, 2)}円 → ${f.fee}円 × 1.1`} color="orange" />
                <ResultRow title="特別の料金（税抜き）" value={String(f.fee)} unit="円" big={false} />
                <ResultRow title="保険の対象となる価格の合計" value={fmtTrim(t.base * q, 2)} unit="円" note="薬剤料の点数はこの価格で算定（1剤1日分ごとに五捨五超入）" big={false} />
              </>
            )}
          </Section>
          <Section header="選定療養の対象になるとき" footer="患者さんの希望で長期収載品を使う場合に限ります。調剤時にも選定療養について説明し、希望を確かめます。">
            <div class="row small">・処方箋の「患者希望」欄に「✓」又は「×」がある銘柄名処方</div>
            <div class="row small">・一般名処方、または「変更不可（医療上必要）」「患者希望」のどちらにも記載の無い銘柄名処方で、患者さんが長期収載品を希望したとき</div>
          </Section>
        </>
      )}
      <Section header="次のいずれかに当たるときは選定療養の対象外（通常の保険給付）">
        {SENTEI_EXEMPTIONS.map((x, i) => (
          <div class="row small">
            {i + 1}. {x}
          </div>
        ))}
      </Section>
    </>
  )
}
