package app.taskora.mobile.reminders

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** JS 交付的一条期望提醒。 */
data class IncomingReminder(
    val key: String,
    val fireAt: Long,
    val title: String,
    val body: String,
)

/**
 * 提醒的调度与投递（ADR-0014）。
 *
 * - sync：JS 交付完整期望集，与持久化计划比对；消失的未来项注销闹钟，
 *   新增/变化项写入，然后按最近优先设置闹钟窗口。
 * - 已到点但尚未投递的项（Doze 或系统排队中）不因从期望集消失而注销：
 *   原生 cancel 会让这条提醒永远不出现（reminders issue 02 的教训）。
 *   超过 GC_AFTER_MS 仍未投递的视为丢失（如被强行停止），静默回收。
 * - 只提前设置最近 ARM_WINDOW 个闹钟（Android 对单应用待触发闹钟数有
 *   上限），每次触发/同步/恢复时补设下一批。每次都无条件重设窗口内的
 *   闹钟：强行停止会清掉闹钟，而持久化计划无从得知。
 */
internal object ReminderAlarms {
    /** 沿用 tauri-plugin-notification 时期的渠道 id：用户对该渠道的设置保留。 */
    const val CHANNEL_ID = "reminders"
    const val ACTION_FIRE = "app.taskora.mobile.reminders.FIRE"
    const val EXTRA_KEY = "key"

    private const val ARM_WINDOW = 20
    private const val GC_AFTER_MS = 60 * 60 * 1000L
    /** 闹钟早于记录时刻超过该值视为过期闹钟（记录已改期），只重设不投递。 */
    private const val EARLY_TOLERANCE_MS = 60 * 1000L

    private val lock = Any()

    fun sync(context: Context, incoming: List<IncomingReminder>, channelName: String) {
        synchronized(lock) {
            ReminderStore.setChannelName(context, channelName)
            ensureChannel(context, channelName)

            val now = System.currentTimeMillis()
            val plan = ReminderStore.load(context)
            val incomingKeys = incoming.mapTo(HashSet()) { it.key }

            val iterator = plan.values.iterator()
            while (iterator.hasNext()) {
                val stored = iterator.next()
                if (stored.key !in incomingKeys && stored.fireAt > now) {
                    cancelAlarm(context, stored.id)
                    iterator.remove()
                }
            }
            for (reminder in incoming) {
                val id = plan[reminder.key]?.id ?: ReminderStore.allocateId(context)
                plan[reminder.key] = StoredReminder(
                    key = reminder.key,
                    id = id,
                    fireAt = reminder.fireAt,
                    title = reminder.title,
                    body = reminder.body,
                )
            }
            collectGarbage(context, plan, now)
            ReminderStore.save(context, plan)
            armWindow(context, plan.values, now)
        }
    }

    /** 登出：注销全部闹钟并清空计划。 */
    fun clear(context: Context) {
        synchronized(lock) {
            val plan = ReminderStore.load(context)
            for (stored in plan.values) cancelAlarm(context, stored.id)
            plan.clear()
            ReminderStore.save(context, plan)
        }
    }

    /**
     * 从持久化计划重新设置闹钟。
     *
     * @param dropPast 开机时为 true：关机期间闹钟已全部清空，已过时刻的
     *   提醒按产品决定丢弃、不补发（reminders spec 2026-09-27）。
     */
    fun restore(context: Context, dropPast: Boolean) {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            val plan = ReminderStore.load(context)
            if (dropPast) {
                plan.values.removeAll { it.fireAt <= now }
            }
            collectGarbage(context, plan, now)
            ReminderStore.save(context, plan)
            armWindow(context, plan.values, now)
        }
    }

    fun onFire(context: Context, key: String) {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            val plan = ReminderStore.load(context)
            val reminder = plan[key] ?: return
            if (reminder.fireAt - now > EARLY_TOLERANCE_MS) {
                armWindow(context, plan.values, now)
                return
            }
            plan.remove(key)
            ReminderStore.save(context, plan)
            post(context, reminder)
            armWindow(context, plan.values, now)
        }
    }

    fun notificationsEnabled(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** 渠道未创建视为可用（首次 sync 会以高重要性创建）。 */
    fun channelEnabled(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return true
        return channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        return alarmManager.canScheduleExactAlarms()
    }

    fun batteryUnrestricted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val power = context.getSystemService(PowerManager::class.java)
        return power.isIgnoringBatteryOptimizations(context.packageName)
    }

    private fun collectGarbage(context: Context, plan: MutableMap<String, StoredReminder>, now: Long) {
        val iterator = plan.values.iterator()
        while (iterator.hasNext()) {
            val stored = iterator.next()
            if (stored.fireAt < now - GC_AFTER_MS) {
                cancelAlarm(context, stored.id)
                iterator.remove()
            }
        }
    }

    /**
     * 已到点的项不重设：系统仍持有其闹钟时会照常投递，已丢失的由
     * collectGarbage 回收——绝不在事后补发。
     */
    private fun armWindow(context: Context, reminders: Collection<StoredReminder>, now: Long) {
        val future = reminders.filter { it.fireAt > now }.sortedBy { it.fireAt }
        future.take(ARM_WINDOW).forEach { setAlarm(context, it) }
        future.drop(ARM_WINDOW).forEach { cancelAlarm(context, it.id) }
    }

    private fun fireIntent(context: Context, key: String?): Intent =
        Intent(context, ReminderAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            if (key != null) putExtra(EXTRA_KEY, key)
        }

    @SuppressLint("MissingPermission")
    private fun setAlarm(context: Context, reminder: StoredReminder) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val pending = PendingIntent.getBroadcast(
            context,
            reminder.id,
            fireIntent(context, reminder.key),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            if (canScheduleExact(context)) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.fireAt, pending)
                return
            }
        } catch (_: SecurityException) {
            // 精确闹钟授权在检查与设置之间被收回：退回非精确。
        }
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.fireAt, pending)
    }

    private fun cancelAlarm(context: Context, id: Int) {
        val pending = PendingIntent.getBroadcast(
            context,
            id,
            fireIntent(context, null),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    private fun ensureChannel(context: Context, name: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        // 已存在时只更新名称（系统保留用户改过的重要性与声音）。
        val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_HIGH)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    @SuppressLint("MissingPermission")
    private fun post(context: Context, reminder: StoredReminder) {
        // 未授权时静默跳过：计划已落盘，用户授权后后续提醒照常投递。
        if (!notificationsEnabled(context)) return
        ensureChannel(context, ReminderStore.channelName(context) ?: "Taskora")

        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        }
        val content = launch?.let {
            PendingIntent.getActivity(
                context,
                reminder.id,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_reminder)
            .setContentTitle(reminder.title)
            .setContentText(reminder.body)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(reminder.fireAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(content)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(reminder.id, notification)
        } catch (_: SecurityException) {
            // 检查与发布之间权限被收回。
        }
    }
}

/** 闹钟到点：发布通知并补设下一批闹钟。 */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReminderAlarms.ACTION_FIRE) return
        val key = intent.getStringExtra(ReminderAlarms.EXTRA_KEY) ?: return
        ReminderAlarms.onFire(context.applicationContext, key)
    }
}

/**
 * 开机 / 应用升级后重新设置闹钟，不需要 WebView，也不需要用户打开 App。
 * 开机时关机期间错过的提醒丢弃；升级时系统保留闹钟，只做对齐。
 */
class ReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED ->
                ReminderAlarms.restore(context.applicationContext, dropPast = true)
            Intent.ACTION_MY_PACKAGE_REPLACED ->
                ReminderAlarms.restore(context.applicationContext, dropPast = false)
        }
    }
}
