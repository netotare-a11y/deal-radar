package kr.dealradar.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val siteHost: String? = Uri.parse(BuildConfig.SITE_URL).host

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = SiteClient()
        }
        setContentView(webView)

        // 안드로이드 15부터 화면이 상태바 아래까지 깔리므로 여백을 직접 준다.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        if (savedInstanceState == null) webView.loadUrl(BuildConfig.SITE_URL)
        else webView.restoreState(savedInstanceState)

        FeedWorker.createChannel(this)
        FeedWorker.schedule(this)
        requestSetupPermissions()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Activity 기본 뒤로가기를 그대로 쓴다")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun requestSetupPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            return
        }
        askBatteryExemptionOnce()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        askBatteryExemptionOnce()
    }

    /** 절전 예외가 없으면 화면이 꺼진 동안 확인이 크게 늦어진다. 거절해도 다시 묻지 않는다. */
    private fun askBatteryExemptionOnce() {
        val prefs = getSharedPreferences("setup", Context.MODE_PRIVATE)
        if (prefs.getBoolean("battery_asked", false)) return
        prefs.edit().putBoolean("battery_asked", true).apply()

        val power = getSystemService(PowerManager::class.java)
        if (power.isIgnoringBatteryOptimizations(packageName)) return
        openExternal(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")),
        )
    }

    private fun openExternal(intent: Intent) {
        try {
            startActivity(intent)
        } catch (missing: ActivityNotFoundException) {
            Toast.makeText(this, "열 수 있는 앱이 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private inner class SiteClient : WebViewClient() {
        // 사이트 안 이동만 앱에서 처리하고, 상품·원문 링크는 브라우저나 해당 앱으로 연다.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.url.host == siteHost) return false
            openExternal(Intent(Intent.ACTION_VIEW, request.url))
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) {
                Toast.makeText(this@MainActivity, R.string.load_failed, Toast.LENGTH_LONG).show()
            }
        }
    }
}
