# 01 数据层：有效 Tag（Project / Area 的 Tag 在过滤时被继承）

Status: implemented

## Problem

`tagId` 查询只看 Task 自身的 `tagIds`。给 Project 或 Area 打了 Tag，按这个 Tag 查询时看不到其中的任务，Project / Area 上的 Tag 实际上没有作用。

## Design

见 spec「有效 Tag」和 Implementation Decisions 第 1 节。

- 新文件 `packages/engine/src/domain/tags.ts`：`effectiveTaskTagIds`、`effectiveProjectTagIds`，从 `domain/index.ts` 导出。
- engine `views.ts`：`TaskQueryFields` 增加 `effectiveTagIds`，`taskMatchesQuery` 的 `tagId` 判定改用它；`api/engine/task-backend.engine.ts` 用副本中的 Project / Area 行计算后传入。
- backend `tasks.service.ts`：`tagId` 条件改为自身、`project.tags`、`area.tags`、`project.area.tags` 四者 `OR`。
- api `events/task-query-match.ts`：用缓存中的 projects / areas 计算有效 Tag；Project / Area 的 `tagIds` 变化时使 `tagId` 查询的缓存失效。
- 文档：
  - `CONTEXT.md` 的 Tag 词条补充「有效 Tag」定义：过滤时继承，显示时不继承；Tag Group 在过滤时视作父节点。
  - 新增 `docs/adr/0015-effective-tags.md`，记录这次 `tagId` 查询语义的变化，以及为什么不做多层嵌套 Tag。

## Acceptance

- Project 打 `Work`，其中没有 Tag 的任务出现在 `tagId = Work` 的查询结果里；Area 打 Tag，Area 下直接归属的任务和 Area 内 Project 的任务都出现。
- 任务行、展开行的 Tag 显示不变（只显示自身 Tag）。
- 去掉 Project 的 Tag 后，Tag 详情页里对应的任务立即消失（本地副本和 REST 两种后端都成立）。
- engine 单测、api 契约测试、backend 用例覆盖继承。

## Comments

### 2026-10-01 — 实现

- `packages/engine/src/domain/tags.ts`：`effectiveTaskTagIds`、`effectiveProjectTagIds`、`tagParentsFrom`。`taskMatchesQuery` 新增第 4 个参数 `parents`，`tagId` 查询没传时直接抛错，避免哪条读路径悄悄退回只看自身 Tag。
- 契约夹具 `VIEW_CONTRACT` 增加 `areas`，Project 增加 `areaId` / `tagIds`，新增 3 条 `tagId` 查询用例（继承 Project、继承 Area 直接归属、经 Project 继承 Area）；三方契约测试都已跟上。
- backend：SQL 粗筛改为四路 `OR`（放在 `AND` 里，避免和 `q` 的 `OR` 冲突），最终判定仍走 domain；`tagParents` 只在 `tagId` 查询时读取。新增一条真实 Postgres 的 e2e（`rest-writes.tasks.e2e-spec.ts`）。
- Engine 模式：`useTasksQuery` 带 `tagId` 时依赖增加 `project`、`area`。
- REST 模式事件流：`task-query-match` 用缓存里的 Project / Area 计算有效 Tag；Project / Area 事件使 `tagId` 任务列表失效。
- 文档：`CONTEXT.md` 增加「Effective Tags」词条并补充 Tag Group 的过滤语义；新增 `docs/adr/0015-effective-tags.md`。
- 测试：engine 218、api 352、backend 310（在临时 Postgres 容器上全部跑过）。
