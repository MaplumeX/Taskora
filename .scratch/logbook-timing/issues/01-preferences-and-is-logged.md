# 01 偏好与推导：`loggingMode` / `loggedThrough` / `isLogged`

Status: implemented

## Problem

还没有地方存移入时机，也没有统一的规则判断「已了结的条目是否已移入 Logbook」。

## Design

见 spec 第 1 节、ADR 0022。

- 偏好：`shared/src/dtos/user.dto.ts`、`backend/src/users/dto/users.dto.ts`、`api/src/stores/preferences.store.ts` 新增 `loggingMode`（缺省 `IMMEDIATE`）与 `loggedThrough`。两者都 LWW（不要照搬 `todayReviewedOn` 的取最大值合并）。backend 加迁移。
- 推导：在 `engine/src/domain/` 写纯函数 `isLogged(item, project, loggingContext)`。`loggingContext` = `{ mode, loggedThrough, archiveCutoff }` + `CalendarContext`。已了结项目内的任务随项目判断。
- store 动作 `setLoggingMode(mode)`：按 spec 的切换规则写 `loggedThrough`。

## Acceptance

- `isLogged` 单测覆盖：三种模式、水位线前后、每天模式跨零点（账号时区，含 DST 日）、早于归档截止、已了结项目内的任务。
- 切换模式的单测：立即→手动、手动↔每天时写入当前时刻，切回立即不写。
- 两端各写一次偏好，后写者胜出。

## Comments

### 2026-10-10 — 实现

- `shared/src/logging.ts`：`LoggingMode`、`accountLogging`（hub 读 Json 偏好）、`loggedThroughAfterModeChange`。
- `engine/src/domain/logging.ts`：`settledIsLogged`、`keepsSettledInViews`、`ViewContext`（`CalendarContext` + 可选 `logging`，缺省即立即模式）。
- 偏好：shared DTO、backend `UpdatePreferencesDto`（`IsIn` / `IsISO8601`，`loggedThrough` 可为 null）、api `normalizePreferences`（载荷有值即采用，LWW）、preferences store（`setLogging`）。Json 列，不需要迁移。
- `api/hooks/useLogging.ts`：`useLoggingActions`（`setLoggingMode` / `logCompleted` 返回撤销函数，乐观写 + 失败回滚）、`useLoggingMode`、`useIsLogged`。
- 测试：`engine/test/logging.test.ts`、`api/src/utils/preferences.test.ts` 新增用例。
