package app.taskora.mobile.statusbar

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ShowArgs {
    lateinit var title: String
    lateinit var channelName: String
    lateinit var quickAddHint: String
    lateinit var submitLabel: String
}

/**
 * 接收通知上「▸」（切换下一条）的广播，经插件转发到 web 层。
 *
 * manifest 静态注册（exported=false + 显式 intent），进程不在时系统也能
 * 拉起进程投递；但「下一条」的轮播状态在 JS 侧游标里，冷启动时插件实例
 * 尚未创建，丢弃即可——App 启动后 JS 会自行刷新到最新任务。
 */
class StatusBarActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_NEXT) return
        // goAsync 立即返回，把冷启动等待移出主线程（10s 窗口内不会 ANR）；
        // 进程冷启动时 submitNext 会轮询等插件就位，热启动时直接投递。
        val pendingResult = goAsync()
        Thread {
            try {
                StatusBarPlugin.submitNext(context)
            } finally {
                pendingResult.finish()
            }
        }.start()
    }
}

@TauriPlugin
class StatusBarPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val PENDING_QUICK_ADD_KEY = "pendingQuickAdd"

        private var instance: StatusBarPlugin? = null
        private var activityRef: Activity? = null

        /**
         * 动作统一入口（「▸」广播 / 浮层提交 / 冷路径补发）。可能跑在
         * 非 UI 线程，而 trigger 要经 WebView，必须切到 UI 线程，否则消
         * 息被静默丢弃。
         */
        fun emitAction(action: String, input: String? = null) {
            val plugin = instance
            val act = activityRef ?: return
            act.runOnUiThread {
                val payload = JSObject()
                payload.put("action", action)
                if (input != null) payload.put("input", input)
                plugin?.trigger("action", payload)
            }
        }

        /**
         * 「▸」的提交入口（StatusBarActionReceiver，经 goAsync 后台线程）。
         * 冷启动时广播先到、插件尚未 load：轮询最多 2s 等插件就位；超时才
         * 丢弃（JS 启动后会自行刷新到最新任务，轮播游标随后同步）。
         */
        fun submitNext(context: Context) {
            val deadline = System.currentTimeMillis() + 2000
            while (instance == null && System.currentTimeMillis() < deadline) {
                Thread.sleep(50)
            }
            emitAction("next")
        }

        /**
         * 快速添加浮层的提交入口（QuickAddActivity）。进程未起（插件实例
         * 为空）时把标题落盘，插件 load 时补发，输入不丢。
         */
        fun submitQuickAdd(context: Context, title: String) {
            if (instance == null || activityRef == null) {
                context.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
                    .edit().putString(PENDING_QUICK_ADD_KEY, title).apply()
                return
            }
            emitAction("quick-add", title)
        }

    }

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        instance = this
        activityRef = activity

        // 冷路径补发：浮层在进程未起时提交的任务标题。
        val prefs = activity.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
        val pending = prefs.getString(PENDING_QUICK_ADD_KEY, null)
        if (!pending.isNullOrBlank()) {
            prefs.edit().remove(PENDING_QUICK_ADD_KEY).apply()
            emitAction("quick-add", pending)
        }
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
            activityRef = null
        }
        super.onDestroy()
    }

    @Command
    fun show(invoke: Invoke) {
        val args = invoke.parseArgs(ShowArgs::class.java)

        if (!StatusBarService.channelEnabled(activity)) {
            invoke.reject("status bar notification channel is disabled")
            return
        }
        StatusBarService.ensureChannel(activity, args.channelName)

        val snapshot = StatusBarService.Snapshot(
            title = args.title,
            channelName = args.channelName,
            quickAddHint = args.quickAddHint,
            submitLabel = args.submitLabel,
        )
        snapshot.save(activity.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE))

        val intent = Intent(activity, StatusBarService::class.java).apply {
            putExtra(EXTRA_TITLE, snapshot.title)
            putExtra(EXTRA_CHANNEL_NAME, snapshot.channelName)
            putExtra(EXTRA_QUICK_ADD_HINT, snapshot.quickAddHint)
            putExtra(EXTRA_SUBMIT_LABEL, snapshot.submitLabel)
        }

        try {
            // 服务已在前台运行时这只是内容更新；未运行时（开启开关的当
            // 下 App 在前台）允许启动 FGS。后台禁启的异常向上抛，由 JS
            // 侧记录诊断并留待下次刷新重试。
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(intent)
            } else {
                activity.startService(intent)
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("failed to start status bar service: ${e.message}")
        }
    }

    @Command
    fun cancel(invoke: Invoke) {
        // stopService 停掉 FGS 会连带撤下其前台通知，且自停服务不受后台
        // 启动限制影响；服务不在时通知兜底撤下。内容快照一并清除（登出
        // 场景不应在系统栏残留任务信息）。
        activity.stopService(Intent(activity, StatusBarService::class.java))
        val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.cancel(NOTIFICATION_ID)
        activity.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        invoke.resolve()
    }
}
