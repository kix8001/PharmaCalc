// 調剤・保管の注意（粉砕・分割・一包化・遮光・温度・湿気）。data/handling.json（tools/make_handling.py で PMDA の電子添文から作る）
import { BookOpen, FileText } from 'lucide-preact'
import { Page, Section, openExternal } from '../ui/components'
import { PMDA } from './gs1'

export interface HandlingDoc {
  /** 貯法 */
  st?: string
  /** 目印：crush 粉砕・かみ砕き、split 分割、pack 一包化・分包、light 遮光、temp 温度、moist 湿気、sr 徐放（販売名）、ec 腸溶 */
  f?: string[]
  /** 根拠の文（[項目, 文]） */
  q?: [string, string][]
  /** 性状に「割線」がある */
  sc?: 1
}

export interface HandlingData {
  source: string
  docs: HandlingDoc[]
  yj: Record<string, number>
}

let p: Promise<HandlingData> | null = null
export function loadHandling(): Promise<HandlingData> {
  p ??= import('../../../data/handling.json').then((m) => (m.default ?? m) as unknown as HandlingData)
  return p
}

/** インタビューフォームの抜き書き（data/if.json、tools/make_if.py） */
export interface IfDoc {
  /** 粉砕 */
  c?: string
  /** 崩壊・懸濁性及び経管投与チューブの通過性（簡易懸濁法） */
  k?: string
  /** 無包装状態の安定性 */
  s?: string
  /** PDF（base からの相対） */
  u: string
}
export interface IfData {
  source: string
  base: string
  docs: IfDoc[]
  yj: Record<string, number>
}
let ifp: Promise<IfData> | null = null
export function loadIf(): Promise<IfData> {
  ifp ??= import('../../../data/if.json').then((m) => (m.default ?? m) as unknown as IfData).catch(() => ({ source: '', base: '', docs: [], yj: {} }))
  return ifp
}
export function ifFor(d: IfData, yjs: string[]): (IfDoc & { url: string }) | null {
  for (const y of yjs) if (d.yj[y] !== undefined) {
    const x = d.docs[d.yj[y]]
    return { ...x, url: d.base + x.u }
  }
  return null
}
const IF_NG = /粉砕不可|粉砕しない|粉砕は避け|粉砕を避け|推奨しない|勧められない|失われる/
const SUSP_NG = /対象外|不適|適さない|推奨しない|できない|失われ/

/** 読み取った製品の YJ コードから添付文書の記載を探す（最初に見つかったもの） */
export function handlingFor(d: HandlingData, yjs: string[]): HandlingDoc | null {
  for (const y of yjs) if (d.yj[y] !== undefined) return d.docs[d.yj[y]]
  return null
}

export interface HTile {
  key: string
  title: string
  value: string
  yes: boolean
  /** IF に参考になる記載がある（青） */
  info?: boolean
}

const has = (h: HandlingDoc, f: string) => !!h.f?.includes(f)

/** 6つの目印 */
export function handlingTiles(h: HandlingDoc, f?: IfDoc | null): HTile[] {
  const form = has(h, 'sr') ? '徐放性製剤' : has(h, 'ec') ? '腸溶性製剤' : ''
  const st = h.st ?? ''
  return [
    {
      key: 'crush',
      title: '粉砕',
      value: has(h, 'crush')
        ? '不可の記載'
        : f?.c && IF_NG.test(f.c)
          ? '不可（IF）'
          : form
            ? `注意（${form}）`
            : f?.c
              ? 'IFにデータ'
              : '記載なし',
      yes: has(h, 'crush') || !!form || !!(f?.c && IF_NG.test(f.c)),
      info: !!f?.c,
    },
    {
      key: 'split',
      title: '分割',
      value: has(h, 'split') ? '不可の記載' : form ? `注意（${form}）` : h.sc ? '割線あり' : '記載なし',
      yes: has(h, 'split') || !!form,
    },
    { key: 'pack', title: '一包化', value: has(h, 'pack') ? '注意の記載' : f?.s ? 'IFに無包装データ' : '記載なし', yes: has(h, 'pack'), info: !!f?.s },
    { key: 'light', title: '遮光', value: has(h, 'light') ? (/遮光/.test(st) ? '遮光保存' : '開封後など') : '記載なし', yes: has(h, 'light') },
    { key: 'temp', title: '温度', value: has(h, 'temp') ? st.replace(/、?室温保存$/, '') || '注意' : st ? '室温' : '記載なし', yes: has(h, 'temp') },
    { key: 'moist', title: '湿気', value: has(h, 'moist') ? '注意の記載' : '記載なし', yes: has(h, 'moist') },
    ...(f?.k
      ? [{ key: 'susp', title: '簡易懸濁', value: SUSP_NG.test(f.k) ? '不適（IF）' : 'IFにデータ', yes: SUSP_NG.test(f.k), info: true }]
      : []),
  ]
}

const MATCH: Record<string, RegExp> = {
  crush: /粉砕|砕|すりつぶ|噛|かみ砕|かまず|かまない|かんだり|かんで|咀嚼|潰|つぶし|つぶさ/,
  split: /割ら|割っ|割る|分割|半割/,
  pack: /分包|一包化|無包装|取り出/,
  light: /遮光|光/,
  moist: /吸湿|湿気|湿度|防湿|乾燥剤/,
  temp: /℃|°C|冷所|冷蔵|凍結/,
}

const cls = (t: HTile) => 'hd-tile ' + (t.yes ? 'yes' : t.info ? 'info' : 'no')

/** 目印の小さな表（スキャンの結果に出す）。押すと根拠の文を見る */
export function HandlingTiles({ h, f, onOpen }: { h: HandlingDoc; f?: IfDoc | null; onOpen: () => void }) {
  return (
    <div class="hd-wrap">
      <div class="hd-title small sub">調剤・保管（添付文書・インタビューフォームの記載）</div>
      <div class="hd-tiles">
        {handlingTiles(h, f).map((t) => (
          <button class={cls(t)} onClick={onOpen}>
            <span class="hd-t">{t.title}</span>
            <span class="hd-v">{t.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 根拠の文をまとめた画面 */
export function HandlingDetailPage({ h, f, name, gtin }: { h: HandlingDoc; f?: (IfDoc & { url: string }) | null; name: string; gtin?: string }) {
  const tiles = handlingTiles(h, f)
  const q = h.q ?? []
  return (
    <Page title="調剤・保管の注意">
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{name}</b>
          <div class="hd-tiles" style={{ width: '100%' }}>
            {tiles.map((t) => (
              <div class={cls(t)}>
                <span class="hd-t">{t.title}</span>
                <span class="hd-v">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
      <Section header="貯法">
        <div class="row">{h.st || '記載なし'}</div>
      </Section>
      {tiles
        .filter((t) => t.yes && t.key !== 'susp')
        .map((t) => {
          const qs = q.filter(([, s]) => MATCH[t.key]?.test(s))
          return (
            <Section header={t.title}>
              {qs.length ? (
                qs.map(([src, s]) => (
                  <div class="row hd-q" style={{ display: 'block' }}>
                    <span class="hd-src">{src}</span>
                    {s}
                  </div>
                ))
              ) : (
                <div class="row small sub" style={{ display: 'block' }}>
                  {t.key === 'temp'
                    ? `貯法：${h.st}`
                    : t.key === 'light'
                      ? `貯法：${h.st}`
                      : '販売名・性状から（徐放性・腸溶性の製剤は、ふつう粉砕・分割しません）。添付文書・インタビューフォームで確かめてください。'}
                </div>
              )}
            </Section>
          )
        })}
      {f && (
        <Section header="インタビューフォーム（抜き書き）" footer="インタビューフォームの該当の項から文字だけを抜き出しています（表は崩れて見えることがあります）。数値や条件は PDF で確かめてください。">
          {f.c && <IfRow title="粉砕" text={f.c} />}
          {f.k && <IfRow title="崩壊・懸濁性・経管投与チューブの通過性" text={f.k} />}
          {f.s && <IfRow title="無包装状態の安定性" text={f.s} />}
          {!f.c && !f.k && !f.s && <div class="row small sub">粉砕・簡易懸濁・無包装の安定性の記載は見つかりませんでした（該当資料なし、または古い書式）。</div>}
          <div class="row" style={{ display: 'block' }}>
            <button class="primary-btn" onClick={() => openExternal(f.url)}>
              <BookOpen size={20} /> インタビューフォームを開く
            </button>
          </div>
        </Section>
      )}
      <Section footer="添付文書（電子添文）の貯法・用法及び用量に関連する注意・適用上の注意・取扱い上の注意・性状から、粉砕・分割・一包化・遮光・温度・湿気に触れた文を抜き出しています。「記載なし」は添付文書に書いていないという意味で、可能という意味ではありません。インタビューフォームの粉砕後・無包装の安定性の試験は含みません。">
        {gtin && (
          <div class="row" style={{ display: 'block' }}>
            <button class="primary-btn" onClick={() => openExternal(PMDA.url(gtin))}>
              <FileText size={20} /> 添付文書を開く
            </button>
          </div>
        )}
      </Section>
    </Page>
  )
}

function IfRow({ title, text }: { title: string; text: string }) {
  return (
    <div class="row hd-q" style={{ display: 'block' }}>
      <span class="hd-src">{title}</span>
      {text}
    </div>
  )
}
