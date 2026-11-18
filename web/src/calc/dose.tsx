import { useState } from 'preact/hooks'
import { MissingRow, NumField, Page, QuickButtons, ResultRow, Section, Segmented, WarningRow } from '../ui/components'
import { fmt, fmtTrim, parseIntNum, parseNum } from '../core/format'
import { useStore } from '../core/store'
import { ageV, patientStore, setPatient, weightV } from '../core/patient'

export function PowderPage() {
  const [toGram, setToGram] = useState(true)
  const [conc, setConc] = useState('10')
  const [percent, setPercent] = useState(true)
  const [amount, setAmount] = useState('')
  const [times, setTimes] = useState('3')
  const [days, setDays] = useState('')
  const c = parseNum(conc), a = parseNum(amount), t = parseIntNum(times), n = parseIntNum(days)
  const unit = percent ? '%' : 'mg/g'
  return (
    <Page title="散剤の換算">
      <Section footer="10% = 100mg/g。力価表示の製剤は力価の値を入れてください。">
        <Segmented<boolean>
          label="計算"
          options={[
            [true, '成分量 → 製剤量'],
            [false, '製剤量 → 成分量'],
          ]}
          value={toGram}
          onChange={setToGram}
        />
        <NumField title="製剤の濃度" value={conc} onChange={setConc} unit={unit} />
        <Segmented<boolean>
          label="濃度の単位"
          options={[
            [true, '%'],
            [false, 'mg/g'],
          ]}
          value={percent}
          onChange={setPercent}
        />
        <QuickButtons values={[1, 2, 5, 10, 20, 50]} onPick={setConc} suffix={unit} />
      </Section>
      <Section>
        {toGram ? <NumField title="1日の成分量" value={amount} onChange={setAmount} unit="mg" /> : <NumField title="1日の製剤量" value={amount} onChange={setAmount} unit="g" />}
        <NumField title="1日の回数" value={times} onChange={setTimes} unit="回" integer />
        <NumField title="日数（任意）" value={days} onChange={setDays} unit="日" integer />
      </Section>
      {c != null && c > 0 && a != null && a > 0 &&
        (() => {
          const mgPerG = percent ? c * 10 : c
          const gram = toGram ? a / mgPerG : a
          const mg = toGram ? a : a * mgPerG
          return (
            <Section header="結果">
              <ResultRow title="製剤の濃度" value={fmtTrim(mgPerG, 3)} unit="mg/g" big={false} />
              {toGram ? <ResultRow title="1日の製剤量" value={fmtTrim(gram, 3)} unit="g" color="orange" /> : <ResultRow title="1日の成分量" value={fmtTrim(mg, 2)} unit="mg" color="orange" />}
              {t != null && t > 0 && <ResultRow title="1回（1包）" value={fmtTrim(gram / t, 3)} unit="g" note={`成分量 ${fmtTrim(mg / t, 2)}mg`} />}
              {n != null && n > 0 && <ResultRow title={`総量（${n}日分）`} value={fmtTrim(gram * n, 3)} unit="g" />}
            </Section>
          )
        })()}
    </Page>
  )
}

/** von Harnack の換算表（年齢の下限, 成人量に対する比, 表示） */
const harnack: [number, number, string][] = [
  [0, 0, '新生児（表の対象外）'],
  [0.25, 1 / 6, '3か月 1/6'],
  [0.5, 1 / 5, '6か月 1/5'],
  [1, 1 / 4, '1歳 1/4'],
  [3, 1 / 3, '3歳 1/3'],
  [7.5, 1 / 2, '7.5歳 1/2'],
  [12, 2 / 3, '12歳 2/3'],
  [20, 1, '成人 1'],
]

export function PediatricPage() {
  const p = useStore(patientStore)
  const [adult, setAdult] = useState('')
  const [unit, setUnit] = useState('mg')
  const age = ageV(p), a = parseNum(adult)
  return (
    <Page title="小児薬用量">
      <Section footer="1歳未満は「か月」に入れてください（1歳6か月なら 1歳＋6か月）。年齢は患者情報と共通です。">
        <NumField title="年齢" value={p.age} onChange={(v) => setPatient('age', v)} unit="歳" />
        <NumField title="＋か月（1歳未満など）" value={p.months} onChange={(v) => setPatient('months', v)} unit="か月" />
        <NumField title="成人量" value={adult} onChange={setAdult} unit={unit} />
        <div class="row quick">
          {['mg', 'g', 'mL', '錠'].map((u) => (
            <button class={'chip ' + (u === unit ? 'on' : '')} onClick={() => setUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </Section>
      {age != null && age >= 0 && a != null && a > 0 && (
        <Section header="小児の量（目安）" footer="あくまで目安です。添付文書や小児の用量の資料で必ず確認してください。">
          {age >= 1 ? (
            (() => {
              const r = Math.min((age * 4 + 20) / 100, 1)
              return <ResultRow title="Augsberger-II式" value={fmtTrim(a * r, 2)} unit={unit} note={`成人量 ×（年齢×4＋20）÷100 ＝ ×${fmt(r, 2)}`} />
            })()
          ) : (
            <MissingRow>Augsberger-II式は1歳以上が対象です</MissingRow>
          )}
          {(() => {
            const h = [...harnack].reverse().find((x) => age >= x[0]) ?? harnack[0]
            return h[1] > 0 ? <ResultRow title="von Harnack" value={fmtTrim(a * h[1], 2)} unit={unit} note={`表の ${h[2]} を適用（表の年齢の間は目安）`} /> : null
          })()}
          {age < 12 &&
            (() => {
              const y = age / (age + 12)
              return <ResultRow title="Young式" value={fmtTrim(a * y, 2)} unit={unit} note={`成人量 × 年齢 ÷（年齢＋12）＝ ×${fmt(y, 2)}`} />
            })()}
        </Section>
      )}
    </Page>
  )
}

export function WeightDosePage() {
  const p = useStore(patientStore)
  const [perKg, setPerKg] = useState('')
  const [times, setTimes] = useState('3')
  const [maxDaily, setMaxDaily] = useState('')
  const [perDose, setPerDose] = useState(false)
  const w = weightV(p), k = parseNum(perKg), t = parseIntNum(times)
  return (
    <Page title="体重あたりの用量">
      <Section>
        <NumField title="体重" value={p.weight} onChange={(v) => setPatient('weight', v)} unit="kg" />
        <Segmented<boolean>
          label="用量の単位"
          options={[
            [false, 'mg/kg/日'],
            [true, 'mg/kg/回'],
          ]}
          value={perDose}
          onChange={setPerDose}
        />
        <NumField title="用量" value={perKg} onChange={setPerKg} unit={perDose ? 'mg/kg/回' : 'mg/kg/日'} />
        <NumField title="1日の回数" value={times} onChange={setTimes} unit="回" integer />
        <NumField title="1日の上限（任意）" value={maxDaily} onChange={setMaxDaily} unit="mg" />
      </Section>
      {w != null && w > 0 && k != null && k > 0 && t != null && t > 0 &&
        (() => {
          const raw = perDose ? k * w * t : k * w
          const cap = parseNum(maxDaily)
          const daily = cap != null ? Math.min(raw, cap) : raw
          return (
            <Section header="結果">
              <ResultRow title="1日量" value={fmtTrim(daily, 2)} unit="mg" color="orange" />
              <ResultRow title="1回量" value={fmtTrim(daily / t, 2)} unit="mg" />
              {cap != null && raw > cap && (
                <WarningRow>
                  計算値 {fmtTrim(raw, 2)}mg が上限 {fmtTrim(cap, 2)}mg を超えたため、上限で表示しています
                </WarningRow>
              )}
            </Section>
          )
        })()}
    </Page>
  )
}
