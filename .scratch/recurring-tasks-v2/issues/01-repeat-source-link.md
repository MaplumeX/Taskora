# 01 新增 repeatSourceId，撤销完成不再删除派生实例

Status: implemented

## Problem

v1 在撤销完成 / 撤销取消时按确定性 id 重新算出派生实例并删除，由此带出一串问题：用户编辑过的实例被删掉；已 compact 的 id 换成新 id 后，下一次撤销找不到对应实例；anchor=completion 下完成 → 取消 → 重开时漏删；anchor=completion 下撤销后隔天再完成，会派生出第二个实例。详见 v1 spec 的 Comments。

## Design

见 spec 第 2 节。要点：

- `Task.repeatSourceId`：engine 迁移新增一步，同时改动 `entities.ts`、Prisma schema 与迁移、`entity-codec.ts`、shared DTO 与 mappers。
- `planRepeatInstance` 产出的 task 字段中带上 `repeatSourceId: parent.id`。
- 设备端（`packages/api/src/engine/task-backend.engine.ts`）和 REST 端（`packages/backend/src/tasks/tasks.service.ts`）：
  - 派生前先查「`repeatSourceId` 等于本任务且不在 Trash」的 Task，存在就跳过；原有的确定性 id 查重保留，作为兜底；
  - 删除 `deleteDerivedInstance`，以及 REST uncomplete / uncancel 中的删除与 Compact 登记；
  - 实例在 Trash 时再完成：重新派生；确定性 id 已被占用（该行在 Trash）或已 compact 时，换新 id。
- 修订 ADR-0012 的 Consequences 与 Scope note 中关于 un-complete 的段落；修订 CONTEXT.md 中 Repeat Instance 的定义。

## Acceptance

- 完成 → 撤销 → 再完成：全程只有一个实例，且实例上的用户编辑保留（engine 与 REST 各有测试）。
- anchor=completion：完成、撤销，把时钟拨到隔天再完成，仍然只有一个实例。
- 实例在 Trash 时再完成来源任务：派生出一个新的存活实例。
- 两个副本离线并发完成同一任务，同步后实例只有一个（ADR-0012 回归测试）。
- 旧副本迁移后，存量实例（`repeatSourceId` 为 null）的去重仍然有效。

## Comments

### 2026-09-30 — 实现

- 字段：`Task.repeatSourceId`，改动涉及 shared DTO（`TaskResponseDto`、`FeedItemBase`，project 恒为 null）、engine `entities.ts`、副本迁移 5 → 6、Prisma 列与索引（迁移 `20260930180000_task_repeat_source`）、feed 映射。hub 的实体编解码按 `ENTITIES` 自动同步该字段。
- 决策：新增纯函数 `repeatDerivationTarget({ hasLinkedInstance, plannedId })`，返回 `skip | planned | fresh`，设备端 `deriveRepeatInstance` 与 REST 的 `TasksService.deriveRepeatInstance` 共用。
- 重开：删除了设备端的 `deleteDerivedInstance`，以及 REST 端的删除与 Compact 登记路径。
- 文档：ADR-0012 的 Scope note 已改写，Consequences 中原条目划掉，并追加 Amendment；CONTEXT.md 的 Repeat Instance 定义已补充。ADR-0008 中相关的是一段历史说明，内容仍然成立，没有改动。
- 测试：
  - engine：决策函数测试、`repeatSourceId` 写入、旧副本迁移后列存在；
  - api：重开保留实例及其编辑、anchor=completion 隔天再完成、完成 → 取消 → 重开、实例在 Trash 时换新 id 并在同步后存活；
  - backend e2e：对应的 REST 路径；
  - `account-time-zone.engine.test.ts` 原本复用同一个父任务「重开再完成」来验证 completion 锚点，与 v2 语义冲突，改为另起一个任务。
- 验证：各包 typecheck 通过。engine 189、api 327、backend 287（含真库 e2e）、ui 328、desktop 51、mobile 71、frontend 16 个测试全部通过。
- 已知边角：确定性 id 所在的行在 Trash 时，如果两台设备并发地离线再完成，会各自换一个新 id 派生，产生两个实例。触发条件需要同时满足 Trash、离线和并发，可以接受。
