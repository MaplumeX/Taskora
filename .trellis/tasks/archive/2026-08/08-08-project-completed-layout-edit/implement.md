# Implement Plan: 项目已完成区保留归档前分布与在位编辑

## 实现顺序

### Step 1: ProjectHeadingRow 支持归档态 variant

文件：`packages/frontend/src/components/project/ProjectHeadingRow.tsx`

- [ ] 引入 `HeadingStatus`（from `@taskora/shared`）和 `useUnarchiveProjectHeading`。
- [ ] 计算 `const archived = heading.status === HeadingStatus.COMPLETED`。
- [ ] 拖拽手柄按钮：`archived` 时不渲染（或渲染 null）。
- [ ] 菜单项：`archived` 时把"归档"项替换为"取消归档"项（`RotateCcw` 图标），调用 `useUnarchiveProjectHeading`；其余"转项目""删除"项保留。
- [ ] 其余编辑能力（标题内联编辑、转项目、删除确认弹窗）对两态共用，不动。

### Step 2: ProjectCompletedTasks 重构分布与编辑

文件：`packages/frontend/src/components/project/ProjectCompletedTasks.tsx`

- [ ] 移除 `completedTasks` 的 `completedAt desc` 排序 useMemo；改为保留后端返回顺序（仅做 filter）。
- [ ] 分布计算：`archivedHeadings`（按 sortOrder，allHeadings 过滤 COMPLETED）；`ungroupedTasks`（completedTasks 中 headingId 为空或不在 archivedHeadings 集合）；`groupedTasks`（headingId → tasks[]）。
- [ ] 引入 `useTaskRowSelection`，拿到 `selectedId / expandedId / handleRowClick / handleBlankClick`。
- [ ] 容器 div 加 `onClick={handleBlankClick}`。
- [ ] ungrouped tasks：渲染 `<TaskItem task onRowClick={() => handleRowClick(task.id)} selectionState={...} onToggleComplete={...} />`。
- [ ] archivedHeadings.map：渲染 `<section><ProjectHeadingRow heading={heading} />` + 其下 tasks（同上 TaskItem 传参）`</section>`。
- [ ] 移除内联简化分组标题块和它自带的 DropdownMenu/取消归档逻辑（已由 ProjectHeadingRow 接管）。
- [ ] 保留折叠区 header 按钮（"已完成 N"）和 `useProjectUiPrefsStore` 展开态。
- [ ] `totalCount` 计算保留（completedTasks.length + archivedHeadings.length）。

### Step 3: 更新单元测试

文件：`packages/frontend/src/components/project/ProjectCompletedTasks.test.tsx`

- [ ] mock 补充：`useTaskRowSelection`（或其依赖 store）、`useUpdateProjectHeading`、`useConvertProjectHeadingToProject`、`useDeleteProjectHeading`、`useArchiveProjectHeading`、`ProjectHeadingRow` 相关。
- [ ] 修正"分组 completed task + archived heading"测试：断言新的分布顺序（ungrouped 在上、archived heading 块在下）。
- [ ] 修正"取消归档菜单点击"测试：改从 `ProjectHeadingRow` 的菜单触发，断言 `useUnarchiveProjectHeading` 被调用。
- [ ] 新增：已完成任务点行展开编辑（断言 TaskRowExpanded 出现 / 标题输入框）。
- [ ] 新增：归档分组标题点击进入内联编辑。
- [ ] 修正排序测试：去掉 completedAt desc 断言，改为 sortOrder 顺序断言。

文件：`packages/frontend/src/components/project/ProjectHeadingRow.test.tsx`

- [ ] 新增归档态 variant 测试：渲染 COMPLETED heading，断言拖拽手柄不渲染、菜单含"取消归档"不含"归档"。
- [ ] 新增：点击"取消归档"调用 unarchive mutation。

### Step 4: 验证

- [ ] `pnpm --filter @taskora/frontend lint`
- [ ] `pnpm --filter @taskora/frontend typecheck`
- [ ] `pnpm --filter @taskora/frontend test --run`（ProjectCompletedTasks + ProjectHeadingRow）
- [ ] `pnpm --filter @taskora/backend lint && pnpm --filter @taskora/backend typecheck`（确认无回响，本任务不动后端）

## 风险点

- `ProjectHeadingRow` 测试现有 mock 结构（`vi.hoisted` + `vi.mock`）需扩展，注意 mock `useUnarchiveProjectHeading`。
- `TaskItem` 展开态依赖 `useTaskQuery`（detail 查询）和 `useUpdateTask` 等，`ProjectCompletedTasks.test.tsx` 已 mock 了这些（见现有 vi.mock 块），需确认 mock 完整。
- `TaskRowExpanded` 若有额外依赖（子任务 hooks），测试 mock 需覆盖——检查现有 mock 是否齐全，不全则补。

## 回滚点

每个 Step 独立可验证；Step 1-2 若合并后测试大面积红，可分别 revert。无数据迁移。