import { IdCard } from 'lucide-preact'
import { ButtonRow, NumField, Page, Section, Segmented } from '../ui/components'
import { useStore } from '../core/store'
import { clearPatient, isEmptyPatient, patientStore, patientSummary, setPatient, sexLabel, type Sex } from '../core/patient'

export type PField = 'age' | 'months' | 'sex' | 'weight' | 'height' | 'scr' | 'cys'

/** 患者情報の入力欄（必要な項目だけ出す） */
export function PatientFields({ fields }: { fields: PField[] }) {
  const p = useStore(patientStore)
  const has = (f: PField) => fields.includes(f)
  return (
    <>
      {has('age') && <NumField title="年齢" value={p.age} onChange={(v) => setPatient('age', v)} unit="歳" />}
      {has('months') && <NumField title="＋か月（1歳未満など）" value={p.months} onChange={(v) => setPatient('months', v)} unit="か月" />}
      {has('sex') && (
        <Segmented<Sex>
          label="性別"
          options={[
            ['male', sexLabel.male],
            ['female', sexLabel.female],
          ]}
          value={p.sex}
          onChange={(v) => patientStore.set((x) => ({ ...x, sex: v }))}
        />
      )}
      {has('height') && <NumField title="身長" value={p.height} onChange={(v) => setPatient('height', v)} unit="cm" />}
      {has('weight') && <NumField title="体重" value={p.weight} onChange={(v) => setPatient('weight', v)} unit="kg" />}
      {has('scr') && <NumField title="血清Cr" value={p.scr} onChange={(v) => setPatient('scr', v)} unit="mg/dL" />}
      {has('cys') && <NumField title="シスタチンC" value={p.cys} onChange={(v) => setPatient('cys', v)} unit="mg/L" />}
    </>
  )
}

export function PatientSummaryLabel() {
  const p = useStore(patientStore)
  const empty = isEmptyPatient(p)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <IdCard size={20} color="var(--accent)" />
      <span class={empty ? 'sub' : ''}>{empty ? '未入力（タップして入力）' : patientSummary(p)}</span>
    </span>
  )
}

export function PatientPage() {
  return (
    <Page title="患者情報">
      <Section footer="ここで入れた値は、腎機能・体表面積・用量などすべての計算で使われます。端末には保存されず、ページを閉じると消えます。">
        <PatientFields fields={['age', 'months', 'sex', 'height', 'weight', 'scr', 'cys']} />
      </Section>
      <Section>
        <ButtonRow danger onClick={clearPatient}>
          すべてクリア
        </ButtonRow>
      </Section>
    </Page>
  )
}
