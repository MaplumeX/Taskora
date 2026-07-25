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
    mutationFn: tasksApi.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

---

## Data Fetching

- 服务端数据全部通过 TanStack Query
- `staleTime: 30_000`（30s 内不重新请求）
- `refetchOnWindowFocus: true`（回到应用刷新）
- `retry: 1`

### Query Key 约定

```typescript
const taskKeys = {
  all: ['tasks'],
  list: (params) => ['tasks', params],
  detail: (id) => ['task', id],
};
```

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