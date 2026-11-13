package app.pharmacalc.android.core

import kotlin.math.pow
import kotlin.math.sqrt

/** 腎機能の計算式 */
object Renal {
    /** Cockcroft-Gault式 CCr（mL/min） */
    fun cockcroftGault(age: Double, weight: Double, scr: Double, sex: Sex): Double {
        val v = (140 - age) * weight / (72 * scr)
        return if (sex == Sex.FEMALE) v * 0.85 else v
    }

    /** 日本人のGFR推算式（血清Cr）mL/min/1.73m² */
    fun egfrCr(age: Double, scr: Double, sex: Sex): Double {
        val v = 194 * scr.pow(-1.094) * age.pow(-0.287)
        return if (sex == Sex.FEMALE) v * 0.739 else v
    }

    /** 日本人のGFR推算式（シスタチンC）mL/min/1.73m² */
    fun egfrCys(age: Double, cys: Double, sex: Sex): Double {
        var v = 104 * cys.pow(-1.019) * 0.996.pow(age)
        if (sex == Sex.FEMALE) v *= 0.929
        return v - 8
    }

    /** 体表面積で補正しない値（mL/min） */
    fun deindex(egfr: Double, bsa: Double) = egfr * bsa / 1.73

    /** CKDのGFR区分 */
    fun stage(gfr: Double): String = when {
        gfr >= 90 -> "G1（正常または高値）"
        gfr >= 60 -> "G2（正常または軽度低下）"
        gfr >= 45 -> "G3a（軽度〜中等度低下）"
        gfr >= 30 -> "G3b（中等度〜高度低下）"
        gfr >= 15 -> "G4（高度低下）"
        else -> "G5（末期腎不全）"
    }
}

/** 体格の計算式 */
object BodyCalc {
    /** 理想体重（Devine式）kg */
    fun idealWeight(height: Double, sex: Sex): Double =
        (if (sex == Sex.MALE) 50.0 else 45.5) + 0.91 * (height - 152.4)

    /** 補正体重 kg */
    fun adjustedWeight(actual: Double, ideal: Double) = ideal + 0.4 * (actual - ideal)

    fun bmi(weight: Double, height: Double): Double {
        val m = height / 100
        return weight / (m * m)
    }

    /** 標準体重（BMI 22） */
    fun standardWeight(height: Double): Double {
        val m = height / 100
        return 22 * m * m
    }

    fun bsaDuBois(weight: Double, height: Double) = 0.007184 * weight.pow(0.425) * height.pow(0.725)
    fun bsaFujimoto(weight: Double, height: Double) = 0.008883 * weight.pow(0.444) * height.pow(0.663)
    fun bsaMosteller(weight: Double, height: Double) = sqrt(weight * height / 3600)

    fun bmiCategory(b: Double): String = when {
        b < 18.5 -> "低体重"
        b < 25 -> "普通体重"
        b < 30 -> "肥満（1度）"
        b < 35 -> "肥満（2度）"
        b < 40 -> "肥満（3度）"
        else -> "肥満（4度）"
    }
}
