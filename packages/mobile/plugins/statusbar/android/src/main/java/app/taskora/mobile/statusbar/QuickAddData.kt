package app.taskora.mobile.statusbar

import android.content.SharedPreferences
import org.json.JSONObject
import java.util.TimeZone

/**
 * 快速添加浮层的数据快照（quick-add-android issue 02）：JS 算好后经
 * setQuickAddData 写进 SharedPreferences，格式见
 * packages/mobile/src/status-bar/quick-add-snapshot.ts。原生只读取与展示，
 * 不做业务推导（归属顺序、稍后项目过滤、Tag 层级都已由 JS 算好）。
 *
 * 没有快照（状态栏刚开启、版本不认识、内容损坏）时退回只有 Inbox 的空
 * 数据：浮层照常能用，只是归属与 Tag 无可选项。
 */
class QuickAddData(
    val timeZone: TimeZone,
    /** 0 = 周日，1 = 周一。 */
    val weekStartsOn: Int,
    val placements: List<Placement>,
    val tags: List<TagRow>,
    private val texts: Map<String, String>,
) {
    /** 归属行；kind 为 inbox / area / project，inbox 的 id 为 null。 */
    data class Placement(val kind: String, val id: String?, val title: String, val depth: Int)

    /** Tag 行，按 Tag 树先序排列；depth 为嵌套层级（嵌套 Tag，ADR-0016）。 */
    data class TagRow(val id: String, val title: String, val color: String?, val depth: Int)

    fun text(key: String): String = texts[key] ?: FALLBACK_TEXTS[key] ?: key

    fun placementTitle(kind: String, id: String?): String? =
        placements.firstOrNull { it.kind == kind && it.id == id }?.title

    fun tagTitle(id: String): String? =
        tags.firstOrNull { it.id == id }?.title

    companion object {
        private const val VERSION = 1

        /** 快照缺失时的英文兜底（正常情况下文案全部来自 JS）。 */
        private val FALLBACK_TEXTS = mapOf(
            "addNotes" to "+ Notes",
            "notesHint" to "Notes",
            "today" to "Today",
            "tomorrow" to "Tomorrow",
            "weekend" to "This weekend",
            "someday" to "Someday",
            "pickDate" to "Pick a date",
            "inbox" to "Inbox",
            "tags" to "Tags",
            "search" to "Search",
            "done" to "Done",
            "continuous" to "Keep adding",
            "continueInApp" to "Continue in app",
            "added" to "Added",
        )

        fun load(prefs: SharedPreferences): QuickAddData =
            prefs.getString(QUICK_ADD_DATA_KEY, null)?.let(::parse) ?: empty()

        private fun empty() = QuickAddData(
            timeZone = TimeZone.getDefault(),
            weekStartsOn = 1,
            placements = listOf(Placement("inbox", null, FALLBACK_TEXTS.getValue("inbox"), 0)),
            tags = emptyList(),
            texts = emptyMap(),
        )

        private fun parse(raw: String): QuickAddData? = try {
            val json = JSONObject(raw)
            if (json.optInt("v") != VERSION) {
                null
            } else {
                val placements = json.getJSONArray("placements").let { array ->
                    (0 until array.length()).map { i ->
                        val row = array.getJSONObject(i)
                        Placement(
                            kind = row.getString("kind"),
                            id = row.optString("id").takeIf { it.isNotEmpty() },
                            title = row.getString("title"),
                            depth = row.optInt("depth"),
                        )
                    }
                }
                val tags = json.getJSONArray("tags").let { array ->
                    (0 until array.length()).mapNotNull { i ->
                        val row = array.getJSONObject(i)
                        // 旧快照的 Tag Group 小标题行：Tag Group 已退役，跳过
                        if (row.getString("kind") != "tag") return@mapNotNull null
                        TagRow(
                            id = row.getString("id"),
                            title = row.getString("title"),
                            color = row.optString("color").takeIf { it.isNotEmpty() && it != "null" },
                            depth = row.optInt("depth"),
                        )
                    }
                }
                val textsJson = json.optJSONObject("texts")
                val texts = textsJson?.keys()?.asSequence()?.associateWith { textsJson.getString(it) }
                    ?: emptyMap()
                QuickAddData(
                    timeZone = TimeZone.getTimeZone(json.optString("timeZone", TimeZone.getDefault().id)),
                    weekStartsOn = json.optInt("weekStartsOn", 1),
                    placements = placements,
                    tags = tags,
                    texts = texts,
                )
            }
        } catch (_: Exception) {
            null
        }
    }
}
