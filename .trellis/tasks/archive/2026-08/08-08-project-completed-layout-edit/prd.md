# PRD: 项目已完成区保留归档前分布与在位编辑

## Goal

项目详情页的"已完成"折叠区，归档后应保留归档前的结构分布（无分组的在上面，归档分组按原顺序在下面，分组内任务留在各自分组），且归档分组和已完成任务都能像未归档/未完成时那样在位编辑。拖拽排序不在本次范围内。

## Background

当前项目详情页分两块：
- `ProjectTaskLayout`（活动区）：展示 ACTIVE 分组 + 未完成任务，支持拖拽排序、分组编辑（改标题/转项目/删除/归档）、任务展开编辑。
- `ProjectCompletedTasks`（已完成折叠区）：展示 COMPLETED 任务 + 归档分组（COMPLETED 状态）。问题：
  1. **分布丢失**：归档分组被抽出来堆在折叠区顶部（按 heading 列表顺序），已完成的无分组任务被一股脑塞在底部，并且前端手动按 `completedAt desc` 重排已完成任务，覆盖了后端返回的 `sortOrder`。整体不再反映归档前的位置结构。
  2. **编辑能力缺失**：
     - 归档分组只有一个"取消归档"菜单项，不能改标题、转项目、删除。
     - 已完成任务用 `TaskItem` 渲染但未传 `onRowClick`，无法展开行编辑（改标题/notes/日期/标签/子任务），右键菜单也因未展开而功能受限。

### 已确认的技术事实（代码证据）

- 后端 `TasksService.findAll`（`packages/backend/src/tasks/tasks.service.ts:104`）：非 logbook 视图排序为 `sortOrder asc, createdAt desc`。`completed=true` 的项目详情查询走此分支，所以已完成任务已按归档前 sortOrder 返回，前端无需后端改动即可还原顺序。
- `ProjectHeadingsService.archive`（`project-headings.service.ts`）：归档只改 `status=COMPLETED, completedAt=now`，不动 `sortOrder`。所以归档分组仍保留原相对顺序。
- `ProjectHeadingsService.findAll`（`project-headings.service.ts`）：`includeArchived=true` 返回 ACTIVE + COMPLETED 全部分组，按 `sortOrder asc, createdAt asc` 排序。
- `ProjectCompletedTasks`（`packages/frontend/src/components/project/ProjectCompletedTasks.tsx`）：当前用 `useMemo` 按 `completedAt desc` 重排 completedTasks，并把分组/无分组任务分成两块独立渲染。
- `TaskItem`（`packages/frontend/src/components/task/TaskItem.tsx`）：支持 `selectionState='expanded'` 展开，但需要 `onRowClick` 回调驱动。`ProjectCompletedTasks` 未传 `onRowClick`。
- `ProjectHeadingRow`（`packages/frontend/src/components/project/ProjectHeadingRow.tsx`）：已有完整的分组编辑能力（改标题/转项目/归档/删除），但当前只在 `ProjectTaskLayout` 活动区使用。归档区分组用的是 `ProjectCompletedTasks` 内联的简化标题 + 仅有取消归档的菜单。

## Requirements

### R1: 已完成区分布还原归档前结构

已完成折叠区展开后，内容分布须与归档前活动区一致：
- 无分组的已完成任务在上面，按各自 `sortOrder` 顺序排列。
- 归档分组按 `sortOrder` 顺序排在无分组任务之后（与活动区分组在同一相对序列里，但归档分组统一在已完成区内）。
- 每个归档分组内的已完成任务留在该分组下，按 `sortOrder` 排列。

> 说明：由于活动区分组与归档区分组各自有独立 sortOrder 序列（归档时不动 sortOrder），"还原归档前结构"的可行精确语义是——在已完成区内，先列无分组已完成任务，再列归档分组（按 sortOrder），分组内任务按 sortOrder。这保留了归档前"无分组在上、分组在各自位置、分组内任务归属不变"的结构感，且无需后端改动。

### R2: 已完成任务在位编辑

已完成区里的任务，编辑能力须与活动区一致：
- 点任务行可展开 `TaskRowExpanded`，编辑标题、notes、日期、标签、子任务。
- 勾掉 checkbox 可取消完成（已有，保留）。
- 右键 `TaskContextMenu` 可用（删除/转项目等）。
- 展开行的选择/取消交互与活动区一致（点行展开、点空白收起、Esc 收起）。

### R3: 归档分组在位编辑

已完成区里的归档分组，编辑能力须与活动区分组一致：
- 改标题（内联编辑）。
- 转成项目。
- 删除分组（带确认弹窗，级联软删分组下任务）。
- 取消归档（已有，保留）。

### R4: 不支持拖拽排序

已完成区内不提供拖拽排序能力：
- 任务不可在分组间/无分组间拖动。
- 分组之间不可换序。
- 想调整顺序须先取消归档/取消完成回到活动区再排。

## Acceptance Criteria

- **AC1**：一个项目里，先有无分组任务 T1(已完成)、T2(已完成)，再有分组 H1(归档) 内含 T3(已完成)、T4(已完成)，再有分组 H2(归档，空)。展开已完成区后，从上到下依次为：T1、T2、H1 标题、T3、T4、H2 标题。顺序由 sortOrder 决定，不由 completedAt 决定。
- **AC2**：在已完成区点 T1 任务行，行展开为编辑态（标题输入框聚焦，`TaskRowExpanded` 可见），可改标题并保存生效。
- **AC3**：在已完成区点 H1 分组标题，可进入内联编辑改标题，保存生效。
- **AC4**：在已完成区 H1 的菜单里选"转成项目"，H1 及其任务从已完成区消失，侧边栏出现新项目。
- **AC5**：在已完成区 H1 的菜单里选"删除"，弹确认框，确认后 H1 及其下任务被软删，已完成区不再显示 H1。
- **AC6**：在已完成区 H1 的菜单里选"取消归档"，H1 变回活动区分组，其下任务变回未完成态（若之前是因归档被级联完成的），回到活动区。
- **AC7**：已完成区内尝试拖拽任务或分组，无任何排序变化（拖拽不可用或不触发）。
- **AC8**：归档分组的菜单项顺序与活动区分组菜单一致（转项目/归档项替换为取消归档/删除），视觉样式一致。
- **AC9**：`ProjectCompletedTasks` 的现有单元测试更新并通过新行为；新增覆盖 AC1 分布顺序、AC2 任务展开编辑、AC3 分组改标题 的测试。
- **AC10**：`pnpm lint` 与 `pnpm typecheck`（前端 + 后端）通过。

## Out of Scope

- 已完成区拖拽排序（R4 明确排除）。
- 后端 reorder 接口扩展支持 COMPLETED 状态。
- Logbook 视图的排序逻辑（保持 `completedAt desc` 不变）。
- 活动区 `ProjectTaskLayout` 的行为改动。
- 归档分组在已完成区内的折叠/展开子交互（每个分组默认展开显示其任务，与当前一致）。

## Key Decisions

- **D1**：已完成区分布用后端已返回的 `sortOrder` 还原，不改后端排序。前端去掉 `completedAt desc` 重排。
- **D2**：已完成区复用活动区的 `ProjectHeadingRow`（传归档态 variant 或通过 heading.status 判断）渲染归档分组，以获得完整编辑能力；不再用内联简化标题。
- **D3**：已完成区任务复用 `TaskItem` 并传入 `onRowClick` + 行选择逻辑（局部 selection state 或复用 `useTaskRowSelection`），使其可展开编辑。
- **D4**：已完成区不包在 `DndContext` 内，拖拽自然不生效。

## Risks / Deferred

- 归档分组用 `ProjectHeadingRow` 时，其拖拽手柄和"归档"菜单项需隐藏/替换为"取消归档"。需确认 `ProjectHeadingRow` 是否支持 variant 切换，可能需要小改该组件——在 design.md 评估。
- `useTaskRowSelection` 若是全局单例 store，已完成区与活动区可能共享 selection 状态导致互相干扰。需在 design.md 确认其作用域，必要时在已完成区用独立 selection state。