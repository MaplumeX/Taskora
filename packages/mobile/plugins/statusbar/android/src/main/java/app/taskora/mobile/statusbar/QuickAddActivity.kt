package app.taskora.mobile.statusbar

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * 状态栏「＋」拉起的快速添加浮层：透明 Activity 上原生画遮罩，卡片是透明
 * WebView 里与桌面 quick-add 窗口、展开任务同一张 QuickAddCard
 * （packages/mobile/src/quick-add，由 vite.quick-add.config.ts 打进本插件
 * 的 assets）。样式、字段与选择器全部复用 web 组件，原生不再画卡片。
 *
 * 数据：主 WebView 经 setQuickAddData 写进 SharedPreferences 的快照，页面经
 * 宿主桥 getSnapshot 读出。提交：页面交回 QuickAddDraft JSON，经
 * StatusBarPlugin.submitQuickAdd 入队，由主 WebView 落库（进程未起时留在
 * 队列里，JS 就绪后取走）。点遮罩、返回键或页面里点空白处直接关闭，不产生
 * 任务（有选择器开着时先关选择器）。
 *
 * 进出场全部自己做、系统过渡一律关掉：浮层独占一个 task，系统默认的
 * task 关闭动画是「窗口缩回桌面图标」，看起来像关掉了一个应用。先把遮罩
 * 与卡片淡出，窗口已无可见内容，再 finishAndRemoveTask。
 */
class QuickAddActivity : Activity() {

    private lateinit var root: View
    private lateinit var scrim: View
    private lateinit var web: WebView

    private var shown = false
    private var dismissing = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        disableSystemTransition(open = true)
        // 遮罩铺满到状态栏与导航栏下方；WebView 按 insets 让开（applyInsets）。
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_quick_add)

        root = findViewById(R.id.quick_add_root)
        scrim = findViewById(R.id.quick_add_scrim)
        web = findViewById(R.id.quick_add_web)

        scrim.setOnClickListener { dismiss() }
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            applyInsets(insets)
            insets
        }

        // 页面只从本插件 assets 加载（https 源，ES module 可用）；其余导航一律拦下。
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.setBackgroundColor(Color.TRANSPARENT)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
        }
        web.addJavascriptInterface(Host(), "TaskoraQuickAddHost")
        // 先拿到视图焦点：页面聚焦标题后，ready 时即可直接弹出键盘。
        web.requestFocus()
        web.loadUrl(PAGE_URL)

        scrim.animate().alpha(1f).setDuration(ENTER_MS).start()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (dismissing) return
        // 页面里有选择器开着时只关选择器（window.taskoraQuickAdd.back 返回 true）。
        web.evaluateJavascript("window.taskoraQuickAdd ? window.taskoraQuickAdd.back() : false") { handled ->
            if (handled != "true") dismiss()
        }
    }

    /**
     * WebView 上边让开状态栏，下边让开键盘 / 导航栏：视口随键盘缩小，窄屏字段
     * 选择器（居中卡片）落在键盘上方。
     */
    private fun applyInsets(insets: WindowInsetsCompat) {
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        val params = web.layoutParams as FrameLayout.LayoutParams
        params.setMargins(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
        web.layoutParams = params
    }

    /** 页面 → 原生。JavascriptInterface 在 JavaBridge 线程回调，UI 操作切回主线程。 */
    private inner class Host {
        @JavascriptInterface
        fun getSnapshot(): String? =
            getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE).getString(QUICK_ADD_DATA_KEY, null)

        @JavascriptInterface
        fun isSystemDark(): Boolean =
            (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

        @JavascriptInterface
        fun ready() = runOnUiThread { playEnter() }

        @JavascriptInterface
        fun submit(draftJson: String, mode: String) = runOnUiThread { commit(draftJson, mode) }

        @JavascriptInterface
        fun dismiss() = runOnUiThread { this@QuickAddActivity.dismiss() }
    }

    // ---------------- 提交 ----------------

    /** mode：close（添加并关闭）/ continue（连续添加，浮层留着）/ openInApp。 */
    private fun commit(draftJson: String, mode: String) {
        if (dismissing) return
        StatusBarPlugin.submitQuickAdd(this, draftJson)
        web.performHapticFeedback(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.VIRTUAL_KEY
            },
        )

        when (mode) {
            "openInApp" -> {
                // 草稿带 openInApp 入队，由 JS 落库后定位并展开这条任务；这里只
                // 负责把 App 拉起来。不播出场动画，避免和 App 启动动画叠在一起。
                packageManager.getLaunchIntentForPackage(packageName)?.let {
                    startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                dismissing = true
                finishAndRemoveTask()
                disableSystemTransition(open = false)
            }
            "continue" -> Unit
            else -> dismiss()
        }
    }

    // ---------------- 进出场 ----------------

    /** 页面挂好并聚焦标题后进场，同时弹出键盘（部分 ROM 只认显式请求）。 */
    private fun playEnter() {
        if (shown || dismissing) return
        shown = true
        web.translationY = -16 * resources.displayMetrics.density
        web.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(ENTER_MS)
            .setInterpolator(DecelerateInterpolator())
            .start()
        web.requestFocus()
        WindowCompat.getInsetsController(window, web).show(WindowInsetsCompat.Type.ime())
    }

    private fun dismiss() {
        if (dismissing) return
        dismissing = true

        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(web.windowToken, 0)

        val offset = -8 * resources.displayMetrics.density
        scrim.animate().alpha(0f).setDuration(EXIT_MS).start()
        web.animate()
            .alpha(0f)
            .translationY(offset)
            .setDuration(EXIT_MS)
            .setInterpolator(AccelerateInterpolator())
            .withEndAction {
                finishAndRemoveTask()
                disableSystemTransition(open = false)
            }
            .start()
    }

    private fun disableSystemTransition(open: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // 34+ 在 onCreate 里一次性声明进出两个方向即可。
            if (open) {
                overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0)
                overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
            }
        } else {
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }
    }

    private companion object {
        const val ENTER_MS = 150L
        const val EXIT_MS = 120L
        /** WebViewAssetLoader 的默认域名；路径对应 assets/quick-add/quick-add.html。 */
        const val PAGE_URL = "https://appassets.androidplatform.net/assets/quick-add/quick-add.html"
    }
}
