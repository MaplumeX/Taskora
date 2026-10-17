# Feature: Android App 外写入直达 hub（通知操作 / 状态栏快速添加）

Status: implemented — awaiting device acceptance

## Problem Statement

Android 端副本只在前台同步（ADR-0007，`packages/mobile/src/engine/mobile-engine.ts`）。两类写入发生在 App 之外，
原生只负责入队，要等主 WebView 下次运行、Engine 装配好后才落库并推送：

1. **通知按钮「完成 / 15 分钟后 / 稍后…」**：`ReminderActionReceiver` / `ReminderSnoozeActivity` 不拉起进程，
   动作进 `ReminderStore.pendingActions` 队列（reminder-actions spec story 7 当时接受了「下次打开 App 时生效」）。
2. **状态栏快速添加**：`QuickAddActivity` → `StatusBarPlugin.submitQuickAdd` 入队，由主 WebView 的
   `createFromQuickAddDraft` 落库。进程已被回收时一直停在队列里；进程存活但在后台时，WebView 可能被冻结，
   写后 1 秒的防抖推送不一定能及时执行（未上真机验证）。

结果：用户在通知上点了「完成」，桌面 / Web 上仍是未完成；在状态栏记下的任务，换到电脑上看不到。用户以为已经做完的操作，
在其他设备上看不到，最容易被当成 bug。

## Solution

入队的同时，原生提交一个带联网约束的 WorkManager 一次性任务，用设备后台凭据把动作**直接交给 hub**，由 hub 按与客户端
相同的规则应用并写入同步变更日志。其他设备随即通过正常的 pull 收到变更；本机副本下次前台同步时同样拉到。

原生队列仍是唯一的待办来源：**Worker 送达后只给条目打「已送达」标记，不出队**，JS 取队列时一并清掉。已送达的快速添加和「完成」
不再交给 JS（任务已在 hub，pull 后自然一致）；已送达的 Snooze 仍交给 JS 在副本上再应用一次，保护本机的临时闹钟。
写入是确定性的（点击时刻、派生 id），两边同时应用也写出同一结果，经字段级 LWW 收敛。重发同理：hub 对已了结 / 快照过期的操作丢弃，
快速添加按 id 去重。

不做的事：后台拉取副本、后台运行 JS Engine、其他类型的离线编辑。

## User Stories

1. 作为用户，App 进程已被回收时，我在通知上点「完成」，联网后几秒到几分钟内，其他设备上这条任务就进入 Logbook，
   了结时间是我点击的时刻。
2. 作为用户，在通知上 Snooze 后，其他设备按新时刻提醒，而不是在原时刻再响一次（即使我之后一直没打开手机上的 App）。
3. 作为用户，我在状态栏快速添加的任务（含计划、Reminder、Project / Area、Tag、Subtask）不用打开 App 就出现在其他设备上。
4. 作为用户，断网时做的这些操作不丢：联网后自动送达；若一直没联网，下次打开 App 时照旧由 App 落库。
5. 作为用户，同一操作不会被应用两次：不会出现两条相同的快速添加任务，也不会为重复任务派生两个下一实例。
6. 作为用户，如果在操作送达之前我已在别的设备上改了这条任务，迟到的通知操作不覆盖新改动（沿用 Reminder Action 过期校验）。

## Implementation Decisions

### 规则只有一份

- `resolveReminderAction` / `snoozeTarget`（`packages/api/src/reminders/reminder-action.ts`）是纯函数，只依赖
  `@taskora/shared` 和 `@taskora/engine`。下沉到 `@taskora/engine` 的 domain（backend 已依赖 engine），api 重新导出，
  客户端与 hub 共用。
- 快速添加草稿 → `CreateTaskDto` 的转换与回落校验（Project 非 ACTIVE / Area 不存在 → Inbox；未知 Tag 丢弃）从
  `createFromQuickAddDraft` 中拆出纯函数，放进 `@taskora/shared`，两端共用。读取 Project / Area / Tag 的方式各自注入。

### hub 接口（只接受设备后台凭据）

- `POST /reminders/actions`：body `{ taskId, action, firedFireAt, tappedAt }`（与 `ReminderActionRequest` 同形）。
  按 hub 当前行和账号时区执行 `resolveReminderAction`：
  - complete → 走 `TasksService.complete`，新增可选 `settledAt`（= tappedAt），派生 Repeat Instance 与 App 内完成一致；
  - snooze → 改写 `scheduledDate` + `reminderTime`；
  - 两者都返回 200 `{ result: 'applied' }`；discard 返回 200 `{ result: 'discarded', reason }`，Worker 都视为已处理。
- `POST /quick-add`：body `{ id, draft }`，`id` 是设备入队时生成的 UUID，即新任务 id。任务、Reminder、Subtask
  同一事务写入；Subtask id 为 `deriveSubtaskId(id, 序号)`。返回 200 `{ taskId }`（空标题为 `null`）。
- 两个接口都经由 `writeAsHub` 记入 SyncChange，其他设备 pull 可见。
- **幂等不另建去重表**（2026-10-17 实现时调整，原计划的 `DeviceRequest` 不做）：
  - 完成重放：任务已了结 → 规则判为 `ineligible` 丢弃，不二次派生；
  - Snooze 重放：通知快照的 fireAt 已不是当前提醒 → `stale` 丢弃；
  - 快速添加重放：该 id 已存在 → 原样返回；已被删除（Compact）→ 返回 `taskId: null`，不重建。
  效果层面已经幂等，只是重放的响应码从 applied 变为 discarded，送达方不区分两者。

### 后台凭据的权限

- 现有凭据定义为「只读，只能读提醒计划」（`background-token.ts`、`schema.prisma` 注释）。本方案**扩展同一枚凭据**，
  白名单为 `GET /reminders/plan`、`POST /reminders/actions`、`POST /quick-add` 三个接口，不能访问其他 REST 或同步接口。
- 不另发一枚写凭据：轮换、过期、失效处理都可复用；风险等价（拿到凭据的人能完成 / 推迟 / 新建任务，不能读取或删除数据）。
- 这是对 local-first-v3 issue 09 决策的修订，记录在新 ADR 中。

### Android 原生

- 通知操作队列条目新增 `delivered`；快速添加队列另存一组已送达的条目 id，并在入队时给草稿 JSON 写入 `"id"`（UUID，即任务 id）。
  JS 取队列时连同已送达标记一起清空；已送达的快速添加与「完成」不交给 JS，已送达的 Snooze 交给 JS（见下）。
- 入队后提交 `enqueueUniqueWork(…, APPEND_OR_REPLACE, OneTimeWorkRequest)`，约束 `NetworkType.CONNECTED`，指数退避 30 秒起。
  两个插件各一个 Worker：reminders 插件的 `ReminderActionWorker`（`/reminders/actions`），statusbar 插件的
  `QuickAddDeliveryWorker`（`/quick-add`）。statusbar 读取 reminders 插件保存的后台凭据（同一 App 的 SharedPreferences）。
- Worker 逐条 POST 未送达的条目：
  - 2xx（含 discarded）→ 标记已送达；
  - 401 / 403 → 停止，留给 JS（reminders 侧随即停用后台凭据，statusbar 侧读到凭据被清空后不再送达）；
  - 5xx / 网络错误 → `Result.retry()`；
  - 其他 4xx（如旧版 hub 没有该接口）→ 停止，留给 JS。
- 「在应用中继续」（openInApp）的快速添加不送达：它会拉起 App，由 JS 落库并定位。
- 通知操作送达后尽快取回一次提醒计划（`ReminderBackground.refreshSoon`），本机闹钟与 hub 收敛。
- 未配置后台凭据（未登录 / 凭据已停用）时不提交 Worker，行为与现在相同。

### JS（主 WebView）

- 取队列的命令与处理流程不变（过滤在原生命令内部）。
- 条目 id 由原生写进交给 JS 的草稿 JSON（`"id"` 字段，与 `openInApp` 同为提交属性，不进草稿），JS 用 `quickAddEntryId` 取出。
- 快速添加落库时，用条目的 `id` 作为任务 id，Subtask id 用 `deriveSubtaskId(id, 序号)`（与 hub 相同）。
  Engine 后端与 hub REST 的 `createTask` 支持传入 id，已存在即返回现有任务。副本里已有这条任务时不再写入
  （避免旧草稿覆盖别处的后续编辑）；没有时建出与 hub 相同的行。
- 通知操作：JS 照旧逐条应用。已送达的 Snooze：副本已 pull 到 → 规则丢弃；副本尚未 pull 到（离线打开）→ 本地写出与 hub 相同的结果，
  计划里才有这次 Snooze。代价：送达后别处又改了这条任务、而手机离线打开时，本地的重新应用会覆盖那次改动（已接受，概率很低；
  反过来不重新应用，离线打开 App 会漏响这次 Snooze）。

### 竞态汇总

| 场景 | 结果 |
|---|---|
| Worker 先送达，之后 JS 取走 | 快速添加 / 完成：JS 不处理；Snooze：JS 再应用一次，副本已 pull 到则丢弃，否则写出相同结果 |
| JS 先取走 | Worker 下一轮看不到该条；走 Outbox 推送 |
| Worker 发送中 JS 取走 | 两边都应用，结果相同；Worker 的「已送达」标记无处可打，忽略 |
| hub 已应用、响应丢失 | 重试被判为已了结 / 快照过期 / id 已存在，不重复生效 |
| 发送前别处已改这条任务 | hub 过期校验丢弃，与 JS 路径一致 |
| 已送达 Snooze，随后离线打开 App | 条目仍在队列，JS 应用前临时闹钟一直受保护；JS 在副本上应用后计划照常 |

## Testing Decisions

- **共用规则**：`reminder-action.test.ts` 随函数迁移；新增草稿转换纯函数的单测（各字段、回落）。
- **hub（e2e，参照 `reminders.plan.e2e-spec.ts`）**：后台凭据可调用两个新接口，会话 JWT 被拒，凭据不能访问其他接口；
  complete 带 settledAt 并派生 Repeat Instance；snooze 改写字段；过期丢弃；重复送达不重复生效；
  写入产生 SyncChange，另一设备 pull 可见。
- **JS**：快速添加用条目 id 作为任务 id、Subtask id 按序号派生，id 已存在时不重复创建。
- **Android 原生**：真机验收清单（见 issue 04）。

## Out of Scope

- 后台同步副本、后台运行 JS。
- 状态栏「在应用中继续」（openInApp）：本来就会拉起 App，走现有 JS 路径即可（Worker 也可能先送达，结果一样）。
- 桌面端：runtime 模式进程必然存活，不受影响。
- 任务在别处了结后撤回本机已弹出的通知。

## Further Notes

- 修订了 reminder-actions spec 的 story 7（「数据在下次打开 App 时生效并同步」）和 local-first-v3 issue 09 的
  「后台凭据只读」决策，需要新 ADR（issue 05）。
- WorkManager 一次性任务在 Doze 下可能延迟到维护窗口，「几分钟内」是常见情况而非保证；验收按「联网且设备非 Doze 时 1 分钟内送达」。
