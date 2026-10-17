package app.taskora.mobile.statusbar

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
 * 快速添加直达 hub（android-out-of-app-writes）。
 *
 * 浮层提交照旧入队等 JS 落库，同时提交一个联网后运行的一次性任务，把还没
 * 送达的草稿 POST 给 `/quick-add`（新任务 id 即条目 id），不打开 App 其他
 * 设备也能看到。送达只打标记、不出队：JS 之后照常取走，同一 id 落库时副本
 * 里已有就跳过，没有就建出与 hub 相同的行（Subtask id 按序号派生）。
 *
 * 凭据是 reminders 插件保存的设备后台凭据（同一 App 的 SharedPreferences，
 * 见 ReminderBackground）：登出或凭据被拒时那边清空，这里随之不再送达。
 * 被拒、hub 不认识这个接口（旧版）时不重试，留给 JS。
 */
internal object QuickAddDelivery {
    private const val TAG = "TaskoraStatusBar"
    private const val WORK_NAME = "taskora-quick-add-delivery"
    private const val TIMEOUT_MS = 15_000

    /** reminders 插件 ReminderBackground 的存储（名称与键须与之一致）。 */
    private const val BACKGROUND_PREFS = "taskora-reminders-background"
    private const val KEY_PLAN_URL = "planUrl"
    private const val KEY_TOKEN = "token"
    private const val PLAN_PATH = "/reminders/plan"

    private data class Credential(val apiBase: String, val token: String)

    private fun credential(context: Context): Credential? {
        val prefs = context.getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE)
        val planUrl = prefs.getString(KEY_PLAN_URL, null) ?: return null
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        return Credential(planUrl.removeSuffix(PLAN_PATH), token)
    }

    /** 入队后调用。没有后台凭据（未登录 / 已停用）时什么都不做。 */
    fun schedule(context: Context) {
        if (credential(context) == null) return
        val request = OneTimeWorkRequest.Builder(QuickAddDeliveryWorker::class.java)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // APPEND_OR_REPLACE：正在送达时新提交的草稿排在其后再跑一轮，不会被漏掉。
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** 一轮送达；返回是否需要按退避重试。 */
    fun run(context: Context): Boolean {
        val credential = credential(context) ?: return false
        for ((id, draft) in StatusBarPlugin.undeliveredQuickAdds(context)) {
            val code = post(credential, id, draft)
            when {
                code in 200..299 -> StatusBarPlugin.markQuickAddDelivered(context, id)
                code >= 500 -> return true
                // 401 / 403（凭据被拒，reminders 插件的后台任务会停用它）、旧版 hub
                // 没有该接口等：留给 JS
                else -> {
                    Log.w(TAG, "quick add rejected by hub ($code), left for the app")
                    return false
                }
            }
        }
        return false
    }

    private fun post(credential: Credential, id: String, draft: JSONObject): Int {
        // id / openInApp 是提交属性：hub 规整草稿时忽略未知字段，原样带上即可
        val body = JSONObject().put("id", id).put("draft", draft).toString()
        val connection = (URL("${credential.apiBase}/quick-add").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${credential.token}")
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

/** WorkManager 一次性任务：见 QuickAddDelivery。 */
class QuickAddDeliveryWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result =
        try {
            if (QuickAddDelivery.run(applicationContext)) Result.retry() else Result.success()
        } catch (_: IOException) {
            // 服务器不可达：按退避重试
            Result.retry()
        } catch (e: Exception) {
            Log.w("TaskoraStatusBar", "quick add delivery failed", e)
            Result.success()
        }
}
