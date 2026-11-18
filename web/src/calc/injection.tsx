import { useState } from 'preact/hooks'
import { MissingRow, NumField, Page, QuickButtons, ResultRow, Section, Segmented, SelectRow } from '../ui/components'
import { fmt, fmtTrim, parseNum } from '../core/format'
import { useStore } from '../core/store'
import { patientStore, setPatient, weightV } from '../core/patient'

export function DripPage() {
  const [volume, setVolume] = useState('')
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [factor, setFactor] = useState(20)
  const totalMin = (parseNum(hours) ?? 0) * 60 + (parseNum(minutes) ?? 0)
  const v = parseNum(volume)
  return (
    <Page title="点滴の滴下速度">
      <Section>
        <NumField title="輸液量" value={volume} onChange={setVolume} unit="mL" />
        <QuickButtons values={[50, 100, 250, 500, 1000]} onPick={setVolume} suffix="mL" />
        <NumField title="時間" value={hours} onChange={setHours} unit="時間" />
        <NumField title="＋" value={minutes} onChange={setMinutes} unit="分" integer />
        <SelectRow<number>
          label="輸液セット"
          options={[
            [20, '成人用 20滴/mL'],
            [60, '小児用 60滴/mL'],
          ]}
          value={factor}
          onChange={setFactor}
        />
      </Section>
      {v != null && v > 0 && totalMin > 0 &&
        (() => {
          const mlh = (v / totalMin) * 60
          const dpm = (v * factor) / totalMin
          return (
            <Section header="結果">
              <ResultRow title="流量" value={fmt(mlh, 1)} unit="mL/h" />
              <ResultRow title="滴下数" value={fmt(dpm, 1)} unit="滴/分" color="orange" />
              <ResultRow title="10秒あたり" value={fmt(dpm / 6, 1)} unit="滴" />
              <ResultRow title="1滴の間隔" value={fmt(60 / dpm, 1)} unit="秒" />
            </Section>
          )
        })()}
    </Page>
  )
}

export function GammaPage() {
  const p = useStore(patientStore)
  const [drugMg, setDrugMg] = useState('')
  const [volume, setVolume] = useState('')
  const [input, setInput] = useState('')
  const [fromGamma, setFromGamma] = useState(true)
  const mg = parseNum(drugMg), v = parseNum(volume), w = weightV(p), x = parseNum(input)
  return (
    <Page title="γ計算">
      <Section footer="例：ドパミン 150mg/50mL（3mg/mL）">
        <NumField title="薬の量" value={drugMg} onChange={setDrugMg} unit="mg" />
        <NumField title="溶液の全量" value={volume} onChange={setVolume} unit="mL" />
        <NumField title="体重" value={p.weight} onChange={(s) => setPatient('weight', s)} unit="kg" />
      </Section>
      <Section>
        <Segmented<boolean>
          label="計算"
          options={[
            [true, 'γ → mL/h'],
            [false, 'mL/h → γ'],
          ]}
          value={fromGamma}
          onChange={setFromGamma}
        />
        <NumField title={fromGamma ? '投与速度' : '流量'} value={input} onChange={setInput} unit={fromGamma ? 'μg/kg/min' : 'mL/h'} />
      </Section>
      {mg != null && mg > 0 && v != null && v > 0 && w != null && w > 0 ? (
        (() => {
          const conc = (mg * 1000) / v
          return (
            <Section header="結果">
              <ResultRow title="濃度" value={fmtTrim(conc, 1)} unit="μg/mL" big={false} />
              <ResultRow title="1 mL/h は" value={fmt(conc / (w * 60), 3)} unit="γ" big={false} />
              {x != null && x > 0 &&
                (fromGamma ? (
                  <ResultRow title="流量" value={fmt((x * w * 60) / conc, 2)} unit="mL/h" color="orange" />
                ) : (
                  <ResultRow title="投与速度" value={fmt((x * conc) / (w * 60), 2)} unit="μg/kg/min" color="orange" />
                ))}
            </Section>
          )
        })()
      ) : (
        <Section>
          <MissingRow>薬の量・溶液量・体重を入力してください</MissingRow>
        </Section>
      )}
    </Page>
  )
}
