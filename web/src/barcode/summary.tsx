import type { VNode } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { FileHeart, FileText } from 'lucide-preact'
import { openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { loadOtc, lookupGtin, productName, senteiBrands, type Lookup } from '../otc/otcData'
import { OtcDetailPage } from '../otc/otcViews'
import { LimitDetailPage, groupOf, loadLimits } from '../limits/limits'
import { RmpDetailPage, rmpForLookup, type RmpItem } from '../rmp/rmp'
import { PMDA } from './gs1'
import { genericInfo, loadGeneric, type GenericInfo } from './generic'

/** 4つの判定の1つ。yes＝該当あり（オレンジの「！」）、no＝該当なし（グレー） */
interface Tile {
  title: string
  value: string
  yes: boolean
  /** 押したときの詳しい画面 */
  open?: () => void
}

interface Summary {
  lookup: Lookup
  name: string
  tiles: Tile[]
  rmp: RmpItem[]
  generic: GenericInfo | null
}

/** 読み取ったコードから、OTC類似薬・選定療養・投与日数・RMP資材の判定をまとめて出す */
async function summarize(gtin: string, push: (el: VNode) => void): Promise<Summary> {
  const [r, otc, lim, gen] = await Promise.all([lookupGtin(gtin), loadOtc(), loadLimits(), loadGeneric()])
  if (r.kind !== 'found') return { lookup: r, name: '', tiles: [], rmp: [], generic: null }
  const yj = r.yj
  const names = [...new Set(yj.map((y) => productName(otc, y)))]

  const otcYj = yj.find((y) => otc.targets[y])
  const senteiYj = yj.find((y) => otc.sentei[y])
  const brandOf = yj.map((y) => senteiBrands(otc, y)).find((b) => b.length)
  const limits = yj.map((y) => ({ y, g: groupOf(lim, y) })).filter((x) => x.g && x.g.days > 0)
  const lim0 = limits[0]
  const rmp = (await rmpForLookup(r)).items
  const mats = rmp.reduce((n, i) => n + i.mats.length, 0)

  const tiles: Tile[] = [
    {
      title: 'OTC類似薬',
      value: otcYj ? '該当あり' : '該当なし',
      yes: !!otcYj,
      open: () => push(<OtcDetailPage yj={otcYj ?? yj[0]} kind="otc" />),
    },
    {
      title: '選定療養',
      value: senteiYj ? '該当あり' : brandOf ? '先発品が該当' : '該当なし',
      yes: !!senteiYj || !!brandOf,
      open: () => push(<OtcDetailPage yj={senteiYj ?? brandOf?.[0] ?? yj[0]} kind="sentei" />),
    },
    {
      title: '投与日数',
      value: lim0 ? `${lim0.g!.days}日まで` : '上限なし',
      yes: !!lim0,
      open: () => push(<LimitDetailPage yj={lim0?.y ?? yj[0]} />),
    },
    {
      title: 'RMP資材',
      value: mats ? `あり（${mats}件）` : 'なし',
      yes: mats > 0,
      open: rmp.length ? () => push(<RmpDetailPage id={rmp[0].id} />) : undefined,
    },
  ]
  return { lookup: r, name: names.length > 1 ? `${names[0]} ほか` : names[0] ?? '', tiles, rmp, generic: genericInfo(gen, yj) }
}

/** 先発品・準先発品・後発品（ジェネリック）・基礎的医薬品の区分 */
function GenericRow({ g }: { g: GenericInfo }) {
  return (
    <div class="scan-gen">
      <div class="scan-chips">
        {g.kind && <span class={'scan-chip ' + (g.kind === '後発品' ? 'gen' : 'brand')}>{g.kind === '後発品' ? '後発品（ジェネリック）' : g.kind}</span>}
        {g.hasGeneric !== undefined && (
          <span class={'scan-chip ' + (g.hasGeneric ? 'has' : 'none')}>{g.hasGeneric ? 'ジェネリックあり' : 'ジェネリックなし'}</span>
        )}
        {!g.kind && <span class="scan-chip none">先発品・後発品の区分なし</span>}
        {g.kiso && <span class="scan-chip kiso">基礎的医薬品（{g.kiso}）</span>}
      </div>
      {g.kind === '後発品' && (
        <div class="scan-brand">
          <span class="sub">先発品：</span>
          {g.brands.length ? (
            <>
              <b>{g.brands.join('、')}</b>
              {g.brandNote && <span class="sub">（{g.brandNote}）</span>}
            </>
          ) : (
            <span class="sub">なし（先発品が無い、または薬価基準に無い）</span>
          )}
        </div>
      )}
    </div>
  )
}

/** 判定のアイコン（2列×2段） */
function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div class="scan-tiles">
      {tiles.map((t) => (
        <button class={'scan-tile ' + (t.yes ? 'yes' : 'no')} onClick={t.open} disabled={!t.open}>
          <span class="scan-tile-ic" aria-hidden="true">
            {t.yes ? '!' : '−'}
          </span>
          <span class="scan-tile-tx">
            <span class="scan-tile-t">{t.title}</span>
            <span class="scan-tile-v">{t.value}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** スキャン画面の読み取り結果：薬品名・判定のアイコン・添付文書と患者向けRMP資材を開くボタン */
export function ScanSummary({ gtin, memo, detail }: { gtin: string; memo: string; detail: string }) {
  const nav = useNav()
  const [s, setS] = useState<Summary | null>(null)
  useEffect(() => {
    let alive = true
    setS(null)
    summarize(gtin, (el) => nav.push(el))
      .then((x) => alive && setS(x))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [gtin])

  const name = memo || s?.name || ''
  return (
    <div class="scan-card">
      <div class="scan-head">
        <div class="scan-name">{name || (s ? '薬品名が分かりませんでした' : '調べています…')}</div>
        <div class="small sub">{detail}</div>
      </div>
      {!s ? (
        <div class="row sub small">OTC類似薬・選定療養・投与日数・RMP資材を調べています…</div>
      ) : s.lookup.kind !== 'found' ? (
        <div class="row sub small">
          {s.lookup.kind === 'offline' ? '製品を調べられませんでした（電波を確かめてください）。' : 'このコードの医療用医薬品が見つかりませんでした。'}
        </div>
      ) : (
        <>
          {s.generic && <GenericRow g={s.generic} />}
          <Tiles tiles={s.tiles} />
        </>
      )}
      <div class="scan-btns">
        <button class="primary-btn" onClick={() => openExternal(PMDA.url(gtin))}>
          <FileText size={20} /> 添付文書を開く
        </button>
        {s?.rmp.map((i) =>
          i.mats.map((m) => (
            <div class="scan-mat">
              <button class="primary-btn" onClick={() => openExternal(m.url)}>
                <FileHeart size={20} /> 患者向けRMP資材を開く
              </button>
              <div class="small sub scan-mat-t">{m.title}</div>
            </div>
          )),
        )}
      </div>
    </div>
  )
}
