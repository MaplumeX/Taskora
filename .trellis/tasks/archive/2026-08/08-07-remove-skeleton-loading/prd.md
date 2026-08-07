# Remove skeleton loading design

## Goal

完全移除前端骨架屏（skeleton）loading 方案。Loading 期间不显示任何占位 UI，数据就绪后直接渲染实际内容。删除所有与骨架屏相关的组件、hook 和样式。

## Requirements

### 移除项

1. **`TaskListSkeleton` 组件** — `packages/frontend/src/components/task/TaskListSkeleton.tsx` 删除。
2. **`useDelayedLoading` hook** — `packages/frontend/src/lib/hooks/useDelayedLoading.ts` 删除。
3. **`.skeleton` CSS 类** — `packages/frontend/src/index.css` 中的 `.skeleton` 和 `.skeleton::after` 规则及 `shimmer` 动画定义删除。
4. **`Tags.tsx` 内联骨架** — `packages/frontend/src/pages/Tags.tsx` 中 `isLoading` 分支内的内联骨架 DOM 删除。

### 页面 loading 行为改写

以下 11 个页面需要改写 loading 分支，loading 期间渲染 `null`（即不显示占位内容）：

- `pages/Today.tsx`
- `pages/Inbox.tsx`
- `pages/Upcoming.tsx`
- `pages/Anytime.tsx`
- `pages/Someday.tsx`
- `pages/Logbook.tsx`
- `pages/Trash.tsx`
- `pages/TagDetail.tsx`
- `pages/ProjectDetail.tsx`（loading 条件为 `isLoading || headingsLoading`）
- `pages/AreaDetail.tsx`
- `pages/Tags.tsx`

改写模式（以 Today 为例）：

```tsx
// before
const showSkeleton = useDelayedLoading(isLoading);
{showSkeleton ? (
  <TaskListSkeleton />
) : isError ? (
  <p>...</p>
) : (
  <FeedListView ... />
)}

// after
{isLoading ? null : isError ? (
  <p>...</p>
) : (
  <FeedListView ... />
)}
```

注意：
- 移除 `useDelayedLoading` 的 import 和调用。
- 移除 `TaskListSkeleton` 的 import。
- `isLoading` 直接来自各页面的 query hook（如 `useFeedQuery`、`useTasksQuery` 等），保留 `isLoading` 变量本身。
- `Tags.tsx` 的 `isLoading` 来自 `useTagsQuery()`，移除内联骨架后 loading 期间渲染 `null`（即 `isLoading ? null : <列表>`）。

### 不改动

- 各页面的 `isError` 分支和错误提示文案保持不变。
- 各页面的空列表提示（`emptyHint` / empty state）保持不变。
- query hook 本身不动。
- `useDelayedLoading` 删除后，确认无其他文件引用（grep 验证）。

## Acceptance Criteria

- [ ] `TaskListSkeleton.tsx` 文件已删除
- [ ] `useDelayedLoading.ts` 文件已删除
- [ ] `index.css` 中 `.skeleton`、`.skeleton::after`、`shimmer` 动画已删除
- [ ] 11 个页面均不再 import `TaskListSkeleton` 和 `useDelayedLoading`
- [ ] 11 个页面 loading 期间渲染 `null`（无占位 UI）
- [ ] `Tags.tsx` 内联骨架 DOM 已移除，loading 期间渲染 `null`
- [ ] `grep -rn "skeleton\|Skeleton\|useDelayedLoading" packages/frontend/src` 无残留（除可能的注释/无关词）
- [ ] 前端构建通过（`pnpm build` 或等价命令）
- [ ] 页面在 loading 和 error 状态下不崩溃

## Notes

- 本任务不引入替代 loading 方案（无 spinner、无骨架）。
- `useDelayedLoading` 的延迟防闪烁逻辑一并移除，不做保留。