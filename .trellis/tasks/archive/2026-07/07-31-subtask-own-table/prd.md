# 独立 Subtask 表重构

## Goal

将子任务从 Task 表的自引用关联重构为独立的 `Subtask` 表，消除字段语义模糊、级联逻辑三处复制、列表查询需过滤 parentId 等问题。子任务回归其真实语义：仅含 title + status + sortOrder 的 checklist 项。

## Background

当前设计：子任务是 `parentId` 自引用的 Task，共享全部字段（标签、计划时间、到期时间等），但前端 `SubtaskRow` 只用到 title/status/delete。这导致：

1. **字段语义模糊**：创建子任务时传了 `projectId`，`resolveBucket` 就返回 `ANYTIME`，子任务默默带上无意义的 bucket。
2. **级联逻辑三处复制**：`tasks.service.remove` / `restore` / `convertToProject` 各写了一遍 BFS 收集后代。
3. **`feed.service.emptyTrash` 和 `project-headings.service.remove` 也依赖 parentId 做级联遍历**。
4. **列表查询靠 `!parentId` 过滤**（FeedListView、ProjectTaskLayout）。

## Requirements

### R1. 新增独立 Subtask 表

- 字段：`id`, `title`, `status`(ACTIVE/COMPLETED), `sortOrder`, `taskId`(FK → Task.id, ON DELETE CASCADE), `completedAt`, `createdAt`, `updatedAt`
- 不含：tags、scheduledDate、scheduledType、dueDate、bucket、parentId、projectId、areaId、headingId
- Subtask 不支持嵌套
- Task 删除时（软删或硬删）Subtask 自动级联——但本项目 Task 是软删（设 trashedAt），Subtask 不设 trashedAt；父 Task 软删时 Subtask 保留不动（父恢复后子任务仍在），仅在父 Task 被物理删除（emptyTrash）时 CASCADE 删除

### R2. Task 表移除自引用

- 移除 `parentId` 字段及 `TaskChildren` 自引用关系
- 移除 `CreateTaskDto.parentId` / `UpdateTaskDto.parentId` / `TaskQueryDto.parentId`
- 移除 `TaskResponseDto.parentId` / `TaskResponseDto.children`
- `TaskResponseDto` 新增 `subtasks: SubtaskResponseDto[]`

### R3. 后端 API 调整

- `GET /tasks` 不再接受 `parentId` 查询参数
- `POST /tasks` 不再接受 `parentId`（创建子任务改为 `POST /tasks/:id/subtasks`）
- `PATCH /tasks/:id` 不再接受 `parentId`
- 新增 `POST /tasks/:taskId/subtasks`：创建子任务（body: `{ title }`）
- 新增 `PATCH /subtasks/:id`：更新子任务（body: `{ title? } | { status? }`，仅 title 和 status）
- 新增 `DELETE /subtasks/:id`：删除子任务
- 新增 `POST /subtasks/:id/complete` / `POST /subtasks/:id/uncomplete`
- 新增 `POST /tasks/:taskId/subtasks/reorder`：重排子任务顺序

### R4. convertToProject 行为调整

- 父任务转项目时，其下所有 subtask 转换为新项目下的正式 Task（一次性字段提升）
- 提升后的 Task 字段：title 来自 subtask.title，status 来自 subtask.status，projectId = 新项目 id，其它字段默认值（bucket=INBOX, scheduledType=NONE 等）
- 提升后原 subtask 记录删除

### R5. 级联逻辑简化

- `tasks.service.remove` / `restore`：移除 BFS 后代收集逻辑（Subtask 无 trashedAt，不参与软删级联；父 task 恢复后 subtask 仍在）
- `feed.service.emptyTrash`：移除 parentId 后代 BFS 逻辑；trashed task 物理删除时 Subtask 走 CASCADE
- `project-headings.service.remove`：移除 parentId 后代 BFS 逻辑；heading 下属 task 软删时其 subtask 保留
- `project-headings.service.reorder`：移除 `parentId: null` 过滤条件（Task 不再有 parentId）

### R6. 前端适配

- `TaskRowExpanded` 的子任务区域改用新 Subtask API
- `SubtaskRow` 组件适配新的 `SubtaskResponseDto` 类型
- `tasks.api.ts` / `useTasks.ts`：移除 parentId 相关，新增 subtask 相关 API 和 hooks
- `FeedListView` / `ProjectTaskLayout`：移除 `!parentId` 过滤
- `shared/dtos`：新增 `SubtaskResponseDto`，更新 `TaskResponseDto`

### R7. 数据迁移

- 现有 parentId 非空的 task 记录直接删除（测试数据，不需要保留）
- 迁移 SQL：删除 parentId 非空 task → 移除 parentId 列 → 创建 Subtask 表

## Acceptance Criteria

- [ ] Subtask 表创建，字段如 R1 所述
- [ ] Task 表 `parentId` 及自引用关系完全移除
- [ ] 新增 Subtask CRUD API（创建、更新、删除、完成/取消完成、重排）
- [ ] `convertToProject` 将 subtask 提升为正式 task
- [ ] `tasks.service.remove` / `restore` 不再含 BFS 逻辑
- [ ] `feed.service.emptyTrash` 不再含 parentId BFS 逻辑
- [ ] `project-headings.service.remove` 不再含 parentId BFS 逻辑
- [ ] 前端子任务功能正常（创建、勾选、删除、重命名）
- [ ] 前端列表视图不再过滤 parentId
- [ ] 现有测试通过或已更新
- [ ] Prisma migration 生成并可正常执行

## Out of Scope

- 子任务的拖拽排序 UI（sortOrder 字段预留，reorder API 预留，但本次不改前端 DnD）
- 子任务的嵌套（明确不支持）
