# 03: Android Reminder 投递下沉到原生插件

Status: implemented — awaiting device acceptance

决策记录见 ADR-0014。本 issue 取代 issue 02 之后仍未解决的 Android 送达问题。

## 问题

经过 #83 / #94 / #98 几轮修复，JS 侧调用链已经修通，但 Android 真机上的
Reminder 仍然不可靠。根因在 JS 之下，调用链修复没有碰到：

1. **非精确闹钟**：App 未声明 `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`。
   `tauri-plugin-notification` 的 `setExactIfPossible` 在 Android 12+ 上因此退回
   `setAndAllowWhileIdle`，AOSP 允许它最多晚到约 1 小时，国产 ROM 合并得更激进。
2. **重启后全部丢失**：插件的 `show`（即 `notify` 命令）只设置 AlarmManager 闹钟，
   不写 `NotificationStorage`；开机恢复用的 `LocalNotificationRestoreReceiver`
   只读 storage，所以没有东西可以恢复。
3. **幽灵通知**：协调器的 `registered` 只存在内存里，进程重启后清空。重启后，在别处
   完成、移入 Trash 或关掉提醒的 Task，原来的闹钟不会被取消，登出也清不掉。插件又
   没有能查到这些闹钟的接口（`getPending` 读 storage，而 `show` 不写），无法对账。
4. **插件自身的 bug**：Android 13+ 且已授权时，`requestPermissions` 永远不 resolve；
   而 `ScheduledDateField` 每次打开提醒开关都会调用它。

## 方案

### 分工

- **JS（规则的唯一来源）**：`computeReminderPlan` 算出完整期望集，组装好文案后，
  调用 `sync(plan)` 整体交给原生。每项包含 key、fireAt（epoch ms）、title、body。
- **原生插件（负责状态与投递）**：持久化计划，自行算差量，设置和取消闹钟，
  负责恢复与通知发布，管理渠道和权限。

fireAt 是按账号时区算好的绝对时刻，设备改时区或改时间都不需要重算，原生侧只负责
重新设置闹钟。Reminder 规则不在 Kotlin 里再写一遍。

### 原生插件 `packages/mobile/plugins/reminders`

目录结构参照 `plugins/statusbar`，作为独立插件，不与 statusbar 合并。

- **命令 `sync(plan)`**：幂等。
  - 与持久化的旧计划比对：key 消失的项取消闹钟并删除记录；新增或变化的项
    （fireAt、title、body 任一不同）写入记录。
  - 按 fireAt 排序，对最近的 K 个（暂定 20）**无条件重新设置闹钟**。强行停止会清掉
    闹钟，但持久化记录不知道，所以不能只设置差量部分。
  - 空计划表示清空全部（登出时使用）。
- **持久化**：key → 原生分配的自增 int 通知 id、fireAt、title、body。原生自己分配 id，
  不再用 FNV 哈希，避免碰撞。
- **闹钟**：`setExactAndAllowWhileIdle(RTC_WAKEUP)`。`canScheduleExactAlarms()`
  为 false 时（Android 12/13 用户可手动收回）退回 `setAndAllowWhileIdle`，并通过
  状态查询上报。
- **触发**：receiver 发布通知（`reminders` 渠道，点击打开 App，自动消失），删除该项
  记录，再补设下一个未设置闹钟的项。
- **恢复**：
  - `BOOT_COMPLETED`、`MY_PACKAGE_REPLACED` 时，以及插件 `load`（App 启动，
    早于 JS 首次 sync）时，从持久化计划重新设置闹钟。
  - 恢复时 **fireAt < now 的项直接丢弃，不补发**（关机期间错过的提醒，与桌面端
    规则一致）。
  - 计划存在凭据加密存储中，只监听 `BOOT_COMPLETED`，不做 direct boot。
- **权限与渠道**：
  - 自己实现 `POST_NOTIFICATIONS` 的检查与请求；已授权时立即 resolve。
  - 创建 `reminders` 渠道（高重要性）。
- **状态查询 `status()`**：返回通知权限、渠道是否被关闭、能否使用精确闹钟、是否已
  豁免电池优化。
- **设置跳转**：
  - 通知设置：沿用现有 `open_notification_settings` 的做法。
  - 电池优化豁免：`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`，需声明
    `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`（侧载分发不受 Play 政策限制）。
  - 厂商自启动管理页：按已知组件逐个尝试（小米/HyperOS、OPPO/ColorOS、vivo、
    华为/荣耀等），都失败时退回应用详情页。
- **Manifest**：
  - `USE_EXACT_ALARM`
  - `SCHEDULE_EXACT_ALARM`（`maxSdkVersion="32"`）
  - `RECEIVE_BOOT_COMPLETED`
  - `POST_NOTIFICATIONS`
  - `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

### JS 侧

- **`ReminderNotificationShell`**：为 system 模式新增 `sync(plan)`，去掉 system 模式
  对 `schedule` / `cancel` 的依赖。runtime 模式（桌面）的 `fireNow` 保持不变。
- **协调器 system 分支**：变更、tick、回前台时计算期望集，串行化后 `sync`；删掉
  `registered` / `due` 内存状态；`stop()` 时 `sync([])`。
- **移动端 shell**：`packages/mobile/src/reminders/tauri-notification-shell.ts`
  改为调用新插件。
- **状态栏**：`notification-bridge.ts` 的权限和渠道查询也改用新插件的命令。之后从
  mobile 移除 `tauri-plugin-notification`，包括 Cargo 依赖、capability 和 JS 依赖。
- **设置页（仅 Android）**：新增「提醒可靠性」区，展示 `status()` 各项，并提供
  跳转入口：通知设置、电池优化、自启动。自启动状态无法检测，只提供引导入口。

## 测试

- **Vitest（JS 可测范围）**：
  - 协调器 system 模式：数据变更、终态、Trash、改期、改时区后，`sync` 收到的是完整期望集；
    stop 后收到空集；
  - 串行化：并发变更不会让旧结果覆盖新结果；
  - 移动端 shell 用 mock `invoke`，校验命令名与参数形状。
- **真机验收矩阵（关单条件，至少一台原生 Android、一台国产 ROM）**：
  - [ ] 前台、后台、进程被杀、从最近任务划掉（ROM 默认设置 / 按引导设置后）、重启手机，
    五种状态下都按时送达
  - [ ] 强制 Doze（`adb shell dumpsys deviceidle force-idle`）下仍送达
  - [ ] `adb shell dumpsys alarm` 中闹钟为精确闹钟（window 为 0）
  - [ ] 进程被杀后，在桌面端完成、Trash 某个 Task，或关掉它的提醒；再打开手机 App
    并同步，原闹钟不再触发
  - [ ] 关机跨过提醒时刻，开机后不补发
  - [ ] 撤销通知权限、关闭渠道、收回精确闹钟权限后恢复，提醒自愈，设置页状态正确
  - [ ] 已授权时打开提醒开关，权限请求立即返回

## 已知限制（写入 spec，不在本 issue 解决）

- 手机只知道上次打开 App 时已同步的提醒；其他设备新设置的提醒，要等手机打开过一次
  App 才会生效。
- 在划掉即强行停止的国产 ROM 上，如果用户没按引导放行自启动和电池使用，闹钟会在
  下次打开 App 之前丢失。
- 更可靠的服务端推送（厂商通道 / FCM）另立 spec，见 ADR-0014。

## Comments

### 2026-09-27 — Implementation (uncommitted working tree)

- **原生插件 `packages/mobile/plugins/reminders`**：
  - Rust 命令：`sync`、`clear`、`status`、`request_permission`、`open_settings`。
  - Kotlin 文件：
    - `RemindersPlugin`：插件入口；
    - `ReminderAlarms`：差量、设置闹钟窗口、投递、恢复，外加两个接收器；
    - `ReminderStore`：SharedPreferences 持久化。
- **比方案多出的一条规则**：已到点、但还不在期望集里的提醒，原生**保留**，不注销。
  因为此时系统可能正在投递它，原生 cancel 会让通知永远不出现（issue 02 的教训）。
  超过 1 小时仍未投递的（例如被强行停止）静默回收。到点后的项一律不重新设置，
  也就不会补发。
- **沿用渠道 id `reminders`**：用户对该渠道的设置得以保留。渠道名改为 i18n 的
  `task:reminderChannelName`。
- **mobile 已移除 `tauri-plugin-notification`**：Cargo 依赖、capability 和
  `@tauri-apps/plugin-notification` 都已去掉。状态栏的权限查询改用本插件。
- **旧闹钟无需清理**：旧版本通过 `tauri-plugin-notification` 注册的闹钟，指向的
  接收器类在新 APK 中已不存在，到点后系统静默丢弃，不会与新闹钟重复。
- **协调器 system 分支**：每次重算交付完整期望集，期望集没变时跳过；交付失败不记账，
  下个 tick 重试；`stop()` 调用 `clear`。
  删除了 `notificationIdForKey`，以及 shell 接口上的 `schedule`/`cancel`。
- **设置页**：新增 `ReminderReliabilitySection`，只在提供了 `reliability` 的 shell
  （Android）上渲染。

### 验证

- 已完成：
  - 测试：API 242/242、UI 306/306、Mobile 62/62、Desktop 53/53；
  - 以上四个包的 `tsc --noEmit`；
  - 改动文件的 ESLint；
  - Mobile Vite 生产构建；
  - host 上的 `cargo check`（mobile crate，含本插件，无警告）。
- **未完成**：
  - 本机没有 Android SDK/NDK：Kotlin 源码没有编译过，
    `cargo check --target aarch64-linux-android` 也没有运行（交给 CI）；
  - 没有构建 APK，上面的真机验收矩阵全部待执行。
