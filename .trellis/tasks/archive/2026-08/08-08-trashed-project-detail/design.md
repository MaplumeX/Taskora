# Design: Trashed project detail page

## 问题

`ProjectDetail` 用 `useProjectsQuery()`（后端 `findAll`，`where: { trashedAt: null }`）取列表后 `.find()`。trashed 项目不在列表里 → `project === undefined` → 降级为空壳 UI。

后端 `findOne` / `GET /tasks?projectId=` 均不过滤 `trashedAt`，数据可得，差异仅在 `findAll`。

## 方案

详情页取数改为：**列表优先，未命中则按 id 单查**。

```
useProjectsQuery()  ──→  list.find(id)  ──hit──→  project（非 trashed 路径，回归不变）
                                  │
                                  miss
                                  ▼
useProjectQuery(id)  ──→  GET /projects/:id（findOne，不过滤 trashedAt）
                                  │
                                  ▼
                          project（含 trashed）
```

`useProjectQuery` 是已有 hook（`useProjects.ts` 里 `projectKeys.detail(id)` key 已定义），但当前未被详情页使用。`getProject` API 已存在（`projects.api.ts`）。

## 改动面

### 1. 新增 hook：`useProjectQuery`

`useProjects.ts` 已有 `projectKeys.detail(id)` 和 `getProject` API，但缺 `useProjectQuery` hook。新增：

```ts
export function useProjectQuery(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => getProject(id),
    enabled: !!id,
  });
}
```

### 2. `ProjectDetail.tsx` 取数改造

当前：
```ts
const { data: projects = [] } = useProjectsQuery();
const project = projects.find((p) => p.id === id);
```

改为：
```ts
const { data: projects = [] } = useProjectsQuery();
const foundInList = projects.find((p) => p.id === id);
const { data: detail, isLoading: detailLoading, isError: detailError } = useProjectQuery(id ?? '', {
  enabled: !foundInList,   // 列表命中就不单查
});
const project = foundInList ?? detail;
```

### 3. `ProjectMoreMenu` variant 透传

当前详情页 `<ProjectMoreMenu project={project} current={project} />` 未传 variant（默认 `'default'`）。

改为按 trashed 状态切换：
```ts
const trashed = project?.trashedAt !== null && project?.trashedAt !== undefined;
<ProjectMoreMenu project={project} current={project} variant={trashed ? 'trash' : 'default'} />
```

B2 方案下 More 菜单完整可用，末项 trashed 时显示「恢复」、非 trashed 时显示「删除」。

### 4. 兜底 UI（R4）

取数失败时显示提示而非空壳。`project` 为 undefined 且 `detailLoading` false 且 `detailError` true → 显示加载失败提示。

## 不改的部分

- `ProjectFeedRow` 点击跳转逻辑不动（B2 允许点开 trashed 项目，跳转正确）。
- 后端 `findAll` 不改（列表过滤 trashed 是对的，废纸篓只在 trash feed 展示）。
- `useDeleteProject.onMutate` 的 `removeProjectFromList` 不动。
- `useTasksQuery({ projectId })` 不动（后端不过滤 trashedAt，trashed 项目任务正常返回）。
- trashed task 详情展示不在本任务范围。

## 回归风险

- 非 trashed 项目：`foundInList` 命中，`useProjectQuery` 不启用，行为不变。
- 新增 `useProjectQuery` 调用需确保 `enabled` 条件正确，避免无谓请求。