package app.taskora.mobile.statusbar

import android.text.format.DateFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * 快速添加浮层的日期计算：一律按账号时区（快照里的 timeZone）取「今天」，
 * 不用设备时区（CONTEXT：Account Time Zone）。产出日历日键 YYYY-MM-DD，
 * 与 QuickAddDraft.when.date 同一格式。minSdk 24 没有 java.time，用 Calendar。
 */
object QuickAddDates {

    fun today(zone: TimeZone): Calendar = Calendar.getInstance(zone)

    fun tomorrow(zone: TimeZone): Calendar = today(zone).apply { add(Calendar.DAY_OF_MONTH, 1) }

    /** 本周六；今天已是周六或周日时取下周六。 */
    fun weekend(zone: TimeZone): Calendar = today(zone).apply {
        // 周日到周六之间相差 6 天，正好落在「下周六」；周六当天跳到 7 天后。
        val daysUntilSaturday = (Calendar.SATURDAY - get(Calendar.DAY_OF_WEEK) + 7) % 7
        add(Calendar.DAY_OF_MONTH, if (daysUntilSaturday == 0) 7 else daysUntilSaturday)
    }

    fun key(calendar: Calendar): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = calendar.timeZone }
            .format(calendar.time)

    fun key(year: Int, month: Int, day: Int): String =
        String.format(Locale.ROOT, "%04d-%02d-%02d", year, month + 1, day)

    /** 「10月3日」/「Oct 3」：按系统语言的月日短格式。 */
    fun shortLabel(key: String): String {
        val parts = key.split("-").map { it.toInt() }
        val calendar = Calendar.getInstance().apply { set(parts[0], parts[1] - 1, parts[2]) }
        val pattern = DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMd")
        return SimpleDateFormat(pattern, Locale.getDefault()).format(calendar.time)
    }
}
