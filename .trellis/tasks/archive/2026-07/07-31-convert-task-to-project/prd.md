# PRD: Convert task to project

## 背景

Taskora 中 Task 和 Project 是两个独立但字段高度重叠的实体（都有 title/notes/scheduledDate/dueDate/bucket/scheduledType/status/tags/areaId 等）。用户在拆解任务时，常发现某个任务实际上是一个需要多步骤管理的"项目"。目前没有从任务转项目的入口，用户只能手动新建项目再重建内容。

## 目标

在任务右键菜单中提供"转换为项目"操作，将任务条目原地转换为项目，保留其全部数据与子结构。

## 需求

### 功能需求

1. **触发入口**：任务右键菜单（`TaskContextMenu`）新增"转换为项目"项，位于删除项之前；仅在默认（非 trash）变体下显示。
2. **转换语义（1A）**：原任务被删除（硬删除），其内容成为一个新项目。原任务不再以任务形式存在（不进入废纸篓）。
3. **字段迁移**：任务的以下字段平移到新项目：
   - 标量：`title`、`notes`、`scheduledDate`、`dueDate`、`scheduledType`、`status`、`completedAt`、`trashedAt`
   - `areaId`：任务自带 areaId 优先；任务为 null 时继承原所属 project 的 areaId
   - `bucket`：`TaskBucket` → `ProjectBucket`（枚举值同名：INBOX/ANYTIME/SCHEDULED）
   - `sortOrder`：取当前用户项目 max(sortOrder)+1，不沿用任务原值
4. **关联迁移**：
   - 标签：任务的 `TaskTag` 全部迁移为新项目的 `ProjectTag`
   - 子任务：原任务的所有后代任务（按 `parentId` 递归）迁移到新项目下——`projectId` 置为新项目 id、`headingId` 清空（新项目无 heading）；直接子节点 `parentId` 置空（成为新项目的顶层任务），更深层后代保留其 `parentId` 链以维持原有层级。
5. **适用范围**：任何任务（顶层任务、子任务、归属项目的任务、归属区域的任务）均可转换，不限制层级。
6. **数据隔离**：仅允许操作当前用户自己的任务（`findFirst` 带 `userId`）。
7. **失败反馈**：转换失败时 toast 报错，不破坏数据（事务回滚）。

### 非功能需求

- 转换必须在单个数据库事务内完成，保证原子性。
- 后端遵循现有 service 分层与 userId 隔离规范。
- 前端类型从 `@taskora/shared` 引用，不在前端重复定义 DTO。
- i18n：新增 key 需同时提供 zh / en。

## 验收标准

- [ ] 右键任务可见"转换为项目"菜单项；trash 变体下不显示。
- [ ] 点击后任务消失，项目列表出现新项目，名称/备注/日期/标签/状态与原任务一致。
- [ ] 原任务自身无 areaId 但所属项目有 areaId 时，新项目继承该区域归属。
- [ ] 原任务的子任务出现在新项目下，层级结构保留（孙辈仍挂在子辈下），heading 归属被清除。
- [ ] 原任务行被硬删除（在废纸篓 feed 中不再出现）。
- [ ] 跨用户隔离：无法转换他人任务（404）。
- [ ] 转换失败时不产生部分写入（事务回滚）。
- [ ] `pnpm -w lint && pnpm -w typecheck` 通过。

## 范围外

- 项目转任务（反向）。
- 批量转换多个任务。
- 转换时的二次确认弹窗（如需要可在 review 时再加）。
