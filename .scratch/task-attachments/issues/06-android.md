# 06: Android 添加与打开附件

Status: implemented — awaiting device acceptance
Blocked by: 03

Spec：`../spec.md`（User Stories 3、5）。

## 范围

- 文件选择器与拍照入口（Tauri 插件或现有原生插件扩展），接入 03 的添加流程。
- 移动端展开卡片的附件列表（无拖动排序、无文件拖入；移除与重命名走附件行的「更多」按钮——触控交互中长按只负责拖动排序）。
- 打开：交给系统 Intent（FileProvider 共享临时文件）。

## 验收

- 真机：选文件、拍照、打开、离线添加后联网上传。

## Comments

### 2026-10-07 — 部分完成

- 共用 webview 代码已覆盖：展开卡片的附件列表、回形针选文件（依赖 Tauri Android WebView 的文件选择器，未在真机验证）、图片应用内预览、上传 / 下载 / 离线续传。
- **未做**：非图片附件交给系统程序打开（FileProvider + `ACTION_VIEW` Intent 的原生插件）。开发环境没有 Android SDK，无法编译验证，没有盲写。现在 Android 上打开非图片附件会提示「无法打开附件」（`mobile/src/main.tsx` 注入的占位 opener）。
- 拍照入口未单独做：`<input type=file>` 在多数 Android 文件选择器里已带相机选项。

### 2026-10-07 — 打开文件

- 新本地插件 `mobile/plugins/attachments`（结构同 statusbar / reminders）：Rust 命令 `open` 接收原始字节（请求头带文件名 / hash / mimeType），清洗文件名与 mimeType 后写入 `Context.getCacheDir()/attachments/<hash>/<文件名>`；Kotlin `AttachmentsPlugin.open` 校验路径在共享目录内，经 FileProvider（authority `<applicationId>.attachments`，只共享 `cache/attachments/`，不导出、按次授权）发 `ACTION_VIEW` 并套选择器；没有应用能打开时 reject，界面提示「无法打开附件」。manifest 带 `<queries>` 以满足 Android 11+ 包可见性。
- 壳层：Cargo 依赖、`.plugin(tauri_plugin_attachments::init())`、capability `attachments:default`；JS `androidAttachmentOpener` 替换之前报错的占位 opener。
- 验证：Rust 单测（文件名 / mimeType 清洗、百分号解码）；插件 crate 对 `aarch64-linux-android` 的 `cargo check`；临时 gradle 工程（tauri-android 基类 + 本插件 + 最小 app 模块）里 Kotlin 编译、manifest 合并（authority 占位符解析正确）与 aapt2 资源链接都通过。
- **未验证**：整包 APK 构建与真机行为——本机 NDK 是 Windows 版，无法交叉编译完整 Rust 壳层。需要在能 `pnpm --filter mobile build` 的环境里装机确认：选文件 / 拍照、打开 PDF 等非图片附件、没有可用应用时的提示。
