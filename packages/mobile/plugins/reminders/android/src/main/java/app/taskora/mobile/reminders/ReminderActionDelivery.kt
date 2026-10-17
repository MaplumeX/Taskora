package app.taskora.mobile.reminders

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * 通知操作直达 hub（android-out-of-app-writes）。
 *
 * 点「完成 / 稍后」时 App 多半不在：操作照旧排进队列等 JS 应用，同时提交
 * 一个联网后运行的一次性任务，用设备后台凭据（ReminderBackground）把还没
 * 送达的操作 POST 给 `/reminders/actions`，hub 按同一套规则应用，其他设备
 * 随即 pull 到。送达只打标记、不出队（见 PendingAction）。
 *
 * 重发安全：hub 对已了结的任务、快照已过期的 Snooze 一律丢弃，同一操作
 * 送达两次不会生效两次。凭据缺失或被拒、hub 不认识这个接口（旧版）时不
 * 重试，留给 JS 下次运行时应用。
 */
internal object ReminderActionDelivery {
    private const val TAG = "TaskoraReminders"
    private const val WORK_NAME = "taskora-reminder-actions"
    private const val TIMEOUT_MS = 15_000

    /** 入队后调用。没有后台凭据（未登录 / 已停用）时什么都不做。 */
    fun schedule(context: Context) {
        if (ReminderBackground.config(context) == null) return
        val request = OneTimeWorkRequest.Builder(ReminderActionWorker::class.java)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // APPEND_OR_REPLACE：正在送达时新点的操作排在其后再跑一轮，不会被漏掉。
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** 一轮送达。 */
    fun run(context: Context): ReminderBackground.Outcome {
        val config = ReminderBackground.config(context) ?: return ReminderBackground.Outcome.DONE
        var delivered = 0
        try {
            for (action in ReminderAlarms.undeliveredActions(context)) {
                val code = post(config, action)
                when {
                    code in 200..299 -> {
                        ReminderAlarms.markDelivered(context, action)
                        delivered++
                    }
                    code == HttpURLConnection.HTTP_UNAUTHORIZED || code == HttpURLConnection.HTTP_FORBIDDEN -> {
                        Log.i(TAG, "background token rejected ($code), background sync disabled")
                        ReminderBackground.disableIfCurrent(context, config.token)
                        return ReminderBackground.Outcome.DONE
                    }
                    code >= 500 -> return ReminderBackground.Outcome.RETRY
                    // 其余 4xx（旧版 hub 没有该接口、请求不被接受）：留给 JS
                    else -> {
                        Log.w(TAG, "reminder action rejected by hub ($code), left for the app")
                        return ReminderBackground.Outcome.DONE
                    }
                }
            }
        } finally {
            if (delivered > 0) ReminderBackground.refreshSoon(context)
        }
        return ReminderBackground.Outcome.DONE
    }

    private fun post(config: ReminderBackground.Config, action: PendingAction): Int {
        val body = JSONObject()
            .put("taskId", action.taskId)
            .put("action", action.action)
            .put("firedFireAt", action.firedFireAt)
            .put("tappedAt", action.tappedAt)
            .toString()
        val connection = (URL("${config.apiBase}/reminders/actions").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${config.token}")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            return connection.responseCode
        } finally {
            connection.disconnect()
        }
    }
}

/** WorkManager 一次性任务：见 ReminderActionDelivery。 */
class ReminderActionWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result =
        try {
            when (ReminderActionDelivery.run(applicationContext)) {
                ReminderBackground.Outcome.DONE -> Result.success()
                ReminderBackground.Outcome.RETRY -> Result.retry()
            }
        } catch (_: IOException) {
            // 服务器不可达：按退避重试
            Result.retry()
        } catch (e: Exception) {
            Log.w("TaskoraReminders", "reminder action delivery failed", e)
            Result.success()
        }
}
