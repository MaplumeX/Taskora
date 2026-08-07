# Add optimistic updates to high-frequency task operations

## Goal

让部署在服务器上的 Taskora 在高频写操作上获得"本地软件般即时响应"的体验，消除"每个操作都要等网络往返才看到变化"的延迟感。

## Background

前端 (React + TanStack Query + Zustand) 绝大多数 mutation 使用"等服务器返回再刷新"的模式：
`mutationFn → onSuccess → invalidateQueries → 重新拉取 → UI 更新`。

已实现乐观更新的只有 `useReorderTasks` / `useReorderProjects` / `useReorderAreas`（拖拽排序）和 `useCreateProject` / `useCreateArea`（onSuccess 里 setQueryData，部分乐观）。

所有 complete / uncomplete / update / create / delete / restore 仍走纯 `onSuccess → invalidate` 模式，网络延迟下用户会明显感知等待。

## 已确认事实（代码证据）

- 涉及 hook 文件：
  - `packages/frontend/src/lib/hooks/useTasks.ts`（Task + Subtask，最大改造面）
  - `packages/frontend/src/lib/hooks/useProjects.ts`
  - `packages/frontend/src/lib/hooks/useAreas.ts`
  - `packages/frontend/src/lib/hooks/useTags.ts`
  - `packages/frontend/src/lib/hooks/useFeed.ts`（仅 `useEmptyTrash`）
- 乐观更新模板：`useReorderTasks`（`onMutate` cancel + setQueriesData + `onError` 回滚 + `onSettled` 同步），改造参考。
- Query key 形状：
  - Task 列表 `['tasks', params]`（`taskKeys.list(params)` / `taskKeys.all === ['tasks']`），详情 `['task', id]`。
  - Project 列表 `['projects']`，详情 `['project', id]`。
  - Area 列表 `['areas']`，详情 `['area', id]`。
  - Tag 列表 `['tags']`，详情 `['tag', id]`。
  - Feed `['feed', view]`。
- 列表查询有多个 params 变体（按 view / projectId / tagId 等过滤），乐观更新需用 `setQueriesData({ queryKey: ['tasks'] })` 覆盖所有 `['tasks']` 前缀缓存。
- DTO 字段已知（`TaskResponseDto`、`UpdateTaskDto`、`CreateTaskDto`、`SubtaskResponseDto`、`UpdateSubtaskDto`、`CreateSubtaskDto`、`ProjectResponseDto`、`AreaResponseDto`、`TagResponseDto`），可在 `onMutate` 中据此推算预期值。
- `TaskItem.tsx` 的勾选已有 350ms 退出动画 + `setExiting`，乐观更新与之兼容。
- 测试设施：vitest + @testing-library/react，hook 测试用 `renderHook` + 自定义 `createWrapper()`（提供 `QueryClientProvider`，`retry: false`）。已有 `useAreas.test.ts` / `useProjectHeadings.test.ts` 可作模板。

## Requirements

- R1 为高频写操作增加乐观更新（`onMutate` 先写缓存 → `onError` 回滚 → `onSettled` 同步真值），UI 在请求发出后立即反映预期变化。
- R2 失败时回滚到服务器确认前的状态，不留下与服务器不一致的本地态。
- R3 乐观更新覆盖所有受影响的 query key（列表多个过滤变体、详情、feed）。
- R4 保留现有交互行为（勾选退出动画、toast 错误提示、自动聚焦编辑等）。
- R5 仅前端改造，不改后端 API 契约。
- R6 范围：Task + Subtask + Project + Area + Tag 一次性全改（用户已选 B）。

## Acceptance Criteria

- [ ] Task 勾选完成 / 取消完成：点击后复选框立即切换状态，无需等待网络；失败时回滚并提示。
- [ ] Task 编辑标题 / 日期 / 备注 / 标签：提交后 UI 立即显示新值。
- [ ] Task 新建：提交后列表立即出现新条目；服务器返回后用真值替换。
- [ ] Task 删除：点击后立即从列表移除；失败时恢复并提示。
- [ ] Subtask 创建 / 更新 / 完成 / 取消完成 / 删除：同上即时响应。
- [ ] Project 创建 / 更新 / 完成 / 取消完成 / 删除 / 恢复：同上即时响应。
- [ ] Area 创建 / 更新 / 删除：同上即时响应。
- [ ] Tag 创建 / 更新 / 删除：同上即时响应。
- [ ] 拖拽排序：保持已有乐观更新行为不回归。
- [ ] 错误场景（断网 / 5xx）：本地状态回滚，toast 提示，不出现脏数据。
- [ ] 现有前端单测通过；新增/更新的乐观更新行为有测试覆盖。

## Out of Scope

- 后端接口变更、数据库索引优化、查询性能调优（独立任务）。
- 引入新的全局状态库或重构现有 TanStack Query 架构。
- 网络层 / 资源加载（JS/CSS/图片）性能优化。
- 离线模式 / 请求队列 / 断网重放（复杂度高，单独立项）。