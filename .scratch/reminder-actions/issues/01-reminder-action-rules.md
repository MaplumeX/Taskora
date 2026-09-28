# 01: Reminder Action 规则、Snooze 与通知文案（JS 核心）

Status: implemented

Spec：`../spec.md`（「领域：Snooze」「通知操作的应用规则」「通知文案」）。平台无关，是 02–05 的前置。

## 范围

- `packages/api/src/reminders/reminder-action.ts`（新）：纯函数
  `resolveReminderAction({ task, firedFireAt, action, tappedAt, timeZone, legacyZone })`
  → `{ kind: 'complete', settledAt } | { kind: 'patch', scheduledDate, reminderTime } | { kind: 'discard', reason }`。
  - 目标时刻：15 分钟 / 1 小时按点击时刻向上取整到分钟；「明天」取账号时区点击日 + 1 的当前 reminderTime。
  - 过期校验：已了结 / 已进 Trash / 任务不存在 / `reminderFireAt(当前) !== firedFireAt` 时丢弃。
- 执行器：把 resolve 结果落到 task-backend（完成走 `completeTask`；patch 走现有的字段 patch 流程）。
- `completeTask(id, opts?: { settledAt?: string })`：可选了结时间，Repeat Instance 派生沿用同一个 settledAt。
- 计划项扩展：`ReminderNotification` 增加 `snoozeTomorrowAt`，供原生侧与桌面端使用。
- 通知文案：替换 `defaultTexts`——title 为任务标题，body 为 `HH:mm · Project/Area 名` 加备注首行；按钮文案进入 i18n（zh/en `task` 命名空间）。

## 验收

- vitest 覆盖 spec 中「Testing Decisions → Reminder Action / 文案」各项，包括跨午夜、账号时区 ≠ 设备时区、DST、幂等重放、重复任务派生。

## Comments

### 2026-09-28 — 实现

- `reminder-action.ts`：`resolveReminderAction` / `snoozeTarget`；`reminder-scheduler.ts` 新增 `snoozeTomorrowAt`，计划项携带该字段。
- `reminder-texts.ts`：`buildReminderTexts` 与 `reminderActionLabels`（zh/en i18n）。
- 协调器新增 `applyAction(request)`：与重算共用同一串行链，返回前会等计划按写入结果重算完成。写入经由同一 engine 的 Task 传输层（`completeTask(id, { settledAt })`、`updateTask`）。
- 通知文案上下文：Project 名优先，其次 Area 名，另附备注首行；只在需要生成文案时读取 project/area。
- `shared/calendar-date.ts` 新增 `instantWallTime`、`addCalendarDays`。
- 暂未改动 `ReminderDelivery`（Android 下发的字段），留给 issue 03，与原生解析一起调整。
