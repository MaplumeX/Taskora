package app.taskora.mobile.background

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * 根页返回手势的收尾动作：把当前任务移到后台（回桌面），而不是结束进程。
 *
 * `activity.moveTaskToBack(true)` 把整个任务放到后台，WebView 与界面状态
 * 保留，从最近任务 / 桌面图标回来是原地恢复（标准 Android 的「返回主屏
 * 幕」语义）。`true` = 仅当本 Activity 是任务根时执行，避免越界移动他人的
 * 任务栈。JS 侧由 `back-navigation.ts` 的级联在根页调用。
 */
@TauriPlugin
class BackgroundPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun moveToBack(invoke: Invoke) {
        activity.moveTaskToBack(true)
        invoke.resolve()
    }
}
