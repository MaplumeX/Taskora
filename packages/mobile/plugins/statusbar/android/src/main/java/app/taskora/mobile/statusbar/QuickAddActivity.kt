package app.taskora.mobile.statusbar

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * 状态栏「＋」拉起的快速添加浮层（issue 02）：透明 Activity 上自绘遮罩
 * 与卡片，浮在当前界面上方，键盘自动弹出——与滴答清单的快速添加
 * overlay 同形态。
 *
 * 提交文本经 StatusBarPlugin.submitQuickAdd 送达 web 层落库（进程未起时
 * 先落盘、插件 load 时补发）；点遮罩或返回键直接关闭，不产生任务。
 *
 * 进出场全部自己做、系统过渡一律关掉：浮层独占一个 task，系统默认的
 * task 关闭动画是「窗口缩回桌面图标」，看起来像关掉了一个应用。先把遮罩
 * 与卡片淡出，窗口已无可见内容，再 finishAndRemoveTask。
 *
 * 文案（hint / 提交按钮）来自最近一次 show 写入的 SharedPreferences 快
 * 照——文案全部由 JS 按当前语言注入，原生不内置翻译。
 */
class QuickAddActivity : Activity() {

    private lateinit var scrim: View
    private lateinit var card: View
    private lateinit var input: EditText
    private var dismissing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        disableSystemTransition(open = true)
        // 遮罩铺满到状态栏与导航栏下方。
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_quick_add)

        val prefs = getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
        scrim = findViewById(R.id.quick_add_scrim)
        card = findViewById(R.id.quick_add_card)
        input = findViewById(R.id.quick_add_input)
        val submit = findViewById<TextView>(R.id.quick_add_submit)

        input.hint = prefs.getString(EXTRA_QUICK_ADD_HINT, null) ?: "Task title"
        submit.text = prefs.getString(EXTRA_SUBMIT_LABEL, null) ?: "Add"

        scrim.setOnClickListener { dismiss() }
        card.setOnClickListener { /* 拦截，避免穿透到遮罩 */ }

        submit.setOnClickListener { commit() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                commit()
                true
            } else {
                false
            }
        }

        playEnter()

        // 键盘随浮层一起出现：manifest 的 stateVisible 兜底，这里下一帧
        // 显式请求（部分 ROM 只认显式请求）。
        input.requestFocus()
        input.post {
            WindowCompat.getInsetsController(window, input).show(WindowInsetsCompat.Type.ime())
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        dismiss()
    }

    private fun commit() {
        if (dismissing) return
        val title = input.text.toString().trim()
        if (title.isNotEmpty()) {
            StatusBarPlugin.submitQuickAdd(this, title)
        }
        dismiss()
    }

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
    }
}
