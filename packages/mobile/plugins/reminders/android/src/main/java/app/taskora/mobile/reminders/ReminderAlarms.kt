package app.taskora.mobile.reminders

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** JS 交付的一条期望提醒。 */
data class IncomingReminder(
    val key: String,
    val taskId: String,
    val fireAt: Long,
    val snoozeTomorrowAt: Long,
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
 * - 通知操作（reminder-actions spec）：按钮由接收器 / 选择对话框处理，
 *   不拉起 App 进程——撤下通知、按操作取消或临时重设本机闹钟，并把操作
 *   排进持久化队列，等 JS 下次运行时按 Reminder Action 规则应用。规则仍
 *   只在 JS：原生只做「点击时刻 + 固定时长」和使用 JS 预先算好的时刻。
 */
internal object ReminderAlarms {
    /** 沿用 tauri-plugin-notification 时期的渠道 id：用户对该渠道的设置保留。 */
    const val CHANNEL_ID = "reminders"
    const val ACTION_FIRE = "app.taskora.mobile.reminders.FIRE"
    const val EXTRA_KEY = "key"
    const val ACTION_REMINDER_ACTION = "app.taskora.mobile.reminders.ACTION"
    /** 点通知正文启动 App 时携带的任务 id（RemindersPlugin 读取）。 */
    const val EXTRA_OPEN_TASK = "app.taskora.mobile.reminders.OPEN_TASK"
    const val EXTRA_ACTION = "action"
    const val EXTRA_ID = "id"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_FIRE_AT = "fireAt"
    const val EXTRA_SNOOZE_TOMORROW_AT = "snoozeTomorrowAt"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    const val OP_COMPLETE = "complete"
    const val OP_SNOOZE_15 = "snooze15"
    const val OP_SNOOZE_60 = "snooze60"
    const val OP_SNOOZE_TOMORROW = "snoozeTomorrow"

    private const val MINUTE_MS = 60 * 1000L
    private const val DAY_MS = 24 * 60 * MINUTE_MS

    private const val ARM_WINDOW = 20
    private const val GC_AFTER_MS = 60 * 60 * 1000L
    /** 闹钟早于记录时刻超过该值视为过期闹钟（记录已改期），只重设不投递。 */
    private const val EARLY_TOLERANCE_MS = 60 * 1000L

    private val lock = Any()

    fun sync(
        context: Context,
        incoming: List<IncomingReminder>,
        channelName: String,
        labels: ActionLabels?,
    ) {
        synchronized(lock) {
            ReminderStore.setChannelName(context, channelName)
            if (labels != null) ReminderStore.setLabels(context, labels)
            ensureChannel(context, channelName)

            val now = System.currentTimeMillis()
            val plan = ReminderStore.load(context)
            val incomingKeys = incoming.mapTo(HashSet()) { it.key }
            // 仍在队列中的操作：JS 还没应用，其 Snooze 临时闹钟不属于「已消失」。
            val queuedKeys = ReminderStore.pendingActions(context).mapTo(HashSet()) { it.key }

            val iterator = plan.values.iterator()
            while (iterator.hasNext()) {
                val stored = iterator.next()
                if (stored.key !in incomingKeys && stored.key !in queuedKeys && stored.fireAt > now) {
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
                    taskId = reminder.taskId,
                    snoozeTomorrowAt = reminder.snoozeTomorrowAt,
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

    /**
     * 通知按钮 / 「稍后…」对话框的选择。撤下通知；完成则确保该 key 不再
     * 有闹钟，Snooze 则以新时刻为该 key 重设本机闹钟（App 不运行也会准时
     * 再响）；随后把操作排进队列。
     */
    fun onAction(context: Context, op: String, fired: StoredReminder, tappedAt: Long) {
        synchronized(lock) {
            NotificationManagerCompat.from(context).cancel(fired.id)
            val now = System.currentTimeMillis()
            val plan = ReminderStore.load(context)
            val target = when (op) {
                OP_COMPLETE -> null
                OP_SNOOZE_15 -> ceilToMinute(tappedAt + 15 * MINUTE_MS)
                OP_SNOOZE_60 -> ceilToMinute(tappedAt + 60 * MINUTE_MS)
                OP_SNOOZE_TOMORROW -> {
                    var at = if (fired.snoozeTomorrowAt > 0) fired.snoozeTomorrowAt else fired.fireAt + DAY_MS
                    while (at <= now) at += DAY_MS
                    at
                }
                else -> return
            }
            if (target == null) {
                plan.remove(fired.key)?.let { cancelAlarm(context, it.id) }
            } else {
                val id = plan[fired.key]?.id ?: fired.id
                // 重设后的临时提醒再次触发时，「明天」保持与触发时刻同样的间隔。
                val tomorrowOffset =
                    if (fired.snoozeTomorrowAt > fired.fireAt) fired.snoozeTomorrowAt - fired.fireAt else DAY_MS
                plan[fired.key] = fired.copy(
                    id = id,
                    fireAt = target,
                    snoozeTomorrowAt = target + tomorrowOffset,
                )
            }
            ReminderStore.save(context, plan)
            armWindow(context, plan.values, now)

            val queue = ReminderStore.pendingActions(context)
            queue.add(
                PendingAction(
                    key = fired.key,
                    taskId = fired.taskId,
                    action = op,
                    firedFireAt = fired.fireAt,
                    tappedAt = tappedAt,
                ),
            )
            ReminderStore.savePendingActions(context, queue)
        }
        RemindersPlugin.notifyActionsAvailable()
    }

    /** 取走排队的操作（JS 应用；取出即删）。 */
    fun takePendingActions(context: Context): List<PendingAction> {
        synchronized(lock) {
            val queue = ReminderStore.pendingActions(context)
            if (queue.isNotEmpty()) ReminderStore.savePendingActions(context, emptyList())
            return queue
        }
    }

    /** 与 JS 的 Snooze 目标一致：向上取整到分钟。 */
    private fun ceilToMinute(ms: Long): Long = (ms + MINUTE_MS - 1) / MINUTE_MS * MINUTE_MS

    /** 通知按钮 / 对话框所需的通知快照（全部随 Intent 携带，不依赖计划）。 */
    fun firedFromIntent(intent: Intent): StoredReminder? {
        val key = intent.getStringExtra(EXTRA_KEY) ?: return null
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return null
        return StoredReminder(
            key = key,
            id = intent.getIntExtra(EXTRA_ID, 0),
            fireAt = intent.getLongExtra(EXTRA_FIRE_AT, 0),
            title = intent.getStringExtra(EXTRA_TITLE) ?: "",
            body = intent.getStringExtra(EXTRA_BODY) ?: "",
            taskId = taskId,
            snoozeTomorrowAt = intent.getLongExtra(EXTRA_SNOOZE_TOMORROW_AT, 0),
        )
    }

    private fun fillFired(intent: Intent, reminder: StoredReminder): Intent = intent.apply {
        putExtra(EXTRA_KEY, reminder.key)
        putExtra(EXTRA_ID, reminder.id)
        putExtra(EXTRA_TASK_ID, reminder.taskId)
        putExtra(EXTRA_FIRE_AT, reminder.fireAt)
        putExtra(EXTRA_SNOOZE_TOMORROW_AT, reminder.snoozeTomorrowAt)
        putExtra(EXTRA_TITLE, reminder.title)
        putExtra(EXTRA_BODY, reminder.body)
    }

    /**
     * 同一通知的各个按钮必须是不同的 PendingIntent：requestCode 相同时靠
     * data URI 区分（extras 不参与 PendingIntent 相等判断）。
     */
    private fun actionData(reminder: StoredReminder, op: String): Uri =
        Uri.parse("taskora-reminder://${reminder.id}/$op")

    private fun actionIntent(context: Context, reminder: StoredReminder, op: String): PendingIntent {
        val intent = fillFired(Intent(context, ReminderActionReceiver::class.java), reminder).apply {
            action = ACTION_REMINDER_ACTION
            data = actionData(reminder, op)
            putExtra(EXTRA_ACTION, op)
        }
        return PendingIntent.getBroadcast(
            context,
            reminder.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun snoozeMoreIntent(context: Context, reminder: StoredReminder): PendingIntent {
        val intent = fillFired(Intent(context, ReminderSnoozeActivity::class.java), reminder).apply {
            data = actionData(reminder, "more")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_HISTORY)
        }
        return PendingIntent.getActivity(
            context,
            reminder.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
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
            // SINGLE_TOP：App 已在前台时经 onNewIntent 交付，而不是被忽略。
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP,
            )
            if (reminder.taskId.isNotEmpty()) putExtra(EXTRA_OPEN_TASK, reminder.taskId)
        }
        val content = launch?.let {
            PendingIntent.getActivity(
                context,
                reminder.id,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_reminder)
            .setContentTitle(reminder.title)
            .setContentText(reminder.body)
            // 正文可能含备注首行（第二行）：展开后完整显示。
            .setStyle(NotificationCompat.BigTextStyle().bigText(reminder.body))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(reminder.fireAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(content)
        // 旧版计划（无 taskId）或尚未收到按钮文案时不挂按钮：操作无从应用。
        val labels = ReminderStore.labels(context)
        if (reminder.taskId.isNotEmpty() && labels != null) {
            // Android 通知最多 3 个按钮：「稍后…」打开对话框选 1 小时 / 明天。
            builder
                .addAction(0, labels.complete, actionIntent(context, reminder, OP_COMPLETE))
                .addAction(0, labels.snooze15, actionIntent(context, reminder, OP_SNOOZE_15))
                .addAction(0, labels.snoozeMore, snoozeMoreIntent(context, reminder))
        }
        try {
            NotificationManagerCompat.from(context).notify(reminder.id, builder.build())
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
