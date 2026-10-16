# 02: 导入计划（纯函数）与 format 迁移

Status: implemented
Blocked by: 01

Spec：`../spec.md`（「导入流水线」）。

## 范围

- format 迁移链：`migrate(raw) → format 1`；高于当前 format 抛明确错误。
- `buildImportPlan(pkg, target)`：`target` = 目标账号现有 Tag 树、各容器末尾位置、已有 blob hash 集合、已有日历订阅 url。输出 `{ writes: Array<{ entity, id, fields }>, calendarSubscriptions, stats }`。
  - id 重映射（`REFERENCE_FIELDS` + `repeatSourceId` + heading `projectId`），悬挂引用按 compact 语义处理。
  - Tag 按标题路径合并。
  - 容器顶层条目位置追加（`positionsBetween`），含 `feedPosition`。
  - 缺 blob 的 Attachment 跳过并计数。
- 不碰数据库，全部 vitest 覆盖 spec「Testing Decisions」前两项。

## 验收

- 输出中不含任何包内原 id（合并到现有 Tag 的除外，那些是目标账号的 id）。
- 单测覆盖：嵌套 Tag 部分命中、悬挂引用、子实体孤儿、位置相对顺序、repeat 实例归属。
