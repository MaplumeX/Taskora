# Android 更新提示

Status: implemented (pending device verification)
Blocked by: 03

## 内容

- 复用 03 的判定与调度；可用性检查用 HEAD `releases/download/v{hubVersion}/Taskora-v{hubVersion}.apk`，不调用 GitHub API。
- `update-available` 时显示可关闭的横幅，`client-too-old` 时显示常驻提示。点击后用系统浏览器打开 APK 链接。
- APK 缺失（构建失败、尚未补发）时不提示，下次再查。

## 实现

- `src/updates/android-update-shell.ts`：可用性查 `api.github.com/repos/MaplumeX/Taskora/releases/tags/v{version}`，看有没有 `Taskora-v{version}.apk` 资产（webview 直接 HEAD 下载地址会被 CORS 拦下，所以没有用 HEAD）。点击后用 `tauri-plugin-opener` 打开下载地址，capability 只允许 `https://github.com/MaplumeX/Taskora/releases/download/*`。
- 复用 `UpdatePrompt`，按钮显示「下载更新」。
- 待验证：真机上旧版本 APK 连接新 hub 后能看到提示，并且能完成覆盖安装。

## 验收

- 真机：旧版本 APK 连接新 hub 后出现提示，点击能下载并覆盖安装。

## Comments
