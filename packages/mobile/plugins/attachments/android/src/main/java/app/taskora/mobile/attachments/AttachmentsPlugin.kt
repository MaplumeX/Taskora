package app.taskora.mobile.attachments

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class OpenArgs {
    /** Rust 侧写好的文件（应用缓存目录 attachments/ 下）。 */
    lateinit var path: String
    var mimeType: String = "application/octet-stream"
}

/**
 * 用系统里能打开该类型的应用打开附件（ADR-0019）：FileProvider 给出
 * content:// URI 并按次授予读权限，发 ACTION_VIEW 并套一层选择器。没有
 * 任何应用能打开时 reject，JS 侧提示「无法打开附件」。
 */
@TauriPlugin
class AttachmentsPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun open(invoke: Invoke) {
        val args = invoke.parseArgs(OpenArgs::class.java)
        val file = File(args.path)
        // 只共享缓存目录下的附件（与 FileProvider 的 cache-path 一致）
        val root = File(activity.cacheDir, "attachments").canonicalFile
        if (!file.canonicalPath.startsWith(root.path + File.separator) || !file.isFile) {
            invoke.reject("attachment file is outside the shared directory")
            return
        }
        val uri = try {
            FileProvider.getUriForFile(activity, "${activity.packageName}.attachments", file)
        } catch (e: IllegalArgumentException) {
            invoke.reject("attachment file is not shareable: ${e.message}")
            return
        }
        val view = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, args.mimeType)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            activity.startActivity(Intent.createChooser(view, file.name))
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("no app can open ${args.mimeType}")
        }
    }
}
