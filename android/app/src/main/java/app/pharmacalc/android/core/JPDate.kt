package app.pharmacalc.android.core

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

object JPDate {
    private val long = DateTimeFormatter.ofPattern("yyyy年M月d日(E)", Locale.JAPANESE)
    private val short = DateTimeFormatter.ofPattern("M/d(E)", Locale.JAPANESE)

    fun text(d: LocalDate): String = d.format(long)
    fun short(d: LocalDate): String = d.format(short)

    /** a から b までの日数（同じ日なら0） */
    fun diff(a: LocalDate, b: LocalDate): Int = ChronoUnit.DAYS.between(a, b).toInt()

    fun isWeekend(d: LocalDate) = d.dayOfWeek == DayOfWeek.SATURDAY || d.dayOfWeek == DayOfWeek.SUNDAY
}
