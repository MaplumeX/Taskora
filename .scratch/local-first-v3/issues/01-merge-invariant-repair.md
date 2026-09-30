# 01 合并后的确定性修复（跨字段不变量）

Status: done

## Problem

字段级 LWW 逐字段裁决。两台设备分别修改同一实体的相关字段时，合并结果可能违反业务规则：

| 场景 | 设备 A | 设备 B | 合并结果 |
|---|---|---|---|
| 分组与项目 | 把任务移到项目 P2（清空 headingId） | 离线把任务拖进 P1 的分组 H1 | projectId=P2, headingId=H1（别的项目的分组） |
| 计划与提醒 | 把任务移到 Someday（清空提醒、重复规则、日期） | 设置提醒时刻 | Someday 任务带提醒 |
| 计划与 Bucket | 给任务设日期（bucket=SCHEDULED） | 把任务从 Inbox 移到 Anytime（bucket=ANYTIME） | DATE 任务落在 Anytime 视图 |
| 了结状态 | 重开任务（status=ACTIVE, settledAt=null） | —（部分写/旧客户端只写 settledAt） | ACTIVE 却带了结时间 |

REST 写路径按规则写入（`TasksService.update`、`heading-invariant` 测试），同步合并路径没有任何跨字段检查。

## Design

**不改合并模型，在 hub 合并之后加一步确定性修复。**

1. Engine 包新增纯函数 `repairEntity(entity, fields, probe)`：输入合并后的字段，返回需要纠正的字段 → 值。规则与 REST 服务写入时的规则一致：
   - Task
     - R1 计划类型不是 DATE → `repeatRule`、`reminderTime` 为 null（CONTEXT：仅 DATE 任务可设提醒 / 重复规则）
     - R2 计划类型是 NONE / SOMEDAY → `scheduledDate` 为 null
     - R3 `bucket` = `resolveTaskBucket(bucket, scheduledType, projectId, areaId)`（与 `TasksService.resolveBucket` 同一推导；NONE 下 INBOX / ANYTIME 是用户选择，保留）
     - R4 `headingId` 指向的分组不属于 `projectId` → `headingId` 为 null（分组归属经 probe 查询；未知的分组不动）
     - R5 状态为 ACTIVE → `settledAt` 为 null
   - Project：R2（`scheduledDate`）、R3（项目版 bucket：DATE / SOMEDAY → SCHEDULED，否则保留非 INBOX 的值，缺省 ANYTIME）、R5（`completedAt`）
   - Subtask：R5（`settledAt`）
   - 一致的状态返回空：修复只在真的冲突时发生，对历史数据也只做一次性纠正。
2. **两个 hub（NestJS `SyncHubService`、进程内 `InMemorySyncHub`）在每次合并之后调用它**，与引用清洗（`scrubReferences`）同一机制：纠正的字段写入实际值，并以虚拟设备 0 的必胜时钟下发。推送方与其他设备拉到后都采用纠正值，全体收敛到同一结果。
3. 设备端不做存储层修复：设备若以原时钟就地改值，可能与 hub 的值在时钟平局下永久分叉。设备本地写入由各 Engine 后端按同样规则写入（已有），跨设备合并出的冲突组合在推送到 hub 后被纠正，下一次 pull 收敛。

**语义**：规则冲突时，「把状态收紧」的一方获胜——移到别的项目的一方胜过设分组的一方；移入 Someday 的一方胜过设提醒的一方。这与 REST 上的单次操作语义一致（换项目会清空分组，离开 DATE 会清提醒）。

**为什么不用「字段组整体 LWW」**：让相关字段总以同一时钟写入，可以保证组合总来自同一个写者，但并发的独立编辑（A 改日期、B 改提醒时刻）会互相覆盖，丢失更多用户意图；而且 hub 的引用清洗、字段纠正都要改成整组提升。修复方案只在真正冲突时介入。

## Acceptance

- 表格中四个场景在两台设备 + hub 上都收敛到一致且合法的状态（进程内 hub 的收敛测试；真实 Postgres 端到端测试至少覆盖分组与项目场景）。
- 正常写入的回声仍然零应用、零通知（纠正只在冲突时发生）。
- `repairEntity` 有逐条规则的单元测试，包括「一致状态返回空」「NONE 下 INBOX / ANYTIME 保留」「未知分组不动」。

## Comments

2026-09-29 — 已实现。

- `packages/engine/src/invariants.ts`：`repairEntity`、`resolveTaskBucket`、`resolveProjectBucket`（规则 R1–R5，单元测试 9 个）。
- `packages/engine/src/hub.ts`：`applyRepairs`（与 `scrubReferences` 并列，两个 hub 共用）；进程内 hub 合并后调用。
- `packages/backend/src/sync/sync-hub.service.ts`：合并、清洗之后调用 `applyRepairs`，分组归属在事务内预读。
- 测试：进程内 hub 四个冲突场景 + 「无冲突不修复、回声零应用」；真实 Postgres 端到端（分组与项目、Someday 与提醒）。去掉修复时冲突场景全部失败。
- 与设计的差异：无。

