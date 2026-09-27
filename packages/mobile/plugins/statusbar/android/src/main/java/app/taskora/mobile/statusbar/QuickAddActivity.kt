package app.taskora.mobile.statusbar

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView

/**
 * 状态栏「＋」拉起的快速添加浮层（issue 02）：半透明 dialog 风格
 * Activity，浮在当前界面上方，键盘自动弹出——与滴答清单的快速添加
 * overlay 同形态。
 *
 * 提交文本经 StatusBarPlugin.submitQuickAdd 送达 web 层落库（进程未起时
 * 先落盘、插件 load 时补发）；点浮层外区域或返回键直接关闭，不产生任务。
 *
 * 文案（hint / 提交按钮）来自最近一次 show 写入的 SharedPreferences 快
 * 照——文案全部由 JS 按当前语言注入，原生不内置翻译。
 */
class QuickAddActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_quick_add)

        val prefs = getSharedPreferences(STATUS_BAR_PREFS, Context.MODE_PRIVATE)
        val input = findViewById<EditText>(R.id.quick_add_input)
        val submit = findViewById<TextView>(R.id.quick_add_submit)

        input.hint = prefs.getString(EXTRA_QUICK_ADD_HINT, null) ?: "Task title"
        submit.text = prefs.getString(EXTRA_SUBMIT_LABEL, null) ?: "Add"

        // 点卡片外关闭；卡片本身的点击拦截在布局的根容器上。
        findViewById<android.view.View>(R.id.quick_add_root).setOnClickListener { finish() }
        findViewById<android.view.View>(R.id.quick_add_card).setOnClickListener { /* 拦截 */ }

        submit.setOnClickListener { commit(input) }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                commit(input)
                true
            } else {
                false
            }
        }

        // 键盘自动弹出（manifest 已配 stateVisible；部分 ROM 需要显式请求）。
        input.requestFocus()
        input.postDelayed({
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
        }, 100)
    }

    private fun commit(input: EditText) {
        val title = input.text.toString().trim()
        if (title.isNotEmpty()) {
            StatusBarPlugin.submitQuickAdd(this, title)
        }
        finish()
    }

    override fun finish() {
        val input = findViewById<EditText?>(R.id.quick_add_input)
        if (input != null) {
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(input.windowToken, 0)
        }
        super.finish()
        // 浮层进出不做切换动画，减少「跳应用」的体感。
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
