# Logbook — 技术设计

## 1. 架构决策

Logbook 是纯视图层功能，**不引入新数据模型、不新增端点**。完全复用现有 Task + completedAt + complete/uncomplete 端点。

### 1.1 后端改动范围

仅两处：
1. `TasksService.findAll` 的 view switch 增加 `case 'logbook'`
2. `TaskQueryDto.view` enum 增加 `'logbook'`

### 1.2 前端改动范围

1. 新增 `Logbook.tsx` 页面
2. `router.tsx` 加 `/logbook` 路由
3. `Sidebar.tsx` 加 Logbook nav item

## 2. 后端设计

### 2.1 TasksService.findAll 增加 logbook view

在现有 view switch 中追加：

```ts
case 'logbook': {
  where.status = TaskStatus.COMPLETED;
  // orderBy 已是 sortOrder asc + createdAt desc，Logbook 需要 completedAt desc
  // 用单独分支处理 orderBy
  break;
}
```

> 决策：Logbook 的 orderBy 需为 `completedAt desc`，与现有 `sortOrder asc, createdAt desc` 不同。需重构 findAll 的 orderBy：
>
> 在 findMany 调用前根据 view 决定 orderBy：
> ```ts
> const orderBy = query.view === 'logbook'
>   ? [{ completedAt: 'desc' as const }]
>   : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];
> ```

### 2.2 TaskQueryDto 扩展

```ts
@IsOptional()
@IsEnum(['inbox', 'today', 'upcoming', 'anytime', 'someday', 'trash', 'logbook'])
view?: 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';
```

### 2.3 shared 包

`TaskQueryDto`（shared interfaces 版本）的 view 类型也扩展加 `'logbook'`。

> 注意：shared 包有**两套 DTO**——class-validator 版（后端 `src/tasks/dto/tasks.dto.ts`）和 interface 版（shared `dtos/task.dto.ts`）。两套都需更新。这是现有代码的既定模式（见 archived task 03-frontend-core），保持一致。

## 3. 前端设计

### 3.1 Logbook 页面结构

`packages/frontend/src/pages/Logbook.tsx`:

```tsx
export default function Logbook() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'logbook' });
  // 复用 Upcoming.tsx 的分组模式：按 completedAt 日期 key 分组
  // 但用"今天 / 昨天 / 更早"语义分组而非精确日期
}
```

### 3.2 日期分组逻辑

参考 `Upcoming.tsx` 的 `grouped` useMemo 模式，但反向（按 completedAt 而非 dueDate）：

```ts
const grouped = React.useMemo(() => {
  const today = []; const yesterday = []; const earlier = [];
  for (const t of tasks) {
    if (!t.completedAt) continue;  // 防御性
    const d = new Date(t.completedAt);
    const diff = dayDiff(d, new Date());
    if (diff === 0) today.push(t);
    else if (diff === 1) yesterday.push(t);
    else earlier.push(t);
  }
  return { today, yesterday, earlier };
}, [tasks]);
```

`dayDiff` 工具函数放 `lib/utils/date.ts`（现有已有 `toDateKey`，可扩展）。

### 3.3 复用 TaskItem + TaskDetail

Logbook 页面复用 `TaskListView` 或直接 map `TaskItem`。TaskItem 需显示 completedAt（完成的任务显示完成时间而非 dueDate）。

> 决策：`TaskItem` 已有 `TaskDateBadge`，Logbook 中传 `completedAt` 作为 date 字段即可，或简单在 title 旁加灰色完成时间文字。MVP 用后者（不改 TaskItem 内部逻辑，在 Logbook 页面层处理）。

### 3.4 Sidebar 入口

在 `mainNav` 数组后、Projects 区前，加 Logbook 项：

```ts
const mainNav: NavItem[] = [
  ...,
  { to: '/logbook', label: 'Logbook', icon: Notebook },  // 或 CheckCircle
];
```

> 决策：Logbook 放在 mainNav 区（与 Inbox/Today 平级），而非 Trash 旁。Things3 中 Logbook 是一级视图。图标用 `Notebook`（lucide-react 已有）。

### 3.5 TaskDetail 复用 uncomplete

TaskDetail 现有逻辑：`completed ? uncompleteTask : completeTask`。Logbook 中打开的 task 都是 completed，按钮显示"取消完成"，点击调 uncomplete → status 变 ACTIVE → Logbook 列表刷新（TanStack Query invalidation）后该任务消失。**无需改 TaskDetail**。

## 4. 兼容性

- 纯新增 view 值，不影响现有 view 的查询逻辑
- Logbook 页面独立路由，不影响其他视图
- 不改 schema，无 migration

## 5. 风险

- **orderBy 重构**：现有 findAll 的 orderBy 是硬编码的，改为根据 view 动态决定时需确保不破坏其他 view 的排序。用局部变量 + 条件赋值，范围可控
- **TaskItem 完成时间显示**：现有 TaskItem 对已完成任务的展示可能不够直观（Things3 中 Logbook 任务有删除线 + 完成时间），需在页面层兜底