package app.taskora.mobile.reminders

import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle

/**
 * 通知按钮（完成 / 15 分钟后）：在接收器里就地处理，不拉起 App 进程
 * （reminder-actions spec）。数据改写由 JS 下次运行时从队列应用。
 */
class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReminderAlarms.ACTION_REMINDER_ACTION) return
        val op = intent.getStringExtra(ReminderAlarms.EXTRA_ACTION) ?: return
        val fired = ReminderAlarms.firedFromIntent(intent) ?: return
        ReminderAlarms.onAction(context.applicationContext, op, fired, System.currentTimeMillis())
    }
}

/**
 * 「稍后…」：Android 通知最多 3 个按钮，1 小时后 / 明天放进这个半透明
 * 选择对话框。只是原生对话框，不启动 WebView；选完即结束。
 */
class ReminderSnoozeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fired = ReminderAlarms.firedFromIntent(intent)
        val labels = ReminderStore.labels(applicationContext)
        if (fired == null || labels == null) {
            finish()
            return
        }
        val ops = arrayOf(ReminderAlarms.OP_SNOOZE_60, ReminderAlarms.OP_SNOOZE_TOMORROW)
        // 活动本身是半透明主题：对话框显式用系统样式，并跟随深色模式。
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val dialogTheme =
            if (night) {
                android.R.style.Theme_DeviceDefault_Dialog_Alert
            } else {
                android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
            }
        AlertDialog.Builder(this, dialogTheme)
            .setTitle(fired.title)
            .setItems(arrayOf(labels.snooze60, labels.snoozeTomorrow)) { _, which ->
                ReminderAlarms.onAction(applicationContext, ops[which], fired, System.currentTimeMillis())
                finish()
            }
            .setOnCancelListener { finish() }
            .show()
    }
}
