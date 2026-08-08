# Implement: Trashed project detail page

## Checklist

### 1. 新增 `useProjectQuery` hook
- [ ] `packages/frontend/src/lib/hooks/useProjects.ts`：新增 `useProjectQuery(id, options?)` hook，`queryKey: projectKeys.detail(id)`，`queryFn: getProject`，`enabled: !!id && options?.enabled`。

### 2. `ProjectDetail.tsx` 取数改造
- [ ] 引入 `useProjectQuery`。
- [ ] `foundInList = projects.find((p) => p.id === id)`；`useProjectQuery(id ?? '', { enabled: !foundInList })`。
- [ ] `project = foundInList ?? detail`。
- [ ] 兜底：`project` 为 undefined 且 `detailLoading` 为 false 且 `detailError` 为 true → 顶部显示加载失败提示（复用 `t('common:loadFailed')`），其余结构保持但用 `project ?` 守卫。

### 3. `ProjectMoreMenu` variant 透传
- [ ] `ProjectDetail.tsx`：计算 `trashed = project?.trashedAt != null`，传 `variant={trashed ? 'trash' : 'default'}` 给 `<ProjectMoreMenu>`。

### 4. 验证
- [ ] `pnpm -r run typecheck` 通过。
- [ ] `pnpm lint` 通过。

## Validation Commands

```bash
pnpm -r run typecheck
pnpm lint
```

## Review Gates

- 改动后人工验证：在废纸篓点击 trashed 项目，详情页显示真实标题/进度环/备注/任务列表，标题可编辑，进度环可点完成，More 菜单末项为「恢复」。
- 非 trashed 项目详情页回归：标题编辑、More 菜单末项「删除」、完成任务均正常。

## Rollback

改动集中在 `useProjects.ts`（新增 hook）和 `ProjectDetail.tsx`（取数 + variant）。回滚即还原这两个文件至本任务前状态。