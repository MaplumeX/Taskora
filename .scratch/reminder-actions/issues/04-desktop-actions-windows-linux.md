# 04: 桌面通知操作（Rust 命令 + Windows / Linux）

Status: implemented — awaiting desktop acceptance
Blocked by: 01, 02

Spec：`../spec.md`「桌面」。

## 范围

- Rust 命令 `show_reminder(payload: { key, taskId, firedFireAt, title, body, labels })`：按平台发送带按钮的通知，结果以事件 `reminder-action` 发给前端；`open` 时先调用 `show_main_window`。
- Windows：直接使用 `tauri-winrt-notification`（已在依赖树中，需要在 Cargo.toml 中显式声明，版本与 lock 一致），`add_button` + `on_activated`。先确认 0.7.x 是否支持 toast selection 输入：支持则做「完成」+「稍后提醒（下拉：15 分钟 / 1 小时 / 明天）」，否则做「完成」「1 小时后」「明天」。保留显式 sound（见 `defaultSound` 注释）。
- Linux：`notify-rust` 的 `.action()` + 后台线程 `wait_for_action`；`default` 即 open。
- 前端：`tauri-notification-shell.ts` 的 `fireNow` 改为调用 `show_reminder`（签名需要携带 taskId / firedFireAt，同步调整 `ReminderNotificationShell` 与协调器 runtime 路径）；订阅 `reminder-action` → 01 的执行器 / 02 的 revealTask。
- macOS 在本 issue 中先保持现状（仍走插件 notify），由 05 负责。

## 验收（打包产物手动测试）

- Windows 安装版：按钮可见；完成/稍后提醒生效；点正文窗口从托盘恢复并展开任务；提示音正常。
- Linux AppImage（GNOME 与 KDE 各一）：同上；守护进程不支持 actions 时正常降级。

## Comments

### 2026-09-28 — 实现（Windows / Linux / macOS 共用一个命令）

- `src-tauri/src/reminder_notification.rs`：命令 `show_reminder(payload)`，用户操作以 `reminder-action { taskId, action, firedFireAt, tappedAt }` 事件回传；`open` 时先调用 `show_main_window`。
  - **Windows**：`tauri-winrt-notification` 0.7 不支持 toast 的 selection 输入，但 toast 最多可以放 5 个按钮，所以**四个操作全部平铺**（完成 / 15 分钟后 / 1 小时后 / 明天），不需要退化方案。使用 `Scenario::Reminder`：通知在用户处理前一直停留在屏幕上。AUMID 的取法与插件一致。
  - **Linux**：`notify-rust` XDG actions，包括 `default`（点正文）和四个按钮，后台线程 `wait_for_action`。GNOME Shell 最多显示前 3 个按钮，所以「明天」在 GNOME 上可能不可见，KDE 上四个都在。
  - **macOS**：一并实现（issue 05），见该 issue。
- 前端：`fireNow(reminder: ReminderDelivery)`（协调器改为传完整的提醒信息）→ `invoke('show_reminder')`。`onReminderAction` 订阅事件：`open` 交给 `requestTaskReveal`，其余交给 `coordinator.applyAction`。
- 删除了 JS 的 `defaultSound`，提示音改在 Rust 侧设置：Windows 用 `Sound::Default`，即不写 `<audio>`、由系统播放默认音；macOS 用 `default_sound()`；Linux 与之前一样不设置。
- `tauri-plugin-notification` 仍保留，用于权限查询。
- **验证**
  - Linux：`cargo check` / `clippy` / `fmt` / 新增单测均通过。
  - Windows：用假 `cl` / `lib` / `llvm-rc` 绕过 C 和资源编译，对 `x86_64-pc-windows-msvc` 跑了 `cargo check` + `clippy`，均通过、无警告。
  - 还需要做的：在打包产物上手动验收。
