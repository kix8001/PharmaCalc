import { useState } from 'preact/hooks'
import { NumField, Page, ResultRow, Section, SelectRow, Toggle } from '../ui/components'
import { fmtTrim, parseNum } from '../core/format'

type Kind = 'oral' | 'injection' | 'patch'
/** オピオイドの種類と、経口モルヒネに換算するときの係数（1日量 × 係数 = 経口モルヒネ mg/日） */
const opioids: { id: string; name: string; factor: number; kind: Kind }[] = [
  { id: 'morphineOral', name: 'モルヒネ 経口', factor: 1, kind: 'oral' },
  { id: 'morphineSupp', name: 'モルヒネ 坐剤', factor: 1.5, kind: 'oral' },
  { id: 'morphineInj', name: 'モルヒネ 注射（静注・皮下）', factor: 2, kind: 'injection' },
  { id: 'oxycodoneOral', name: 'オキシコドン 経口', factor: 1.5, kind: 'oral' },
  { id: 'oxycodoneInj', name: 'オキシコドン 注射', factor: 2, kind: 'injection' },
  { id: 'hydromorphoneOral', name: 'ヒドロモルフォン 経口', factor: 5, kind: 'oral' },
  { id: 'hydromorphoneInj', name: 'ヒドロモルフォン 注射', factor: 25, kind: 'injection' },
  { id: 'fentanylPatch', name: 'フェンタニル 貼付（1日型の表示量）', factor: 30, kind: 'patch' },
  { id: 'fentanylInj', name: 'フェンタニル 注射', factor: 100, kind: 'injection' },
  { id: 'tapentadol', name: 'タペンタドール 経口', factor: 0.3, kind: 'oral' },
  { id: 'tramadol', name: 'トラマドール 経口', factor: 0.2, kind: 'oral' },
  { id: 'codeine', name: 'コデイン 経口', factor: 1 / 6, kind: 'oral' },
]
const opt = opioids.map((o) => [o.id, o.name] as [string, string])
const byId = (id: string) => opioids.find((o) => o.id === id)!

export function OpioidPage() {
  const [fromId, setFrom] = useState('oxycodoneOral')
  const [dose, setDose] = useState('')
  const [toId, setTo] = useState('fentanylPatch')
  const [reduce, setReduce] = useState(false)
  const from = byId(fromId), to = byId(toId)
  const d = parseNum(dose)
  return (
    <Page title="オピオイド換算">
      <Section header="いまの薬">
        <SelectRow label="薬" options={opt} value={fromId} onChange={setFrom} />
        <NumField title="1日量" value={dose} onChange={setDose} unit="mg/日" />
      </Section>
      {d != null && d > 0 &&
        (() => {
          const mme = d * from.factor
          const target = (mme / to.factor) * (reduce ? 0.75 : 1)
          return (
            <>
              <Section>
                <ResultRow title="経口モルヒネ換算" value={fmtTrim(mme, 1)} unit="mg/日" color="orange" />
              </Section>
              <Section header="変更先">
                <SelectRow label="変更先" options={opt} value={toId} onChange={setTo} />
                <Toggle label="交差耐性を考えて25%減らす" value={reduce} onChange={setReduce} />
                <ResultRow title="1日量" value={fmtTrim(target, 2)} unit="mg/日" />
                {to.kind === 'oral' && <ResultRow title="レスキュー1回量（1日量の1/6）" value={fmtTrim(target / 6, 2)} unit="mg" big={false} />}
                {to.kind === 'injection' && <ResultRow title="レスキュー（1時間量）" value={fmtTrim(target / 24, 3)} unit="mg" big={false} />}
                {to.kind === 'patch' && (
                  <>
                    <ResultRow title="レスキュー：モルヒネ速放" value={fmtTrim(mme / 6, 1)} unit="mg/回" big={false} />
                    <ResultRow
                      title="レスキュー：オキシコドン速放"
                      value={fmtTrim(mme / 6 / 1.5, 1)}
                      unit="mg/回"
                      note="貼付剤のときは経口の速放性製剤をレスキューに使います（1日量の1/6が目安）"
                      big={false}
                    />
                  </>
                )}
              </Section>
              <Section header="各薬の相当量">
                {opioids.map((o) => (
                  <div class="row labeled">
                    <span class="small">{o.name}</span>
                    <span class="num">{fmtTrim(mme / o.factor, 2)} mg/日</span>
                  </div>
                ))}
              </Section>
            </>
          )
        })()}
      <Section
        header="換算比（経口モルヒネ 60mg/日 に相当）"
        footer="がん疼痛の治療で一般的に使われる換算比の目安です。個人差が大きく、切り替え直後は効果と副作用をよく観察してください。フェンタニル貼付はフェントステープ（1日型）の表示量で、デュロテップMTパッチ（3日型）2.1mg ≒ フェントステープ1mg。メサドンは換算が一定でないため対象外です。"
      >
        {opioids.map((o) => (
          <div class="row labeled small">
            <span>{o.name}</span>
            <span class="num">{fmtTrim(60 / o.factor, 2)}mg</span>
          </div>
        ))}
      </Section>
    </Page>
  )
}

/** ステロイドの種類と、プレドニゾロン5mgに相当する量 */
const steroids: { id: string; name: string; eq: number; note: string }[] = [
  { id: 'hydrocortisone', name: 'ヒドロコルチゾン', eq: 20, note: '短時間型・鉱質作用あり' },
  { id: 'cortisone', name: 'コルチゾン', eq: 25, note: '短時間型・鉱質作用あり' },
  { id: 'prednisolone', name: 'プレドニゾロン', eq: 5, note: '中間型' },
  { id: 'methylprednisolone', name: 'メチルプレドニゾロン', eq: 4, note: '中間型' },
  { id: 'triamcinolone', name: 'トリアムシノロン', eq: 4, note: '中間型' },
  { id: 'dexamethasone', name: 'デキサメタゾン', eq: 0.75, note: '長時間型' },
  { id: 'betamethasone', name: 'ベタメタゾン', eq: 0.75, note: '長時間型' },
]

export function SteroidPage() {
  const [fromId, setFrom] = useState('prednisolone')
  const [dose, setDose] = useState('')
  const from = steroids.find((s) => s.id === fromId)!
  const d = parseNum(dose)
  return (
    <Page title="ステロイド換算">
      <Section>
        <SelectRow label="薬" options={steroids.map((s) => [s.id, s.name] as [string, string])} value={fromId} onChange={setFrom} />
        <NumField title="量" value={dose} onChange={setDose} unit="mg" />
      </Section>
      {d != null && d > 0 &&
        (() => {
          const pred = (d / from.eq) * 5
          return (
            <Section header="相当量（抗炎症作用）">
              {steroids.map((s) => (
                <ResultRow
                  title={s.name}
                  value={fmtTrim((pred / 5) * s.eq, 2)}
                  unit="mg"
                  note={s.note}
                  big={s.id === 'prednisolone'}
                  color={s.id === fromId ? 'orange' : undefined}
                />
              ))}
            </Section>
          )
        })()}
      <Section header="換算表（プレドニゾロン5mg相当）" footer="抗炎症作用で比べた一般的な目安です。鉱質コルチコイド作用や作用時間は薬ごとに違います。">
        {steroids.map((s) => (
          <div class="row labeled small">
            <span>{s.name}</span>
            <span class="num">{fmtTrim(s.eq, 2)}mg</span>
          </div>
        ))}
      </Section>
    </Page>
  )
}
