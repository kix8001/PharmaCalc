import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, Search } from 'lucide-preact'
import { ButtonRow, LabeledRow, NumField, Page, ResultRow, Section, WarningRow, openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { fmtTrim, matchesSearch, parseNum } from '../core/format'
import { CameraBox, useCameraOn, useScanner } from '../barcode/scan'
import { parseGS1 } from '../barcode/gs1'
import { OTC_EXEMPTIONS, loadOtc, lookupGtin, otcFee, searchProducts, unitOfSpec, type Lookup, type OtcData } from './otcData'

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

/** 判定の札：対象（オレンジ）／対象外 */
function Verdict({ target }: { target: boolean }) {
  return <span class={'otc-verdict ' + (target ? 'yes' : 'no')}>{target ? 'OTC類似薬（別途の負担の対象）' : 'OTC類似薬ではない'}</span>
}

/** 製品1つの行。押すと詳しい画面へ */
function ProductRow({ d, yj }: { d: OtcData; yj: string }) {
  const nav = useNav()
  const t = d.targets[yj]
  return (
    <button class="row otc-row" onClick={() => nav.push(<OtcDetailPage yj={yj} />)}>
      <span class="otc-main">
        <b>{t?.name ?? d.names[yj] ?? yj}</b>
        <Verdict target={!!t} />
        {t && (
          <span class="small sub">
            {t.spec}・薬価 {fmtTrim(t.price, 2)}円 → 別途の負担 {fmtTrim(t.quarter, 2)}円／{unitOfSpec(t.spec)}
          </span>
        )}
      </span>
      <ChevronRight size={18} class="chev" />
    </button>
  )
}

/** 調べた結果（製品が複数のこともある） */
function LookupResult({ d, r }: { d: OtcData; r: Lookup }) {
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

/** バーコード画面の読み取り結果に出す、OTC類似薬かどうかの1行 */
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
  if (!d || !r) return <div class="row small sub">OTC類似薬かどうか調べています…</div>
  if (r.kind !== 'found') return <div class="row small sub">OTC類似薬：{r.kind === 'offline' ? '調べられませんでした（電波を確かめてください）' : '製品が見つかりませんでした'}</div>
  return <LookupResult d={d} r={r} />
}

/** OTC類似薬チェック：PTPシートや箱のバーコード、または名前で、別途の負担（薬剤費の4分の1）の対象かどうかを出す */
export function OtcPage() {
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
  const hits = d && query ? searchProducts(d, query) : []

  return (
    <Page title="OTC類似薬チェック">
      <CameraBox cam={cam} />
      {gtin && (
        <Section header={`読み取り結果（GTIN ${gtin}）`}>
          {!d || busy || !r ? <div class="row sub">調べています…</div> : <LookupResult d={d} r={r} />}
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
        <input type="search" placeholder="名前で探す（例：ロキソニン、ヘパリン類似物質）" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      {d && query.trim().length >= 2 && (
        <Section>
          {hits.length === 0 ? (
            <div class="row sub">見つかりませんでした</div>
          ) : (
            hits.map((y) => <ProductRow d={d} yj={y} />)
          )}
        </Section>
      )}
      <Section
        header="制度のあらまし"
        footer={d ? `${d.source}、${d.hot}をもとに判定しています。最終的な判断は、医師の診察（別途の負担の対象外に当たるか）と最新の厚労省の資料で確かめてください。` : undefined}
      >
        <div class="row small" style={{ display: 'block' }}>
          OTC医薬品との代替性が特に高い医療用医薬品（OTC類似薬）を保険診療で使うと、令和9年3月1日から、薬剤費の4分の1を「別途の負担（特別の料金）」として患者さんが支払います。こども・がん治療・入院中などは対象外です。
        </div>
        <ButtonRow onClick={() => openExternal('https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html')}>厚労省のページを開く</ButtonRow>
      </Section>
    </Page>
  )
}

/** 製品ごとの詳しい画面：判定・価格・特別の料金の計算・対象外になる場合 */
export function OtcDetailPage({ yj }: { yj: string }) {
  const d = useOtc()
  const [qty, setQty] = useState('')
  const [dq, setDq] = useState('')
  if (!d) {
    return (
      <Page title="OTC類似薬">
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      </Page>
    )
  }
  const t = d.targets[yj]
  const name = t?.name ?? d.names[yj] ?? yj
  const q = parseNum(qty)
  const eff = d.effects[yj] ?? []
  const dis = t ? d.diseases[t.ingredient] ?? [] : []
  const disShown = dis.filter((x) => matchesSearch(x, dq))
  return (
    <Page title="OTC類似薬">
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{name}</b>
          <Verdict target={!!t} />
          <span class="small sub">YJコード {yj}</span>
        </div>
      </Section>
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
            <Section header="この効能・効果で使うときは対象外" footer="類似のOTC医薬品では承認されていない効能・効果です。">
              {eff.map((x) => (
                <div class="row">{x}</div>
              ))}
            </Section>
          )}
          {dis.length > 0 && (
            <Section header={`この傷病名で使うときは対象外（例 ${dis.length}件・成分 ${t.ingredient}）`}>
              <div class="row">
                <input class="text-input" placeholder="傷病名で絞り込む" value={dq} onInput={(e) => setDq((e.target as HTMLInputElement).value)} />
              </div>
              {disShown.slice(0, 100).map((x) => (
                <div class="row small">{x}</div>
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
      <Section>
        <ButtonRow onClick={() => openExternal(`https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yj.slice(0, 7)}`)}>添付文書を見る（PMDA）</ButtonRow>
      </Section>
    </Page>
  )
}

