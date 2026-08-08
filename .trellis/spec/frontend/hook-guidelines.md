# Hook Guidelines

## Project heading query and mutation scope

Project heading query keys must include `projectId`:

```typescript
['project-headings', { projectId }]
```

Heading CRUD invalidates the affected project heading list and all task/feed
queries. Layout mutations apply the submitted heading order and task
`headingId`/`sortOrder` values to caches immediately, then invalidate on both
error and settlement so the server remains authoritative.

`useConvertProjectHeadingToProject(projectId)` invalidates the heading list,
tasks, and feed (via `invalidateProjectData`) plus the `['projects']` cache so
the newly created project shows up in the sidebar.

> How hooks are used in this project.

---

## Overview

- 数据获取：TanStack Query v5
- 客户端状态：Zustand（auth、跨组件 UI 态、主题等）
- 自定义 hooks 在 `src/lib/hooks/`（可委托 store 透传，作为稳定 API 供消费方使用）

---

## Custom Hook Patterns

### Query Hooks

```typescript
// useTasksQuery — 获取任务列表
export function useTasksQuery(params: TaskQueryParams) {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => tasksApi.getTasks(params),
  });
}

// useTaskQuery — 获取单个任务（含 children）
export function useTaskQuery(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getTask(id),
  });
}
```

### Mutation Hooks（乐观更新三段式）

所有高频 CRUD mutation（create / update / delete / complete / uncomplete / restore）使用乐观更新三段式：`onMutate`（cancel + snapshot + 写乐观值）→ `onError`（snapshot 回滚）→ `onSettled`（invalidate 同步真值）。UI 在请求发出后立即反映预期变化，失败时回滚，最终通过 invalidate 同步服务器真值。

```typescript
// 多参数用对象解构
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => updateTask(id, data),
    onMutate: async ({ id, data }) => {
      // 1. 取消进行中的查询，避免异步刷新覆盖乐观值
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      // 2. 快照列表缓存（用于 onError 回滚）
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all });
      // 3. 写入预期值（立即反映到 UI）
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },  // 前缀匹配所有 ['tasks', {...}] 变体
        (old) => old?.map((t) => (t.id === id ? { ...t, ...data } : t)),
      );
      // 详情缓存也同步
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      // 4. 失败：用 snapshot 回滚列表缓存
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: (_data, _error, { id }) => {
      // 5. 无论成败：invalidate 同步服务器真值
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
```

**关键设计**：
- `getQueriesData` 返回 `[key, data][]` 数组，`onError` 逐个 `setQueryData(key, data)` 恢复
- 列表多变体用 `setQueriesData`（前缀匹配），单条详情用 `setQueryData`（精确匹配）
- create 类用 `crypto.randomUUID()` 生成临时 id 写入缓存，`onSuccess` 拿到服务器真值后替换临时项
- toast 错误提示由组件层调用方在 `mutate` 的 `onError` 选项中处理，hook 层只负责缓存回滚

### 跨资源 invalidate 约定

当 mutation 改变的资源会影响其他资源缓存的派生字段时，`onSettled` 必须追加被影响资源的 invalidate。典型场景：task mutation 会改变 project 缓存中的 `taskTotalCount` / `taskCompletedCount` 聚合字段。

`useTasks.ts` 中所有可能改变项目 task 计数的 mutation（`useCreateTask` / `useUpdateTask` / `useDeleteTask` / `useCompleteTask` / `useUncompleteTask`）的 `onSettled` 必须追加：

```typescript
void queryClient.invalidateQueries({ queryKey: ['projects'] });
```

`useReorderTasks` 只改 `sortOrder`，不影响计数，不需追加。

---

## Data Fetching

- 服务端数据全部通过 TanStack Query
- 在 `main.tsx` 的 `QueryClient` 中配置了 `defaultOptions.queries`：`staleTime: 30_000`（30s）、`retry: 1`、`refetchOnWindowFocus: true`。与 TanStack Query 默认值（staleTime=0、retry=3）不同，避免过多 refetch。
- 若调用方需要懒加载，用 `enabled` 选项（如 `useTaskQuery` 的 `enabled: !!id`）

### Query Key 约定

```typescript
export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: TaskQuery) => ['tasks', params ?? {}] as const,
  detail: (id: string) => ['task', id] as const,
};
```

- `taskKeys` 工厂对象与 hook 定义在同一文件（`src/lib/hooks/useTasks.ts`），跨文件复用 key 时从此处 import，不硬编码字符串

### Invalidation 策略

- 创建/更新/删除任务 → `invalidateQueries({ queryKey: ['tasks'] })`
- 更新任务详情 → 同时 invalidate `['task', id]` 和 `['tasks']`
- 子任务操作 → invalidate 父任务 detail query

---

## Naming Conventions

- `useXxxQuery`：查询 hook
- `useCreateXxx` / `useUpdateXxx` / `useDeleteXxx`：变更 hook
- `useXxx`：其他（如 `useAuth`、`useLogout`）

---

## Common Mistakes

### 乐观更新遗漏 snapshot 回滚

**Symptom**：请求失败后本地状态与服务器不一致（脏数据）

**Cause**：`onMutate` 写了乐观值但 `onError` 没回滚，或 snapshot 为 undefined 时未做边界检查

**Fix**：onMutate 必须 `getQueriesData` 取快照并返回；onError 用快照逐个 `setQueryData` 恢复；onSettled 必须 invalidate 同步真值。三段缺一不可。

### 变更后忘记 invalidate 相关 query

**Symptom**：创建/更新/删除任务后列表不刷新

**Fix**：乐观更新 mutation 的 `onSettled` 必须 invalidate 对应 query（不是 `onSuccess`）。
---

## Reorder Mutation（半乐观更新模式）

拖拽排序的 `useReorderXxx` mutation 使用半乐观更新：`onMutate` 即时重排缓存，`onError`/`onSettled` invalidate 拉取最新。与 CRUD 三段式的区别：reorder 不做 snapshot 回滚（list 数据不大、refetch 快，复杂度匹配收益），CRUD 必须做 snapshot 回滚（脏数据危害更大）。

```typescript
export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTasks(orderedIds),
    onMutate: async (orderedIds) => {
      // 1. 取消进行中的查询，避免回写冲突
      await queryClient.cancelQueries({ queryKey: taskKeys.all });

      // 2. setQueriesData 批量更新所有匹配前缀的缓存
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },  // 匹配 ['tasks', ...] 所有 list 缓存
        (old) => {
          if (!old) return old;
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
          return [...old].sort((a, b) => {
            const ai = orderMap.get(a.id);
            const bi = orderMap.get(b.id);
            if (ai !== undefined && bi !== undefined) return ai - bi;
            return 0;  // 不在拖拽集合的任务保持原顺序
          });
        },
      );
    },
    onError: () => {
      // 失败：invalidate 触发 refetch 恢复
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onSettled: () => {
      // 完成：invalidate 拉取最新数据纠正可能的偏差
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

**关键设计**：
- `setQueriesData`（注意是复数 `Queries`）匹配所有以 `taskKeys.all` 为前缀的缓存（如 `['tasks', {view:'inbox'}]`、`['tasks', {view:'today'}]`），一次更新所有视图的缓存
- 只重排 `orderedIds` 中存在的任务，其他任务保持原顺序——与后端 `reorder` 只更新传入 ids 的行为一致
- `onError` 直接 invalidate 触发 refetch 而非手工保存 snapshot 回滚——list 数据不大、refetch 快，复杂度匹配收益
- **不**做严谨 snapshot 回滚（`onMutate` 返回 previous → `onError` 用 `setQueryData` 写回），因为 list query 多个缓存要逐个保存快照

### `setQueriesData` vs `setQueryData`

- `setQueryData({ queryKey: ['tasks'] })`：只命中**精确匹配**该 key 的缓存
- `setQueriesData({ queryKey: ['tasks'] })`：匹配**所有以该 key 为前缀**的缓存（`['tasks', {...}]`），适合 list query 有多组 params 的场景
