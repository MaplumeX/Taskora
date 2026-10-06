# 06 searchTasks 支持 Tag 条件

Status: implemented
Blocked by: 03

## Problem

Quick Find 的 `#tag` 需要搜索接口能按 Tag（子树、有效 Tag）缩小范围，并且允许只给 Tag、不给文字。

## Design

见 spec「Quick Find 的 Tag 条件」。

- engine `domain/search.ts`：`TaskSearchOptions.tagIds`；`planTaskSearch` 用 AND 组合各个 Tag 条件；`q` 为空但有 `tagIds` 时按范围档位 → Position 排序。
- `task-backend.engine.ts`、`TasksService.search`、`GET /tasks/search?tagId=` 都要跟上；`useTaskSearchQuery` 接受 `tagIds`。

## Acceptance

- 契约测试：两个 Tag 取 AND、子树命中、继承自 Project / Area、空 `q`。

## Comments

### 2026-10-06 — 实现

- engine `domain/search.ts`：`TaskSearchOptions.tagIds`；`planTaskSearch(tasks, subtasks, q, options, parents?)`，有 Tag 条件时必须传 `TagParents`（否则抛错）；`hasSearchCriteria`。只有 Tag 条件时档位记为 `other`，排序退化为范围层级 → Position。
- 设备端：Engine 后端的搜索字段带上自身 Tag 与归属，有 Tag 条件时读 Tag 树和 Project / Area。
- hub：`TaskSearchQueryDto.q` 改为可选，`tagIds` 逗号分隔；SQL 粗筛对每个 Tag 加一组四路 `OR`（子树 `IN`），只有 Tag 条件时不读 Subtask 命中（`take: 0`）。
- `useTaskSearchQuery(q, { extended, tagIds })`：查询键带上 tagIds；有 Tag 条件时依赖增加 project、area；只有 Tag 条件也会查询。
- 与 spec 的差异：REST 参数是 `tagIds=a,b`，不是重复的 `tagId`（axios 默认把数组序列化成 `tagIds[]=`，逗号分隔最省事）。
- 测试：搜索契约 `SEARCH_CONTRACT` 加了 Tag、Area 和三条带 Tag 条件的用例，三方（纯函数、Engine 后端、hub 服务）都跑过；真实 Postgres 的 e2e 一条；DTO 解析一条。
