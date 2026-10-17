# App 外写入经设备后台凭据直达 Sync Hub

Android 端的副本只在前台同步（ADR-0007），但有两类写入发生在 App 之外：通知上的「完成 / 稍后」（ReminderActionReceiver，不拉起进程）和状态栏快速添加（QuickAddActivity）。原生只负责入队，要等主 WebView 下次运行才落库推送。用户在通知上点了「完成」，其他设备上却一直是未完成；在状态栏记下的任务，电脑上看不到。reminder-actions spec 当时接受了「下次打开 App 时生效」，实际使用中这个落差最容易被当成 bug。

## Decision

- **原生在入队的同时提交一个联网后运行的 WorkManager 一次性任务，用设备后台凭据把操作直接交给 hub**：通知操作走 `POST /reminders/actions`，快速添加走 `POST /quick-add`。hub 按与设备相同的规则应用（Reminder Action 的 `resolveReminderAction`、快速添加的 `planQuickAddTask`，均在共享 domain），写入经 `writeAsHub` 记入变更日志，其他设备正常 pull。
- **不做后台副本同步、不在后台运行 JS。** ADR-0007 的前台同步取舍不变；这里只是给两种已经排队的写入加一条送达通路。
- **后台凭据从「只读，只能读提醒计划」扩展为受限凭据**：能读提醒计划、送达这两种 App 外写入，不能读任务数据、不能删除、不能走同步协议。不另发一枚写凭据，轮换、续期、被拒即停用的逻辑都沿用 local-first-v3 issue 09。其他接口只认会话 JWT，后台凭据天然通不过，不需要额外的白名单代码。
- **幂等靠写入本身的确定性，不建去重表。** 完成以点击时刻为了结时间，Repeat Instance id 按规则派生；Snooze 的目标时刻由点击时刻算出；快速添加的任务 id 是入队时生成的条目 id，Subtask id 用 `deriveSubtaskId(taskId, 序号)`。重复送达时 hub 判为已了结 / 快照过期而丢弃，或按 id 认出任务已存在；hub 与设备都应用同一条时写出相同的值，经字段级 LWW 收敛。
- **原生队列仍是唯一的待办来源。** Worker 送达后只给条目打「已送达」标记，不出队；JS 取队列时一并清掉。已送达的快速添加与「完成」不再交给 JS（任务已在 hub，pull 后自然一致；JS 若在 pull 之前处理，会用旧数据覆盖别处随后的改动）。已送达的 Snooze 仍交给 JS 在副本上再应用一次：它在 JS 应用之前继续保护本机的临时闹钟，副本落后（离线打开 App）时 JS 的计划里也才有这次 Snooze。
- 凭据缺失、被拒，或 hub 不认识这两个接口（旧版）时不重试，留给 JS，行为与此前相同。「在应用中继续」的快速添加不走这条通路，它本来就会拉起 App。

## Considered Options

- **维持现状**：实现最简单，但操作在用户打开 App 之前不会到达其他设备，可能拖上几天。
- **后台运行 JS Engine 同步副本**：能覆盖所有写入，但要在无界面的环境里启动 WebView 或重写一套原生同步，代价远超收益，也与 ADR-0007 冲突。
- **另发一枚写凭据**：权限更细，但要多维护一套轮换和失效逻辑；泄露后果与扩展现有凭据相同（能完成 / 推迟 / 新建任务，不能读取或删除数据）。
- **hub 端按请求 id 去重（DeviceRequest 表）**：最初的方案。写入本身已经确定，去重表只会改变重放时的响应（applied → discarded），而送达方不区分两者，于是省掉了表和清理任务。
- **Worker 取走条目、加租约防并发**：最初的方案。送达后不出队更简单，JS 侧也不必改动，还顺带保住了 Snooze 临时闹钟的保护。

## Consequences

- 修订 reminder-actions spec 的 story 7 与 local-first-v3 issue 09 中「后台凭据只读」的决定；ADR-0014 追加了修订说明。
- statusbar 插件读取 reminders 插件保存的后台凭据（同一 App 的 SharedPreferences），两边的存储名和键必须保持一致。
- Doze / 应用待机下 WorkManager 可能推迟到维护窗口，「很快送达」不是保证。
- 已接受的边界：Snooze 送达后、别处又改了这条任务、手机随后离线打开 App 时，本地对 Snooze 的重新应用会覆盖那次改动。
