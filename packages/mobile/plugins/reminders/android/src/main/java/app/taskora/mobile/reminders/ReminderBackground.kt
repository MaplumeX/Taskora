package app.taskora.mobile.reminders

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * 提醒的后台同步（local-first-v3 issue 09）。
 *
 * App 未打开时，WorkManager 周期任务（最短 15 分钟，联网且电量不低时）
 * 取回 hub 按共享规则算好的完整提醒计划（`GET /reminders/plan`），直接
 * 交给 ReminderAlarms——不经 JS、不写副本，下次打开 App 时副本照常同步。
 * 规则仍只有一份（共享 domain），原生只做取回与交付。
 *
 * 凭据是设备注册时签发的只读后台凭据（不是会话令牌：原生刷新会话会和 JS
 * 争 refresh token 的轮换）。被拒（401 / 403）即停用，等 App 下次启动重新
 * 注册设备时恢复。
 */
internal object ReminderBackground {
    private const val TAG = "TaskoraReminders"
    private const val PREFS = "taskora-reminders-background"
    private const val KEY_PLAN_URL = "planUrl"
    private const val KEY_TOKEN = "token"
    private const val WORK_NAME = "taskora-reminder-plan"
    private const val PERIOD_MINUTES = 15L
    private const val TIMEOUT_MS = 15_000

    data class Config(val planUrl: String, val token: String)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 登录后（每次 App 启动注册设备时）：保存凭据并确保周期任务存在。 */
    @Synchronized
    fun configure(context: Context, planUrl: String, token: String) {
        prefs(context).edit()
            .putString(KEY_PLAN_URL, planUrl)
            .putString(KEY_TOKEN, token)
            .commit()
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val request = PeriodicWorkRequest.Builder(
            ReminderPlanWorker::class.java,
            PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .build()
        // KEEP：已排好的周期不因每次启动而重置。
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** 登出 / 凭据被拒：删除凭据并取消周期任务。 */
    @Synchronized
    fun disable(context: Context) {
        prefs(context).edit().clear().commit()
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** 凭据被拒时停用——除非期间 App 已注册设备、换上了新凭据。 */
    @Synchronized
    private fun disableIfCurrent(context: Context, token: String) {
        if (config(context)?.token == token) disable(context)
    }

    fun config(context: Context): Config? {
        val prefs = prefs(context)
        val planUrl = prefs.getString(KEY_PLAN_URL, null) ?: return null
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        return Config(planUrl, token)
    }

    /** 一次取回与交付。 */
    fun run(context: Context): Outcome {
        val config = config(context) ?: return Outcome.DONE
        val before = ReminderAlarms.planSource(context)
        // 副本有未推送的本地写：hub 计划不含它们，等 App 推送后再说。
        if (before.pendingLocal) return Outcome.DONE

        val connection = (URL(config.planUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${config.token}")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val code = connection.responseCode
            if (code == HttpURLConnection.HTTP_UNAUTHORIZED || code == HttpURLConnection.HTTP_FORBIDDEN) {
                Log.i(TAG, "background token rejected ($code), background sync disabled")
                disableIfCurrent(context, config.token)
                return Outcome.DONE
            }
            if (code != HttpURLConnection.HTTP_OK) return Outcome.RETRY
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val (reminders, cursor) = parsePlan(body)
            val applied = ReminderAlarms.applyBackgroundPlan(context, reminders, cursor, before.generation)
            Log.i(TAG, "background plan: ${reminders.size} reminders at cursor $cursor, applied=$applied")
            return Outcome.DONE
        } finally {
            connection.disconnect()
        }
    }

    private fun parsePlan(body: String): Pair<List<IncomingReminder>, Long> {
        val json = JSONObject(body)
        val array = json.getJSONArray("reminders")
        val reminders = (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            IncomingReminder(
                key = o.getString("key"),
                taskId = o.getString("taskId"),
                fireAt = o.getLong("fireAt"),
                snoozeTomorrowAt = o.getLong("snoozeTomorrowAt"),
                title = o.getString("title"),
                body = o.getString("body"),
            )
        }
        return reminders to json.getLong("cursor")
    }

    enum class Outcome { DONE, RETRY }
}

/** WorkManager 周期任务：见 ReminderBackground。 */
class ReminderPlanWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result =
        try {
            when (ReminderBackground.run(applicationContext)) {
                ReminderBackground.Outcome.DONE -> Result.success()
                ReminderBackground.Outcome.RETRY -> Result.retry()
            }
        } catch (_: IOException) {
            // 服务器不可达：按退避重试，下个周期照常
            Result.retry()
        } catch (e: Exception) {
            // 响应不可解析等：本轮放弃，不重试
            Log.w("TaskoraReminders", "background plan failed", e)
            Result.success()
        }
}
