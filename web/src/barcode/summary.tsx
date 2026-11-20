import type { VNode } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { BookOpen, FileHeart, FileText } from 'lucide-preact'
import { openExternal } from '../ui/components'
import { useNav } from '../ui/nav'
import { gtinForYj, loadOtc, lookupGtin, productName, senteiBrands, type Lookup } from '../otc/otcData'
import { OtcDetailPage } from '../otc/otcViews'
import { LimitDetailPage, groupOf, loadLimits } from '../limits/limits'
import { RmpDetailPage, rmpForLookup, type RmpItem } from '../rmp/rmp'
import { PMDA } from './gs1'
import { genericInfo, loadGeneric, type GenericInfo } from './generic'
import { figUrls, infoFor, loadInfo, type InfoItem } from './info'
import type { GenericData } from './generic'
import { HandlingDetailPage, HandlingTiles, handlingFor, ifFor, loadHandling, loadIf, type HandlingDoc, type IfDoc } from './handling'

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
  handling: HandlingDoc | null
  iff: (IfDoc & { url: string }) | null
  /** 添付文書を開く URL */
  doc: string
  /** 製品ごとの YJ コード・薬価・識別コード */
  products: Product[]
}

interface Product {
  yj: string
  name: string
  info: InfoItem
  /** 薬価を比べる相手（ジェネリックなら先発品、先発品なら最安のジェネリック） */
  cmp?: { label: string; name: string; price: string }
}

/** 読み取ったコードから、OTC類似薬・選定療養・投与日数・RMP資材の判定をまとめて出す */
async function summarize(gtin: string | undefined, yjs: string[] | undefined, push: (el: VNode) => void): Promise<Summary> {
  const look: Promise<Lookup> = yjs ? Promise.resolve({ kind: 'found', yj: yjs, via: 'name' }) : lookupGtin(gtin!)
  const [r, otc, lim, gen, hd, ifd, inf] = await Promise.all([look, loadOtc(), loadLimits(), loadGeneric(), loadHandling(), loadIf(), loadInfo()])
  if (r.kind !== 'found') return { lookup: r, name: '', tiles: [], rmp: [], generic: null, handling: null, iff: null, doc: gtin ? PMDA.url(gtin) : '', products: [] }
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
  return { lookup: r, name: names.length > 1 ? `${names[0]} ほか` : names[0] ?? '', tiles, rmp, generic: genericInfo(gen, yj), handling: handlingFor(hd, yj) ?? (ifFor(ifd, yj) ? {} : null), iff: ifFor(ifd, yj), doc: docUrl(otc, gtin, yj), products: yj.slice(0, 4).map((y) => ({ yj: y, name: productName(otc, y), info: infoFor(inf, y), cmp: compareTo(gen, inf, y) })) }
}

/** 先発品・準先発品・後発品（ジェネリック）・基礎的医薬品の区分 */
function GenericRow({ g, cmp }: { g: GenericInfo; cmp?: Product['cmp'] }) {
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
              {g.brands.map((b, i) => (
                <>
                  {i > 0 && '、'}
                  <b>{b}</b>
                  {cmp && cmp.name === b && <span> {cmp.price}円</span>}
                </>
              ))}
              {g.brandNote && <span class="sub">（{g.brandNote}）</span>}
            </>
          ) : (
            <span class="sub">なし（先発品が無い、または薬価基準に無い）</span>
          )}
        </div>
      )}
      {g.kind !== '後発品' && cmp && (
        <div class="scan-brand">
          <span class="sub">ジェネリック（例）：</span>
          <b>{cmp.name}</b> <span>{cmp.price}円</span>
        </div>
      )}
    </div>
  )
}

/** 薬価を比べる相手。ジェネリック→先発品（規格・剤形が同じとき）、先発品・準先発品→最安のジェネリック */
function compareTo(gen: GenericData, inf: Awaited<ReturnType<typeof loadInfo>>, yj: string): Product['cmp'] {
  const u = gen.u9?.[yj.slice(0, 9)]
  const g = gen.items[yj] ?? (u ? gen.items[u] : undefined)
  const own = infoFor(inf, yj)
  if (g?.k === 'G' && g.b?.length && !g.o) {
    const b = g.b[0]
    const p = inf.bp[b]
    return p ? { label: '先発品', name: gen.names[b] ?? b, price: p } : undefined
  }
  if ((g?.k === 'B' || g?.k === 'Q') && own.c) return { label: '最安のジェネリック', name: own.c[0], price: own.c[1] }
  return undefined
}

/** 添付文書の URL：コードを読んだときはそのコードで、薬品名で選んだときは箱のコード、無ければ PMDA の成分の一覧 */
function docUrl(otc: Awaited<ReturnType<typeof loadOtc>>, gtin: string | undefined, yj: string[]): string {
  if (gtin) return PMDA.url(gtin)
  const g = gtinForYj(otc, yj[0])
  return g ? PMDA.url(g) : `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yj[0].slice(0, 7)}`
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
/** gtin（読み取ったコード）か yj（薬品名で選んだ製品）のどちらかを渡す */
export function ScanSummary({ gtin, yj, memo, detail }: { gtin?: string; yj?: string[]; memo: string; detail: string }) {
  const nav = useNav()
  const [s, setS] = useState<Summary | null>(null)
  useEffect(() => {
    let alive = true
    setS(null)
    summarize(gtin, yj, (el) => nav.push(el))
      .then((x) => alive && setS(x))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [gtin, yj?.join()])

  const name = memo || s?.name || ''
  return (
    <div class="scan-card">
      <div class="scan-head">
        <div class="scan-name">{name || (s ? '薬品名が分かりませんでした' : '調べています…')}</div>
        <div class="small sub">{detail}</div>
        {s?.products.map((p) => (
          <div class="scan-prod">
            {s.products.length > 1 && <div class="scan-prod-name">{p.name}</div>}
            <div class="scan-prod-row">
              <span class="sub">YJコード</span>
              <span class="num">{p.yj}</span>
            </div>
            <div class="scan-prod-row">
              <span class="sub">薬価</span>
              <span>{p.info.p ? `${p.info.p}円${p.info.s ? `（${p.info.s}）` : ''}` : '—'}</span>
            </div>
            {p.info.i && (
              <div class="scan-prod-row">
                <span class="sub">識別コード</span>
                <span>{p.info.i}</span>
              </div>
            )}
            {figUrls(p.info.f).length > 0 && (
              <div class="scan-figs" aria-label="錠剤の図（表・裏・横）">
                {figUrls(p.info.f).map((u) => (
                  <img src={u} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {!s ? (
        <div class="row sub small">OTC類似薬・選定療養・投与日数・RMP資材を調べています…</div>
      ) : s.lookup.kind !== 'found' ? (
        <div class="row sub small">
          {s.lookup.kind === 'offline' ? '製品を調べられませんでした（電波を確かめてください）。' : 'このコードの医療用医薬品が見つかりませんでした。'}
        </div>
      ) : (
        <>
          {s.generic && <GenericRow g={s.generic} cmp={s.products[0]?.cmp} />}
          <Tiles tiles={s.tiles} />
          {s.handling && <HandlingTiles h={s.handling} f={s.iff} onOpen={() => nav.push(<HandlingDetailPage h={s.handling!} f={s.iff} name={name} doc={s.doc} />)} />}
        </>
      )}
      <div class="scan-btns">
        <button class="primary-btn" disabled={!s?.doc} onClick={() => s?.doc && openExternal(s.doc)}>
          <FileText size={20} /> 添付文書を開く
        </button>
        {s && s.lookup.kind === 'found' && (
          <button
            class="primary-btn"
            onClick={() =>
              openExternal(s.iff ? s.iff.url : `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${(s.lookup as { yj: string[] }).yj[0].slice(0, 7)}`)
            }
          >
            <BookOpen size={20} /> インタビューフォームを開く
          </button>
        )}
        {s && s.lookup.kind === 'found' && !s.iff && <div class="small sub scan-mat-t">PMDA の製品の一覧が開きます。目的の製品の「インタビューフォーム」を押してください。</div>}
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
