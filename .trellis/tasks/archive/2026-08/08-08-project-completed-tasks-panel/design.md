# Design: 项目详情页已完成任务区域

## Architecture & Boundaries

### 组件结构

```
ProjectDetail (页面)
├── 标题行（ProjectProgressRing + InlineTitleEdit + ProjectMoreMenu）
├── 备注 Textarea
├── ProjectTaskLayout（活跃任务区，DnD + heading 分组）
└── ProjectCompletedTasks（新增，已完成任务区）
    ├── 折叠条头（toggle 按钮 + 「已完成 (N)」 + 展开图标）
    └── 已完成任务列表（展开时渲染）
        └── TaskItem × N（折叠态，复用现有组件）
```

新建组件：`src/components/project/ProjectCompletedTasks.tsx`

### 数据流

```
ProjectCompletedTasks
  ├─ useProjectCompletedPrefs(projectId) → expanded: boolean, setExpanded
  ├─ useTasksQuery({ projectId, completed: true }) → tasks (ACTIVE + COMPLETED 混合)
  │    └─ 前端 filter: status === COMPLETED && trashedAt === null
  └─ useUncompleteTask() → toggleComplete(task)
```

### 持久化偏好 store

新建 `src/lib/stores/projectUiPrefs.store.ts`：

```typescript
interface ProjectUiPrefsState {
  // projectId -> 是否展开已完成区域
  completedPanelExpanded: Record<string, boolean>;
  setCompletedPanelExpanded: (projectId: string, expanded: boolean) => void;
}

export const useProjectUiPrefsStore = create<ProjectUiPrefsState>()(
  persist(
    (set) => ({
      completedPanelExpanded: {},
      setCompletedPanelExpanded: (projectId, expanded) =>
        set((state) => ({
          completedPanelExpanded: {
            ...state.completedPanelExpanded,
            [projectId]: expanded,
          },
        })),
    }),
    { name: 'taskora-project-ui-prefs' },
  ),
);
```

- localStorage key：`taskora-project-ui-prefs`（与 `taskora-auth` / `taskora-theme` / `taskora-lang` 同前缀约定）
- 按 `projectId` 存储独立偏好，每个项目独立记忆
- 默认值：`completedPanelExpanded[projectId]` 为 `undefined` 时按 `false`（收起）处理

### Query 策略

复用现有 `useTasksQuery`，传 `{ projectId, completed: true }`：

```typescript
const { data: mixedTasks = [], isLoading } = useTasksQuery({
  projectId,
  completed: true,
});
const completedTasks = mixedTasks.filter(
  (t) => t.status === 'COMPLETED' && t.trashedAt === null,
);
```

- QueryKey：`['tasks', { projectId, completed: true }]`，与活跃任务的 `['tasks', { projectId }]` 独立缓存
- `useCompleteTask` / `useUncompleteTask` 的 `onSettled` 已 `invalidateQueries({ queryKey: taskKeys.all })`（前缀 `['tasks']`），会自动刷新此 query
- `staleTime: 30_000`（全局默认）足够，无需额外配置

### 任务行渲染

复用 `TaskItem` 组件（折叠态）：

```tsx
<TaskItem
  task={task}
  onToggleComplete={() => uncompleteTask.mutate(task.id, {
    onError: () => toast.error(t('common:operationFailed')),
  })}
  // 不传 onRowClick → 不进入 selected/expanded 态
  // selectionState 默认 'idle'
/>
```

- 不包裹 `TaskContextMenu`（归档视图不需要右键菜单）
- 不传 `onRowClick`（不进入展开编辑态）
- `onToggleComplete` 调 `useUncompleteTask`（已完成 → 取消完成）

### 折叠条头交互

```tsx
<button
  onClick={() => setExpanded(projectId, !expanded)}
  className="flex w-full items-center gap-2 px-2 py-2 text-sm text-muted-foreground hover:bg-muted/40 rounded-md transition-colors"
  aria-expanded={expanded}
>
  <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
  <span>{t('project:completed')}</span>
  <span className="text-xs">{completedTasks.length}</span>
</button>
```

- 图标用 `ChevronRight`，展开时 `rotate-90` 朝下
- 文案：`project:completed`（新增 i18n key，zh「已完成」/ en「Completed」）
- 计数显示在标题右侧

## Compatibility & Migration

- 纯前端新增，无后端改动，无数据库迁移
- 无破坏性变更，现有功能不受影响
- localStorage key 为新增，不影响现有 `taskora-auth` / `taskora-theme` / `taskora-lang`

## Trade-offs

- **独立 query vs 复用活跃任务 query**：选择独立 query（`completed: true`），因为活跃任务 query 默认只返回 ACTIVE，若复用需改后端或前端全量拉取再过滤。独立 query 缓存隔离，刷新互不干扰
- **Zustand persist vs 纯 localStorage**：选择 Zustand persist，遵循 `state-management.md` 约定，与 `theme.store.ts` 模式一致，消费方用 hook 订阅自动重渲染
- **已完成区域不分组 vs 按 heading 分组**：选择不分组，已完成任务是归档视图，heading 分组对归档无意义，平铺 + `completedAt` 降序更符合 Logbook 风格

## Rollback

- 删除 `ProjectCompletedTasks.tsx`
- 从 `ProjectDetail.tsx` 移除引用
- 删除 `projectUiPrefs.store.ts`
- 删除 i18n key
- 无数据迁移需回滚