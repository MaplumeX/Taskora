# 项目标题分组

## Goal

在项目详情页加入类似 Things 3 的标题分组（Heading），让用户能够按阶段或主题拆分长任务列表，并通过直观的拖拽交互持续整理项目。

## Background

- 当前项目详情页只查询项目直属任务，并通过通用 `TaskListView` 展示，不存在标题分组实体或字段（`packages/frontend/src/pages/ProjectDetail.tsx`）。
- 当前任务仅有全局 `sortOrder`、`projectId` 等字段，没有标题归属字段（`packages/backend/prisma/schema.prisma`）。
- 当前项目任务支持基于任务 ID 列表的拖拽排序，但不支持跨分组移动（`packages/frontend/src/components/task/TaskList.tsx`、`packages/backend/src/tasks/tasks.service.ts`）。
- 当前项目页底栏只能创建任务；创建后会直接展开新任务（`packages/frontend/src/components/layout/ContentBottomBar.tsx`）。
- Heading 是项目内部的任务组织结构，不是用于归类项目的区域（Area）。

## Requirements

### R1 — Heading 生命周期

- Heading 只属于一个项目，不能脱离项目独立存在。
- 用户可以在项目详情页创建、重命名和删除 Heading。
- 项目页底部工具栏提供仅在项目详情页显示的独立“新建标题”按钮。
- 新建 Heading 追加到全部现有 Heading 的末尾，并立即进入标题编辑状态。
- 空 Heading 可以保留并展示，刷新后不会丢失。

### R2 — 列表布局

- 未分组的顶层任务显示在全部 Heading 之前，构成无标题的顶部区块。
- 在项目页直接创建的新任务默认进入顶部未分组区。
- 每个 Heading 显示自己的顶层任务；现有子任务继续沿用任务详情内的层级行为，不作为 Heading 的直接成员。
- Heading 及任务的视觉层级必须清楚，Heading 不得表现得像可完成的普通任务。

### R3 — 拖拽整理

- 用户可以上下拖拽 Heading；移动 Heading 时，其下任务作为一个整体随 Heading 移动。
- 用户可以在未分组区、同一 Heading 内及不同 Heading 之间拖拽顶层任务。
- Heading 顺序、任务组内顺序及任务归属必须持久化，刷新后保持一致。
- 拖拽失败时界面必须回到服务端确认的布局，并提示操作失败。

### R4 — 删除语义

- 删除 Heading 前显示明确的二次确认，说明其下任务也会被删除。
- 确认后 Heading 被删除，其直接成员任务及这些任务的所有后代一起进入废纸篓。
- 从废纸篓恢复这些任务时，由于原 Heading 已不存在，恢复后的顶层任务进入项目顶部未分组区。
- 删除整个项目仍沿用现有软删除/恢复语义；恢复项目后原有 Heading 与归组关系保持不变。

### R5 — 隔离、兼容与本地化

- 所有 Heading 查询和写入必须校验当前用户及所属项目，不能访问其他用户的数据。
- Heading 只影响项目详情页；Area、Today、Anytime、Upcoming、Logbook、Trash、Tag 和搜索列表继续按现有方式展示任务。
- 新增的界面文案必须同时提供简体中文和英文，两个语言文件的 key 保持一致。
- 现有无 Heading 项目在迁移后必须继续正常展示，全部任务视为未分组。

## Acceptance Criteria

- [ ] AC1（R1）：项目页底部出现独立“新建标题”按钮；点击后在 Heading 列表末尾创建空 Heading 并自动聚焦编辑。
- [ ] AC2（R1）：Heading 可重命名；空 Heading 刷新后仍然存在。
- [ ] AC3（R2）：未分组任务始终显示在全部 Heading 之前，新建项目任务默认进入未分组区。
- [ ] AC4（R2）：Heading 与普通任务视觉和交互角色清晰不同；子任务行为不变。
- [ ] AC5（R3）：Heading 可上下拖拽，且其成员任务随 Heading 整体移动。
- [ ] AC6（R3）：顶层任务可在未分组区、同组及跨 Heading 拖拽，刷新后顺序和归属不变。
- [ ] AC7（R3）：布局保存失败时不保留错误的乐观状态，并显示失败提示。
- [ ] AC8（R4）：删除 Heading 前显示包含级联影响的二次确认；确认后 Heading 消失，其任务及后代出现在废纸篓。
- [ ] AC9（R4）：恢复由 Heading 删除带入废纸篓的任务后，顶层任务出现在原项目的未分组区。
- [ ] AC10（R4）：软删除并恢复整个项目后，Heading、Heading 顺序和任务归组保持不变。
- [ ] AC11（R5）：无 Heading 的已有项目无需手工迁移即可继续使用，其他任务列表行为不变。
- [ ] AC12（R5）：跨用户访问或提交不属于当前项目的 Heading/任务布局会被拒绝。
- [ ] AC13（R5）：中英文文案完整且 key 集合一致。
- [ ] AC14：根级 lint、typecheck 和 test 全部通过。

## Out of Scope

- 使用 Area 对项目进行分组。
- Heading 的归档、复制、转换为项目。
- 将整个 Heading 移动到另一个项目。
- 通过“移动”选择器或快速录入直接选择 Heading。
- 根据当前选中任务把新 Heading 插入列表中间。
- 批量选择任务并创建 Heading。
- 在项目以外的聚合列表中渲染 Heading。

## Technical Notes

- 该功能横跨数据库、共享 DTO、后端 API、前端数据层、拖拽组件和本地化，按复杂任务处理。
- Heading 删除采用“物理删除 Heading + 软删除成员任务”的组合语义，以兼容现有任务废纸篓；项目自身的软删除不删除 Heading。
- Heading 仅直接关联顶层任务，布局写入需要由后端原子校验并更新 Heading 顺序、任务归属和组内顺序。
