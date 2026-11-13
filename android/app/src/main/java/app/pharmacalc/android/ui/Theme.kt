package app.pharmacalc.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Teal = Color(0xFF14918A)

@Composable
fun PharmaTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(0xFF4FD1C5), secondary = Color(0xFF4FD1C5))
    } else {
        lightColorScheme(primary = Teal, secondary = Teal, background = Color(0xFFF2F2F7),
            surface = Color(0xFFF2F2F7), surfaceContainer = Color.White)
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
