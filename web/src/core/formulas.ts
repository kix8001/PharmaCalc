import type { Sex } from './patient'

/** 腎機能の計算式 */
export const Renal = {
  /** Cockcroft-Gault式 CCr（mL/min） */
  cockcroftGault(age: number, weight: number, scr: number, sex: Sex) {
    const v = ((140 - age) * weight) / (72 * scr)
    return sex === 'female' ? v * 0.85 : v
  },
  /** 日本人のGFR推算式（血清Cr）mL/min/1.73m² */
  egfrCr(age: number, scr: number, sex: Sex) {
    const v = 194 * Math.pow(scr, -1.094) * Math.pow(age, -0.287)
    return sex === 'female' ? v * 0.739 : v
  },
  /** 日本人のGFR推算式（シスタチンC）mL/min/1.73m² */
  egfrCys(age: number, cys: number, sex: Sex) {
    let v = 104 * Math.pow(cys, -1.019) * Math.pow(0.996, age)
    if (sex === 'female') v *= 0.929
    return v - 8
  },
  /** 体表面積で補正しない値（mL/min）にする */
  deindex: (egfr: number, bsa: number) => (egfr * bsa) / 1.73,
  /** CKDのGFR区分 */
  stage(gfr: number) {
    if (gfr >= 90) return 'G1（正常または高値）'
    if (gfr >= 60) return 'G2（正常または軽度低下）'
    if (gfr >= 45) return 'G3a（軽度〜中等度低下）'
    if (gfr >= 30) return 'G3b（中等度〜高度低下）'
    if (gfr >= 15) return 'G4（高度低下）'
    return 'G5（末期腎不全）'
  },
}

export const BodyCalc = {
  /** 理想体重（Devine式）kg */
  idealWeight: (height: number, sex: Sex) => (sex === 'male' ? 50 : 45.5) + 0.91 * (height - 152.4),
  /** 補正体重 kg */
  adjustedWeight: (actual: number, ideal: number) => ideal + 0.4 * (actual - ideal),
  bmi: (weight: number, height: number) => weight / (height / 100) ** 2,
  /** 標準体重（BMI 22） */
  standardWeight: (height: number) => 22 * (height / 100) ** 2,
  bsaDuBois: (w: number, h: number) => 0.007184 * Math.pow(w, 0.425) * Math.pow(h, 0.725),
  bsaFujimoto: (w: number, h: number) => 0.008883 * Math.pow(w, 0.444) * Math.pow(h, 0.663),
  bsaMosteller: (w: number, h: number) => Math.sqrt((w * h) / 3600),
  bmiCategory(b: number) {
    if (b < 18.5) return '低体重'
    if (b < 25) return '普通体重'
    if (b < 30) return '肥満（1度）'
    if (b < 35) return '肥満（2度）'
    if (b < 40) return '肥満（3度）'
    return '肥満（4度）'
  },
}
