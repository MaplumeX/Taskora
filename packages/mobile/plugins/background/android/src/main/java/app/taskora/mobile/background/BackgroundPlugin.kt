package app.taskora.mobile.background

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.view.HapticFeedbackConstants
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

@InvokeArg
class HapticArgs {
    var kind: String = "tick"
}

/**
 * Activity 级窗口控制：根页返回退到后台 + 系统栏安全区 + 图标明暗 + 系统主题。
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
 * 系统主题：uiMode 查询 + 配置变化 / 回前台事件，供 JS 的「跟随系统」解析。
 *
 * 触感：窗口 View 的 performHapticFeedback，跟随系统「触摸反馈」设置，不需要
 * VIBRATE 权限。种类与 JS（api 包 haptics.ts）一一对应，新常量在旧系统上
 * 退回近似的旧常量。
 *
 * 摇一摇：前台期间（onResume ~ onPause）监听加速度计，短时间内两次超过
 * 阈值的晃动算一次摇一摇，经 `shake` 事件推送（JS 弹出撤销确认）；推送后
 * 冷却一段时间，避免一次连续晃动触发多次。
 */
@TauriPlugin
class BackgroundPlugin(private val activity: Activity) : Plugin(activity), SensorEventListener {

    private val sensorManager =
        activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager?
    private val accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    /** 上一次超过阈值的晃动时刻（elapsedRealtime 毫秒）；0 为没有。 */
    private var lastPeakAt = 0L
    /** 上一次推送 shake 的时刻，冷却期内不再推送。 */
    private var lastShakeAt = 0L

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

    // 不读取 Activity 的主题属性：WebView 的 prefers-color-scheme 可能保持
    // 启动值。uiMode 直接反映系统的夜间模式，配置变化和恢复都重新推送。
    private fun systemTheme(config: Configuration) = JSObject().apply {
        put("dark", (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES)
    }

    @Command
    fun systemTheme(invoke: Invoke) {
        invoke.resolve(systemTheme(activity.resources.configuration))
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        trigger("theme", systemTheme(newConfig))
    }

    override fun onResume() {
        super.onResume()
        trigger("theme", systemTheme(activity.resources.configuration))
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager?.unregisterListener(this)
        lastPeakAt = 0L
    }

    override fun onSensorChanged(event: SensorEvent) {
        val (x, y, z) = event.values
        val gForce = Math.sqrt((x * x + y * y + z * z).toDouble()) / SensorManager.GRAVITY_EARTH
        if (gForce < SHAKE_G_FORCE) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastShakeAt < SHAKE_COOLDOWN_MS) return
        if (lastPeakAt != 0L && now - lastPeakAt in SHAKE_MIN_GAP_MS..SHAKE_WINDOW_MS) {
            lastPeakAt = 0L
            lastShakeAt = now
            trigger("shake", JSObject())
        } else if (lastPeakAt == 0L || now - lastPeakAt > SHAKE_WINDOW_MS) {
            lastPeakAt = now
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit

    @Command
    fun haptic(invoke: Invoke) {
        val args = invoke.parseArgs(HapticArgs::class.java)
        val constant = when (args.kind) {
            "lift" -> HapticFeedbackConstants.LONG_PRESS
            "drop" ->
                if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.GESTURE_END
                else HapticFeedbackConstants.VIRTUAL_KEY
            "confirm" ->
                if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM
                else HapticFeedbackConstants.VIRTUAL_KEY
            else -> HapticFeedbackConstants.CLOCK_TICK
        }
        activity.runOnUiThread {
            activity.window.decorView.performHapticFeedback(constant)
            invoke.resolve()
        }
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

private const val SHAKE_G_FORCE = 2.3
/** 两次晃动峰值的最小间隔：同一次甩动的连续采样不算两次。 */
private const val SHAKE_MIN_GAP_MS = 120L
private const val SHAKE_WINDOW_MS = 700L
private const val SHAKE_COOLDOWN_MS = 1500L
