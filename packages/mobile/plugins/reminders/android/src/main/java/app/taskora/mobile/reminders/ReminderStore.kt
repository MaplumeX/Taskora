package app.taskora.mobile.reminders

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** 持久化计划中的一条提醒；id 由原生分配，同 key 跨 sync 复用。 */
data class StoredReminder(
    val key: String,
    val id: Int,
    val fireAt: Long,
    val title: String,
    val body: String,
)

/**
 * 提醒计划的持久化（SharedPreferences + JSON）。
 *
 * 这是原生侧的单一事实来源：JS 进程的内存会随进程消失，系统闹钟却会
 * 持续存在，两者只能靠这份持久化计划对账（ADR-0014）。所有写入走
 * commit()（同步落盘）：接收器返回后进程随时可能被回收。调用方负责加锁
 * （见 ReminderAlarms.lock）。
 */
internal object ReminderStore {
    private const val PREFS = "taskora-reminders"
    private const val KEY_PLAN = "plan"
    private const val KEY_NEXT_ID = "nextId"
    private const val KEY_CHANNEL_NAME = "channelName"

    /** 通知 id 起点：远离状态栏常驻通知的固定 id（620001）。 */
    private const val FIRST_ID = 1_000_000

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(context: Context): LinkedHashMap<String, StoredReminder> {
        val plan = LinkedHashMap<String, StoredReminder>()
        val raw = prefs(context).getString(KEY_PLAN, null) ?: return plan
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                val reminder = StoredReminder(
                    key = o.getString("key"),
                    id = o.getInt("id"),
                    fireAt = o.getLong("fireAt"),
                    title = o.getString("title"),
                    body = o.getString("body"),
                )
                plan[reminder.key] = reminder
            }
        } catch (_: Exception) {
            // 损坏的计划整体丢弃：下一次 JS sync 会重建。
            plan.clear()
        }
        return plan
    }

    fun save(context: Context, plan: Map<String, StoredReminder>) {
        val array = JSONArray()
        for (reminder in plan.values) {
            array.put(
                JSONObject()
                    .put("key", reminder.key)
                    .put("id", reminder.id)
                    .put("fireAt", reminder.fireAt)
                    .put("title", reminder.title)
                    .put("body", reminder.body),
            )
        }
        prefs(context).edit().putString(KEY_PLAN, array.toString()).commit()
    }

    fun allocateId(context: Context): Int {
        val prefs = prefs(context)
        val id = prefs.getInt(KEY_NEXT_ID, FIRST_ID)
        // 溢出回绕到起点：届时早期 id 早已随提醒触发而退役。
        val next = if (id >= Int.MAX_VALUE - 1) FIRST_ID else id + 1
        prefs.edit().putInt(KEY_NEXT_ID, next).commit()
        return id
    }

    fun channelName(context: Context): String? = prefs(context).getString(KEY_CHANNEL_NAME, null)

    fun setChannelName(context: Context, name: String) {
        prefs(context).edit().putString(KEY_CHANNEL_NAME, name).commit()
    }
}
