package app.pharmacalc.android.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class Sex(val label: String) { MALE("男性"), FEMALE("女性") }

/**
 * 患者情報。一度入れれば全部の電卓で使い回す。
 * 個人情報なので端末には保存せず、アプリを終了すると消える。
 */
object Patient {
    var age by mutableStateOf("")
    /** 1歳未満などのための「か月」（年齢に足す） */
    var months by mutableStateOf("")
    var sex by mutableStateOf(Sex.MALE)
    var weight by mutableStateOf("")
    var height by mutableStateOf("")
    var scr by mutableStateOf("")
    var cys by mutableStateOf("")

    /** 年齢（歳）。か月が入っていれば足す（例：1歳＋6か月 → 1.5） */
    val ageV: Double?
        get() {
            val y = parseNum(age); val m = parseNum(months)
            if (y == null && m == null) return null
            return (y ?: 0.0) + (m ?: 0.0) / 12
        }
    val weightV get() = parseNum(weight)
    val heightV get() = parseNum(height)
    val scrV get() = parseNum(scr)
    val cysV get() = parseNum(cys)

    val isEmpty get() = listOf(age, months, weight, height, scr, cys).all { it.isBlank() }

    val summary: String
        get() {
            val parts = mutableListOf<String>()
            ageV?.let { parts += if (parseNum(months) == null) "${fmt(it, 0)}歳" else ageText(it) }
            parts += sex.label
            heightV?.let { parts += "${fmt(it, 1)}cm" }
            weightV?.let { parts += "${fmt(it, 1)}kg" }
            scrV?.let { parts += "Cr ${fmt(it, 2)}" }
            cysV?.let { parts += "CysC ${fmt(it, 2)}" }
            return parts.joinToString("・")
        }

    fun clear() {
        age = ""; months = ""; sex = Sex.MALE; weight = ""; height = ""; scr = ""; cys = ""
    }
}

/** 年齢（歳、小数）を「1歳6か月」「6か月」のように書く */
fun ageText(y: Double): String {
    val total = Math.round(y * 12).toInt()
    val yy = total / 12; val mm = total % 12
    return if (yy == 0) "${mm}か月" else if (mm == 0) "${yy}歳" else "${yy}歳${mm}か月"
}
