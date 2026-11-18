import { useState } from 'preact/hooks'
import { NumField, Page, ResultRow, Section, Segmented, SelectRow, WarningRow } from '../ui/components'
import { fmtTrim, parseIntNum, parseNum } from '../core/format'

const sheetSizes = [6, 7, 10, 12, 14, 20, 21, 28]

export function RemainingPage() {
  const [daily, setDaily] = useState('')
  const [days, setDays] = useState('')
  const [remain, setRemain] = useState('')
  const d = parseNum(daily), n = parseIntNum(days)
  return (
    <Page title="残薬調整">
      <Section>
        <NumField title="1日量" value={daily} onChange={setDaily} unit="錠" />
        <NumField title="処方日数" value={days} onChange={setDays} unit="日" integer />
        <NumField title="残薬" value={remain} onChange={setRemain} unit="錠" />
      </Section>
      {d != null && d > 0 && n != null && n > 0 &&
        (() => {
          const r = Math.max(0, parseNum(remain) ?? 0)
          const covered = Math.floor(r / d + 1e-9)
          const frac = r - covered * d
          const adjDays = Math.max(0, n - covered)
          return (
            <>
              <Section header="日数で調整">
                <ResultRow title="残薬で足りる日数" value={String(covered)} unit="日" />
                <ResultRow title="調整後の処方日数" value={String(adjDays)} unit="日" color="orange" />
                <ResultRow
                  title="調整後の処方数"
                  value={fmtTrim(adjDays * d)}
                  unit="錠"
                  note={frac > 0.0001 ? `1日分に満たない残薬 ${fmtTrim(frac)}錠 が手元に残ります` : undefined}
                />
              </Section>
              <Section header="総数で調整">
                <ResultRow title="必要数 − 残薬" value={fmtTrim(Math.max(0, d * n - r))} unit="錠" note="総数で調整する場合（日数は変えずに数量だけ減らす）" />
              </Section>
              {covered >= n && (
                <Section>
                  <WarningRow>残薬だけで処方日数分が足ります</WarningRow>
                </Section>
              )}
            </>
          )
        })()}
    </Page>
  )
}

/** シートの規格を選ぶ部品（0 は「その他」） */
function SheetSizePicker(props: { size: number; setSize: (n: number) => void; custom: string; setCustom: (s: string) => void }) {
  return (
    <>
      <SelectRow<number>
        label="1シートの錠数"
        options={[...sheetSizes.map((n) => [n, String(n)] as [number, string]), [0, 'その他']]}
        value={props.size}
        onChange={props.setSize}
      />
      {props.size === 0 && <NumField title="1シートの錠数" value={props.custom} onChange={props.setCustom} unit="錠" integer />}
    </>
  )
}

export function sheetBreakdown(total: number, size: number) {
  const sheets = Math.floor(total / size + 1e-9)
  return { sheets, rest: Math.max(0, total - sheets * size) }
}

export function SheetPage() {
  const [total, setTotal] = useState('')
  const [daily, setDaily] = useState('')
  const [days, setDays] = useState('')
  const [useDaily, setUseDaily] = useState(false)
  const [size, setSize] = useState(10)
  const [custom, setCustom] = useState('')
  const s = size === 0 ? parseIntNum(custom) ?? 0 : size
  const dd = parseNum(daily), dn = parseIntNum(days)
  const t = useDaily ? (dd != null && dn != null ? dd * dn : null) : parseNum(total)
  return (
    <Page title="PTPシート換算">
      <Section>
        <Segmented<boolean>
          label="入力方法"
          options={[
            [false, '総数'],
            [true, '1日量×日数'],
          ]}
          value={useDaily}
          onChange={setUseDaily}
        />
        {useDaily ? (
          <>
            <NumField title="1日量" value={daily} onChange={setDaily} unit="錠" />
            <NumField title="日数" value={days} onChange={setDays} unit="日" integer />
          </>
        ) : (
          <NumField title="総数" value={total} onChange={setTotal} unit="錠" />
        )}
        <SheetSizePicker size={size} setSize={setSize} custom={custom} setCustom={setCustom} />
      </Section>
      {t != null && t > 0 && s > 0 &&
        (() => {
          const b = sheetBreakdown(t, s)
          return (
            <Section header="結果">
              <ResultRow title="総数" value={fmtTrim(t)} unit="錠" />
              <ResultRow title="シート" value={String(b.sheets)} unit="シート" color="orange" />
              <ResultRow title="バラ" value={fmtTrim(b.rest)} unit="錠" />
            </Section>
          )
        })()}
    </Page>
  )
}

export function UnevenPage() {
  const [morning, setMorning] = useState('')
  const [noon, setNoon] = useState('')
  const [evening, setEvening] = useState('')
  const [bedtime, setBedtime] = useState('')
  const [days, setDays] = useState('')
  const [size, setSize] = useState(10)
  const [custom, setCustom] = useState('')
  const perDay = [morning, noon, evening, bedtime].map(parseNum).reduce<number>((a, v) => a + (v ?? 0), 0)
  const n = parseIntNum(days)
  return (
    <Page title="不均等投与">
      <Section header="1回量">
        <NumField title="朝" value={morning} onChange={setMorning} unit="錠" />
        <NumField title="昼" value={noon} onChange={setNoon} unit="錠" />
        <NumField title="夕" value={evening} onChange={setEvening} unit="錠" />
        <NumField title="寝る前" value={bedtime} onChange={setBedtime} unit="錠" />
      </Section>
      <Section>
        <NumField title="日数" value={days} onChange={setDays} unit="日" integer />
        <SheetSizePicker size={size} setSize={setSize} custom={custom} setCustom={setCustom} />
      </Section>
      {perDay > 0 && n != null && n > 0 &&
        (() => {
          const total = perDay * n
          const s = size === 0 ? parseIntNum(custom) ?? 0 : size
          const b = s > 0 ? sheetBreakdown(total, s) : null
          return (
            <Section header="結果">
              <ResultRow title="1日量" value={fmtTrim(perDay)} unit="錠" />
              <ResultRow title="総数" value={fmtTrim(total)} unit="錠" color="orange" />
              {b && <ResultRow title="シート換算" value={`${b.sheets}シート＋${fmtTrim(b.rest)}錠`} big={false} />}
            </Section>
          )
        })()}
    </Page>
  )
}
