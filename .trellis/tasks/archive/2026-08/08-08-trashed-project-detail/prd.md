# Fix trashed project detail page

## Goal

让废纸篓（soft-delete / `trashedAt != null`）里的项目在被点击后能正常打开详情页，显示真实标题、进度环、标签、备注和任务列表，而不是当前的"空壳页"（默认占位标题、无 ring、无 More 菜单、无备注编辑器）。

## Background

当前链路：

- `ProjectFeedRow` 在 feed（含 trash view）里渲染 trashed 项目行，`onClick` 无条件 `navigate(/projects/:id)`。
- `ProjectDetail` 通过 `useProjectsQuery()`（后端 `findAll`，`where: { trashedAt: null }`）取列表后 `.find()`，trashed 项目不在列表中 → `project === undefined` → 降级为空壳 UI。
- `useDeleteProject.onMutate` 还会 `removeProjectFromList`，进一步坐实缓存里没有该数据。

后端 `findOne` / `GET /tasks?projectId=` 均**不过滤 trashedAt**，所以数据是可得的，差异仅在 `findAll`。

## Requirements

### R1 详情页能取到 trashed 项目数据
- `ProjectDetail` 不再只依赖 `useProjectsQuery().find()`；当列表里找不到时，回退到按 id 单查（后端 `findOne`，未过滤 trashedAt，可返回 trashed 项目）。
- trashed 项目详情页显示：标题、进度环、标签、备注、任务列表、已完成任务，与非 trashed 项目信息一致。

### R2 详情页展示 trashed 项目下属任务
- 详情页任务列表（`useTasksQuery({ projectId })`）后端不过滤 trashedAt，trashed 项目下的任务应正常展示。

### R3 编辑能力：完全可编辑（方案 B2）
- trashed 项目详情页与正常项目行为一致：标题可编辑、备注可编辑、进度环可点完成、日期/标签可改。
- More 菜单：完成/日期/标签/删除全部可用；末项按 trashed 状态切换——trashed 时显示「恢复」（`variant='trash'`），非 trashed 时显示「删除」（`variant='default'`）。这样在废纸篓里点开仍保留「恢复」入口，符合语义。
- 后端 `update`/`complete`/`uncomplete` 不过滤 trashedAt，编辑会真生效（恢复后保留改动），这是 B2 的预期行为。

### R4 空壳兜底
- 即便取数失败（网络/权限），详情页有可读的兜底 UI（提示加载失败或项目不存在），而非静默显示默认占位标题。

## Acceptance Criteria

- [ ] 在废纸篓点击一个 trashed 项目，跳转后详情页显示该项目的真实标题、进度环、备注、任务列表（不再是空壳页）。
- [ ] trashed 项目的子任务在详情页可见。
- [ ] 详情页在取数失败时有可读的兜底提示，不静默退化为默认标题。
- [ ] 非 trashed 项目的详情页行为回归不变（标题编辑、More 菜单、完成任务等正常）。
- [ ] trashed 项目详情页：标题可编辑、备注可编辑、进度环可点完成、日期/标签可改，与正常项目一致。
- [ ] trashed 项目的 More 菜单末项为「恢复」（非「删除」），其余菜单项可用。
- [ ] typecheck + lint 通过。

## Decision

**废纸篓项目详情页编辑能力 → 方案 B2（完全可编辑）**：trashed 项目详情页与正常项目行为一致，标题/备注/进度环/日期/标签均可编辑，More 菜单完整可用；仅末项按 trashed 状态在「恢复」/「删除」间切换。后端 update/complete 不过滤 trashedAt，编辑真生效（恢复后保留改动）。

## Out of Scope

- 空废纸篓、清空废纸篓等已有功能不动。
- trashed task 的详情展示不在本任务范围（本任务只针对 project）。