import { useState } from 'preact/hooks'
import { ButtonRow, NumField, Page, ResultRow, Section, Segmented, SelectRow } from '../ui/components'
import { fmt, parseIntNum, parseNum } from '../core/format'

/** 補正Ca・Child-Pugh分類 */
export function LabPage() {
  const [ca, setCa] = useState('')
  const [alb, setAlb] = useState('')
  const [bil, setBil] = useState('')
  const [alb2, setAlb2] = useState('')
  const [inr, setInr] = useState('')
  const [ascites, setAscites] = useState(1)
  const [enceph, setEnceph] = useState(1)
  const c = parseNum(ca), a = parseNum(alb)
  const b = parseNum(bil), a2 = parseNum(alb2), i = parseNum(inr)
  return (
    <Page title="Child-Pugh・補正Ca">
      <Section
        header="Child-Pugh分類"
        footer="ビリルビン：2未満1点、2〜3は2点、3超3点。アルブミン：3.5超1点、2.8〜3.5は2点、2.8未満3点。PT-INR：1.7未満1点、1.7〜2.3は2点、2.3超3点。A：5〜6点、B：7〜9点、C：10〜15点。"
      >
        <NumField title="総ビリルビン" value={bil} onChange={setBil} unit="mg/dL" />
        <NumField title="アルブミン" value={alb2} onChange={setAlb2} unit="g/dL" />
        <NumField title="PT-INR" value={inr} onChange={setInr} />
        <SelectRow<number>
          label="腹水"
          options={[
            [1, 'なし'],
            [2, '軽度'],
            [3, '中等度以上'],
          ]}
          value={ascites}
          onChange={setAscites}
        />
        <SelectRow<number>
          label="肝性脳症"
          options={[
            [1, 'なし'],
            [2, '軽度（I・II度）'],
            [3, '昏睡（III度以上）'],
          ]}
          value={enceph}
          onChange={setEnceph}
        />
        {b != null && a2 != null && i != null &&
          (() => {
            const sb = b < 2 ? 1 : b <= 3 ? 2 : 3
            const sa = a2 > 3.5 ? 1 : a2 >= 2.8 ? 2 : 3
            const si = i < 1.7 ? 1 : i <= 2.3 ? 2 : 3
            const total = sb + sa + si + ascites + enceph
            const grade = total <= 6 ? 'A' : total <= 9 ? 'B' : 'C'
            return <ResultRow title="Child-Pugh" value={`${grade}（${total}点）`} note={`ビリルビン${sb}・アルブミン${sa}・PT-INR${si}・腹水${ascites}・脳症${enceph}点`} color="orange" />
          })()}
      </Section>
      <Section header="補正カルシウム（Payne式）" footer="補正Ca = 血清Ca＋(4−アルブミン)。アルブミンが4g/dL以上なら補正しません。">
        <NumField title="血清Ca" value={ca} onChange={setCa} unit="mg/dL" />
        <NumField title="アルブミン" value={alb} onChange={setAlb} unit="g/dL" />
        {c != null && a != null && c > 0 && a > 0 &&
          (() => {
            const corr = a < 4 ? c + (4 - a) : c
            return (
              <ResultRow
                title="補正Ca"
                value={fmt(corr, 1)}
                unit="mg/dL"
                note={corr > 10.4 ? '高カルシウム血症の目安（10.4mg/dL超）' : corr < 8.5 ? '低カルシウム血症の目安（8.5mg/dL未満）' : undefined}
                color="orange"
              />
            )
          })()}
      </Section>
    </Page>
  )
}

/** 1剤1日分（1調剤単位）の薬価から点数：15円以下は1点、それを超えると10で割って五捨五超入 */
export function feePoints(yen: number): number {
  if (yen <= 15) return 1
  const x = yen / 10
  const fl = Math.floor(x)
  return x - fl > 0.5 + 1e-9 ? fl + 1 : fl
}

/** 薬剤料と窓口負担 */
export function FeePage() {
  const [rows, setRows] = useState([{ price: '', days: '' }, { price: '', days: '' }, { price: '', days: '' }])
  const [otherPoints, setOtherPoints] = useState('')
  const [rate, setRate] = useState(3)
  const set = (i: number, k: 'price' | 'days', v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const drug = rows.reduce((acc, r) => {
    const p = parseNum(r.price), d = parseIntNum(r.days)
    return p != null && p > 0 && d != null && d > 0 ? acc + feePoints(p) * d : acc
  }, 0)
  const total = drug + (parseIntNum(otherPoints) ?? 0)
  const yen = total * 10
  const pay = Math.round((yen * rate) / 10 / 10) * 10
  return (
    <Page title="薬剤料・負担金">
      {rows.map((r, i) => {
        const p = parseNum(r.price), d = parseIntNum(r.days)
        return (
          <Section header={`${i + 1}剤目`}>
            <NumField title="1日分の薬価の合計" value={r.price} onChange={(v) => set(i, 'price', v)} unit="円" />
            <NumField title="日数・回数" value={r.days} onChange={(v) => set(i, 'days', v)} unit="日" integer />
            {p != null && p > 0 && d != null && d > 0 && <ResultRow title="薬剤料" value={String(feePoints(p) * d)} unit="点" note={`${feePoints(p)}点 × ${d}`} big={false} />}
          </Section>
        )
      })}
      <Section>
        <ButtonRow onClick={() => setRows((r) => [...r, { price: '', days: '' }])}>剤を追加</ButtonRow>
      </Section>
      <Section footer="その他の点数には、調剤基本料・薬剤調製料・調剤管理料・服薬管理指導料などの合計を入れます。">
        <NumField title="その他の点数（任意）" value={otherPoints} onChange={setOtherPoints} unit="点" />
        <Segmented<number>
          label="負担割合"
          options={[
            [1, '1割'],
            [2, '2割'],
            [3, '3割'],
          ]}
          value={rate}
          onChange={setRate}
        />
      </Section>
      {total > 0 && (
        <Section
          header="結果"
          footer="内服薬は1剤の1日分、頓服・外用は1調剤分の薬価で計算します（日数・回数には頓服・外用なら1を入れます）。窓口負担は10円未満を四捨五入。公費・高額療養費・上限額は考慮していません。"
        >
          <ResultRow title="薬剤料の合計" value={String(drug)} unit="点" big={false} />
          <ResultRow title="合計" value={String(total)} unit="点" note={`${yen}円`} />
          <ResultRow title={`窓口負担（${rate}割）`} value={String(pay)} unit="円" color="orange" />
        </Section>
      )}
    </Page>
  )
}
