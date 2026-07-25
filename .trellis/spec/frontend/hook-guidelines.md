# Hook Guidelines

> How hooks are used in this project.

---

## Overview

- 数据获取：TanStack Query v5
- 客户端状态：Zustand
- 自定义 hooks 在 `src/lib/hooks/`

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

### Mutation Hooks

```typescript
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskDto) => createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

// 多参数用对象解构
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => updateTask(id, data),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

---

## Data Fetching

- 服务端数据全部通过 TanStack Query
- 当前未显式配置 `staleTime` / `retry` / `refetchOnWindowFocus`，使用 TanStack Query 默认值（staleTime=0、retry=3、refetchOnWindowFocus=true）
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

### 变更后忘记 invalidate 相关 query

**Symptom**：创建/更新/删除任务后列表不刷新

**Fix**：所有 mutation 的 `onSuccess` 必须 invalidate 对应 query。
---

## Reorder Mutation（乐观更新模式）

拖拽排序的 `useReorderXxx` mutation 使用半乐观更新：`onMutate` 即时重排缓存，`onError`/`onSettled` invalidate 拉取最新。

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
