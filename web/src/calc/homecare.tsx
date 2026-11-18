import { useState } from 'preact/hooks'
import { MissingRow, NumField, Page, QuickButtons, ResultRow, Section, Segmented, Toggle, WarningRow } from '../ui/components'
import { fmtTrim, parseIntNum, parseNum } from '../core/format'
import { useStore } from '../core/store'
import { ageV, heightV, patientStore, weightV } from '../core/patient'
import { PatientFields } from './patient'

/** 持続皮下注・PCA */
export function PCAPage() {
  const [daily, setDaily] = useState('')
  const [concMode, setConcMode] = useState(0)
  const [conc, setConc] = useState('')
  const [drugMg, setDrugMg] = useState('')
  const [totalMl, setTotalMl] = useState('')
  const [rescueTimes, setRescueTimes] = useState('')
  const [container, setContainer] = useState('')
  const c = (() => {
    if (concMode === 0) return parseNum(conc)
    const m = parseNum(drugMg), v = parseNum(totalMl)
    return m != null && v != null && v > 0 ? m / v : null
  })()
  const d = parseNum(daily)
  return (
    <Page title="持続皮下注・PCA">
      <Section>
        <NumField title="1日量" value={daily} onChange={setDaily} unit="mg/日" />
        <Segmented<number>
          label="薬液"
          options={[
            [0, '濃度で入力'],
            [1, '薬の量と全量'],
          ]}
          value={concMode}
          onChange={setConcMode}
        />
        {concMode === 0 ? (
          <NumField title="濃度" value={conc} onChange={setConc} unit="mg/mL" />
        ) : (
          <>
            <NumField title="薬の量" value={drugMg} onChange={setDrugMg} unit="mg" />
            <NumField title="全量" value={totalMl} onChange={setTotalMl} unit="mL" />
          </>
        )}
      </Section>
      <Section>
        <NumField title="早送りの回数（1日・任意）" value={rescueTimes} onChange={setRescueTimes} unit="回" integer />
        <NumField title="容器の容量（任意）" value={container} onChange={setContainer} unit="mL" />
      </Section>
      {d != null && d > 0 && c != null && c > 0 &&
        (() => {
          const mlDay = d / c
          const bolus = mlDay / 24
          const r = parseIntNum(rescueTimes)
          const used = mlDay + bolus * (r ?? 0)
          const v = parseNum(container)
          return (
            <Section header="結果" footer="流量 = 1日量 ÷ 濃度 ÷ 24。早送り（レスキュー）は1時間量が目安で、ロックアウト時間は15〜30分程度が一般的です。">
              {concMode === 1 && <ResultRow title="濃度" value={fmtTrim(c, 3)} unit="mg/mL" big={false} />}
              <ResultRow title="1日の液量" value={fmtTrim(mlDay, 2)} unit="mL/日" />
              <ResultRow title="流量" value={fmtTrim(mlDay / 24, 3)} unit="mL/h" color="orange" />
              <ResultRow title="早送り1回（1時間量）" value={fmtTrim(bolus, 3)} unit="mL" note={`薬の量 ${fmtTrim(d / 24, 2)}mg`} />
              {r != null && r > 0 && <ResultRow title="早送り込みの1日の液量" value={fmtTrim(used, 2)} unit="mL/日" note={`薬の量 ${fmtTrim(used * c, 2)}mg/日`} big={false} />}
              {v != null && v > 0 && <ResultRow title="容器が空になるまで" value={fmtTrim(v / used, 1)} unit="日" note={`約${fmtTrim((v / used) * 24, 0)}時間`} />}
            </Section>
          )
        })()}
    </Page>
  )
}

/** 必要エネルギー・水分・たんぱく質、輸液のカロリー */
export function NutritionPage() {
  const p = useStore(patientStore)
  const [activity, setActivity] = useState('1.2')
  const [stress, setStress] = useState('1.0')
  const [glucose, setGlucose] = useState('')
  const [amino, setAmino] = useState('')
  const [fat, setFat] = useState('')
  const a = ageV(p), w = weightV(p), h = heightV(p)
  const g = parseNum(glucose) ?? 0, aa = parseNum(amino) ?? 0, f = parseNum(fat) ?? 0
  return (
    <Page title="栄養・輸液">
      <Section header="患者情報（共通）">
        <PatientFields fields={['age', 'sex', 'height', 'weight']} />
      </Section>
      <Section footer="活動係数：寝たきり1.0、ベッド上安静1.2、ベッド外活動1.3。ストレス係数：なし1.0、軽い手術・褥瘡1.1〜1.2、感染症・発熱1.2〜1.3。">
        <NumField title="活動係数" value={activity} onChange={setActivity} />
        <QuickButtons values={[1.0, 1.1, 1.2, 1.3, 1.5]} onPick={setActivity} />
        <NumField title="ストレス係数" value={stress} onChange={setStress} />
        <QuickButtons values={[1.0, 1.1, 1.2, 1.3, 1.5]} onPick={setStress} />
      </Section>
      {a != null && w != null && h != null && a > 0 && w > 0 && h > 0 ? (
        (() => {
          const bee = p.sex === 'male' ? 66.47 + 13.75 * w + 5.0 * h - 6.76 * a : 655.1 + 9.56 * w + 1.85 * h - 4.68 * a
          const af = parseNum(activity) ?? 1, sf = parseNum(stress) ?? 1
          return (
            <Section
              header="必要量（Harris-Benedict式）"
              footer={'男性：66.47＋13.75×体重＋5.0×身長−6.76×年齢\n女性：655.1＋9.56×体重＋1.85×身長−4.68×年齢\n必要エネルギー＝基礎エネルギー×活動係数×ストレス係数'}
            >
              <ResultRow title="基礎エネルギー消費量" value={fmtTrim(bee, 0)} unit="kcal/日" big={false} />
              <ResultRow
                title="必要エネルギー"
                value={fmtTrim(bee * af * sf, 0)}
                unit="kcal/日"
                note={`簡易法（25〜30kcal/kg）なら ${fmtTrim(w * 25, 0)}〜${fmtTrim(w * 30, 0)}kcal/日`}
                color="orange"
              />
              <ResultRow title="必要水分量" value={`${fmtTrim(w * 30, 0)}〜${fmtTrim(w * 35, 0)}`} unit="mL/日" note="30〜35mL/kg/日（心不全・腎不全では制限することがあります）" big={false} />
              <ResultRow title="必要たんぱく質" value={`${fmtTrim(w * 1.0, 0)}〜${fmtTrim(w * 1.2, 0)}`} unit="g/日" note="1.0〜1.2g/kg/日（腎機能に合わせて調整）" big={false} />
            </Section>
          )
        })()
      ) : (
        <Section>
          <MissingRow>年齢・性別・身長・体重を入力してください</MissingRow>
        </Section>
      )}
      <Section header="輸液・経腸栄養のカロリー（1日分）" footer="ブドウ糖4kcal/g、アミノ酸4kcal/g、脂肪9kcal/g。窒素量＝アミノ酸×0.16。">
        <NumField title="ブドウ糖" value={glucose} onChange={setGlucose} unit="g" />
        <NumField title="アミノ酸" value={amino} onChange={setAmino} unit="g" />
        <NumField title="脂肪" value={fat} onChange={setFat} unit="g" />
        {g + aa + f > 0 &&
          (() => {
            const npc = g * 4 + f * 9
            return (
              <>
                <ResultRow title="総エネルギー" value={fmtTrim(npc + aa * 4, 0)} unit="kcal" color="orange" />
                <ResultRow title="非たんぱくカロリー（NPC）" value={fmtTrim(npc, 0)} unit="kcal" big={false} />
                {aa > 0 && <ResultRow title="NPC/N比" value={fmtTrim(npc / (aa * 0.16), 0)} note="一般に150〜200。腎不全では高め、侵襲が大きいときは低め" big={false} />}
              </>
            )
          })()}
      </Section>
    </Page>
  )
}

/** 在宅酸素ボンベの残り時間 */
export function OxygenPage() {
  const [capacity, setCapacity] = useState('500')
  const [fullPressure, setFullPressure] = useState('14.7')
  const [pressure, setPressure] = useState('')
  const [flow, setFlow] = useState('')
  const [conserver, setConserver] = useState(false)
  const [ratio, setRatio] = useState('3')
  const cap = parseNum(capacity), fp = parseNum(fullPressure), pr = parseNum(pressure), f = parseNum(flow)
  const hm = (m: number) => {
    const total = Math.floor(m)
    return `${Math.floor(total / 60)}時間${total % 60}分`
  }
  return (
    <Page title="酸素ボンベ">
      <Section footer="呼吸同調器は機種と呼吸数で変わりますが、2〜3倍長持ちするのが目安です。">
        <NumField title="ボンベの容量（満充填）" value={capacity} onChange={setCapacity} unit="L" />
        <QuickButtons values={[150, 200, 300, 500]} onPick={setCapacity} suffix="L" />
        <NumField title="満充填の圧力" value={fullPressure} onChange={setFullPressure} unit="MPa" />
        <NumField title="いまの圧力" value={pressure} onChange={setPressure} unit="MPa" />
        <NumField title="流量" value={flow} onChange={setFlow} unit="L/分" />
        <QuickButtons values={[0.5, 1, 1.5, 2, 3]} onPick={setFlow} suffix="L" />
        <Toggle label="呼吸同調器を使う" value={conserver} onChange={setConserver} />
        {conserver && <NumField title="節約倍率" value={ratio} onChange={setRatio} unit="倍" />}
      </Section>
      {cap != null && fp != null && pr != null && f != null && cap > 0 && fp > 0 && pr >= 0 && f > 0 &&
        (() => {
          const remain = (cap * pr) / fp
          const r = conserver ? parseNum(ratio) ?? 1 : 1
          const minutes = (remain / f) * r
          return (
            <Section header="結果" footer="残量 = 容量 × いまの圧力 ÷ 満充填の圧力、使える時間 = 残量 ÷ 流量（× 同調器の倍率）">
              <ResultRow title="残りの酸素量" value={fmtTrim(remain, 0)} unit="L" />
              <ResultRow title="使える時間" value={hm(minutes)} color="orange" />
              <ResultRow title="安全を見た時間（8割）" value={hm(minutes * 0.8)} note="移動や外出の計画はこちらで" big={false} />
            </Section>
          )
        })()}
    </Page>
  )
}

/** 消毒液の希釈（次亜塩素酸ナトリウムなど） */
export function DilutionPage() {
  const [stock, setStock] = useState('6')
  const [target, setTarget] = useState('0.1')
  const [amount, setAmount] = useState('1000')
  const s = parseNum(stock), t = parseNum(target), v = parseNum(amount)
  return (
    <Page title="消毒液の希釈">
      <Section footer="次亜塩素酸ナトリウムの目安：ノロウイルスの吐物・便の処理は0.1%（1000ppm）、ドアノブや手すりなどの拭き取りは0.02〜0.05%（200〜500ppm）。家庭用塩素系漂白剤は約5〜6%。">
        <NumField title="原液の濃度" value={stock} onChange={setStock} unit="%" />
        <QuickButtons values={[1, 5, 6, 12]} onPick={setStock} suffix="%" />
        <NumField title="作りたい濃度" value={target} onChange={setTarget} unit="%" />
        <QuickButtons values={[0.02, 0.05, 0.1]} onPick={setTarget} suffix="%" />
        <NumField title="作る量" value={amount} onChange={setAmount} unit="mL" />
        <QuickButtons values={[500, 1000, 2000, 5000]} onPick={setAmount} suffix="mL" />
      </Section>
      {s != null && t != null && v != null && s > 0 && t > 0 && v > 0 && (
        <Section header="結果">
          {t >= s ? (
            <WarningRow>作りたい濃度が原液以上です</WarningRow>
          ) : (
            (() => {
              const x = (v * t) / s
              return (
                <>
                  <ResultRow title="原液" value={fmtTrim(x, 1)} unit="mL" note={`ペットボトルのキャップ1杯は約5mL → 約${fmtTrim(x / 5, 1)}杯`} color="orange" />
                  <ResultRow title="水" value={fmtTrim(v - x, 1)} unit="mL" />
                  <ResultRow title="濃度（ppm）" value={fmtTrim(t * 10000, 0)} unit="ppm" big={false} />
                </>
              )
            })()
          )}
        </Section>
      )}
    </Page>
  )
}
