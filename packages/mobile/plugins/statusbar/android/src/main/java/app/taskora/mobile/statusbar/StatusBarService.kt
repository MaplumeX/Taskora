package app.taskora.mobile.statusbar

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.IBinder
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat

const val CHANNEL_ID = "status-bar"
const val NOTIFICATION_ID = 620001

const val ACTION_STOP_SERVICE = "app.taskora.mobile.statusbar.STOP_SERVICE"
const val ACTION_NEXT = "app.taskora.mobile.statusbar.NEXT"

const val EXTRA_TITLE = "title"
const val EXTRA_CHANNEL_NAME = "channelName"
const val EXTRA_QUICK_ADD_HINT = "quickAddHint"
const val EXTRA_SUBMIT_LABEL = "submitLabel"

/** 点通知本体时携带的导航目标（issue 03：跳转到 Today）。 */
const val EXTRA_NAVIGATE = "navigate"
const val NAVIGATE_TODAY = "today"

/** 内容快照与 pending 快速添加共用的 SharedPreferences 文件。 */
const val STATUS_BAR_PREFS = "taskora-statusbar"

/** 快速添加浮层的数据快照（JSON，格式见 mobile/src/status-bar/quick-add-snapshot.ts）。 */
const val QUICK_ADD_DATA_KEY = "quickAddData"

/**
 * 持有状态栏常驻通知的前台服务（specialUse 类型）。
 *
 * 通知挂在 FGS 上而非直接发布：进程被回收时「▸」「＋」背后的广播接收器
 * 和插件实例还在，按钮不会变死（research.md §3.1）。START_STICKY 让系统
 * 回收进程后把服务拉回来；此时 onStartCommand 的 intent 为 null，用
 * SharedPreferences 里的内容快照重建通知（快照在每次 show 时写入）。
 */
class StatusBarService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null && intent.action == ACTION_STOP_SERVICE) {
            prefs().edit().clear().apply()
            stopForegroundCompat()
            stopSelf()
            return Service.START_NOT_STICKY
        }

        val snapshot = intent?.let { Snapshot.fromIntent(it) } ?: Snapshot.fromPrefs(prefs())
        if (snapshot == null) {
            // sticky 重启但从未发布过内容：没什么可显示的，不要空跑服务。
            stopSelf()
            return Service.START_NOT_STICKY
        }

        ensureChannel(this, snapshot.channelName)
        startForeground(NOTIFICATION_ID, buildNotification(this, snapshot))
        return Service.START_STICKY
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun prefs(): SharedPreferences =
        getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)

    /** 一次发布所需的全部内容；同时是 SharedPreferences 快照的读写口径。 */
    data class Snapshot(
        val title: String,
        val channelName: String,
        val quickAddHint: String,
        val submitLabel: String,
    ) {
        fun save(prefs: SharedPreferences) {
            prefs.edit()
                .putString(EXTRA_TITLE, title)
                .putString(EXTRA_CHANNEL_NAME, channelName)
                .putString(EXTRA_QUICK_ADD_HINT, quickAddHint)
                .putString(EXTRA_SUBMIT_LABEL, submitLabel)
                .apply()
        }

        companion object {
            fun fromIntent(intent: Intent) = Snapshot(
                title = intent.getStringExtra(EXTRA_TITLE) ?: "",
                channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "Status bar",
                quickAddHint = intent.getStringExtra(EXTRA_QUICK_ADD_HINT) ?: "Task title",
                submitLabel = intent.getStringExtra(EXTRA_SUBMIT_LABEL) ?: "Add",
            )

            fun fromPrefs(prefs: SharedPreferences): Snapshot? {
                val title = prefs.getString(EXTRA_TITLE, null) ?: return null
                return Snapshot(
                    title = title,
                    channelName = prefs.getString(EXTRA_CHANNEL_NAME, null) ?: "Status bar",
                    quickAddHint = prefs.getString(EXTRA_QUICK_ADD_HINT, null) ?: "Task title",
                    submitLabel = prefs.getString(EXTRA_SUBMIT_LABEL, null) ?: "Add",
                )
            }
        }
    }

    companion object {

        /** 渠道被用户关闭（IMPORTANCE_NONE）时返回 false，由调用方拒绝发布。 */
        fun channelEnabled(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return true
            return channel.importance != NotificationManager.IMPORTANCE_NONE
        }

        /**
         * 创建/更新 LOW 渠道：无声无震动但状态栏有图标。重复创建同 id 渠道
         * 只更新名字（语言切换），不会重置用户在系统设置里的选择。
         */
        fun ensureChannel(context: Context, name: String) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            manager.createNotificationChannel(channel)
        }

        private fun broadcastIntent(context: Context, action: String, requestCode: Int): PendingIntent {
            val intent = Intent(context, StatusBarActionReceiver::class.java).setAction(action)
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun buildNotification(context: Context, snapshot: Snapshot): Notification {
            val views = RemoteViews(context.packageName, R.layout.notification_status_bar).apply {
                setTextViewText(R.id.status_bar_task_title, snapshot.title)
                setOnClickPendingIntent(
                    R.id.status_bar_btn_next,
                    broadcastIntent(context, ACTION_NEXT, 1),
                )
                val quickAdd = Intent(context, QuickAddActivity::class.java)
                setOnClickPendingIntent(
                    R.id.status_bar_btn_add,
                    PendingIntent.getActivity(
                        context,
                        2,
                        quickAdd,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                )
            }

            val openApp = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                // 点通知本体应落到 Today（issue 03）：标准 launch intent 只会
                // 回到上次界面，加 extra 交给原生插件转成导航请求。
                ?.apply { putExtra(EXTRA_NAVIGATE, NAVIGATE_TODAY) }
                ?.let {
                    PendingIntent.getActivity(
                        context, 0, it,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    )
                }

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_status_bar)
                .setCustomContentView(views)
                .setStyle(NotificationCompat.DecoratedCustomViewStyle())
                // 不设 BigContentView：通知只有折叠态单行，不可展开（issue 02）。
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

            openApp?.let { builder.setContentIntent(it) }

            return builder.build()
        }
    }
}
