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
    var sex by mutableStateOf(Sex.MALE)
    var weight by mutableStateOf("")
    var height by mutableStateOf("")
    var scr by mutableStateOf("")
    var cys by mutableStateOf("")

    val ageV get() = parseNum(age)
    val weightV get() = parseNum(weight)
    val heightV get() = parseNum(height)
    val scrV get() = parseNum(scr)
    val cysV get() = parseNum(cys)

    val isEmpty get() = listOf(age, weight, height, scr, cys).all { it.isBlank() }

    val summary: String
        get() {
            val parts = mutableListOf<String>()
            ageV?.let { parts += "${fmt(it, 0)}歳" }
            parts += sex.label
            heightV?.let { parts += "${fmt(it, 1)}cm" }
            weightV?.let { parts += "${fmt(it, 1)}kg" }
            scrV?.let { parts += "Cr ${fmt(it, 2)}" }
            cysV?.let { parts += "CysC ${fmt(it, 2)}" }
            return parts.joinToString("・")
        }

    fun clear() {
        age = ""; sex = Sex.MALE; weight = ""; height = ""; scr = ""; cys = ""
    }
}
