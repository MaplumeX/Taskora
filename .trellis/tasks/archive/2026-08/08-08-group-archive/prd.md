# 为分组提供归档功能

## Goal

为项目内的分组标题（Project Heading）提供归档功能，让用户可以标记一个分组为"已归档"状态，从而在不删除的前提下将其从活跃视图中收起。

## Background（代码库已确认的事实）

### ProjectHeading 数据模型
- 字段：`id`, `title`, `sortOrder`, `userId`, `projectId`, `createdAt`, `updatedAt`
- **没有** `status`、`completedAt`、`trashedAt` 等状态字段
- 关系：`project`（onDelete: Cascade）、`tasks`（Task.headingId → onDelete: SetNull）

### 现有的"完成 / 归档"机制（Project & Task）
- Project 和 Task 都有 `status: ACTIVE | COMPLETED` + `completedAt`
- **Logbook** 视图 = 已完成条目的集合（status=COMPLETED, trashedAt=null），按 completedAt 倒序
- 完成一个 Project 只设置 status/completedAt，不级联影响 tasks
- 完成一个 Task 只设置 status/completedAt

### 现有的删除机制
- **Trash（软删除）**：设置 `trashedAt`，可在 Trash 视图恢复或清空
- 删除 Heading（`ProjectHeadingsService.remove`）：将该 heading 下所有 task 设 `trashedAt`，然后**硬删除** heading 记录本身
- Project 删除：级联 trashed 所有下属 task

### 前端现状
- `ProjectHeadingRow`：拖拽手柄 + 标题（可编辑）+ 下拉菜单（"转换为项目"、"删除标题"含确认弹窗）
- `ProjectTaskLayout`：DnD 布局，heading 作为可排序容器，task 可在 heading 间拖动
- `ProjectCompletedTasks`：项目详情页底部的"已完成"折叠面板
- `ProjectDetail`：标题 + 进度环 + 备注 + 活跃任务区 + 已完成面板

## Decisions

- **归档语义 = 选项 C（级联完成）**：归档一个 heading = 把该 heading 下所有 ACTIVE task 标记为 COMPLETED，并把 heading 自身标记为 COMPLETED。
- **取消归档语义 = 选项 B（只恢复 heading）**：取消归档只把 heading 标记回 ACTIVE，不改变任何 task 状态。归档时被级联完成的 task 保持 COMPLETED。

## Requirements

- 归档操作（级联完成）：
  - 将目标 heading 标记为 COMPLETED（需为 ProjectHeading 新增状态字段）
  - 将该 heading 下所有 status=ACTIVE 的 task 标记为 COMPLETED，设置 completedAt
  - 已 COMPLETED 的 task 保持不变
- 归档后 heading 从项目活跃任务区消失
- 取消归档（恢复 heading 为 ACTIVE）：
  - 只把 heading 标记回 ACTIVE
  - **不改变任何 task 状态**（归档时被级联完成的 task 保持 COMPLETED）

## UI 展示方案（已确认）

- **复用现有「已完成」折叠面板**（`ProjectCompletedTasks`），不新增独立面板
- 已完成面板内的展示逻辑：
  - **归档的 heading**（status=COMPLETED）：作为分组标题行显示，标题行右侧有下拉菜单，菜单含「取消归档」操作。其下 COMPLETED task 按现有样式列出
  - **ACTIVE heading 下的已完成 task + 无 heading 的已完成 task**：扁平展示，不显示 heading 标题
- 取消归档入口：归档 heading 分组标题行的下拉菜单
- 取消归档后 heading 回到活跃任务区，其下 task 保持 COMPLETED（会出现在已完成面板扁平区）

## Acceptance Criteria

- [ ] ProjectHeading 新增 `status`（ACTIVE/COMPLETED）字段，默认 ACTIVE，含 Prisma 迁移
- [ ] `POST /project-headings/:id/archive` 接口：标记 heading 为 COMPLETED，并级联完成其下所有 ACTIVE task
- [ ] `POST /project-headings/:id/unarchive` 接口：标记 heading 为 ACTIVE，不改变任何 task 状态
- [ ] 归档后 heading 从项目活跃任务区（`ProjectTaskLayout`）消失
- [ ] 归档的 heading 在已完成面板内作为分组标题显示，其下 task 保留 heading 关联展示
- [ ] ACTIVE heading 下的已完成 task 和无 heading 的已完成 task 在已完成面板扁平展示
- [ ] 归档 heading 分组标题行有下拉菜单，含「取消归档」操作
- [ ] 取消归档后 heading 回到活跃任务区，其下 task 保持 COMPLETED
- [ ] `ProjectHeadingsService.findAll` 返回的 heading 需带 status 字段
- [ ] 前端 DTO（`ProjectHeadingResponseDto`）含 status 字段
- [ ] 归档/取消归档后正确刷新相关 query（headings、tasks、feed）
- [ ] i18n 文案补充（归档/取消归档等）
- [ ] 后端 + 前端测试覆盖归档、取消归档、级联完成、面板展示逻辑

## Open Questions

（无）