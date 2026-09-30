# 01 任务搜索：Subtask 命中、相关度排序、扩展范围

Status: implemented

## Problem

现有 `getTasks({ q })` 只匹配标题 / 备注，按 Position 排序，范围只有「未了结」或「含已了结」，搜不到 Subtask 与 Trash。

## Design

见 spec 第 2 节。要点：

- `@taskora/engine` 新增 `domain/search.ts`：`taskSearchRank(fields, subtaskTitles, needle)` 与结果排序函数，从 `domain/index.ts` 导出。
- `TaskBackend` 新增 `searchTasks(q, { extended })`，返回 `TaskSearchHit[]`（类型放 `@taskora/shared`）。
  - 设备端 `packages/api/src/engine/task-backend.engine.ts`：按范围预过滤 task，再一次性读取候选的 subtask（或按标题预过滤 subtask 后反查父任务），计算命中与档位。
  - REST 端：`TasksService.search` + `GET /tasks/search?q=&extended=`；`tasks.api.rest.ts` 对应实现。
- 新增 `useTaskSearchQuery(q, extended)` hook；本地后端 debounce 约 50ms，REST 回退 300ms。
- `getTasks` 的 `q` 行为不变（助手工具在用）。

## Acceptance

- 标题、备注、Subtask 标题任一命中即返回父任务；Subtask 命中时 `matchedSubtasks` 列出命中的子任务。
- 默认范围只含 ACTIVE 且未进 Trash；`extended` 额外包含已完成、已取消与 Trash 中的任务。
- 排序：`titlePrefix` > `title` > `other`；同档未了结 → 已了结 → Trash；再按有效 Position。
- 设备端与 REST 端对同一数据集返回相同的 id 顺序（各有测试）。

## Comments

### 2026-09-30 — 实现

- engine：新增 `domain/search.ts`，包含 `planTaskSearch`（范围 → 命中 → 排序，两端共用）、`searchNeedle`、`taskInSearchScope`、`taskSearchRank`。`taskSearchRank` 的签名是 `(task, hasSubtaskMatch, needle)`：Subtask 标题由 `planTaskSearch` 统一判定后传入一个布尔值，与 spec 草案里的 `subtaskTitles` 参数略有不同。
- shared：新增 `TaskSearchHit` 和 `TaskSearchRank`。
- 设备端：`searchTasks` 在默认范围用 SQL 粗筛出 ACTIVE 且不在 Trash 的任务，扩展范围全量读取；Subtask 全量读出后由 domain 过滤。
- REST 端：`GET /tasks/search?q=&extended=`（路由在 `:id` 之前）。SQL 按标题、备注和 `subtasks.some(title)` 粗筛，同时 include 命中的 Subtask。下发的任务 DTO 不带 `subtasks`，因为这里取到的只是命中的那部分，不是完整的子任务列表。
- hook：`useTaskSearchQuery(q, { extended })`，缓存键为 `['task-search', q, extended]`，不挂在 `taskKeys.all` 下（那里的缓存按 `TaskResponseDto[]` 就地改写）。Engine 模式下防抖 50ms，REST 模式 300ms；返回值带 `searchedQuery`，供高亮使用。依赖 `task`、`subtask`、`tag`。
- 契约：新增 `SEARCH_CONTRACT`（`@taskora/engine/testing`），由纯函数、设备 Engine 后端和 hub REST 服务三方各跑一遍。
- 测试：engine 纯函数（契约、档位、已取消的任务只在扩展范围内）；api 契约，以及「新建的 Subtask 命中后搜索结果实时刷新」（已做变异验证：去掉 `subtask` 依赖后该测试失败）；backend 契约与 Prisma 粗筛条件。
- 验证：全部包 typecheck 通过，改动文件 eslint 通过。测试：engine 204、api 340、backend 215（9 个需真库的 e2e 文件被跳过）、ui 349、desktop 51、mobile 72、frontend 16，全部通过。
- 未做：没有对 `GET /tasks/search` 跑真库 e2e。本机唯一的 Postgres 属于另一个 worktree，e2e 会 TRUNCATE 表。
