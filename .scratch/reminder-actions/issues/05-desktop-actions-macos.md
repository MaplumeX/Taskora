# 05: macOS 通知操作（spike → 实现或降级）

Status: implemented — awaiting macOS acceptance (spike)
Type: prototype
Blocked by: 04

Spec：`../spec.md`「桌面 → macOS」。

## 问题

未签名或仅 ad-hoc 签名的打包产物上，`mac-notification-sys` 的 `main_button(DropdownActions)` / `close_button` 能否显示按钮并通过 `send()` 拿到 `NotificationResponse`？点击正文能否拿到 `Click`？

## 步骤

1. 在 `desktop-release.yml` 同款构建产物上做最小 spike，分别在 Apple Silicon 和 Intel（若有条件）上验证。
2. 根据结果：
   - 按钮和点击都可用 → 在 `show_reminder` 中实现 macOS 分支，事件协议与 04 一致；
   - 只有点击可用 → 仅实现 open；
   - 都不可用 → 保持现状，在本文件 `## Answer` 中记录原因和可行路径（例如正式签名后改用 UNUserNotificationCenter）。
3. 注意：`send()` 会阻塞，必须放在独立线程；确认同时存在多条通知时线程的开销可以接受。

## Answer

### 2026-09-28 — 已实现，运行时验证仍需真机

直接实现了 macOS 分支（`reminder_notification.rs` 的 `#[cfg(target_os = "macos")]` 模块），没有先做单独的 spike：

- `mac-notification-sys` 0.6：主按钮用 `DropdownActions(完成, [完成, 15 分钟后, 1 小时后, 明天])`，点主按钮本身即「完成」，下拉中选 Snooze；点正文返回 `Click` → `open`。
- **不用 `close_button` 承载操作**：从 `notify.m` 看，划走通知也会走 `didDismissAlert` 并回报关闭按钮，如果把「完成」放在关闭按钮上会误完成任务。
- 回报的是按钮文案，按文案反查操作（各文案互不相同）。
- `send()` 会阻塞，放在后台线程；`set_application` 与插件取值一致：开发运行时用 `com.apple.Terminal`，打包后用 bundle identifier。
- 编译验证：`aarch64-apple-darwin` 目标 `cargo clippy` 通过（ObjC 部分由假 cc 跳过，所以只覆盖 Rust 类型检查）。

**还需要在 macOS 打包产物上确认**（未签名或 ad-hoc 签名）：
1. 通知是否以带按钮的 alert 样式出现（系统设置 → 通知 → Taskora 需要设为「提醒」样式；「横幅」样式下不显示按钮）；
2. 下拉中的选项能否回调；
3. 点正文能否唤出窗口并定位任务。

如果按钮或回调不工作：退化方案是把 macOS 分支改回只发普通通知（去掉 `main_button`，只保留 `wait_for_click(true)` 处理点击）；如果连点击都拿不到，就回退到插件的 notify 路径。
