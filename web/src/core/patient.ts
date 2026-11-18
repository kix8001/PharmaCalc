import { createStore } from './store'
import { fmt, parseNum } from './format'

export type Sex = 'male' | 'female'
export const sexLabel: Record<Sex, string> = { male: '男性', female: '女性' }

export interface Patient {
  age: string
  /** 1歳未満などのための「か月」（年齢に足す） */
  months: string
  sex: Sex
  weight: string
  height: string
  scr: string
  cys: string
}

const empty: Patient = { age: '', months: '', sex: 'male', weight: '', height: '', scr: '', cys: '' }

/** 患者情報。一度入れれば全部の電卓で使い回す。個人情報なので端末には保存せず、ページを閉じると消える */
export const patientStore = createStore<Patient>({ ...empty })

export function setPatient(k: keyof Patient, v: string) {
  patientStore.set((p) => ({ ...p, [k]: v }))
}

export function clearPatient() {
  patientStore.set({ ...empty })
}

/** 年齢（歳）。か月が入っていれば足す（例：1歳＋6か月 → 1.5） */
export function ageV(p: Patient): number | null {
  const y = parseNum(p.age), m = parseNum(p.months)
  if (y == null && m == null) return null
  return (y ?? 0) + (m ?? 0) / 12
}

export const weightV = (p: Patient) => parseNum(p.weight)
export const heightV = (p: Patient) => parseNum(p.height)
export const scrV = (p: Patient) => parseNum(p.scr)
export const cysV = (p: Patient) => parseNum(p.cys)

export function isEmptyPatient(p: Patient) {
  return [p.age, p.months, p.weight, p.height, p.scr, p.cys].every((s) => s.trim() === '')
}

/** 年齢（歳、小数）を「1歳6か月」「6か月」のように書く */
export function ageText(y: number): string {
  const total = Math.round(y * 12)
  const yy = Math.floor(total / 12), mm = total % 12
  if (yy === 0) return `${mm}か月`
  return mm === 0 ? `${yy}歳` : `${yy}歳${mm}か月`
}

export function patientSummary(p: Patient): string {
  const parts: string[] = []
  const a = ageV(p)
  if (a != null) parts.push(parseNum(p.months) == null ? `${fmt(a, 0)}歳` : ageText(a))
  parts.push(sexLabel[p.sex])
  const h = heightV(p), w = weightV(p), c = scrV(p), cy = cysV(p)
  if (h != null) parts.push(`${fmt(h, 1)}cm`)
  if (w != null) parts.push(`${fmt(w, 1)}kg`)
  if (c != null) parts.push(`Cr ${fmt(c, 2)}`)
  if (cy != null) parts.push(`CysC ${fmt(cy, 2)}`)
  return parts.join('・')
}
