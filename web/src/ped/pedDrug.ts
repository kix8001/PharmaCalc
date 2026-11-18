import presetsFile from '../../../data/ped_presets.json'
import { createStore, loadLocal, saveLocal } from '../core/store'
import { ageText } from '../core/patient'
import { fmtTrim } from '../core/format'

/** 年齢別・体重別の用量（〜未満なら min〜max）。min・max とも0なら「この範囲は用量の記載なし」 */
export interface AgeBand {
  below: number
  min: number
  max: number
  /** この範囲だけ1日の回数が違うとき */
  times?: number
  /** true なら min・max は体重1kgあたり */
  perKg?: boolean
  /** true なら min・max は1回量（無ければ1日量） */
  perDose?: boolean
}

export type DoseBasis = 'day' | 'dose' | 'age' | 'weight' | 'memo'
export const basisLabel: Record<DoseBasis, string> = {
  day: '体重あたり（1日）',
  dose: '体重あたり（1回）',
  age: '年齢別',
  weight: '体重別',
  memo: 'メモだけ',
}

/** 小児用量を計算する薬（ユーザーが追加・編集できる）。iOS・Android の PedDrug と同じ */
export interface PedDrug {
  id: string
  name: string
  ingredient: string
  /** true: シロップ（mL）、false: 散・DS（g）。formUnit があればそちらを使う */
  isSyrup: boolean
  /** 製剤1g・1mL・1単位あたりの成分量。0なら製剤量は出さない */
  conc: number
  basis: DoseBasis
  minPerKg: number
  maxPerKg: number
  times: number
  maxDoseMg?: number
  maxDailyMg?: number
  maxDailyPerKg?: number
  bands: AgeBand[]
  note: string
  category?: string
  /** 錠・包・個・枚など（散・シロップ以外） */
  formUnit?: string
  /** 成分量の単位（"mg" か "μg"） */
  amountUnit?: string
  /** PMDA の一般名ごとの一覧を開くための YJ コード先頭7桁 */
  pmda?: string
}

export const pmdaURL = (d: { pmda?: string }) => (d.pmda ? `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${d.pmda}` : null)
export const unitOf = (d: PedDrug) => d.formUnit ?? (d.isSyrup ? 'mL' : 'g')
export const amountOf = (d: PedDrug) => d.amountUnit ?? 'mg'

export interface PedDoseResult {
  dailyLo: number
  dailyHi: number
  doseLo: number
  doseHi: number
  times: number
  capped: boolean
  /** 年齢別・体重別で、どの区切りの用量を使ったか（例：「1歳未満」） */
  bandLabel?: string
}

export type PedDoseError = 'needWeight' | 'needAge' | 'outOfRange' | 'notIndicated' | 'memo'
export const errorMessage: Record<PedDoseError, string> = {
  needWeight: '体重を入れてください',
  needAge: '年齢を入れてください',
  outOfRange: '登録した範囲の外です',
  notIndicated: 'この年齢・体重では用量の記載がありません',
  memo: '',
}

/** 年齢（歳）と体重（kg）から用量を出す */
export function compute(d: PedDrug, age: number | null, weight: number | null): PedDoseResult | PedDoseError {
  const t = Math.max(1, d.times)
  switch (d.basis) {
    case 'memo':
      return 'memo'
    case 'day': {
      if (weight == null || weight <= 0) return 'needWeight'
      let hi = d.maxPerKg * weight
      let capped = false
      if (d.maxDailyPerKg != null && hi > d.maxDailyPerKg * weight) {
        hi = d.maxDailyPerKg * weight
        capped = true
      }
      if (d.maxDailyMg != null && hi > d.maxDailyMg) {
        hi = d.maxDailyMg
        capped = true
      }
      const lo = Math.min(d.minPerKg * weight, hi)
      return { dailyLo: lo, dailyHi: hi, doseLo: lo / t, doseHi: hi / t, times: t, capped }
    }
    case 'dose': {
      if (weight == null || weight <= 0) return 'needWeight'
      let hi = d.maxPerKg * weight
      let capped = false
      if (d.maxDoseMg != null && hi > d.maxDoseMg) {
        hi = d.maxDoseMg
        capped = true
      }
      const lo = Math.min(d.minPerKg * weight, hi)
      let dHi = hi * t
      if (d.maxDailyPerKg != null && dHi > d.maxDailyPerKg * weight) {
        dHi = d.maxDailyPerKg * weight
        capped = true
      }
      if (d.maxDailyMg != null && dHi > d.maxDailyMg) {
        dHi = d.maxDailyMg
        capped = true
      }
      return { dailyLo: Math.min(lo * t, dHi), dailyHi: dHi, doseLo: lo, doseHi: hi, times: t, capped }
    }
    case 'age':
    case 'weight': {
      let key: number
      if (d.basis === 'age') {
        if (age == null || age < 0) return 'needAge'
        key = age
      } else {
        if (weight == null || weight <= 0) return 'needWeight'
        key = weight
      }
      const sorted = [...d.bands].sort((a, b) => a.below - b.below)
      const i = sorted.findIndex((b) => key < b.below)
      if (i < 0) return 'outOfRange'
      const b = sorted[i]
      if (b.min <= 0 && b.max <= 0) return 'notIndicated'
      const bt = Math.max(1, b.times ?? t)
      let lo = b.min, hi = b.max
      if (b.perKg) {
        if (weight == null || weight <= 0) return 'needWeight'
        lo *= weight
        hi *= weight
      }
      // 上限（登録してあれば年齢別・体重別にも使う）
      let capped = false
      let dLo: number, dHi: number
      if (b.perDose) {
        if (d.maxDoseMg != null && hi > d.maxDoseMg) {
          hi = d.maxDoseMg
          capped = true
        }
        lo = Math.min(lo, hi)
        dLo = lo * bt
        dHi = hi * bt
      } else {
        dLo = lo
        dHi = hi
      }
      if (d.maxDailyPerKg != null && weight != null && dHi > d.maxDailyPerKg * weight) {
        dHi = d.maxDailyPerKg * weight
        capped = true
      }
      if (d.maxDailyMg != null && dHi > d.maxDailyMg) {
        dHi = d.maxDailyMg
        capped = true
      }
      dLo = Math.min(dLo, dHi)
      let oLo = dLo / bt, oHi = dHi / bt
      if (!b.perDose && d.maxDoseMg != null && oHi > d.maxDoseMg) {
        oHi = d.maxDoseMg
        oLo = Math.min(oLo, d.maxDoseMg)
        dHi = d.maxDoseMg * bt
        dLo = Math.min(dLo, dHi)
        capped = true
      }
      const f = d.basis === 'age' ? ageText : (w: number) => `${fmtTrim(w, 1)}kg`
      const lower = i > 0 ? sorted[i - 1].below : null
      let label: string | undefined
      if (sorted.length > 1) {
        if (lower == null) label = `${f(b.below)}未満`
        else if (b.below >= 100) label = `${f(lower)}以上`
        else label = `${f(lower)}〜${f(b.below)}未満`
      }
      return { dailyLo: dLo, dailyHi: dHi, doseLo: oLo, doseHi: oHi, times: bt, capped, bandLabel: label }
    }
  }
}

export function range(a: number, b: number, digits: number) {
  return Math.abs(a - b) < 1e-9 ? fmtTrim(a, digits) : `${fmtTrim(a, digits)}〜${fmtTrim(b, digits)}`
}

// ---- 初期登録（data/ped_presets.json、iOS・Android と共通） ----
interface PresetDrug {
  category: string
  name: string
  ingredient: string
  form: string
  conc: number
  basis: string
  unit?: string
  amountUnit?: string
  minPerKg?: number
  maxPerKg?: number
  times?: number
  maxDoseMg?: number
  maxDailyMg?: number
  maxDailyPerKg?: number
  bands?: AgeBand[]
  note?: string
  pmda?: string
}

const file = presetsFile as unknown as { version: number; replaced?: string[]; drugs: PresetDrug[] }
let idSeq = 0
export const newId = () => `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function fromPreset(p: PresetDrug): PedDrug {
  return {
    id: newId(),
    name: p.name,
    ingredient: p.ingredient,
    isSyrup: p.form === 'syrup',
    conc: p.conc,
    basis: (['day', 'dose', 'age', 'weight', 'memo'].includes(p.basis) ? p.basis : 'memo') as DoseBasis,
    minPerKg: p.minPerKg ?? 0,
    maxPerKg: p.maxPerKg ?? p.minPerKg ?? 0,
    times: p.times ?? 3,
    maxDoseMg: p.maxDoseMg,
    maxDailyMg: p.maxDailyMg,
    maxDailyPerKg: p.maxDailyPerKg,
    bands: (p.bands ?? []).map((b) => ({ ...b })),
    note: p.note ?? '',
    category: p.category,
    formUnit: p.form === 'other' ? p.unit ?? '' : undefined,
    amountUnit: p.amountUnit,
    pmda: p.pmda,
  }
}

export const presetDrugs = () => file.drugs.map(fromPreset)

const KEY = 'pedDrugs'
const VERSION_KEY = 'pedPresetVersion'

function initialDrugs(): PedDrug[] {
  const saved = loadLocal<PedDrug[] | null>(KEY, null)
  if (!saved) {
    saveLocal(VERSION_KEY, file.version)
    return presetDrugs()
  }
  const v = loadLocal<number>(VERSION_KEY, 0)
  if (v < file.version) {
    // 初期登録の薬は新しい版に入れ替え、自分で追加した薬は後ろに残す
    const presets = presetDrugs()
    const names = new Set(presets.map((d) => d.name))
    const replaced = new Set(file.replaced ?? [])
    saveLocal(VERSION_KEY, file.version)
    return [...presets, ...saved.filter((d) => !names.has(d.name) && !replaced.has(d.name))]
  }
  return saved
}

/** 小児用量の薬の一覧（このブラウザに保存） */
export const pedStore = createStore<PedDrug[]>(initialDrugs(), (v) => saveLocal(KEY, v))

export function categoriesOf(drugs: PedDrug[]) {
  const seen: string[] = []
  for (const d of drugs) {
    const c = d.category ?? '自分で追加'
    if (!seen.includes(c)) seen.push(c)
  }
  return seen
}
