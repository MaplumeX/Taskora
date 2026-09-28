package app.taskora.mobile.reminders

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class SyncEntry {
    lateinit var key: String
    var taskId: String = ""
    var fireAt: Long = 0
    var snoozeTomorrowAt: Long = 0
    lateinit var title: String
    lateinit var body: String
}

@InvokeArg
class SyncLabels {
    lateinit var complete: String
    lateinit var snooze: String
    lateinit var snooze15: String
    lateinit var snooze60: String
    lateinit var snoozeTomorrow: String
    lateinit var snoozeMore: String
}

@InvokeArg
class SyncArgs {
    var reminders: List<SyncEntry> = listOf()
    lateinit var channelName: String
    var labels: SyncLabels? = null
}

@InvokeArg
class OpenSettingsArgs {
    lateinit var target: String
}

private const val NOTIFICATIONS_ALIAS = "notifications"

/**
 * 厂商自启动管理页（无公开 API，按已知组件逐个尝试，均失败时退回应用
 * 详情页）。组件未导出或不存在时 startActivity 抛异常，继续下一个。
 */
private val AUTOSTART_COMPONENTS = listOf(
    // 小米 / HyperOS
    "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
    // 华为
    "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
    "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
    // 荣耀
    "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
    // OPPO / 一加 / realme（ColorOS）
    "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
    "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
    "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
    "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
    // vivo / iQOO
    "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
    "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
    // 三星（电池 → 后台使用限制）
    "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
)

/**
 * Reminder 投递插件入口（ADR-0014）。JS 经 Rust 命令调用：
 * sync / clear / status / requestPermission / openSettings /
 * takePendingActions / takeLaunchTask。
 *
 * 事件（reminder-actions spec，JS 经 addPluginListener 订阅）：
 * - actions-available：通知按钮排进了新操作（进程存活时立即应用）；
 * - open-task：App 存活时点通知正文（onNewIntent），JS 随后 takeLaunchTask。
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = NOTIFICATIONS_ALIAS),
    ],
)
class RemindersPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        /** 当前存活的插件实例：接收器（与 WebView 同进程）据此通知 JS。 */
        @Volatile
        private var instance: RemindersPlugin? = null

        fun notifyActionsAvailable() {
            instance?.trigger("actions-available", JSObject())
        }
    }

    /** 点通知正文带来的任务 id，等 JS 取走（冷启动时 JS 尚未就绪）。 */
    @Volatile
    private var launchTaskId: String? = null

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        instance = this
        captureLaunchTask(activity.intent)
        // 进程冷启动（含强行停止后首次打开）：在 JS 首次 sync 之前就按
        // 持久化计划重设闹钟。已过时刻的项不补发（见 ReminderAlarms）。
        val context = activity.applicationContext
        Thread { ReminderAlarms.restore(context, dropPast = false) }.start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (captureLaunchTask(intent)) trigger("open-task", JSObject())
    }

    /** 取出并移除意图里的任务 id（避免 Activity 重建时重复定位）。 */
    private fun captureLaunchTask(intent: Intent?): Boolean {
        val taskId = intent?.getStringExtra(ReminderAlarms.EXTRA_OPEN_TASK) ?: return false
        intent.removeExtra(ReminderAlarms.EXTRA_OPEN_TASK)
        launchTaskId = taskId
        return true
    }

    @Command
    fun sync(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SyncArgs::class.java)
            val incoming = args.reminders.map {
                IncomingReminder(
                    key = it.key,
                    taskId = it.taskId,
                    fireAt = it.fireAt,
                    snoozeTomorrowAt = it.snoozeTomorrowAt,
                    title = it.title,
                    body = it.body,
                )
            }
            val labels = args.labels?.let {
                ActionLabels(
                    complete = it.complete,
                    snooze = it.snooze,
                    snooze15 = it.snooze15,
                    snooze60 = it.snooze60,
                    snoozeTomorrow = it.snoozeTomorrow,
                    snoozeMore = it.snoozeMore,
                )
            }
            ReminderAlarms.sync(activity.applicationContext, incoming, args.channelName, labels)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("reminder sync failed: ${e.message}")
        }
    }

    @Command
    fun takePendingActions(invoke: Invoke) {
        val array = JSONArray()
        for (action in ReminderAlarms.takePendingActions(activity.applicationContext)) {
            array.put(
                JSONObject()
                    .put("taskId", action.taskId)
                    .put("action", action.action)
                    .put("firedFireAt", action.firedFireAt)
                    .put("tappedAt", action.tappedAt),
            )
        }
        val result = JSObject()
        result.put("actions", array)
        invoke.resolve(result)
    }

    @Command
    fun takeLaunchTask(invoke: Invoke) {
        val taskId = launchTaskId
        launchTaskId = null
        val result = JSObject()
        // taskId 为 null 时 org.json 不写入该键；Rust 侧 Option 缺省即 None。
        result.put("taskId", taskId)
        invoke.resolve(result)
    }

    @Command
    fun clear(invoke: Invoke) {
        ReminderAlarms.clear(activity.applicationContext)
        invoke.resolve()
    }

    @Command
    fun status(invoke: Invoke) {
        val context = activity.applicationContext
        val result = JSObject()
        result.put("notifications", ReminderAlarms.notificationsEnabled(context))
        result.put("channelEnabled", ReminderAlarms.channelEnabled(context))
        result.put("exactAlarms", ReminderAlarms.canScheduleExact(context))
        result.put("batteryUnrestricted", ReminderAlarms.batteryUnrestricted(context))
        invoke.resolve(result)
    }

    /**
     * 已授权时立即返回（tauri-plugin-notification 在此情形下永不
     * resolve，issue 03 问题 4）。Android 13 以下没有运行时授权，直接
     * 返回应用级通知开关状态。
     */
    @Command
    fun requestPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState(NOTIFICATIONS_ALIAS) == PermissionState.GRANTED
        ) {
            resolvePermission(invoke)
            return
        }
        requestPermissionForAlias(NOTIFICATIONS_ALIAS, invoke, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(invoke: Invoke) {
        resolvePermission(invoke)
    }

    private fun resolvePermission(invoke: Invoke) {
        val result = JSObject()
        result.put("granted", ReminderAlarms.notificationsEnabled(activity.applicationContext))
        invoke.resolve(result)
    }

    @Command
    fun openSettings(invoke: Invoke) {
        val args = invoke.parseArgs(OpenSettingsArgs::class.java)
        val packageUri = Uri.parse("package:${activity.packageName}")
        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)

        val candidates = when (args.target) {
            "exact-alarm" -> buildList {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    add(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri))
                }
                add(appDetails)
            }
            "battery" -> listOf(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri),
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                appDetails,
            )
            "autostart" -> AUTOSTART_COMPONENTS.map { (pkg, cls) ->
                Intent().setComponent(ComponentName(pkg, cls))
            } + appDetails
            else -> {
                invoke.reject("unknown settings target: ${args.target}")
                return
            }
        }

        for (intent in candidates) {
            try {
                activity.startActivity(intent)
                invoke.resolve()
                return
            } catch (_: Exception) {
                // 该 ROM 上不存在或未导出，尝试下一个。
            }
        }
        invoke.reject("no settings page available for ${args.target}")
    }
}
