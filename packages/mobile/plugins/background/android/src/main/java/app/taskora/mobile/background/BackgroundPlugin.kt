package app.taskora.mobile.background

import android.app.Activity
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SystemBarAppearanceArgs {
    var dark: Boolean = false
}

/**
 * Activity 级窗口控制：根页返回退到后台 + 系统栏安全区 + 系统栏图标明暗。
 *
 * 退到后台：`activity.moveTaskToBack(true)` 把整个任务放到后台，WebView 与
 * 界面状态保留，从最近任务 / 桌面图标回来是原地恢复（标准 Android 的「返回
 * 主屏幕」语义）。`true` = 仅当本 Activity 是任务根时执行，避免越界移动他人
 * 的任务栈。JS 侧由 `back-navigation.ts` 的级联在根页调用。
 *
 * 安全区：edge-to-edge 下内容铺到状态栏 / 手势条后面，而部分 WebView 的
 * `env(safe-area-inset-*)` 仍为 0。这里从 WebView 收到的 WindowInsets 读取
 * 系统栏 + 刘海高度（换算成 CSS px），JS 启动时 `safeAreaInsets` 取一次，
 * 之后变化（旋转、切换手势导航）经 `insets` 事件推送。MainActivity
 * （scripts/android-signing.py 注入）只开 edge-to-edge，不在原生层消费
 * insets / 加 padding，否则 WebView 被挤到状态栏下方且与这里双重避让。
 *
 * 系统栏图标明暗：状态栏透明，底下是 App 自身背景；图标明暗随 App 实际
 * 主题（含手动指定的亮 / 暗，与系统 DayNight 无关）由 JS 设置。
 */
@TauriPlugin
class BackgroundPlugin(private val activity: Activity) : Plugin(activity) {

    @Volatile
    private var insets = SafeAreaInsets(0f, 0f)

    override fun load(webView: WebView) {
        super.load(webView)
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val density = view.resources.displayMetrics.density
            val next = SafeAreaInsets(top = bars.top / density, bottom = bars.bottom / density)
            if (next != insets) {
                insets = next
                trigger("insets", next.toJs())
            }
            // 继续交给 WebView 自身处理：新版 WebView 据此提供 env()。
            ViewCompat.onApplyWindowInsets(view, windowInsets)
        }
        ViewCompat.requestApplyInsets(webView)
    }

    @Command
    fun moveToBack(invoke: Invoke) {
        activity.moveTaskToBack(true)
        invoke.resolve()
    }

    @Command
    fun safeAreaInsets(invoke: Invoke) {
        invoke.resolve(insets.toJs())
    }

    @Command
    fun setSystemBarAppearance(invoke: Invoke) {
        val args = invoke.parseArgs(SystemBarAppearanceArgs::class.java)
        activity.runOnUiThread {
            WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
                // 浅色背景配深色图标。
                isAppearanceLightStatusBars = !args.dark
                isAppearanceLightNavigationBars = !args.dark
            }
            invoke.resolve()
        }
    }

    private data class SafeAreaInsets(val top: Float, val bottom: Float) {
        fun toJs() = JSObject().apply {
            put("top", top.toDouble())
            put("bottom", bottom.toDouble())
        }
    }
}
