# 研究：Taskora 安卓端「状态栏常驻通知」（快速添加 + 未完成任务展示）

> 研究日期：2026-09。目标：为 Taskora（Tauri 2 Android，`app.taskora.mobile`）实现类似滴答清单（TickTick）的状态栏常驻通知。除标注「本仓库」外，论断均附一手来源 URL；直接证据 / 来源解读 / 研究者推断分别标注。

## 摘要

可行。滴答清单的形态 = 一条 ongoing 通知：标题区显示未完成任务（今天/7天/全部可配置）+ 「+」快速添加入口；其快速添加是拉起应用内浮层，**不是**通知内直接输入。Android 平台上，「常驻且进程保活」的正解是 **前台服务（specialUse 类型）+ ongoing 通知 + BroadcastReceiver 动作（可含 RemoteInput 直接回复）**；Android 14+ 用户已可划掉 ongoing 通知，Android 15 起 `dataSync` 类型有 6 小时超时、`BOOT_COMPLETED` 禁启 `dataSync`，故类型应选 `specialUse`。Tauri 侧：tauri-plugin-notification 已支持 `ongoing`、`inboxLines`（≤5 行）、action 按钮与 `input:true` 的 RemoteInput，但所有动作都会拉起主 Activity 且无前台服务/自定义布局，只能做到「半常驻」；完整形态需自写 Kotlin 插件（社区已有同构参考实现 tauri-plugin-timer）。**本仓库的独特优势：任务本地副本是 `app_data_dir/taskora-<user>.db` SQLite（rusqlite，WAL），原生侧可直接读取，无需经 webview**。

---

## 1. 背景（本仓库事实）

- 安卓端是 Tauri 2 薄壳：`packages/mobile/src-tauri/src/lib.rs`（本仓库）。已注册 `tauri-plugin-notification`；已有 Rust 命令 `open_notification_settings`（经 ndk-context + JNI 发 `android.settings.APP_NOTIFICATION_SETTINGS`，说明仓库内已有 Rust↔JNI 先例）。
- 数据层：webview 内 Engine 经 IPC 命令（`sql_use_db/sql_exec/sql_all/sql_run`）在 **Rust 侧 rusqlite 连接** 上执行 SQL；副本文件为应用数据目录下 `taskora-<user>.db`，WAL 模式（`packages/mobile/src-tauri/src/sqlite.rs`，ADR-0007，本仓库）。这一点推翻「数据在 localStorage/IndexedDB、原生不可读」的常规假设，见 §5。
- 桌面端已有全局快捷键快速添加；移动端已有本地提醒（`packages/mobile/src/reminders`，基于 plugin-notification 的 schedule）。
- 分发方式：侧载 APK，不上 Google Play。

## 2. 滴答清单（TickTick）的状态栏形态

1. **官方用户手册（TickTick 开发商 appest 的 GitBook）**：「状态栏」位于 设置 → 高级选项 → 【状态栏】；原文：「开启【状态栏】可以在手机通知栏处显示快速添加及未完成的任务。」并注明「状态栏中的文字颜色可选，支持默认、黑色和白色」。同页还有「新任务默认设置对应用、小部件和**状态栏**生效」。**Sources:** [高级选项 · 滴答清单用户手册](https://xwzappest.gitbooks.io/guide-dd/content/android_app/gao_ji_xuan_xiang.html)。**Support:** 直接证据（官方手册原文，该手册版本较旧）。**Confidence:** 高（功能存在性）；中（当前版本设置路径，见下）。
2. **现行设置入口（2024 官方更新日志）**：Settings > Sounds & Notifications > Notification & Status Bar，可自定义提醒通知上的 Done/Snooze 按钮位置。**Sources:** [Updates in 2024 · help.ticktick.com](https://help.ticktick.com/external/articles/7301088783166865408)。**Support:** 直接证据。**Confidence:** 高。
3. **通知内容形态（第三方独立指南，非官方）**：常驻（ongoing）通知固定显示在锁屏与下拉栏；列出今天的任务（可配置：今天 / 未来 7 天 / 全部）；点任务可标完成或进应用；有「+」按钮；**点「+」打开的是应用内快速添加浮层（一个透明 Activity），不是在通知里直接打字**——该文指出 TickTick 未使用 Android `RemoteInput` API。**Sources:** [TickTick Persistent Notification: Android Setup, Fixes, and Limits · snaptask.org](https://snaptask.org/blog/ticktick-persistent-notification-android/)。**Support:** 来源解读（第三方实测；该站是推销自家 RemoteInput 应用的竞品软文，「TickTick 不用 RemoteInput」一说无官方确认）。**Confidence:** 中。
4. **用户侧证据**：新版路径为 General → Task quick add（快速添加任务）→ 状态栏；另有独立设置「Reminder Stick on Status Bar」（提醒通知置顶），与本研究的常驻状态栏是两个功能。**Sources:** [r/ticktick: How to remove this sticky notification](https://www.reddit.com/r/ticktick/comments/1m795ms/how_to_remove_this_sticky_notification/)、[Tasks not sticking to status bar](https://www.reddit.com/r/ticktick/comments/1dc7uon/tasks_not_sticking_to_status_bar/)。**Support:** 来源解读（社区）。**Confidence:** 中。
5. **注意名词歧义**：TickTick 官方博客中「Status Bar」也指任务**进度百分比条**（长按任务时间出现），与状态栏常驻通知无关。**Sources:** [20 Lesser-Known TickTick Features · blog.ticktick.com](https://blog.ticktick.com/2020/12/08/20-lesser-known-ticktick-features/)。**Support:** 直接证据。**Confidence:** 高。

**形态小结（研究者推断）**：滴答清单 ≈ 「一条 ongoing 通知 + 自定义 RemoteViews 布局（文字颜色可选暗示自定义布局）+ 点击跳应用内快速添加」，未必有前台服务；其在国产 ROM 上同样依赖自启/白名单（官方 FAQ 首要排查项即自启与后台保活，见 [FAQ · help.ticktick.com](https://help.ticktick.com/articles/7055792921664028672)）。

## 3. Android 平台机制（developer.android.com 一手文档）

### 3.1 ongoing 通知 vs 前台服务（FGS）

1. **`setOngoing(true)`（FLAG_ONGOING_EVENT）只是通知属性，不提供进程保活**：通知由系统持有，进程被杀后通知仍在但内容冻结；PendingIntent 仍可拉起进程。**Sources:** [Notification · API reference](https://developer.android.com/reference/android/app/Notification)。**Support:** 来源解读（API 语义 + 平台行为常识）。**Confidence:** 高。
2. **Android 14（API 34）起，ongoing/FGS 通知用户在解锁状态下可滑动清除**；例外：锁屏时不可划、「全部清除」按钮不会清掉它们、CallStyle/媒体/DPC 类通知不受影响。这意味着「常驻」在 14+ 上无法绝对保证，需接受用户可划掉并考虑重新发布策略。**Sources:** [Behavior changes: all apps (Android 14) — Changes to how users experience non-dismissible notifications](https://developer.android.com/about/versions/14/behavior-changes-all)。**Support:** 直接证据。**Confidence:** 高。这正是 Reddit 上「TickTick 提醒钉不住了」投诉的平台原因（一致性印证，非矛盾）。
3. **前台服务（`Context.startForegroundService()` + `ServiceCompat.startForeground()`）才会把进程置于前台态**：「Foreground services show a status bar notification…」「Foreground services continue running even when the user isn't interacting with the app.」START_STICKY 可被杀后重启。**Sources:** [Foreground services overview](https://developer.android.com/develop/background-work/services/fgs)、[Services overview](https://developer.android.com/develop/background-work/services)、[Launch a foreground service](https://developer.android.com/develop/background-work/services/fgs/launch)。**Support:** 直接证据。**Confidence:** 高。

### 3.2 通知渠道与重要性（Android 8.0+）

4. **8.0 起所有通知必须归属渠道**；重要性（importance）决定打扰方式且创建后只能由用户改。「无打扰常驻」应建 **`IMPORTANCE_LOW`（无声、状态栏显示图标）** 渠道；`IMPORTANCE_MIN` 只在抽屉折叠区显示、**状态栏无图标**，不适合本场景。**Sources:** [Create a notification — Create a channel and set the importance](https://developer.android.com/develop/ui/views/notifications/build-notification)、[NotificationManager · IMPORTANCE_* constants](https://developer.android.com/reference/android/app/NotificationManager)。**Support:** 直接证据。**Confidence:** 高。

### 3.3 POST_NOTIFICATIONS（Android 13+）

5. **13（API 33）起发通知（含 FGS 通知）需运行时权限 `POST_NOTIFICATIONS`**；新装应用默认关闭，需主动请求。官方明确：「Apps don't need to request the `POST_NOTIFICATIONS` permission in order to launch a foreground service. However, apps must include a notification when they start a foreground service」——即**无权限也能起 FGS，但用户拒绝后通知不进抽屉**（仅系统 FGS Task Manager 可见）。**Sources:** [Notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)。**Support:** 直接证据。**Confidence:** 高。Taskora 的提醒功能已处理过该权限引导（`open_notification_settings`，本仓库）。

### 3.4 前台服务类型声明（Android 14+）与类型选择

6. **target 34+ 必须在 manifest 声明 `android:foregroundServiceType` 并请求对应 `FOREGROUND_SERVICE_<TYPE>` 权限**。**Sources:** [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)、[Declare foreground services and request permissions](https://developer.android.com/develop/background-work/services/fgs/declare)。**Support:** 直接证据。**Confidence:** 高。
7. **本场景类型对比**：
   - `dataSync`：权限 `FOREGROUND_SERVICE_DATA_SYNC`、无运行时前置；但 **Android 15（target 35+）起每 24 小时只能跑 6 小时**（用户把应用带回前台则重置计时），超时系统回调 `Service.onTimeout()` 且不停会抛异常。**Sources:** [Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)、[Android 15 behavior changes — Data sync FGS timeout](https://developer.android.com/about/versions/15/behavior-changes-15)。**Support:** 直接证据。**Confidence:** 高。→ 7×24 常驻**不能选 dataSync**。
   - **`specialUse`（推荐）**：权限 `FOREGROUND_SERVICE_SPECIAL_USE`、无运行时前置、无超时；官方定位为「其它类型覆盖不到的合法前台场景」，需在 manifest 的 `<service>` 内加 `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="…用途说明…"/>`。**Sources:** [Foreground service types — Special use](https://developer.android.com/develop/background-work/services/fgs/service-types)。**Support:** 直接证据（「常驻任务看板」不属于任何枚举类型，选 specialUse 为来源解读+研究者推断）。**Confidence:** 高。
8. **开机自启类型限制（Android 15）**：`BOOT_COMPLETED` 接收器**禁止**启动 `dataSync / camera / mediaPlayback / phoneCall / mediaProjection / microphone` 类型的 FGS；**`specialUse` 不在禁用列表**，即开机后可重启 specialUse FGS。而 Android 12+ 的一般规则是「后台不能起 FGS」，`BOOT_COMPLETED` 本身是豁免场景之一。**Sources:** [Android 15 behavior changes — Restrictions on BOOT_COMPLETED receivers launching FGS](https://developer.android.com/about/versions/15/behavior-changes-15)、[Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)。**Support:** 直接证据。**Confidence:** 高。
9. **Google Play 政策**：target 34+ 上架 Play 需在 Play Console 申报各 FGS 类型用途（specialUse 需文字说明供审核）。**Taskora 侧载 APK 不走 Play，无此申报环节**，但 manifest 声明仍是系统层要求。**Sources:** [Foreground service types — Google Play policy enforcement](https://developer.android.com/develop/background-work/services/fgs/service-types#google-play-enforcement)、[Understanding FGS and full-screen intent requirements · Play support](https://support.google.com/googleplay/android-developer/answer/13392821)。**Support:** 直接证据。**Confidence:** 高。

### 3.5 自定义通知布局 RemoteViews

10. **能力与限制**：用 `NotificationCompat.DecoratedCustomViewStyle` + `setCustomContentView()/setCustomBigContentView()` 注入 RemoteViews；官方明确「The height available for a custom notification layout depends on the Android version… collapsed view layouts are limited to as little as **48 dp**, heads-up view layouts to as little as **88 dp**, expanded view layouts to as little as **252 dp**」。**Android 12+ 不允许完全自定义布局**（系统强制套标准模板装饰）。**Sources:** [Create a custom notification layout](https://developer.android.com/develop/ui/views/notifications/custom-notification)。**Support:** 直接证据。**Confidence:** 高。
11. **RemoteViews 只支持被 `@RemoteView` 标注的有限控件**（TextView/ImageView/Button/ProgressBar/ListView 等），**不含可编辑文本框**——通知内打字必须走 RemoteInput（见下），不能放一个 EditText 在布局里。**Sources:** [RemoteViews · API reference](https://developer.android.com/reference/android/widget/RemoteViews)。**Support:** 来源解读（类文档列出受支持控件集；「无 EditText」为对清单的反向推断）。**Confidence:** 高。

### 3.6 通知动作与 Direct Reply（RemoteInput）

12. **动作按钮**：`addAction()` 最多 3 个，各自挂 PendingIntent（可指 Activity 或 BroadcastReceiver；广播可在后台执行不打断用户）。**Sources:** [Create a notification — Add action buttons](https://developer.android.com/develop/ui/views/notifications/build-notification)。**Support:** 直接证据。**Confidence:** 高。
13. **Direct Reply（Android 7.0+）**：`RemoteInput.Builder(KEY)` 挂到 action 上，用户在通知里输入文字，系统把文本附进该 action 的 intent 回传应用，**无需打开 Activity**；官方用例原文即包括「update task lists from within the notification」（与本需求完全同场景）。接收侧 `RemoteInput.getResultsFromIntent(intent)` 取文本；**处理完必须用同一 id 重新 `notify()` 更新通知**，否则输入 UI 不会关闭。**Sources:** [Create a notification — Add a direct reply action](https://developer.android.com/develop/ui/views/notifications/build-notification)。**Support:** 直接证据。**Confidence:** 高。→ Taskora 可做到比 TickTick 更进一步：**通知内直接输入任务标题**。

### 3.7 后台启动限制、Doze 与国产 ROM

14. **Android 12+ 后台禁启 FGS**（`ForegroundServiceStartNotAllowedException`）；豁免包括：应用从可见态转换、用户与通知/小组件交互、精确闹钟、`BOOT_COMPLETED`（受 §3.4-8 的类型限制）、**用户关闭电池优化**等。实践含义：FGS 应在用户于应用内开启功能时（前台）启动。**Sources:** [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)。**Support:** 直接证据。**Confidence:** 高。
15. **Doze/应用待机桶**：Doze 推迟的是后台 CPU/网络与 JobScheduler/闹钟；有 FGS 的应用处于活跃状态（active bucket），FGS 本身不被 Doze 停止。真正的不确定项是**国产 ROM 的自启/省电白名单**（小米/OV/华为），TickTick 官方 FAQ 也把「允许自启动、加入白名单」列为提醒失效的首要排查——这是所有常驻方案的共有风险，需在设置页做引导。**Sources:** [Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)、[App Standby Buckets](https://developer.android.com/topic/performance/appstandby)、[TickTick FAQ](https://help.ticktick.com/articles/7055792921664028672)。**Support:** 直接证据（前三者）+ 研究者推断（「FGS 不被 Doze 停止」为对文档语义的解读）。**Confidence:** 高。
16. **用户主动停止**：Android 15 的 FGS Task Manager 允许用户停止某个 FGS（应用下次需重新启动它）。**Sources:** [Handle user-stopped foreground service](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping)。**Support:** 直接证据。**Confidence:** 高。

## 4. Tauri 2 集成路径

### 4.1 tauri-plugin-notification 现有能力边界（以插件源码为准）

插件仓库：`tauri-apps/plugins-workspace`（v2 分支）。Taskora 当前依赖 `tauri-plugin-notification = "2"`（本仓库 Cargo.toml）。

**已支持（JS API + Kotlin 实现双重确认）：**

1. `Options.ongoing`：「If true, the notification cannot be dismissed by the user on Android」→ Kotlin 侧 `.setOngoing(notification.isOngoing)`。**Sources:** [guest-js/index.ts](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/guest-js/index.ts)、[TauriNotificationManager.kt](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/TauriNotificationManager.kt)。**Support:** 直接证据（源码）。**Confidence:** 高。
2. **渠道**：`createChannel`，`Importance` 枚举（None/Min/Low/Default/High，文档注释确认 Min「without a status bar icon」、Low「shown without a sound」）、`Visibility`。**Sources:** 同上。**Support:** 直接证据。**Confidence:** 高。
3. **多行任务展示**：`inboxLines`（InboxStyle，**最多 5 行**，配 `summary` 可显示「+N more」式摘要）与 `largeBody`（BigTextStyle）。→ 无自定义布局也能展示「前 5 条未完成任务 + 总数」。**Sources:** 同上。**Support:** 直接证据。**Confidence:** 高。
4. **动作按钮与 Direct Reply**：`registerActionTypes()`，action 的 `input: true` 时 Kotlin 侧确实构建 `RemoteInput.Builder(REMOTE_INPUT_KEY)` 并 `addRemoteInput()`；JS 侧注明「On Android only the identifier, the title and the input flag are used」。**Sources:** 同上。**Support:** 直接证据。**Confidence:** 高。
5. **动作回调回 JS**：用户点动作后，`handleNotificationActionPerformed()` 解析 intent（含 `RemoteInput.getResultsFromIntent` 取 `inputValue`）→ `trigger("actionPerformed", …)` → JS `onAction()`；冷启动时插件 `load()` 也会检查 `activity.intent` 并派发。**Sources:** [TauriNotificationManager.kt](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/TauriNotificationManager.kt)、[NotificationPlugin.kt](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/NotificationPlugin.kt)。**Support:** 直接证据。**Confidence:** 高。
6. **定时通知与重启恢复**：AlarmManager 调度；manifest 含 `RECEIVE_BOOT_COMPLETED`，`LocalNotificationRestoreReceiver` 重启后恢复 **scheduled** 通知。**Sources:** [plugins/notification/android/src/main/AndroidManifest.xml](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/AndroidManifest.xml)。**Support:** 直接证据。**Confidence:** 高。

**关键限制（源码证据）：**

7. **所有动作（含 direct reply）都拉起主 Activity**：`createActionIntents()` 对每个动作用 `PendingIntent.getActivity(...)`，`buildIntent()` 构造 `Intent(context, activity.javaClass)`（ACTION_MAIN/CATEGORY_LAUNCHER，FLAG_ACTIVITY_SINGLE_TOP|CLEAR_TOP）。→ 点「快速添加/完成」必然把 App 带到前台，**无法做到 SnapTask 式「不离开当前应用」**。插件注释亦自承「TODO Add custom icons to actions」等。**Sources:** [TauriNotificationManager.kt — createActionIntents/buildIntent](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/TauriNotificationManager.kt)。**Support:** 直接证据。**Confidence:** 高。
8. **无前台服务、无 RemoteViews**：插件 manifest 只声明三个 receiver（TimedNotificationPublisher / NotificationDismissReceiver / LocalNotificationRestoreReceiver），无 `<service>`；构建器仅 BigTextStyle/InboxStyle，无自定义布局入口。→ ongoing 通知在进程死后内容冻结；**重启后普通（非 scheduled）通知不恢复**。**Sources:** 同 6。**Support:** 直接证据。**Confidence:** 高。
9. 内容更新链路依赖 webview：`sendNotification()` 从 JS 发出，webview 被冻结/杀死则无法刷新任务列表。**Support:** 研究者推断（由 7-8 推出）。**Confidence:** 高。

### 4.2 自写/嵌入 Kotlin 插件的官方机制

10. **插件形态**：Kotlin 类继承 `app.tauri.plugin.Plugin` + `@TauriPlugin` 注解；`@Command` 方法可被 Rust 或 JS 调用；参数类用 `@InvokeArg`；生命周期钩子 `load(webView)`、`onNewIntent(intent)`（通知点击/深链重入时用）；`trigger("event", payload)` 随时发事件，JS 侧 `addPluginListener('<plugin>', '<event>', cb)` 接收；JS→原生为 `invoke('plugin:<name>|<command>', args)`；Rust→原生为 `PluginHandle.run_mobile_plugin()`。**Sources:** [Develop Mobile Plugins · v2.tauri.app](https://v2.tauri.app/develop/plugins/develop-mobile/)。**Support:** 直接证据（官方文档）。**Confidence:** 高。
11. **Kotlin→Rust（webview 挂起也可用）**：官方明确「using JNI on Android… allows plugins to call shared code, **even when the application WebView is suspended**」——Kotlin `System.loadLibrary("app_lib")` + `external fun`，Rust 侧 `#[no_mangle] pub extern "system" fn Java_…`。→ 原生 BroadcastReceiver/Service 可在 webview 不在场时直接调 Rust 读写本地副本。**Sources:** 同上（Calling Rust From Mobile Plugins 节）。**Support:** 直接证据。**Confidence:** 高。
12. **工程结构**：`tauri android init` 生成 `src-tauri/gen/android` Gradle 工程（app 模块含 `MainActivity.kt` 与可编辑合并的 `AndroidManifest.xml`；插件为独立 android library 模块挂入）。本仓库当前尚无 gen/android 目录（未生成或未入库），实施时需先 init。**Sources:** [Develop Mobile Plugins](https://v2.tauri.app/develop/plugins/develop-mobile/)；本仓库目录核对。**Support:** 直接证据 + 本仓库事实。**Confidence:** 高。

### 4.3 社区现成插件（可借鉴/可直用，均较新）

13. **`WhoStoleMySleep/tauri-plugin-timer`**：与本需求**架构同构**——FGS 持有 ongoing 通知，动作按钮落在 `BroadcastReceiver` 再 `trigger` 到 web 层（「The buttons have to reach the app. Taps land in a BroadcastReceiver, which forwards them to the plugin, which relays them to the web layer as an event… keeps counting **with no JavaScript running**」）；manifest 声明 `POST_NOTIFICATIONS / FOREGROUND_SERVICE / **FOREGROUND_SERVICE_SPECIAL_USE**（含 declared subtype）**，service 与 receiver 均 `exported="false"`；桌面端为 no-op 便于跨端。代码结构（TimerPlugin.kt + TimerService.kt）可直接作为方案 B 的模板。**Sources:** [github.com/WhoStoleMySleep/tauri-plugin-timer](https://github.com/WhoStoleMySleep/tauri-plugin-timer)。**Support:** 直接证据（README/结构）。**Confidence:** 高（作参考实现）；低（生产稳定性，新仓）。
14. **`dardourimohamed/tauri-background-service`**：FGS（LifecycleService + START_STICKY + 常驻通知）保活的通用底座，FGS 类型可配（`dataSync` 默认 / `specialUse`），crates.io + npm + docs.rs 齐备。**Sources:** [github.com/dardourimohamed/tauri-background-service](https://github.com/dardourimohamed/tauri-background-service)、[docs.rs/tauri-plugin-background-service](https://docs.rs/tauri-plugin-background-service/latest/tauri_plugin_background_service/)。**Support:** 直接证据。**Confidence:** 中（可作 keepalive 底座，但通知交互仍需自写）。

## 5. 数据桥接

1. **JS→native**：`invoke('plugin:<name>|<command>', args)`；**native→JS**：插件 `trigger()` + `addPluginListener()`。双向机制均有官方文档与现有插件实例。**Sources:** [Develop Mobile Plugins](https://v2.tauri.app/develop/plugins/develop-mobile/)。**Support:** 直接证据。**Confidence:** 高。
2. **「native 直读 webview 存储」不可行的原因（通用结论）**：localStorage/IndexedDB 存于 WebView 私有 Chromium profile 目录（LevelDB 二进制格式），无公开稳定 API，且格式随 WebView 版本变化；Tauri 也不提供读取 webview 存储的原生接口。**Support:** 研究者推断（基于 WebView 存储机制的公开知识；未找到官方「禁止读取」条文，标注为推断）。**Confidence:** 高。
3. **但对 Taskora 这一点基本不成立**：任务副本是 `app_data_dir/taskora-<user>.db` 的**普通 SQLite 文件**（rusqlite，WAL）（本仓库 `sqlite.rs`，ADR-0007）。因此原生侧有两条直读路径：(a) Kotlin→JNI→Rust 复用/新开着 rusqlite 连接（官方机制，§4.2-11）；(b) Kotlin 直接用 `android.database.sqlite` 打开同一文件——WAL 支持多读单写并发。**Support:** 直接证据（本仓库源码）+ 研究者推断（并发细节）。**Confidence:** 高。
4. **写入一致性（研究者推断，实施时需定夺）**：从通知 Direct Reply 新增任务时，若 Engine（webview 内存态）在线，直接写库会造成 Engine 状态过期。可选：(i) 原生写入 SQLite 后 `trigger` 事件，webview 前台/就绪时重载；(ii) 原生写 outbox 表，Engine 下次前台时应用；(iii) 动作一律拉起 App 走 JS（放弃纯后台添加，即方案 A/C 的行为）。本地副本随后由前台同步与服务器对账，符合现有 local-first 架构。
5. **推荐数据流（研究者推断）**：JS Engine 观察任务变更 → 防抖后 `invoke` 推送摘要（未完成任务前 N 条 + 总数）→ 原生更新通知并把快照写 SharedPreferences → 冷启动/开机时原生用快照渲染通知，webview 就绪后再精确刷新。这样即使 webview 从未启动（开机后），通知也有最近一次的内容。

## 6. 方案对比

### 方案 A：纯 tauri-plugin-notification（零原生代码）

- **做什么**：JS 建 `Importance.Low` 渠道 → `registerActionTypes`（如「快速添加」`input:true`、「打开」）→ Engine 变更时 `sendNotification({ id 固定, ongoing: true, channelId, title: "N 条待办", inboxLines: 前5条, summary })` → `onAction` 处理（input 经 `inputValue` 拿到文本后在 JS 侧建任务）。
- **能力边界**：ongoing + 5 行任务 + 按钮 + **通知内输入均有**；但**点任何按钮/提交输入都会拉起主 Activity**（源码证实）；无 FGS 保活 → 进程死后通知冻结（按钮仍可拉起 App 冷启动并收到 `actionPerformed`）；**重启后通知消失**；无自定义布局；内容刷新需 webview 存活。
- **权限**：仅 `POST_NOTIFICATIONS`（插件 manifest 已合并声明）。
- **工作量**：小（1–2 天，纯 TS + engine 订阅/防抖 + 权限引导复用 reminders 既有链路）。
- **风险**：低。体验是「半常驻」：符合日常（用户每天会开 App），不符合「重启后仍在」。

### 方案 B：自定义 Kotlin 插件 + `specialUse` FGS + BroadcastReceiver +（可选）RemoteViews

- **做什么**：内嵌插件（gen/android 或独立插件包）：`StatusBarService`（`startForeground`，type=`specialUse` + subtype property）持有 ongoing 通知；RemoteViews 自定义布局（折叠 48dp / 展开 252dp）或先用标准模板；动作走 **BroadcastReceiver**（「完成任务」「快速添加」`RemoteInput`）→ 原生直接写 SQLite（JNI→Rust 或直开 WAL）→ 更新通知 → `trigger` 事件供 webview 对账；`BOOT_COMPLETED` receiver 重启服务（Android 15 允许 specialUse）；JS 经 `invoke` 推送任务摘要 + SharedPreferences 快照兜底。代码结构大量借鉴 tauri-plugin-timer（§4.3-13）。
- **能力边界**：**完整滴答形态且更进一步**（通知内直接输入添加、不开 App 完成任务、开机自启、webview 不在场也可读写副本）。仍受平台硬约束：Android 14+ 用户可划掉该通知（可检测后下次启动时提示/重发）；用户可在系统 FGS Task Manager 停止服务；国产 ROM 需自启白名单引导。
- **权限/声明**：`POST_NOTIFICATIONS`（运行时）、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`、`RECEIVE_BOOT_COMPLETED`；manifest 声明 `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`。侧载无 Play 申报。
- **工作量**：中–大（约 1–2 周含联调：插件脚手架、Service/Receiver/RemoteViews、JS API、Engine 推送管道、DB 并发一致性、Android 12–15 行为差异与厂商适配测试）。
- **风险**：中。主要风险点是 DB 并发写入与 Engine 一致性设计、OEM 杀后台、`specialUse` 声明文案（虽无 Play 审核，仍须规范填写）。

### 方案 C：简化版——常驻入口通知，点击直达应用内快速添加

- **做什么**：方案 A 的裁剪：一条静态 ongoing 通知（LOW 渠道），标题如「+ 快速添加任务」，`actionTypeId` 或 content intent 拉起 App；JS 在 `onAction`/启动参数中直达快速添加页（类桌面端全局快捷键体验）。可选显示未完成任务计数（标题数字）。
- **能力边界**：最小可用；不展示任务列表、不支持通知内输入（或退化为拉起后输入）。
- **权限**：仅 `POST_NOTIFICATIONS`。
- **工作量**：最小（半天–1 天）。**风险**：最低。

### 对比表

| 维度 | A 纯插件 | B 自定义插件+FGS | C 入口通知 |
|---|---|---|---|
| 常驻（锁屏/下拉可见） | ✔（14+ 可划掉） | ✔（同左，可重发） | ✔ |
| 显示未完成任务 | ≤5 行（InboxStyle） | 自定义布局，可更多 | 仅计数 |
| 通知内直接输入添加 | ✔ 但会拉起 App | ✔ 纯后台 | ✘ |
| 不开 App 完成任务 | ✘（拉起 App） | ✔ | ✘ |
| 进程死后内容仍新鲜 | ✘ | ✔（FGS 保活 + 原生直读 SQLite） | ✘（静态内容，可接受） |
| 重启后仍在 | ✘ | ✔（BOOT_COMPLETED + specialUse） | ✘ |
| 自定义布局 | ✘ | ✔ RemoteViews（48/252dp） | ✘ |
| 新增权限 | 无 | FGS + specialUse + BOOT | 无 |
| 工作量 | 1–2 天 | 1–2 周 | 0.5–1 天 |
| 主要风险 | 体验半常驻 | 复杂度、DB 一致性、OEM | 功能弱 |

## 7. 建议

1. **分两期**。**一期先做 A（含 C 的直达快速添加）**：成本极低，立刻覆盖「下拉栏快速添加 + 前 5 条待办 + 计数」，并搭好 Engine→通知的推送管道、LOW 渠道与 POST_NOTIFICATIONS 引导（复用 reminders 已有模式）。接受「重启/杀进程后通知消失或冻结」作为已知限制。
2. **二期做 B**，直接以 `WhoStoleMySleep/tauri-plugin-timer` 的 Kotlin 结构为模板（FGS 持有通知 + BroadcastReceiver 动作 + trigger 事件），FGS 类型**务必选 `specialUse`**（`dataSync` 有 Android 15 六小时超时且被禁 BOOT_COMPLETED 启动），并**利用本仓库 SQLite 副本原生可读的优势**让 Direct Reply/完成任务在原生侧落库 + 事件对账，避免「快照推送」在重度使用下的不一致。
3. **产品层面对齐平台现实**：不承诺「不可清除」（Android 14+ 用户可划掉），改为「划掉后下次启动应用时可一键恢复」；设置页提供「常驻状态栏」开关、电池优化/自启引导入口（复用 `open_notification_settings` 的 JNI 模式扩展到 `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 与厂商自启页）。
4. **测试矩阵**：Android 8/12/13/14/15 各一（渠道、运行时权限、ongoing 可划掉、后台启动限制、dataSync 超时与 BOOT_COMPLETED 类型限制各命中一版），另加一台小米/OPPO 机型验证自启白名单链路。

---

## 矛盾与争议记录

- **「提醒钉在状态栏」失效投诉 vs 平台行为**：Reddit 用户称新版 Android 上 TickTick「Reminder Stick on Status Bar」仍可被划掉（[1](https://www.reddit.com/r/ticktick/comments/1dc7uon/tasks_not_sticking_to_status_bar/)、[2](https://www.reddit.com/r/ticktick/comments/1s2c7wk/how_to_pin_reminders_in_the_notification_bar/)）。与 Android 14「ongoing 可消除」官方变更一致，非实现 bug；任何方案都无法绕过，记录为平台约束。
- **TickTick 设置路径**：旧官方手册为「高级选项 → 状态栏」，2024 官方更新与用户实测为「声音、提醒与通知 → 通知与状态栏 / 快速添加任务 → 状态栏」。系版本演进，均已注明。
- **snaptask.org 对 TickTick「不用 RemoteInput」的说法**：无 TickTick 官方确认，且该文为竞品软文；标注为中置信度。
- **tauri-plugin-notification 文档站示例**（v2.tauri.app/plugin/notification）把 `input/foreground` 等属性描述偏 iOS，JS 源码注释明确「On Android only the identifier, the title and the input flag are used」——以源码为准。

## 缺失证据

- TickTick 现行帮助中心**没有**「状态栏」专门文章（help.ticktick.com 全文检索未见），当前形态描述 = 旧官方手册 + 2024 更新日志 + 社区实测拼合。
- TickTick 的常驻通知是否挂前台服务、是否 RemoteViews 自定义布局：外部无法确认（「文字颜色可选」暗示自定义布局，为推断）。
- `tauri-plugin-timer` / `tauri-plugin-background-service` 在 Android 14/15 真机上的长期表现：无公开验证数据，采用前需自测。
- RemoteViews 48/88/252dp 的官方表述为「as little as」（因版本/OEM 而异），布局应按最保守值设计。
- 本仓库 `packages/mobile/src/reminders` 内部实现细节未逐一核对（目录不可列举，仅确认其基于 plugin-notification schedule）。

## 来源清单

**保留（一手/权威）：**
- [Foreground service types · Android Developers](https://developer.android.com/develop/background-work/services/fgs/service-types) — 类型声明、权限、specialUse property、Play 政策
- [Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout) — dataSync 6h/24h 超时
- [Restrictions on starting a FGS from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) — 12+ 后台禁启与豁免
- [Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-15) — BOOT_COMPLETED 禁启类型清单
- [Android 14 behavior changes (all apps)](https://developer.android.com/about/versions/14/behavior-changes-all) — ongoing 通知可消除
- [Notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission) — POST_NOTIFICATIONS 与 FGS 豁免细节
- [Create a notification](https://developer.android.com/develop/ui/views/notifications/build-notification) — 渠道、动作、Direct Reply 全流程
- [Create a custom notification layout](https://developer.android.com/develop/ui/views/notifications/custom-notification) — RemoteViews 高度限制与 12+ 模板约束
- [Foreground services overview](https://developer.android.com/develop/background-work/services/fgs) / [Services overview](https://developer.android.com/develop/background-work/services) — FGS 语义
- [Develop Mobile Plugins · Tauri v2](https://v2.tauri.app/develop/plugins/develop-mobile/) — Kotlin 插件机制、trigger/invoke、JNI 调 Rust
- [tauri-plugin-notification JS API（guest-js/index.ts）](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/guest-js/index.ts)、[TauriNotificationManager.kt](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/TauriNotificationManager.kt)、[NotificationPlugin.kt](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/java/NotificationPlugin.kt)、[AndroidManifest.xml](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/android/src/main/AndroidManifest.xml) — 插件能力边界的一手源码
- [高级选项 · 滴答清单用户手册（官方 GitBook）](https://xwzappest.gitbooks.io/guide-dd/content/android_app/gao_ji_xuan_xiang.html) — 状态栏功能官方描述
- [Updates in 2024 · TickTick 帮助中心](https://help.ticktick.com/external/articles/7301088783166865408) — 现行「通知与状态栏」设置
- [TickTick FAQ · help.ticktick.com](https://help.ticktick.com/articles/7055792921664028672) — 自启/白名单官方排查建议
- [WhoStoleMySleep/tauri-plugin-timer](https://github.com/WhoStoleMySleep/tauri-plugin-timer) — 方案 B 同构参考实现
- [dardourimohamed/tauri-background-service](https://github.com/dardourimohamed/tauri-background-service) — FGS 保活底座备选

**降级/参考：**
- [snaptask.org — TickTick persistent notification 指南](https://snaptask.org/blog/ticktick-persistent-notification-android/)（第三方+竞品立场，仅用于形态描述，中置信）
- Reddit r/ticktick 若干帖（用户实测设置路径与划除行为，社区证据）
- [v2.tauri.app/plugin/notification](https://v2.tauri.app/plugin/notification/)（文档站，能力以源码复核为准）

## 后续研究建议

1. 实机验证 `tauri-plugin-timer` 在 Android 14/15 上的 FGS 行为（可划掉后的重发策略、Task Manager 停止后的恢复），决定二期是直接依赖还是复制其结构自写。
2. 确认 Engine 对「原生侧写入副本」的重载/对账机制（packages/mobile/src/engine 的存储事件流），定方案 B 的写入路径（直写 SQLite + 事件 vs outbox 表）。
3. 调研小米（MIUI）/OPPO/vivo 自启动设置页的 intent 唤起方式，形成设置页引导清单（可参考 dontkillmyapp.com 与各厂商文档）。
