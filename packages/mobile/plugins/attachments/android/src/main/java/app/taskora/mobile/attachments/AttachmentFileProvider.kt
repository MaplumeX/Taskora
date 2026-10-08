package app.taskora.mobile.attachments

import androidx.core.content.FileProvider

/**
 * Manifest merger 按 provider 类名合并节点；独立子类避免与 Tauri 默认的
 * FileProvider 冲突，保留附件专用 authority 和受限的 cache-path。
 */
class AttachmentFileProvider : FileProvider()
