// 調剤・保管の注意（粉砕・分割・一包化・遮光・温度・湿気）。data/handling.json（tools/make_handling.py で PMDA の電子添文から作る）
import { FileText } from 'lucide-preact'
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
}

const has = (h: HandlingDoc, f: string) => !!h.f?.includes(f)

/** 6つの目印 */
export function handlingTiles(h: HandlingDoc): HTile[] {
  const form = has(h, 'sr') ? '徐放性製剤' : has(h, 'ec') ? '腸溶性製剤' : ''
  const st = h.st ?? ''
  return [
    {
      key: 'crush',
      title: '粉砕',
      value: has(h, 'crush') ? '不可の記載' : form ? `注意（${form}）` : '記載なし',
      yes: has(h, 'crush') || !!form,
    },
    {
      key: 'split',
      title: '分割',
      value: has(h, 'split') ? '不可の記載' : form ? `注意（${form}）` : h.sc ? '割線あり' : '記載なし',
      yes: has(h, 'split') || !!form,
    },
    { key: 'pack', title: '一包化', value: has(h, 'pack') ? '注意の記載' : '記載なし', yes: has(h, 'pack') },
    { key: 'light', title: '遮光', value: has(h, 'light') ? (/遮光/.test(st) ? '遮光保存' : '開封後など') : '記載なし', yes: has(h, 'light') },
    { key: 'temp', title: '温度', value: has(h, 'temp') ? st.replace(/、?室温保存$/, '') || '注意' : st ? '室温' : '記載なし', yes: has(h, 'temp') },
    { key: 'moist', title: '湿気', value: has(h, 'moist') ? '注意の記載' : '記載なし', yes: has(h, 'moist') },
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

/** 目印の小さな表（スキャンの結果に出す）。押すと根拠の文を見る */
export function HandlingTiles({ h, onOpen }: { h: HandlingDoc; onOpen: () => void }) {
  return (
    <div class="hd-wrap">
      <div class="hd-title small sub">調剤・保管（添付文書の記載）</div>
      <div class="hd-tiles">
        {handlingTiles(h).map((t) => (
          <button class={'hd-tile ' + (t.yes ? 'yes' : 'no')} onClick={onOpen}>
            <span class="hd-t">{t.title}</span>
            <span class="hd-v">{t.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 根拠の文をまとめた画面 */
export function HandlingDetailPage({ h, name, gtin }: { h: HandlingDoc; name: string; gtin?: string }) {
  const tiles = handlingTiles(h)
  const q = h.q ?? []
  return (
    <Page title="調剤・保管の注意">
      <Section>
        <div class="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', paddingTop: '12px', paddingBottom: '12px' }}>
          <b style={{ fontSize: '18px' }}>{name}</b>
          <div class="hd-tiles" style={{ width: '100%' }}>
            {tiles.map((t) => (
              <div class={'hd-tile ' + (t.yes ? 'yes' : 'no')}>
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
        .filter((t) => t.yes)
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
