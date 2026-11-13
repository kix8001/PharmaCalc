package app.pharmacalc.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import app.pharmacalc.android.barcode.ScanHistory
import app.pharmacalc.android.home.HomeTiles
import app.pharmacalc.android.ui.App
import app.pharmacalc.android.ui.PharmaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ScanHistory.init(applicationContext)
        HomeTiles.init(applicationContext)
        setContent { PharmaTheme { App() } }
    }
}
