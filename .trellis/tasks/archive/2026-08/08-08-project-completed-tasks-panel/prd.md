# 项目详情页显示已完成任务区域

## Goal

在项目详情页（`ProjectDetail`）底部增加一个可折叠区域，展示该项目的已完成任务。用户可通过一个 toggle 按钮控制该区域的显示/隐藏，偏好持久化（刷新后保持）。已完成区域的任务支持取消完成（uncomplete），使任务回到上方活跃区。

## Background

- 项目详情页当前只展示活跃（ACTIVE）任务，已完成任务不可见，用户无法在项目上下文中回顾或恢复已完成任务
- 后端 `GET /tasks` 支持 `projectId + completed=true` 组合，返回 ACTIVE + COMPLETED 混合任务（`tasks.service.ts:90-100`），前端需过滤 `status === COMPLETED`
- 现有 `ProjectTaskLayout` 仅消费 ACTIVE 任务列表，已完成区域是独立的新区块，不参与 DnD 排序与 heading 分组

## Requirements

### 功能需求

- **R1 已完成区域位置**：位于 `ProjectTaskLayout`（活跃任务区）下方，作为项目详情页底部的独立区块
- **R2 折叠/展开按钮**：区域顶部有一个 toggle 按钮，显示「已完成 (N)」标题 + 计数 + 展开/收起指示图标。点击切换显示/隐藏
- **R3 持久化偏好**：展开/收起状态持久化到 localStorage，刷新页面或重进项目详情页后保持上次选择
- **R4 已完成任务列表**：展开时列出该项目的已完成任务，按 `completedAt` 降序（最近完成在前）。每行复用 `TaskItem` 组件（折叠态），展示标题、标签徽章、日期徽章
- **R5 取消完成**：已完成区域的任务行 checkbox 可点击，调用 `useUncompleteTask`，任务从已完成区消失并回到活跃区
- **R6 空状态**：项目无已完成任务时，不显示折叠按钮和区域（整块隐藏）
- **R7 加载/错误态**：已完成任务列表加载中不显示区域；加载失败时区域不显示（静默失败，不阻塞活跃任务区）

### 非功能需求

- **R8 i18n**：新增文案需同时在 `zh/` 和 `en/` 添加，key 集合保持一致
- **R9 样式**：遵循 Tailwind + shadcn/ui 约定，主题色走 CSS 变量，不硬编码颜色
- **R10 质量门**：`pnpm lint` + `pnpm typecheck` + `pnpm test` 全部通过

## Acceptance Criteria

- [ ] AC1 项目详情页底部出现「已完成 (N)」toggle 条，N 为该项目已完成任务数量
- [ ] AC2 点击 toggle 条展开/收起已完成任务列表，动画流畅
- [ ] AC3 刷新页面后，展开/收起状态与上次一致（持久化生效）
- [ ] AC4 展开时按 `completedAt` 降序列出已完成任务，每行可看到标题、标签徽章、日期徽章
- [ ] AC5 点击已完成任务行的 checkbox，任务从已完成区消失，活跃任务区出现该任务（uncomplete 生效）
- [ ] AC6 项目无已完成任务时，toggle 条和区域均不显示
- [ ] AC7 活跃任务区的 DnD 排序、heading 分组不受已完成区域影响
- [ ] AC8 `pnpm lint` + `pnpm typecheck` + `pnpm test` 通过
- [ ] AC9 zh/en 两语言下文案均正确显示

## Out of Scope

- 已完成区域不支持拖拽排序
- 已完成区域不支持 heading 分组（已完成任务忽略 heading 归属，平铺展示）
- 已完成区域不支持展开态编辑（`TaskItem` 仅用折叠态，不传 `onRowClick`）
- 已完成区域不支持右键菜单（不包裹 `TaskContextMenu`，保持归档视图简洁）
- 不修改后端 API（复用现有 `GET /tasks?projectId=&completed=true`）
- 不支持按完成日期分组（如 Logbook 的今天/昨天/更早），仅按 `completedAt` 降序平铺
- 持久化偏好不做跨项目共享（每个项目独立记忆）

## Key Decisions

- **持久化方案**：用 Zustand + `persist` 中间件新建 `projectUiPrefs.store.ts`，按 `projectId` 存储展开偏好。遵循 `state-management.md` 的「持久 UI 偏好 → store + persist」约定
- **数据获取**：新增 `useTasksQuery({ projectId, completed: true })` 调用，前端过滤 `status === COMPLETED`。与活跃任务列表的 query 独立（不同 queryKey）
- **任务行复用**：复用 `TaskItem` 组件（折叠态），传 `onToggleComplete` 调 `useUncompleteTask`，不传 `onRowClick`（不进入展开态）
- **组件归属**：新建 `ProjectCompletedTasks.tsx` 组件，由 `ProjectDetail` 在 `ProjectTaskLayout` 下方渲染

## Risks / Deferred

- **已删除（trashed）任务的过滤**：后端 `completed=true` 分支已排除 `trashedAt` 不为 null 的任务（`where.trashedAt = null`），无需前端额外处理
- **乐观更新一致性**：`useCompleteTask` / `useUncompleteTask` 的 `onSettled` 已 invalidate `['tasks']`（前缀匹配所有 list 变体），已完成区域的 query 会被自动刷新