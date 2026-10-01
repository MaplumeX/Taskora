# 01 数据层：Inbox 任务不能有归属

Status: implemented

## Problem

`resolveTaskBucket` 在计划类型为 NONE 时保留原有的 INBOX / ANYTIME。因此 Inbox 任务获得项目或区域后，bucket 仍是 INBOX，任务会同时出现在 Inbox 和项目里。

## Design

见 spec 第 1 节。

- `packages/engine/src/domain/bucket.ts`：NONE 下只有无归属时才保留 INBOX；有归属时 INBOX 转为 ANYTIME。ANYTIME 的保留规则不变。
- 不改 `planTaskUpdate` 的结构：它和 `invariants.repairEntity`、`planTaskCreate` 都经由 `resolveTaskBucket` 推导，两个后端（`backend/tasks.service.ts`、`api/engine/task-backend.engine.ts`）共用。
- 已有的脏数据不迁移。

## Acceptance

- INBOX 任务写入 `{ projectId }` 或 `{ areaId }` 后 bucket 变为 ANYTIME，从 Inbox 视图消失。
- 创建时带 `bucket: INBOX` 和 `projectId`，结果是 ANYTIME。
- `{ projectId: null, areaId: null, bucket: INBOX, scheduledType: NONE }` 能把一个有计划、有归属的任务移回 Inbox，计划日期、提醒、重复规则一并清除。
- DATE / SOMEDAY 任务换归属后 bucket 仍是 SCHEDULED。
- 补齐 engine 单测（bucket、tasks、invariants）。

## Comments

### 2026-10-01 — 实现

- `resolveTaskBucket`：NONE 下有归属即 ANYTIME；无归属时保留 ANYTIME，其余（INBOX / 未指定 / 残留的 SCHEDULED）落 INBOX。
- 连带修正「转为项目」：Subtask 提升的任务原本写死 `bucket: INBOX`（随后由调用方填入项目 id），会同时出现在 Inbox 和新项目里，改为 ANYTIME。backend e2e（`rest-writes.tasks.e2e-spec.ts`）与 api 契约测试同步更新。
- 测试：用例并入 `engine/test/domain.test.ts`「任务写入规则」与 `invariants.test.ts`。原先断言「INBOX + 有项目」一致的用例（#117 固化的旧行为）改为断言修复为 ANYTIME。
- backend 的 88 个依赖 Postgres 的用例本机跳过，未在数据库上跑过。
