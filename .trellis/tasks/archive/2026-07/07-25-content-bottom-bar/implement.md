# Implement — 内容区底栏

## 执行顺序

### Step 1: usePageTaskContext hook
- 新建 `packages/frontend/src/lib/hooks/usePageTaskContext.ts`
- 用 `useLocation` + `useParams` 解析路由，返回 `Partial<CreateTaskDto>`（scheduledType / scheduledDate / projectId）。
- 校验：`pnpm -F @taskora/frontend exec tsc --noEmit`。

### Step 2: useTaskRowSelection 改为 URL 派生 expandedId
- 改 `lib/hooks/useTaskRowSelection.ts`：`expandedId` 从 `useSearchParams().get('expand')` 派生；新增 `setExpandedId` 写 searchParams（`replace: true`）；`handleRowClick` / `handleBlankClick` 适配。
- `selectedId` 保持 `useState`。
- 校验：tsc 通过。

### Step 3: SearchModal 组件
- 新建 `components/search/SearchModal.tsx`：基于 `Dialog`，迁移旧 `SearchBar.tsx` 的输入/防抖/勾选/结果列表逻辑。
- props: `{ open: boolean; onOpenChange: (v:boolean)=>void }`。

### Step 4: ContentBottomBar 组件
- 新建 `components/layout/ContentBottomBar.tsx`：
  - 两个按钮（Search / Plus）。
  - 内置 `searchOpen` state + 渲染 `<SearchModal open={searchOpen} onOpenChange={setSearchOpen}>`。
  - Cmd/Ctrl+K → `setSearchOpen(true)`（全局 keydown，卸载时 removeEventListener）。
  - `handleAddTask`：读 `usePageTaskContext()`，调 `useCreateTask`，成功后 invalidate `['tasks']` 并 `setParams({ expand: created.id })`。
- 校验：tsc 通过。

### Step 5: TaskRowExpanded 自动聚焦标题
- 改 `components/task/TaskRowExpanded.tsx`：
  - 给标题 `<Input>` 加 `ref`。
  - `useEffect`：当 URL `expand`===task.id 且 `current.title === '新任务'` 时 `focus()`+`select()`。
- 校验：tsc 通过。

### Step 6: AppShell 布局替换
- 改 `components/layout/AppShell.tsx`：移除 `<SearchBar />` 与 import；在 `<MainContent />` 下方加 `<ContentBottomBar />`。

### Step 7: 移除各页面 QuickAddTask
- `pages/Inbox.tsx`、`pages/Today.tsx`、`pages/Anytime.tsx`、`pages/Someday.tsx`、`pages/ProjectDetail.tsx`：删除 `<QuickAddTask />` 渲染与 import。
- 删除 `components/task/QuickAddTask.tsx` 文件。
- 确认无残余 import（grep `QuickAddTask`、`SearchBar`）。

### Step 8: 质量检查
- `pnpm -F @taskora/frontend exec tsc --noEmit`
- `pnpm -F @taskora/frontend exec eslint src`
- 手动验证（结合 AC）：
  - 各页底部底栏可见；搜索模态框打开/防抖/勾选/Esc/Cmd+K。
  - 添加任务创建并展开+聚焦标题；Today/Someday/ProjectDetail 上下文正确。
  - 行内展开/折叠/勾选/删除/子任务交互无回归。

## 回滚点

- Step 2（useTaskRowSelection 改 URL）是行为变化核心，若展开交互回归可单独 revert。
- Step 6/7 为纯结构改动，可整体 revert。

## Review gates

- Step 2 完成后自测展开/折叠状态机仍正常（idle→selected→expanded→selected）。
- Step 8 全 AC 通过后方可进入 Phase 3。