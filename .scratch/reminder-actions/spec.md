# Feature: Reminder Actions（通知操作：完成 / 稍后提醒 / 跳转任务）

Status: implemented — awaiting device acceptance

## Problem Statement

Reminder 已能在 Desktop / Android 可靠触发（reminders spec、ADR-0014），但通知弹出之后
几乎什么都做不了：

- 想了结任务或推迟，必须先打开 App、找到任务再操作；
- 桌面端点通知不会把窗口带到前台（`tauri-plugin-notification` 桌面端没有点击回调）；
- 两端都不会定位到被提醒的任务；
- 通知正文只有 `HH:mm`，看不出任务属于哪个 Project。

滴答清单与 Things 3 都在通知上直接提供「完成」「稍后提醒」，点通知直达该任务。

## Solution

1. 通知上提供操作按钮：**完成**、**稍后提醒（15 分钟 / 1 小时 / 明天）**。
2. 点击通知正文：打开/聚焦 App，并**定位并展开该任务**。
3. 通知文案补充上下文（Project / Area 名、备注首行），按 App 语言本地化。

覆盖 Android 与三个桌面平台（Windows / macOS / Linux）。Web 仍无提醒。

## User Stories

1. 作为用户，我想在通知上点「完成」直接完成任务，不必打开 App。
2. 作为用户，我想在通知上选「15 分钟后 / 1 小时后 / 明天」再提醒，让提醒顺延而任务不丢。
3. 作为多设备用户，我希望稍后提醒同步到其他设备，其他设备按新时刻提醒，而不是在原时刻再响一次。
4. 作为用户，我想点通知正文就打开 App 并看到被提醒的任务处于展开状态。
5. 作为桌面用户，我想点通知时窗口从托盘/最小化恢复并获得焦点。
6. 作为用户，我希望通知里能看到任务属于哪个 Project（或 Area），以及备注首行。
7. 作为 Android 用户，即使 App 进程已被系统回收，点「完成」后通知也立即消失、本机不会再为它响铃；数据在下次打开 App 时生效并同步。
8. 作为 Android 用户，App 未运行时点「稍后提醒」，本机仍会在新时刻准时再次提醒。
9. 作为用户，如果我在点按钮之前已在别的设备上改了这条任务（改期、改提醒、完成、删除），迟到的通知操作不应覆盖我的新改动。
10. 作为用户，完成一个重复任务的提醒后，下一个 Repeat Instance 照常生成（与在 App 里完成一致）。

## Implementation Decisions

### 领域：Snooze（稍后提醒）

- Snooze 是对 Task 的**普通字段改写**，不新增字段、不新增实体：把提醒挪到目标时刻 T，
  即 `scheduledDate := T 在账号时区的日历日`，`reminderTime := T 的 HH:mm`。经字段级 LWW 同步。
  代价（已接受）：原提醒时刻被覆盖（Things 3 同款语义）。
- 目标时刻：
  - 15 分钟 / 1 小时：`T = 点击时刻 + 15min / 1h`，向上取整到分钟。可能跨过午夜，此时计划日期随之变为次日。
  - 明天：`T = 账号时区「点击日 + 1」的当前 reminderTime`。
- 与既有规则一致：「在计划日期已过的 Task 上修改 Reminder 时计划日期一并改写」——Snooze 本身即显式改写计划日期。
- 重复任务上 Snooze 会移动该实例的计划日期；锚点为计划日期的规则，从新日期继续推算（与在 App 内改期一致，不特殊处理）。
- CONTEXT.md 新增 **Snooze** 术语（本次设计已写入）。

### 通知操作的应用规则（新 seam：Reminder Action）

纯函数模块（`packages/api/src/reminders/`），输入：通知快照（taskId、通知对应的 fireAt）、
动作（complete / snooze15 / snooze60 / snoozeTomorrow）、点击时刻、账号时区、任务当前行；
输出：要执行的任务操作（complete，或 scheduledDate + reminderTime 的 patch），或丢弃。

- **过期校验（story 9）**：任务已了结、已进 Trash、已不存在，或其**当前提醒的 fireAt 与通知快照不一致**
  （别处已改期或已改提醒）时，动作**丢弃**。只要 fireAt 一致，完成与 Snooze 都照常应用。
- **完成**走 `completeTask` 同一路径（清提醒 + 派生 Repeat Instance）。`completeTask` 新增可选的
  `settledAt` 参数，排队动作以**点击时刻**作为了结时间，使 Logbook 归组正确。
- 同一动作重复投递（如原生队列重放）必须幂等：完成已完成的任务为 no-op；Snooze 在快照不一致时被过期校验丢弃。

### 点击跳转（Reveal Task）

- 新增「定位任务」UI 动作：给定 taskId，导航到最能容纳它的视图并设置 `expandedId`：
  - 在 Today 中可见 → `/today`；
  - 否则有 Project → `/projects/:id`；有 Area → `/areas/:id`；
  - 否则按 Bucket 落到 `/inbox` / `/anytime` / `/upcoming`；
  - 任务不存在或已进 Trash → 只打开 App，不导航。
- 该动作与平台无关，平台壳只负责把 `{ taskId }` 交给 JS。

### 通知文案

- title：任务标题。
- body：`HH:mm · <Project 名或 Area 名>`（无归属则只有时刻）；备注非空时追加备注首行（Android 用 BigText 展开显示；桌面端作为第二行显示）。
- 按钮文案由 JS 按当前 App 语言提供（i18n `task` 命名空间），原生侧不维护翻译。
- 生成逻辑替换 `reminder-coordinator.ts` 的 `defaultTexts`。

### Android（扩展 ADR-0014 原生插件）

- `sync(plan)` 的计划项新增：`taskId`、`snoozeTomorrowAt`（JS 预先算好的「明天」目标 epoch ms，供原生临时重设闹钟使用，避免在 Kotlin 里重写时区规则）。按钮文案作为 plan 级字段随 sync 下发并持久化。
- 按钮：Android 通知最多 3 个 action，采用 **「完成」「15 分钟后」「稍后…」**。「稍后…」打开一个原生半透明选择对话框（1 小时后 / 明天），不启动 WebView。
- 按钮由 BroadcastReceiver（或对话框 Activity）处理，**不拉起 App 进程**：
  1. 立即撤下通知；
  2. 完成：从持久化计划中移除该 key 并取消闹钟；Snooze：用新目标时刻为该 key 重设闹钟（15 分钟 / 1 小时按点击时刻计算，明天使用 `snoozeTomorrowAt`）；
  3. 把 `{ key, taskId, action, tappedAt, firedFireAt }` 追加到原生持久化的**动作队列**。
- JS 取队列：新增命令 `takePendingActions()`（取出即删）+ 插件事件 `actions-available`（进程存活时立即通知）。协调器启动时和收到事件时拉取，逐条按 Reminder Action 规则应用，然后照常重算 `sync`。原生侧对 Snooze 的临时闹钟会被下一次 sync 以同 key 的新 fireAt 收敛；过期校验丢弃的 Snooze 则由 sync 撤销临时闹钟。
- 点击正文：contentIntent 携带 `taskId`；插件在 `load` / `onNewIntent` 记录它，提供 `takeLaunchTask()` + 事件 `open-task`，JS 调用 Reveal Task。
- 与 ADR-0014 的关系：仍坚持「JS 是规则唯一来源」。原生只做两件事：按点击时刻加上固定时长，以及使用 JS 预先算好的时刻。需要在 ADR-0014 末尾追加一段修订说明（issue 03 负责）。

### 桌面（绕开 tauri-plugin-notification 的 reminder 发送路径）

- 新增 Rust 命令 `show_reminder(payload)`，直接使用依赖树中已有的平台 crate 发送带按钮的通知，并把结果以事件
  `reminder-action { key, taskId, action, firedFireAt }` 发给前端。`action ∈ open | complete | snooze15 | snooze60 | snoozeTomorrow`。
  `open` 由 Rust 先调用 `show_main_window` 再发事件。
- 桌面是 runtime 模式，进程必然存活，**不需要动作队列**；前端收到事件后立即按 Reminder Action 规则应用。
- 平台实现：
  - **Windows**：`tauri-winrt-notification`，`add_button` 添加按钮，`on_activated` 接收点击（正文点击的 action 为空，即 open）。Snooze 用 3 个按钮不够放，采用 toast 的 selection 下拉（15 分钟 / 1 小时 / 明天）配合「稍后提醒」按钮；若 crate 不支持 input/selection，则退化为「完成」「1 小时后」「明天」三个按钮。
  - **Linux**：`notify-rust` 的 XDG actions + 后台线程 `wait_for_action`；`default` action 即 open。不同通知守护进程对 actions 的支持程度不一，不支持时按钮不显示，点击行为依守护进程而定（已接受）。
  - **macOS**：`mac-notification-sys`，`main_button(DropdownActions[...])` + `close_button`，在后台线程 `send()` 后读取 `NotificationResponse`。由于 App 未签名/仅 ad-hoc 签名，**先做 spike**：若按钮或回调在打包产物上无法工作，则退化为「仅点击跳转」；若连点击回调都拿不到，则保持现状并在 issue 中记录。
- 权限检测与 `openSettings` 仍沿用现有 shell；`tauri-plugin-notification` 保留用于权限命令，reminder 的发送改走新命令。
- 应用退出后仍留在通知中心的旧通知：点击行为属于尽力而为（Windows 可能重新启动 App 但不跳转；macOS/Linux 可能无反应）。此范围不做 COM activator / URL scheme 注册。

## Testing Decisions

- **Reminder Action（新 seam，vitest 纯逻辑）**：各动作的目标时刻（含跨午夜、账号时区 ≠ 设备时区、DST）；过期校验（已了结 / Trash / fireAt 不一致 / 任务不存在）；完成使用 `settledAt = tappedAt`；重复任务完成后派生实例；幂等重放。
- **Reveal Task**：UI 组件测试（参照 TaskRowExpanded.test.tsx 风格）——不同归属/Bucket 的任务导航到正确路由并展开；任务不存在时不导航。
- **协调器**：mock shell，验证拉取动作队列 → 应用 → sync 的顺序，以及事件触发。
- **文案**：给定任务、Project/Area、备注，生成的 title/body 与按钮 i18n。
- **Android 原生**：沿用 issue 03 的真机验收清单，新增：进程被杀后点完成/稍后提醒、重启后稍后提醒的闹钟是否恢复、点击正文跳转。
- **桌面**：Rust 侧只做薄适配，三平台打包产物手动验收（按钮、点击聚焦、跳转）。

## Out of Scope

- 自定义稍后提醒时长、设置默认稍后提醒时长。
- 任务在别处了结后，自动撤回其他设备上已弹出的通知。
- 通知中心里旧通知在 App 退出后的可靠激活（COM activator / URL scheme / deep-link 插件）。
- 服务端推送（ADR-0014 已推迟）。
- Web 端提醒。
- 一个任务多个提醒、Deadline 提醒、每日汇总（另开 spec）。

## Further Notes

- Android 最多 3 个 action 的限制，决定了「稍后…」需要使用二级对话框；如果不想做对话框，可以退化为「完成 / 15 分钟后 / 明天」三个按钮，放弃 1 小时选项。

## Comments

### 2026-09-28 — 实现完成（01–05），与 spec 字面的差异

- Windows 不需要 selection 下拉：toast 最多支持 5 个按钮，四个操作全部平铺。
- Linux 在 GNOME Shell 上最多显示前 3 个按钮（「明天」可能不可见）。
- macOS：主按钮「完成」带下拉（15 分钟后 / 1 小时后 / 明天）；关闭按钮不承载操作（划走通知也会回报关闭）。
- Reveal Task：已了结的任务落到 Logbook（spec 没写）；只设置展开状态，不设置 Selection（路由变化会清空 Selection）。
- 各平台的真机验收清单见 issues 03 / 04 / 05。
