# 04：Android 送达 Worker 与队列状态

Status: implemented — awaiting device acceptance
Blocked by: 02, 03

Spec：`../spec.md`「Android 原生」「竞态汇总」。

## 范围

- 通知操作队列（`ReminderStore.pendingActions`）与快速添加队列（`StatusBarPlugin`）条目新增「已送达」标记，快速添加条目另加 `id`（UUID，即任务 id）；
  兼容旧格式。两个队列的读写与 Worker 共用锁。
- 入队后提交 `enqueueUniqueWork`（联网约束、指数退避）；未配置后台凭据时跳过。
- Worker 按 spec 处理 2xx / 401·403 / 其他错误；送达后触发一次提醒计划拉取。
- Worker 放在哪个插件：两个队列分属 reminders 与 statusbar 插件，实现时决定是新建共享模块，还是由 reminders 插件统一承担
  （它已有 WorkManager 依赖和后台凭据）。

## 验收（真机）

- 划掉最近任务后在通知上点完成：1 分钟内桌面端任务进入 Logbook，了结时间为点击时刻。
- 进程被杀后 Snooze 15 分钟：桌面端提醒时刻随之改写，原时刻不再响。
- 进程被杀后状态栏快速添加（带 Project、Tag、Subtask、Reminder）：不打开 App，桌面端可见。之后打开 App，没有重复任务。
- 飞行模式下操作 → 关闭飞行模式：自动送达。
- 飞行模式下操作 → 直接打开 App：由 App 落库，联网后不出现重复。
- 在桌面端改期后再点手机上的旧通知 Snooze：被丢弃。
- 登出后入队的操作不会被 Worker 发送。

## Comments

### 2026-10-17 — 实现（未上真机）

**设计调整：不要租约 / 发送中状态。** Worker 送达后只打「已送达」标记、不出队；JS 取队列和应用的流程一行不改，照旧取走全部条目
在副本上再应用一次。可以这样做是因为两边的写入是确定性的：
- 完成：了结时间 = 点击时刻；重复实例 id 按规则派生；
- Snooze：目标时刻由点击时刻算出；
- 快速添加：任务 id = 条目 id，Subtask id 按序号派生。

副本已 pull 到 hub 的变更时，本地按规则丢弃（已了结 / 快照过期 / 任务已存在）；还没 pull 到时写出相同的值，经 LWW 收敛。
额外的好处：Snooze 条目在 JS 应用前一直留在队列里，`sync` 不会把它的临时闹钟当作「已消失」注销——
否则「Worker 已送达、用户随后离线打开 App」时，本机会漏响这次 Snooze。spec 已同步。

**改动**

- reminders 插件
  - `ReminderStore`：`PendingAction` 新增 `delivered`（持久化，旧数据缺省 false）。
  - `ReminderAlarms`：`onAction` 入队后调用 `ReminderActionDelivery.schedule`；新增 `undeliveredActions` / `markDelivered`（同一把锁）。
  - 新文件 `ReminderActionDelivery.kt`：`ReminderActionDelivery` + `ReminderActionWorker`。地址由已保存的 planUrl 去掉
    `/reminders/plan` 得出，不改 `configureBackground` 的参数。401 / 403 时调用 `ReminderBackground.disableIfCurrent`（改为非 private）。
    送达过任何一条后调用新加的 `ReminderBackground.refreshSoon`（一次性取回计划；`disable` 时一并取消）。
- statusbar 插件
  - `build.gradle.kts` 加 `androidx.work:work-runtime:2.9.1`（与 reminders 同版本）。
  - `StatusBarPlugin`：`submitQuickAdd` 给草稿 JSON 补 `id`（不是 JSON 的旧纯标题条目原样保留，也不会被送达）后调用
    `QuickAddDelivery.schedule`；另存已送达 id（`deliveredQuickAddIds`），`drainPendingQuickAdds` 一并清空；新增
    `undeliveredQuickAdds`（跳过 openInApp）/ `markQuickAddDelivered`。
  - 新文件 `QuickAddDelivery.kt`：`QuickAddDelivery` + `QuickAddDeliveryWorker`。凭据读 reminders 插件的
    `taskora-reminders-background` 存储（名称与键在两边各写一份，注释里注明须一致）。
- Rust 插件、JS 取队列的命令：不需要改动。
- hub 端补测：草稿里带 `id` / `openInApp` 时 `POST /quick-add` 照常接受（全局 ValidationPipe 不检查嵌套的普通对象）。

**Worker 放在哪里**：两个插件各一个。gen/android 由 Tauri 生成、不入库，插件之间加 Gradle 依赖不可靠；共享的只有凭据存储。

**验证**

- 本机没有 Android SDK。用 Gradle 缓存里的 Kotlin 2.0.21 编译器，加上 android-34 的 `android.jar`（从 dl.google.com 下载到 /tmp）、
  缓存里的 androidx（core 1.13.1、work-runtime 2.9.1、webkit、appcompat 等）和 jackson，把 Tauri 2.12.2（Cargo.lock 中的版本）
  的 Android 源码与两个插件一起编译：0 错误。`R` / `BuildConfig` 用按 res 目录生成的桩类代替。我新增和改动的代码没有新警告
  （`StatusBarPlugin.onDestroy` 的两条弃用警告原本就有）。
- 仍然需要跑一次完整的 Gradle / Android 构建（CI），以及下面的真机验收。
- 真机验收清单见上方「验收」；补充一条：Worker 送达后、App 尚未打开前，桌面端改了这条任务，再打开 App（在线）——不应覆盖桌面端的改动。

### 2026-10-17 — 补充：已送达条目交不交给 JS

上面「JS 照旧取走全部条目再应用一次」有一个问题：快速添加队列在 App 启动时就被处理，可能早于第一次 pull。条目已送达、
随后用户在桌面端改了这条任务，手机打开时副本里还没有它，JS 会用旧草稿重建，覆盖桌面端的改动。按「重新应用有没有用」区分：

- 已送达的快速添加：原生 `drainPendingQuickAdds` 不再交给 JS（任务已在 hub，pull 后自然出现）。
- 已送达的「完成」：`takePendingActions` 不再交给 JS（本机没有闹钟要保护）。
- 已送达的 Snooze：仍交给 JS——这是唯一有用的重新应用：离线打开 App 时副本落后，不重新应用的话 JS 的计划里没有这次 Snooze，
  临时闹钟会被注销而漏响。代价是「送达后别处又改了这条任务 + 手机离线打开」时会覆盖那次改动，已接受。

两处过滤都在原生命令内部，JS 不变。修正后重新编译：0 错误。
