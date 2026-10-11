# 01 数据层：start 取代 bucket / scheduledType，同步协议 7 和迁移

Status: implemented

## Design

见 spec 和 ADR 0024。

- shared：删除 `TaskBucket`、`ProjectBucket`、`ScheduledType`，新增 `Start`；DTO 改为 `start` + `scheduledDate`；`later-project.ts` 改判定。
- engine：`entities.ts` 字段；`domain/bucket.ts` → `domain/start.ts`（规范化函数）；`invariants.ts` 新规则；`views.ts` 新视图规则（Anytime 依赖日历）；`tasks.ts` / `projects.ts` / `duplicate.ts` / `repeat-*` / `reminders.ts` / `headings.ts`。
- 协议 7，hub `MIN_SYNC_PROTOCOL_VERSION = 7`。
- 副本迁移追加一步 + Outbox 改写 + resync 标记；`engine.ts` 在协议 ≥ 7 时消费标记。
- hub Prisma 迁移 + schema；`entity-codec.ts`、`views.ts`、REST DTO 校验、feed、agent 工具。

## Acceptance

- hub 和副本对同一批旧数据迁移出逐字相同的行和时钟。
- 旧 Outbox 事件迁移后能推送落地。
- 协议 6 的请求收到 426。
- engine / api / backend 测试全部通过。

## Comments

### 2026-10-11 — 实现

- shared：`Start` 取代 `TaskBucket` / `ProjectBucket` / `ScheduledType`；DTO 改为 `start` + `scheduledDate`。
- engine：`domain/start.ts`（`resolveTaskStart` / `resolveProjectStart`）；`repairEntity` 新规则（Someday 无日期、无日期无提醒/规则、整理过离开 Inbox、项目不在 Inbox）；视图 Anytime 含日期已到的任务并依赖日历；副本迁移 14 → 15（`mergeBucketIntoStart`，含 Outbox 改写与 `startModelResync` 标记）；协议 7（`START_MODEL_PROTOCOL`）。
- hub：Prisma 迁移 `20261011120000_things_start_model`（`prisma migrate diff` 与 schema 一致）；entity-codec、视图粗筛、feed、提醒计划、REST DTO、Agent 工具（`start` 参数）、seed；`MIN_SYNC_PROTOCOL_VERSION = 7`。
- 测试：副本迁移（行、时钟、Outbox、只在协议 7 上 bootstrap 一次）；真实 Postgres 上 hub 与副本迁移逐字一致的对比用例；engine / api / backend 全部通过。
