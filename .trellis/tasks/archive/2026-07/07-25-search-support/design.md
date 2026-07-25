# Design — Task search support

## Architecture

复用现有 `GET /tasks` 端点与 `TasksService.findAll`，在 `TaskQueryDto` 新增 `q?: string` 查询参数，在 service 的 `findAll` 中新增 `q` 分支构建 `contains` 条件。前端在 `AppShell` 顶部新增 `SearchBar` 组件，去抖后调用现有 `getTasks({ q })`。

不新增独立搜索端点、不新增独立 service 方法——`q` 与现有筛选条件正交，复用 `findAll` 的 `where` 组合逻辑最简。

## Data Flow

```
用户输入 → SearchBar(去抖 300ms) → useTasksQuery({ q }) → apiClient.get('/tasks', { params: { q } })
→ TasksController.findAll → TasksService.findAll(userId, { q })
→ Prisma where: { userId, OR: [{ title: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }], status: ACTIVE }
→ 结果 → 复用 TaskResponseDto → TaskListView 渲染
```

## Contracts

### Backend DTO 变更（`packages/shared/src/dtos/task.dto.ts` + `packages/backend/src/tasks/dto/tasks.dto.ts`）

`TaskQueryDto` 新增：
```typescript
@IsOptional()
@IsString()
q?: string;
```

`TaskQuery`（前端 `tasks.api.ts`）新增 `q?: string`。

### Service 行为（`TasksService.findAll`）

在现有 `where: Prisma.TaskWhereInput = { userId }` 之后，追加 `q` 分支：
```typescript
if (query.q) {
  where.OR = [
    { title: { contains: query.q, mode: 'insensitive' } },
    { notes: { contains: query.q, mode: 'insensitive' } },
  ];
}
```

`q` 分支的默认 status 处理：
- 当 `q` 存在且未传 `view` 且未传 `completed=true` 时：默认 `status = ACTIVE`（不覆盖显式 `completed` 请求）。
- "包含已完成"开关：前端传 `completed=true`，沿用现有 `findAll` 末尾的 `if (!query.completed)` 分支逻辑即可（无需新代码）。但现有逻辑里 `completed=true` 时不设 status 约束，会包含 TRASHED——需在 `q` 模式下显式约束 `status` 为 `{ in: [ACTIVE, COMPLETED] }` 以排除 TRASHED。

结论：`q` 模式下的 status 逻辑：
```typescript
if (query.q) {
  where.OR = [ /* contains title/notes */ ];
}
// q 模式下 status 默认 ACTIVE，开启 completed 时为 [ACTIVE, COMPLETED]，始终排除 TRASHED
if (query.q && !query.view) {
  where.status = query.completed
    ? { in: [TaskStatus.ACTIVE, TaskStatus.COMPLETED] }
    : TaskStatus.ACTIVE;
}
```

注意：`q` 与 `view` 同时存在时以 `view` 的 status 逻辑为准（`view` 分支已设 status），此时 `q` 仅作为额外的 `OR` 条件叠加。这种组合虽然可能，但非主流程，保留原有 `view` 语义即可。

### 前端组件

新增文件：
- `packages/frontend/src/components/search/SearchBar.tsx` — 搜索输入框 + 快捷键 + 去抖 + "包含已完成"开关 + 结果区。
- `packages/frontend/src/lib/hooks/useDebouncedValue.ts` — 通用去抖 hook（若不存在）。

修改文件：
- `packages/frontend/src/components/layout/AppShell.tsx` — 在 `MainContent` 上方插入 `SearchBar`。
- `packages/frontend/src/components/layout/MainContent.tsx` — 或改在 MainContent 内部顶部放置 SearchBar，取决于布局层级。推荐放 AppShell 中，使搜索框固定在顶部不随页面滚动。
- `packages/frontend/src/lib/api/tasks.api.ts` — `TaskQuery` 新增 `q?: string`。
- `packages/frontend/src/lib/hooks/useTasks.ts` — 无需修改（`useTasksQuery` 已透传 `TaskQuery`）。

### SearchBar 交互设计

- `SearchBar` 自带内部 state：`query`（输入值）、`debouncedQuery`（去抖后）、`includeCompleted`（boolean，默认 false）。
- 当 `debouncedQuery` 非空时：`useTasksQuery({ q: debouncedQuery, completed: includeCompleted })` 取结果，渲染 `TaskListView`。
- 当 `debouncedQuery` 为空时：不发请求、不渲染结果区。
- 快捷键：全局监听 `Cmd/Ctrl+K` → `inputRef.focus()` + `select()`；输入框内 `Esc` → 清空 `query` + `blur()`。
- 结果区位于搜索框下方，用 `ScrollArea` 包裹，最大高度限定（如 `max-h-[60vh]`），不撑开整个布局。
- 搜索进行中显示"搜索中…"；无结果显示"未找到匹配的任务"。

### 布局放置

`AppShell` 改为：
```tsx
<div className="flex h-screen w-full">
  <Sidebar />
  <div className="flex h-screen flex-1 flex-col">
    <SearchBar />
    <MainContent />
  </div>
</div>
```
`MainContent` 保持原 `overflow-y-auto`，SearchBar 固定在顶部。

## Compatibility & Migration

- 无数据库 schema 变更（不新增字段、不新增索引）。
- `q` 为可选参数，完全向后兼容。
- 现有 `view` 查询行为不变。

## Trade-offs

- **复用 `findAll` vs 独立 `search` 方法**：选复用。`q` 仅是 `where` 的额外 `OR` 条件，与现有筛选正交；独立方法会重复排序/分页/include 逻辑。
- **`contains` vs FTS**：选 `contains`。数据量未到 FTS 必要规模，简单模糊查询够用；后续可升级。
- **搜索框顶部固定 vs 浮层 Dialog**：选顶部固定内联。比 Dialog 更轻量，不打断当前上下文；如未来需更强聚焦体验可升级为 Command Palette 风格。

## Rollback

纯增量改动，回滚即移除 `SearchBar` 组件并还原 `AppShell`/DTO 中的 `q` 字段。无数据迁移。