package app.taskora.mobile.statusbar

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import androidx.core.app.NotificationCompat
import org.json.JSONArray

@InvokeArg
class ShowArgs {
    lateinit var title: String
    lateinit var channelName: String
    lateinit var quickAddHint: String
    lateinit var submitLabel: String
}

@InvokeArg
class QuickAddDataArgs {
    lateinit var data: String
}

@InvokeArg
class QuickAddFailedArgs {
    lateinit var title: String
    lateinit var text: String
    lateinit var channelName: String
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
        /** 旧版本的单条补发（只存一个标题）；读取时并入队列。 */
        private const val LEGACY_PENDING_QUICK_ADD_KEY = "pendingQuickAdd"
        /** 待 JS 落库的快速添加提交（JSON 数组，每项是草稿 JSON 字符串）。 */
        private const val PENDING_QUICK_ADD_QUEUE_KEY = "pendingQuickAddQueue"
        private const val FAILURE_CHANNEL_ID = "quick-add-failed"
        private const val FAILURE_NOTIFICATION_BASE = 621000
        private val queueLock = Any()

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
         * 快速添加浮层的提交入口（QuickAddActivity）：一律先入队，再提醒
         * JS 取走（quick-add-android issue 01）。不直接 trigger 载荷：冷
         * 启动时插件已 load 而 JS 尚未注册监听，trigger 会被丢弃；入队
         * 后由 JS 注册监听时主动取一次，存活时靠 quick-add-available 信号。
         * 队列保证进程未起时连续提交多条也不互相覆盖。
         */
        fun submitQuickAdd(context: Context, payload: String) {
            synchronized(queueLock) {
                val prefs = context.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
                val queue = readQueue(prefs)
                queue.put(payload)
                prefs.edit().putString(PENDING_QUICK_ADD_QUEUE_KEY, queue.toString()).commit()
            }
            val act = activityRef ?: return
            act.runOnUiThread { instance?.trigger("quick-add-available", JSObject()) }
        }

        /** 取走全部待落库提交（按提交顺序；取出即删）。 */
        fun drainPendingQuickAdds(context: Context): JSONArray {
            synchronized(queueLock) {
                val prefs = context.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
                val queue = readQueue(prefs)
                if (queue.length() > 0 || prefs.contains(LEGACY_PENDING_QUICK_ADD_KEY)) {
                    prefs.edit()
                        .remove(PENDING_QUICK_ADD_QUEUE_KEY)
                        .remove(LEGACY_PENDING_QUICK_ADD_KEY)
                        .commit()
                }
                return queue
            }
        }

        private fun readQueue(prefs: android.content.SharedPreferences): JSONArray {
            val queue = JSONArray()
            // 升级前落盘的旧条目排在最前（它一定早于新队列里的提交）。
            prefs.getString(LEGACY_PENDING_QUICK_ADD_KEY, null)
                ?.takeIf { it.isNotBlank() }
                ?.let { queue.put(it) }
            val raw = prefs.getString(PENDING_QUICK_ADD_QUEUE_KEY, null) ?: return queue
            try {
                val stored = JSONArray(raw)
                for (i in 0 until stored.length()) queue.put(stored.getString(i))
            } catch (_: Exception) {
                // 损坏的队列丢弃，不阻塞后续提交
            }
            return queue
        }

    }

    /**
     * 冷启动时点通知带来的导航目标（issue 03），等 JS 取走（插件 load
     * 时 JS 尚未注册事件监听）。App 存活时改走 onNewIntent 事件。
     */
    @Volatile
    private var launchNavigation: String? = null

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        instance = this
        activityRef = activity
        // 冷启动：contentIntent 的导航 extra 先收起，JS 初始化时 take。
        launchNavigation = readNavigation(activity.intent)

        // 冷路径的快速添加提交留在队列里，由 JS 注册监听后 takePendingQuickAdds 取走。
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
            activityRef = null
        }
        super.onDestroy()
    }

    /**
     * App 存活时点通知本体（MainActivity 为 singleTask）：取出 extra 经
     * 事件投递给 JS，由 AppShell 导航到 Today。取出即删，避免 Activity
     * 重建时重复导航。
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val destination = readNavigation(intent) ?: return
        val payload = JSObject()
        payload.put("destination", destination)
        trigger("navigate", payload)
    }

    /** 取出并移除意图里的导航目标（避免 Activity 重建时重复导航）。 */
    private fun readNavigation(intent: Intent?): String? {
        val destination = intent?.getStringExtra(EXTRA_NAVIGATE) ?: return null
        intent.removeExtra(EXTRA_NAVIGATE)
        return destination
    }

    /** 取走冷启动时点通知携带的导航目标（取出即删）。 */
    @Command
    fun takeNavigation(invoke: Invoke) {
        val destination = launchNavigation
        launchNavigation = null
        val result = JSObject()
        // destination 为 null 时 org.json 不写入该键；Rust 侧 Option 缺省即 None。
        result.put("destination", destination)
        invoke.resolve(result)
    }

    /**
     * 写入快速添加浮层的数据快照（quick-add-android issue 02）：JS 算好的
     * JSON 原样落盘，浮层打开时读取。状态栏每次刷新都会调用，内容没变时
     * 不写盘。cancel（关闭开关 / 登出）清空 SharedPreferences 时一并清除。
     */
    @Command
    fun setQuickAddData(invoke: Invoke) {
        val args = invoke.parseArgs(QuickAddDataArgs::class.java)
        val prefs = activity.getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(QUICK_ADD_DATA_KEY, null) != args.data) {
            prefs.edit().putString(QUICK_ADD_DATA_KEY, args.data).apply()
        }
        invoke.resolve()
    }

    /** 取走排队的快速添加提交（JS 注册监听后、收到 quick-add-available 时调用）。 */
    @Command
    fun takePendingQuickAdds(invoke: Invoke) {
        val result = JSObject()
        result.put("items", drainPendingQuickAdds(activity.applicationContext))
        invoke.resolve(result)
    }

    /**
     * 快速添加落库失败的一次性通知：浮层已关、App 多半在后台，只能经系
     * 统通知告知；正文是任务标题，点按打开 App。DEFAULT 渠道与常驻通知
     * 的 LOW 渠道分开，用户可单独关闭。
     */
    @Command
    fun notifyQuickAddFailed(invoke: Invoke) {
        val args = invoke.parseArgs(QuickAddFailedArgs::class.java)
        val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(FAILURE_CHANNEL_ID, args.channelName, NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val openApp = activity.packageManager
            .getLaunchIntentForPackage(activity.packageName)
            ?.let {
                PendingIntent.getActivity(
                    activity, 3, it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
        val builder = NotificationCompat.Builder(activity, FAILURE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_status_bar)
            .setContentTitle(args.title)
            .setContentText(args.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(args.text))
            .setAutoCancel(true)
        openApp?.let { builder.setContentIntent(it) }
        // 每次失败各自一条，不互相覆盖（连续添加时可能多条失败）。
        val id = FAILURE_NOTIFICATION_BASE + (System.currentTimeMillis() % 1000).toInt()
        manager.notify(id, builder.build())
        invoke.resolve()
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
