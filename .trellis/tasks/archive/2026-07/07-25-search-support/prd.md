# Task search support

## Goal

为 taskora 提供全局任务搜索能力：用户可通过顶部搜索框（快捷键唤起）跨所有列表按关键词搜索任务标题与备注，快速定位任务。

## Background

- 现有 `TasksService.findAll` 通过 `query.view` 分发多个预定义列表视图（inbox/today/upcoming/anytime/someday/trash/logbook），不支持按关键词检索。
- 前端无搜索入口，`AppShell` 仅含 Sidebar + MainContent。
- 数据层：Task 有 `title`、`notes`（可空）字段；`status` 区分 ACTIVE/COMPLETED/TRASHED。

## Requirements

### R1 后端搜索接口

- 新增 `GET /tasks` 对 `q` 查询参数的支持（复用现有端点，在 `TaskQueryDto` 中新增 `q?: string`）。
- 当 `q` 非空时，对 `title` 和 `notes` 做 case-insensitive `contains` 模糊匹配（PostgreSQL 默认 `mode: 'insensitive'`）。
- `q` 与其他筛选条件（`view`/`projectId`/`areaId`/`tagId` 等）可组合；当 `q` 存在但未传其他筛选时，默认搜索范围为当前用户的所有 ACTIVE 任务。
- 搜索结果按 `sortOrder asc, createdAt desc` 排序（与默认列表一致）。

### R2 搜索结果范围与切换

- 默认仅搜索 `status = ACTIVE` 的任务（排除 COMPLETED 与 TRASHED）。
- 前端搜索结果页提供"包含已完成"开关；开启时后端在 `q` 模式下将 `status` 放宽为 `[ACTIVE, COMPLETED]`（仍排除 TRASHED）。
- 不搜索 Trash 内任务。

### R3 前端搜索入口与交互

- 在 `AppShell` 顶部新增搜索框（位于 Sidebar 右侧、MainContent 顶部区域）。
- 快捷键：`Cmd/Ctrl + K` 聚焦搜索框；`Esc` 清空并失焦。
- 输入关键词后（去抖 300ms）调用后端搜索接口，展示结果列表。
- 搜索结果使用现有 `TaskListView` / `TaskItem` 组件渲染，保持与列表页一致的交互（完成、勾选等）。
- 搜索框为空时不发起请求、不展示结果。
- 搜索结果页独立于当前路由（不跳转），在 MainContent 顶部以浮层或内联区域展示。

### R4 数据隔离

- 搜索接口必须包含 `userId` 隔离，遵循 `database-guidelines.md` 的 `findFirst/findMany` 用户隔离规则。

## Acceptance Criteria

- [ ] AC1：在顶部搜索框输入关键词，能匹配到标题或备注包含该关键词的 ACTIVE 任务，结果按 sortOrder 排序。
- [ ] AC2：按 `Cmd/Ctrl + K` 自动聚焦搜索框；按 `Esc` 清空并失焦。
- [ ] AC3：当前路由在 Today/Inbox/Anytime 等任意页面时，搜索均可跨所有列表返回结果（不受当前 view 限制）。
- [ ] AC4：搜索默认不返回 COMPLETED 与 TRASHED 任务；开启"包含已完成"开关后，结果包含 COMPLETED 任务，但仍不含 TRASHED。
- [ ] AC5：搜索框为空时不发起请求、不展示结果列表。
- [ ] AC6：搜索结果项可进行完成/取消完成等操作且与列表页行为一致。
- [ ] AC7：搜索接口包含 `userId` 隔离，不返回其他用户任务。
- [ ] AC8：已登录用户在任意登录后页面均可见搜索入口。

## Out of Scope

- 搜索 projects / areas / tags（本期仅搜任务）。
- Postgres 全文索引（FTS）、拼音搜索、搜索排名/高亮。
- 搜索历史、搜索建议/自动补全。
- 按标签名/项目名/区域名间接搜索任务（仅匹配 title/notes）。
- 搜索结果分页（采用现有限量返回即可）。

## Open Questions

（无未决问题）