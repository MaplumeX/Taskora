# 03: Android 通知操作、动作队列与点击跳转

Status: implemented — awaiting device acceptance
Blocked by: 01, 02

Spec：`../spec.md`「Android」。扩展 `packages/mobile/plugins/reminders`（ADR-0014）。

## 范围

- plan 项新增 `taskId`、`snoozeTomorrowAt`；plan 级新增按钮文案，与计划一起持久化。
- 通知按钮：「完成」「15 分钟后」「稍后…」；「稍后…」打开原生半透明选择 Activity（1 小时后 / 明天），不启动 WebView。
- 动作处理（不拉起 App 进程）：撤下通知 → 完成则移除 key 并取消闹钟，Snooze 则按新目标时刻重设闹钟 → 追加到持久化动作队列 `{ key, taskId, action, tappedAt, firedFireAt }`。
  - 被 Snooze 的临时闹钟也要能在开机/升级后恢复（归入持久化计划）。
- 命令 `takePendingActions()`（取出即删）+ 事件 `actions-available`；命令 `takeLaunchTask()` + 事件 `open-task`（contentIntent 携带 taskId，在 `load` / `onNewIntent` 中记录）。
- JS：协调器在 system 模式启动时和收到事件时拉取队列 → 调用 01 的执行器逐条应用 → 重算 sync；`open-task` → 02 的 revealTask。
- 在 ADR-0014 末尾追加修订说明：原生侧新增动作队列和临时闹钟，规则仍以 JS 为唯一来源（原生只做「点击时刻加固定时长」和「使用 JS 预先算好的时刻」）。

## 验收（真机，补充到 issue reminders/03 的清单中）

- 进程存活时点完成/15 分钟后/稍后…：数据立即生效，并同步到另一台设备。
- 划掉最近任务（进程被杀）后点完成：通知消失、不再响铃；打开 App 后任务出现在 Logbook，了结时间为点击时刻。
- 进程被杀后点「15 分钟后」：15 分钟后准时响铃；打开 App 后计划日期和提醒时刻已改写。
- Snooze 后重启手机：新时刻的闹钟仍在。
- 在另一台设备上改期之后，再点旧通知的 Snooze：被丢弃，不覆盖别处的改动。
- 点通知正文：打开 App 并展开该任务。

## Comments

### 2026-09-28 — 实现（未上真机）

- **JS**
  - 协调器在 system 模式下每次 tick 先 `takePendingActions` 并逐条 `applyAction`，然后才 sync；`onActionsAvailable` 触发立即重算。
  - `ReminderDelivery` 增加 `taskId` 和 `snoozeTomorrowAt`；移动端壳在 sync 时附带 `labels`（按钮文案）。
  - `mobile-engine` 装配完成后调用 `takeLaunchTask`，并订阅 `open-task` 事件，两者都转给 `requestTaskReveal`。
- **Rust**（`plugins/reminders/src/lib.rs`）
  - 新增命令 `take_pending_actions`、`take_launch_task`；`SyncArgs.labels`；`ReminderEntry` 增加 `taskId` 和 `snoozeTomorrowAt`。
  - ACL 放行 `register_listener` / `remove_listener`，供 `addPluginListener` 使用。
- **Kotlin**
  - `ReminderActions.kt`：`ReminderActionReceiver`（完成 / 15 分钟后）和 `ReminderSnoozeActivity`（「稍后…」对话框：1 小时后 / 明天，DeviceDefault 主题，跟随深色模式）。
  - `ReminderAlarms.onAction`：撤下通知 → 完成则移除 key，Snooze 则按新时刻重设闹钟 → 追加到持久化队列 → 通知插件发出 `actions-available`。
  - sync 时，仍在队列中的 key 不会被当作「已消失」而注销（避免 JS 取走队列之前的竞态误删 Snooze 的临时闹钟）。
  - 旧版持久化记录（没有 taskId）或尚未收到按钮文案时，通知不挂按钮。
  - contentIntent 带上 `EXTRA_OPEN_TASK` 并加 `SINGLE_TOP` 标志；已确认 Tauri 模板里 MainActivity 是 `singleTask`，所以存活时会走 `onNewIntent`。
- ADR-0014 末尾已追加修订说明。
- **验证**
  - JS：mobile 65 个测试、api 协调器新增的队列测试全部通过。
  - Rust：`cargo check`（host）通过。没有 NDK，未做 Android 目标的 `cargo check`，这一项由 CI 覆盖。
  - Kotlin：本机用 kotlinc 2.0.21 + android-34 `android.jar` + androidx-core 1.13.1 编译通过，0 错误、0 警告。Tauri 的注解和 `JSObject` 用真实源码，`Plugin` / `Invoke` 用按 tauri 2.11.6 签名写的桩。仍然需要跑一次完整的 Gradle 构建。
- 真机验收清单见上方「验收」。
