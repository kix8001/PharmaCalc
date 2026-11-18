import { useState } from 'preact/hooks'
import { ListChecks } from 'lucide-preact'
import { LinkRow, MissingRow, Page, ResultRow, Section, Toggle, WarningRow } from '../ui/components'
import { useNav } from '../ui/nav'
import { useStore } from '../core/store'
import { ageV, heightV, patientStore, scrV, cysV, weightV } from '../core/patient'
import { BodyCalc, Renal } from '../core/formulas'
import { fmt } from '../core/format'
import { PatientFields } from './patient'
import { RenalDrugsPage } from '../renal/renalDrugs'

export function RenalPage() {
  const p = useStore(patientStore)
  const nav = useNav()
  const [roundUp, setRoundUp] = useState(false)
  const age = ageV(p), w = weightV(p), h = heightV(p), cr0 = scrV(p), cys = cysV(p)
  const bsa = w != null && h != null && w > 0 && h > 0 ? BodyCalc.bsaDuBois(w, h) : null

  const ccr = () => {
    if (age == null || w == null || cr0 == null || cr0 <= 0 || w <= 0) return <MissingRow>年齢・体重・血清Crを入力してください</MissingRow>
    const cr = roundUp ? Math.max(cr0, 0.6) : cr0
    const actual = Renal.cockcroftGault(age, w, cr, p.sex)
    const ibw = h != null && h > 0 ? BodyCalc.idealWeight(h, p.sex) : null
    return (
      <>
        <ResultRow title={`実体重 ${fmt(w)}kg`} value={fmt(actual)} unit="mL/min" />
        {ibw != null && ibw > 0 && (
          <>
            <ResultRow
              title={`理想体重 ${fmt(ibw)}kg`}
              value={fmt(Renal.cockcroftGault(age, ibw, cr, p.sex))}
              unit="mL/min"
              note={w < ibw ? '実体重が理想体重より少ないため、実体重の値を使うのが一般的です' : undefined}
            />
            {w > ibw &&
              (() => {
                const abw = BodyCalc.adjustedWeight(w, ibw)
                return (
                  <ResultRow
                    title={`補正体重 ${fmt(abw)}kg`}
                    value={fmt(Renal.cockcroftGault(age, abw, cr, p.sex))}
                    unit="mL/min"
                    note={w > ibw * 1.2 ? '実体重が理想体重の120%を超えています。補正体重での値を考慮してください' : undefined}
                  />
                )
              })()}
          </>
        )}
      </>
    )
  }

  return (
    <Page title="腎機能">
      <Section header="患者情報（共通）">
        <PatientFields fields={['age', 'sex', 'height', 'weight', 'scr', 'cys']} />
      </Section>
      {age != null && age < 18 && (
        <Section>
          <WarningRow>18歳未満は成人の式の対象外です。小児用の式を使ってください。</WarningRow>
        </Section>
      )}
      <Section
        header="CCr（Cockcroft-Gault式）"
        footer={'CCr = (140−年齢)×体重 ÷ (72×血清Cr)、女性は×0.85\n理想体重（Devine）：男性 50＋0.91×(身長−152.4)、女性 45.5＋0.91×(身長−152.4)\n補正体重 = 理想体重＋0.4×(実体重−理想体重)'}
      >
        <Toggle label="Crが0.6未満なら0.6として計算" value={roundUp} onChange={setRoundUp} />
        {ccr()}
      </Section>
      <Section header="eGFR（血清Cr・日本人の式）" footer={'eGFR = 194 × Cr^−1.094 × 年齢^−0.287、女性は×0.739\n未補正値 = eGFR × 体表面積(DuBois) ÷ 1.73'}>
        {age != null && cr0 != null && cr0 > 0 && age > 0 ? (
          (() => {
            const e = Renal.egfrCr(age, cr0, p.sex)
            return (
              <>
                <ResultRow title="eGFR" value={fmt(e)} unit="mL/min/1.73m²" note={Renal.stage(e)} />
                {bsa != null ? (
                  <ResultRow title={`体表面積未補正（BSA ${fmt(bsa, 2)}m²）`} value={fmt(Renal.deindex(e, bsa))} unit="mL/min" note="薬の投与量の判断にはこちらを使います" />
                ) : (
                  <MissingRow>身長・体重を入れると、体表面積で補正しない値（mL/min）も出します</MissingRow>
                )}
              </>
            )
          })()
        ) : (
          <MissingRow>年齢・血清Crを入力してください</MissingRow>
        )}
      </Section>
      <Section header="eGFR（シスタチンC）" footer={'eGFRcys = 104 × CysC^−1.019 × 0.996^年齢（女性は×0.929）− 8\n筋肉量が極端に少ない・多い人では血清Crより正確なことがあります'}>
        {age != null && cys != null && cys > 0 && age > 0 ? (
          (() => {
            const e = Renal.egfrCys(age, cys, p.sex)
            return (
              <>
                <ResultRow title="eGFRcys" value={fmt(e)} unit="mL/min/1.73m²" note={Renal.stage(e)} />
                {bsa != null && <ResultRow title="体表面積未補正" value={fmt(Renal.deindex(e, bsa))} unit="mL/min" />}
              </>
            )
          })()
        ) : (
          <MissingRow>年齢・シスタチンCを入力してください</MissingRow>
        )}
      </Section>
      <Section footer="CCr・eGFRで減量や禁忌がある薬と、添付文書の該当箇所を見られます。">
        <LinkRow icon={<ListChecks size={20} />} onClick={() => nav.push(<RenalDrugsPage />)}>
          腎機能で注意する薬（添付文書）
        </LinkRow>
      </Section>
    </Page>
  )
}

export function BodyPage() {
  const p = useStore(patientStore)
  const w = weightV(p), h = heightV(p)
  const ok = w != null && h != null && w > 0 && h > 0
  return (
    <Page title="体表面積・体格">
      <Section header="患者情報（共通）">
        <PatientFields fields={['sex', 'height', 'weight']} />
      </Section>
      {ok ? (
        (() => {
          const b = BodyCalc.bmi(w, h)
          const ibw = BodyCalc.idealWeight(h, p.sex)
          return (
            <>
              <Section header="体表面積（BSA）" footer={'DuBois：0.007184 × W^0.425 × H^0.725\n藤本：0.008883 × W^0.444 × H^0.663\nMosteller：√(H×W÷3600)'}>
                <ResultRow title="DuBois式" value={fmt(BodyCalc.bsaDuBois(w, h), 3)} unit="m²" />
                <ResultRow title="藤本式" value={fmt(BodyCalc.bsaFujimoto(w, h), 3)} unit="m²" />
                <ResultRow title="Mosteller式" value={fmt(BodyCalc.bsaMosteller(w, h), 3)} unit="m²" />
              </Section>
              <Section header="体格">
                <ResultRow title="BMI" value={fmt(b)} note={BodyCalc.bmiCategory(b) + '（日本肥満学会の基準）'} />
                <ResultRow title="標準体重（BMI 22）" value={fmt(BodyCalc.standardWeight(h))} unit="kg" />
                <ResultRow title="理想体重（Devine）" value={fmt(ibw)} unit="kg" />
                {w > ibw && <ResultRow title="補正体重" value={fmt(BodyCalc.adjustedWeight(w, ibw))} unit="kg" />}
              </Section>
            </>
          )
        })()
      ) : (
        <Section>
          <MissingRow>身長・体重を入力してください</MissingRow>
        </Section>
      )}
    </Page>
  )
}
