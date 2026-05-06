package com.converge.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val accent = Color(0xFF0F6F87)
private val accentDark = Color(0xFF4ECDC4)

val LightColors = lightColorScheme(
    primary = accent,
    onPrimary = Color.White,
    secondary = Color(0xFFBD5A26),
    onSecondary = Color.White,
    background = Color(0xFFEAF0F4),
    surface = Color(0xFFFBFDFF),
    onBackground = Color(0xFF162538),
    onSurface = Color(0xFF162538),
    outline = Color(0xFFCCD7E2),
    error = Color(0xFF9F2F2F),
)

val DarkColors = darkColorScheme(
    primary = accentDark,
    onPrimary = Color(0xFF0C2528),
    secondary = Color(0xFFFF9F43),
    onSecondary = Color(0xFF3A230F),
    background = Color(0xFF1A1A2E),
    surface = Color(0xFF232448),
    onBackground = Color(0xFFEAEAEA),
    onSurface = Color(0xFFEAEAEA),
    error = Color(0xFFFF6B6B),
)

@Composable
fun ConvergeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
