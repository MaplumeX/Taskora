# 桌面端检查、下载与重启安装

Status: implemented (pending device verification)
Blocked by: 03, 04

## 内容

- 接入 `tauri-plugin-updater` 和 `tauri-plugin-process`，在 capabilities 中加对应权限。
- Rust 侧暴露命令：用 `UpdaterBuilder::endpoints` 指向 `https://github.com/MaplumeX/Taskora/releases/download/v{hubVersion}/latest.json`，再执行 check / download。目标版本 ≤ 当前版本时不更新（插件默认行为），404 或缺少本平台条目视为暂无更新。
- `update-available`：后台下载，完成后用非模态提示「重启并更新 / 稍后 / 跳过此版本」。`client-too-old`：`SyncIndicator` 的升级提示可点击，直接触发同样的流程。
- 重启前等 Engine 的写入落盘，再 relaunch。
- debug 构建不检查更新。

## 实现

- `src-tauri/src/updater.rs`：`update_prepare(version)` 校验版本字符后拼 `releases/download/v{version}/latest.json`，检查并下载，暂存在内存；`update_apply(version)` 安装后 `app.restart()`。没有用 `tauri-plugin-process`。debug 构建直接返回 false。
- `src/updates/desktop-update-shell.ts`：安装前调用 `flushBeforeRestart()`，最多等 5 秒把 Outbox 推给 hub（本地写入本来就已经在 SQLite 里）。
- `packages/ui` 的 `UpdatePrompt`：角落里的非模态提示条，按钮是「重启并更新 / 稍后 / 跳过此版本」，必须更新时不显示「跳过」；挂在 `AppShell`。
- 与 spec 的差异：`SyncIndicator` 没有改成可点击。必须更新时提示条同样会出现，设置页也有「更新到 vX」。
- 待验证：三平台真机实测更新（至少 Linux AppImage 与 Windows NSIS），以及开机自启意图在更新后是否保留。

## 验收

- 用旧版本安装包加测试 hub 实测三平台（至少 Linux AppImage 与 Windows NSIS）都能完成更新。
- 开机自启意图不丢失（参见 `.scratch/desktop-autostart/issues/02`：updater 路径的 NSIS 带 `/UPDATE`）。

## Comments
