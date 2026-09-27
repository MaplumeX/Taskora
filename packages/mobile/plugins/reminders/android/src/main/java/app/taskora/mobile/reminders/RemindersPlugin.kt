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

@InvokeArg
class SyncEntry {
    lateinit var key: String
    var fireAt: Long = 0
    lateinit var title: String
    lateinit var body: String
}

@InvokeArg
class SyncArgs {
    var reminders: List<SyncEntry> = listOf()
    lateinit var channelName: String
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
 * sync / clear / status / requestPermission / openSettings。
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = NOTIFICATIONS_ALIAS),
    ],
)
class RemindersPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        // 进程冷启动（含强行停止后首次打开）：在 JS 首次 sync 之前就按
        // 持久化计划重设闹钟。已过时刻的项不补发（见 ReminderAlarms）。
        val context = activity.applicationContext
        Thread { ReminderAlarms.restore(context, dropPast = false) }.start()
    }

    @Command
    fun sync(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SyncArgs::class.java)
            val incoming = args.reminders.map {
                IncomingReminder(key = it.key, fireAt = it.fireAt, title = it.title, body = it.body)
            }
            ReminderAlarms.sync(activity.applicationContext, incoming, args.channelName)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("reminder sync failed: ${e.message}")
        }
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
