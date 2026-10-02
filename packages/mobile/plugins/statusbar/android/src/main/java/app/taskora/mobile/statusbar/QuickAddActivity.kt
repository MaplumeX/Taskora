package app.taskora.mobile.statusbar

import android.app.Activity
import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

/**
 * 状态栏「＋」拉起的快速添加浮层：透明 Activity 上自绘遮罩与卡片，浮在
 * 当前界面上方，键盘自动弹出——与滴答清单的快速添加 overlay 同形态。
 *
 * 草稿卡片（quick-add-android issue 03 / 04）：标题、可展开的备注、日期
 * chip（今天 / 明天 / 周末 / Someday / 选择日期）、归属与 Tag chip、连续
 * 添加、在应用中继续。数据与文案来自 JS 推送的快照（QuickAddData），日期
 * 按账号时区计算。
 *
 * 提交的草稿 JSON 经 StatusBarPlugin.submitQuickAdd 入队，由 web 层取走
 * 落库（进程未起时留在队列里，JS 就绪后取走）；点遮罩或返回键直接关闭，
 * 不产生任务（有选择器开着时先关选择器）。
 *
 * 进出场全部自己做、系统过渡一律关掉：浮层独占一个 task，系统默认的
 * task 关闭动画是「窗口缩回桌面图标」，看起来像关掉了一个应用。先把遮罩
 * 与卡片淡出，窗口已无可见内容，再 finishAndRemoveTask。
 */
class QuickAddActivity : Activity() {

    private enum class DateChoice { TODAY, TOMORROW, WEEKEND, SOMEDAY, PICKED }
    private enum class Picker { PLACEMENT, TAGS }

    private lateinit var data: QuickAddData
    private lateinit var scrim: View
    private lateinit var card: View
    private lateinit var input: EditText
    private lateinit var notesToggle: TextView
    private lateinit var notes: EditText
    private lateinit var fields: View
    private lateinit var dateChips: LinearLayout
    private lateinit var metaChips: LinearLayout
    private lateinit var continuous: TextView
    private lateinit var status: TextView
    private lateinit var picker: View
    private lateinit var pickerSearch: EditText
    private lateinit var pickerList: LinearLayout
    private lateinit var pickerDone: TextView

    private var dismissing = false

    // 草稿状态（归属在「连续添加」时保留）。
    private var dateChoice: DateChoice? = null
    private var dateKey: String? = null
    private var placement: QuickAddData.Placement? = null
    private val tagIds = linkedSetOf<String>()
    private var openPicker: Picker? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        disableSystemTransition(open = true)
        // 遮罩铺满到状态栏与导航栏下方。
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_quick_add)

        val prefs = getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
        data = QuickAddData.load(prefs)

        scrim = findViewById(R.id.quick_add_scrim)
        card = findViewById(R.id.quick_add_card)
        input = findViewById(R.id.quick_add_input)
        notesToggle = findViewById(R.id.quick_add_notes_toggle)
        notes = findViewById(R.id.quick_add_notes)
        fields = findViewById(R.id.quick_add_fields)
        dateChips = findViewById(R.id.quick_add_date_chips)
        metaChips = findViewById(R.id.quick_add_meta_chips)
        continuous = findViewById(R.id.quick_add_continuous)
        status = findViewById(R.id.quick_add_status)
        picker = findViewById(R.id.quick_add_picker)
        pickerSearch = findViewById(R.id.quick_add_picker_search)
        pickerList = findViewById(R.id.quick_add_picker_list)
        pickerDone = findViewById(R.id.quick_add_picker_done)
        val submit = findViewById<TextView>(R.id.quick_add_submit)
        val openInApp = findViewById<TextView>(R.id.quick_add_open_in_app)

        input.hint = prefs.getString(EXTRA_QUICK_ADD_HINT, null) ?: "Task title"
        submit.text = prefs.getString(EXTRA_SUBMIT_LABEL, null) ?: "Add"
        notesToggle.text = data.text("addNotes")
        notes.hint = data.text("notesHint")
        openInApp.text = data.text("continueInApp")
        continuous.text = data.text("continuous")
        pickerSearch.hint = data.text("search")
        pickerDone.text = data.text("done")

        // 标题可折行显示，但仍是单行输入：输入法显示「完成」，回车即提交。
        input.setHorizontallyScrolling(false)
        input.maxLines = 3

        scrim.setOnClickListener { if (!closePicker()) dismiss() }
        card.setOnClickListener { /* 拦截，避免穿透到遮罩 */ }

        submit.setOnClickListener { commit(openInApp = false) }
        openInApp.setOnClickListener { commit(openInApp = true) }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                commit(openInApp = false)
                true
            } else {
                false
            }
        }
        notesToggle.setOnClickListener {
            notesToggle.visibility = View.GONE
            notes.visibility = View.VISIBLE
            notes.requestFocus()
        }

        continuous.isSelected = prefs.getBoolean(CONTINUOUS_KEY, false)
        continuous.setOnClickListener {
            continuous.isSelected = !continuous.isSelected
            prefs.edit().putBoolean(CONTINUOUS_KEY, continuous.isSelected).apply()
        }

        pickerSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = renderPickerList()
        })
        pickerDone.setOnClickListener { closePicker() }

        renderDateChips()
        renderMetaChips()
        playEnter()

        // 键盘随浮层一起出现：manifest 的 stateVisible 兜底，这里下一帧
        // 显式请求（部分 ROM 只认显式请求）。
        focusAndShowKeyboard(input)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!closePicker()) dismiss()
    }

    // ---------------- 提交 ----------------

    private fun draftJson(title: String, openInApp: Boolean): String {
        val json = JSONObject().put("title", title)
        notes.text.toString().takeIf { it.isNotBlank() }?.let { json.put("notes", it) }
        when (dateChoice) {
            DateChoice.SOMEDAY -> json.put("when", JSONObject().put("type", "someday"))
            null -> Unit
            else -> dateKey?.let { json.put("when", JSONObject().put("type", "date").put("date", it)) }
        }
        when (placement?.kind) {
            "project" -> json.put("projectId", placement?.id)
            "area" -> json.put("areaId", placement?.id)
        }
        if (tagIds.isNotEmpty()) json.put("tagIds", JSONArray(tagIds.toList()))
        if (openInApp) json.put("openInApp", true)
        return json.toString()
    }

    private fun commit(openInApp: Boolean) {
        if (dismissing) return
        val title = input.text.toString().trim()
        if (title.isEmpty()) {
            if (!openInApp) dismiss()
            return
        }
        StatusBarPlugin.submitQuickAdd(this, draftJson(title, openInApp))
        card.performHapticFeedback(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.VIRTUAL_KEY
            },
        )

        if (openInApp) {
            // 草稿带 openInApp 入队，由 JS 落库后定位并展开这条任务；这里只
            // 负责把 App 拉起来。不播出场动画，避免和 App 启动动画叠在一起。
            packageManager.getLaunchIntentForPackage(packageName)?.let {
                startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            dismissing = true
            finishAndRemoveTask()
            disableSystemTransition(open = false)
            return
        }

        if (continuous.isSelected) {
            resetDraft()
            flashStatus(data.text("added"))
        } else {
            dismiss()
        }
    }

    /** 连续添加：清空标题、备注、日期、Tag，保留归属。 */
    private fun resetDraft() {
        input.text.clear()
        notes.text.clear()
        notes.visibility = View.GONE
        notesToggle.visibility = View.VISIBLE
        dateChoice = null
        dateKey = null
        tagIds.clear()
        renderDateChips()
        renderMetaChips()
        input.requestFocus()
    }

    private fun flashStatus(text: String) {
        status.text = text
        status.animate().cancel()
        status.alpha = 1f
        status.animate().alpha(0f).setStartDelay(STATUS_MS).setDuration(EXIT_MS).start()
    }

    // ---------------- 日期 chip ----------------

    private fun renderDateChips() {
        dateChips.removeAllViews()
        val zone = data.timeZone
        addChip(dateChips, data.text("today"), dateChoice == DateChoice.TODAY) {
            toggleDate(DateChoice.TODAY, QuickAddDates.key(QuickAddDates.today(zone)))
        }
        addChip(dateChips, data.text("tomorrow"), dateChoice == DateChoice.TOMORROW) {
            toggleDate(DateChoice.TOMORROW, QuickAddDates.key(QuickAddDates.tomorrow(zone)))
        }
        addChip(dateChips, data.text("weekend"), dateChoice == DateChoice.WEEKEND) {
            toggleDate(DateChoice.WEEKEND, QuickAddDates.key(QuickAddDates.weekend(zone)))
        }
        addChip(dateChips, data.text("someday"), dateChoice == DateChoice.SOMEDAY) {
            toggleDate(DateChoice.SOMEDAY, null)
        }
        val picked = dateChoice == DateChoice.PICKED
        val pickLabel = if (picked) "📅 ${QuickAddDates.shortLabel(dateKey!!)}" else "📅 ${data.text("pickDate")}"
        addChip(dateChips, pickLabel, picked) { showDatePicker() }
    }

    /** 单选；再点已选中的 chip 即取消。 */
    private fun toggleDate(choice: DateChoice, key: String?) {
        if (dateChoice == choice) {
            dateChoice = null
            dateKey = null
        } else {
            dateChoice = choice
            dateKey = key
        }
        renderDateChips()
    }

    private fun showDatePicker() {
        val initial = dateKey?.split("-")?.map { it.toInt() }
        val today = QuickAddDates.today(data.timeZone)
        val dialog = DatePickerDialog(
            this,
            { _, year, month, day ->
                dateChoice = DateChoice.PICKED
                dateKey = QuickAddDates.key(year, month, day)
                renderDateChips()
                focusAndShowKeyboard(input)
            },
            initial?.get(0) ?: today.get(Calendar.YEAR),
            (initial?.get(1)?.minus(1)) ?: today.get(Calendar.MONTH),
            initial?.get(2) ?: today.get(Calendar.DAY_OF_MONTH),
        )
        dialog.datePicker.firstDayOfWeek =
            if (data.weekStartsOn == 0) Calendar.SUNDAY else Calendar.MONDAY
        dialog.setOnCancelListener { focusAndShowKeyboard(input) }
        dialog.show()
    }

    // ---------------- 归属 / Tag chip 与选择器 ----------------

    private fun renderMetaChips() {
        metaChips.removeAllViews()
        val place = placement
        val placeLabel = when (place?.kind) {
            "project" -> "◔ ${place.title}"
            "area" -> "▦ ${place.title}"
            else -> "📥 ${data.text("inbox")}"
        }
        addChip(metaChips, "$placeLabel ▾", place != null) { showPicker(Picker.PLACEMENT) }

        val names = tagIds.mapNotNull(data::tagTitle)
        val tagLabel = when {
            names.isEmpty() -> "# ${data.text("tags")}"
            names.size == 1 -> "#${names[0]}"
            else -> "#${names[0]} +${names.size - 1}"
        }
        addChip(metaChips, tagLabel, names.isNotEmpty()) { showPicker(Picker.TAGS) }
    }

    private fun showPicker(kind: Picker) {
        openPicker = kind
        fields.visibility = View.GONE
        picker.visibility = View.VISIBLE
        pickerDone.visibility = if (kind == Picker.TAGS) View.VISIBLE else View.GONE
        pickerSearch.text.clear()
        renderPickerList()
        focusAndShowKeyboard(pickerSearch)
    }

    /** 关闭选择器；没有开着的选择器时返回 false。 */
    private fun closePicker(): Boolean {
        if (openPicker == null) return false
        openPicker = null
        picker.visibility = View.GONE
        fields.visibility = View.VISIBLE
        renderMetaChips()
        focusAndShowKeyboard(input)
        return true
    }

    private fun renderPickerList() {
        pickerList.removeAllViews()
        val needle = pickerSearch.text.toString().trim().lowercase(Locale.ROOT)
        val matches = { title: String -> needle.isEmpty() || title.lowercase(Locale.ROOT).contains(needle) }
        when (openPicker) {
            Picker.PLACEMENT -> {
                for (row in data.placements.filter { matches(it.title) }) {
                    val selected = row.kind == (placement?.kind ?: "inbox") && row.id == placement?.id
                    // 有搜索词时结果扁平显示，不缩进。
                    val indent = if (needle.isEmpty()) row.depth else 0
                    addPickerRow(row.title, selected, indent, bold = row.kind == "area") {
                        placement = if (row.kind == "inbox") null else row
                        closePicker()
                    }
                }
            }
            Picker.TAGS -> {
                var pendingHeader: String? = null
                for (row in data.tags) {
                    when (row) {
                        is QuickAddData.TagRow.Header -> pendingHeader = row.title
                        is QuickAddData.TagRow.Tag -> {
                            if (!matches(row.title)) continue
                            // 小标题只在组内有命中项时出现；搜索时不显示分组。
                            pendingHeader?.takeIf { needle.isEmpty() }?.let(::addPickerHeader)
                            pendingHeader = null
                            addPickerRow(row.title, row.id in tagIds, 0, dotColor = row.color) {
                                if (!tagIds.remove(row.id)) tagIds.add(row.id)
                                renderPickerList()
                            }
                        }
                    }
                }
            }
            null -> Unit
        }
    }

    private fun addPickerHeader(title: String) {
        pickerList.addView(
            TextView(this).apply {
                text = title
                textSize = 12f
                setTextColor(getColor(R.color.quick_add_text_hint))
                setPadding(dp(8), dp(10), dp(8), dp(2))
            },
        )
    }

    private fun addPickerRow(
        title: String,
        selected: Boolean,
        indent: Int,
        bold: Boolean = false,
        dotColor: String? = null,
        onClick: () -> Unit,
    ) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            minimumHeight = dp(44)
            setPadding(dp(8) + dp(20) * indent, 0, dp(8), 0)
            isClickable = true
            setOnClickListener { onClick() }
        }
        dotColor?.let { color ->
            row.addView(
                View(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(parseColor(color))
                    }
                    layoutParams = LinearLayout.LayoutParams(dp(8), dp(8)).apply { marginEnd = dp(10) }
                },
            )
        }
        row.addView(
            TextView(this).apply {
                text = title
                textSize = 15f
                setTextColor(getColor(R.color.quick_add_text))
                if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            },
        )
        row.addView(
            TextView(this).apply {
                text = "✓"
                textSize = 15f
                setTextColor(getColor(R.color.quick_add_accent))
                visibility = if (selected) View.VISIBLE else View.INVISIBLE
            },
        )
        pickerList.addView(row)
    }

    // ---------------- 小工具 ----------------

    private fun addChip(parent: LinearLayout, label: String, selected: Boolean, onClick: () -> Unit) {
        parent.addView(
            TextView(this).apply {
                text = label
                textSize = 13f
                isSelected = selected
                setTextColor(getColor(if (selected) R.color.quick_add_accent else R.color.quick_add_text))
                setBackgroundResource(R.drawable.bg_quick_add_chip)
                setPadding(dp(12), dp(6), dp(12), dp(6))
                maxLines = 1
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { marginEnd = dp(6) }
                setOnClickListener { onClick() }
            },
        )
    }

    private fun parseColor(color: String): Int =
        try {
            Color.parseColor(color)
        } catch (_: IllegalArgumentException) {
            getColor(R.color.quick_add_text_hint)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun focusAndShowKeyboard(target: EditText) {
        target.requestFocus()
        target.post {
            WindowCompat.getInsetsController(window, target).show(WindowInsetsCompat.Type.ime())
        }
    }

    // ---------------- 进出场 ----------------

    private fun playEnter() {
        val offset = -16 * resources.displayMetrics.density
        card.translationY = offset
        scrim.animate().alpha(1f).setDuration(ENTER_MS).start()
        card.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(ENTER_MS)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    private fun dismiss() {
        if (dismissing) return
        dismissing = true

        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(input.windowToken, 0)

        val offset = -8 * resources.displayMetrics.density
        scrim.animate().alpha(0f).setDuration(EXIT_MS).start()
        card.animate()
            .alpha(0f)
            .translationY(offset)
            .setDuration(EXIT_MS)
            .setInterpolator(AccelerateInterpolator())
            .withEndAction {
                finishAndRemoveTask()
                disableSystemTransition(open = false)
            }
            .start()
    }

    private fun disableSystemTransition(open: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // 34+ 在 onCreate 里一次性声明进出两个方向即可。
            if (open) {
                overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0)
                overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
            }
        } else {
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }
    }

    private companion object {
        const val ENTER_MS = 150L
        const val EXIT_MS = 120L
        const val STATUS_MS = 1200L
        /** 连续添加开关（本机记忆）。 */
        const val CONTINUOUS_KEY = "quickAddContinuous"
    }
}
