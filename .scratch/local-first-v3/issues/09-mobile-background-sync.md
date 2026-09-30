# 09 移动端后台同步

Status: implemented — awaiting device acceptance

## Problem

ADR-0014 接受了「手机只知道上次打开 App 时同步到的提醒」。在桌面端改了提醒时间，手机在打开 App 前仍按旧时间响。

## Design

- Android WorkManager 周期任务（最短 15 分钟）唤起一个无界面的同步：flush + pull + 重算提醒计划并交给原生插件。
- Tauri 移动端在后台运行 JS 受限：需要确认能否在 headless WebView 中运行 Engine；否则原生侧直接调 `/sync/pull`，只处理与提醒相关的字段变更，写入原生计划（不写副本，下次打开 App 时正常同步）。
- 省电：只在联网且未处于省电模式时运行。

## Acceptance

- App 未打开时，其他设备修改的提醒在一个同步周期内生效。

## Comments

**2026-09-30 实现记录**

没有采用 headless WebView（Tauri v2 mobile 的运行时绑在 Activity 上）也没有让原生直接处理 `/sync/pull` 增量（要在 Kotlin 重写提醒规则）。改为 hub 按共享规则算好完整计划，原生只取回与交付（ADR-0014 amendment 2026-09-30）：

- 规则移入共享 domain：`packages/engine/src/domain/reminders.ts`（原 `api/src/reminders/reminder-scheduler.ts` + `buildReminderTexts`），新增 `planReminderDeliveries` / `reminderTextContext`。协调器（副本）与 hub（Postgres）调用同一函数，产出逐字一致的计划。
- hub：`GET /reminders/plan`（`src/reminders/`），返回 `{ reminders, cursor, serverTime }`；cursor 在读任务前取，计划至少包含到 cursor 为止的变更。
- 凭据：`POST /sync/devices` 带 `backgroundToken: true` 时签发设备只读后台凭据（`Device.backgroundTokenHash` / `backgroundTokenExpiresAt`，迁移 `20260930120000_device_background_token`），每次注册轮换、30 天有效。只能读提醒计划；会话 JWT 读不了。
- 原生：`ReminderBackground.kt`（WorkManager 周期任务 15 分钟，联网 + 电量不低）→ `ReminderAlarms.applyBackgroundPlan`。401/403 停用（仅当被拒的是当前凭据），登出 `clear` 一并停用。新插件命令 `configure_background`。
- 两个写入方的取舍（`PlanSource`）：JS 的 `sync` 附带副本基准 `{ cursor, pendingLocal }`。Outbox 非空时后台不覆盖；副本落后于后台计划且无本地写时 JS 不覆盖；后台取回期间 JS 交付过则作废。队列里有通知操作的 key 两条路径都留给 JS。
- JS：设备注册取回凭据后 `configureBackgroundSync(<server>/reminders/plan, token)`；每次同步成功立即重算提醒，把 Outbox 清空的基准尽快交给原生。

验证：engine / api / backend（含 e2e：注册 → 凭据读计划 → JWT 401 → 轮换后旧凭据 401）/ mobile / desktop 测试与 lint 通过；迁移经 `prisma migrate diff` 与 schema 一致。Kotlin 本机没有 Android SDK，未编译，依赖 CI 的 Android 构建。

待真机验收：
1. App 划走（不强行停止）后在桌面改提醒时间，15～30 分钟内手机按新时间响。
2. 手机离线编辑提醒后切到后台：联网后不被 hub 计划覆盖，直到 App 推送。
3. 离线打开 App：不用旧副本覆盖后台已取回的新计划。
4. 登出后后台任务停止（`adb shell dumpsys jobscheduler | grep taskora`）。

