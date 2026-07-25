# 技术设计：拖拽排序（任务/项目/区域）

## 1. 架构总览

```
┌─────────────── 前端 (React + dnd-kit) ───────────────┐
│  DndContext + SortableContext                         │
│     │ onDragEnd → arrayMove(ids)                      │
│     ▼                                                 │
│  useReorderXxx mutation                               │
│     │ onMutate: setQueryData 按新顺序写回（乐观）      │
│     │ onError:  setQueryData 回滚旧快照                │
│     │ onSettled: invalidate list query                │
│     ▼                                                 │
│  api.reorderXxx(orderedIds)                           │
└────────────────────────┬─────────────────────────────┘
                         │ POST /xxx/reorder { orderedIds }
┌─────────────── 后端 (NestJS + Prisma) ────────────────┐
│  Controller.reorder(userId, ReorderDto)               │
│     ▼                                                 │
│  Service.reorder(userId, orderedIds)                  │
│     │ 校验每个 id 属于该 userId（findFirst id+userId）│
│     │ $transaction(                                   │
│     │   orderedIds.map((id, i) =>                     │
│     │     updateMany({ where:{id,userId}, data:{sortOrder:i} })) │
│     │ )                                               │
└───────────────────────────────────────────────────────┘
```

## 2. 数据模型变更

### 2.1 Prisma schema 改动

`packages/backend/prisma/schema.prisma`：

```prisma
model Area {
  // ...原有字段
  sortOrder Int @default(0)
  @@index([userId])   // 新增：按用户查询时走索引
}

model Project {
  // ...原有字段
  sortOrder Int @default(0)
  @@index([userId])   // 新增
}
```

- `Task.sortOrder` 已存在，不改。
- 迁移名：`add_sort_order_to_project_and_area`
- 迁移后需对历史数据 backfill：把现有记录按 `createdAt desc` 现有顺序设置为连续的 0,1,2,...。迁移自动生成 SQL 只是 `ALTER TABLE ADD COLUMN sortOrder INT DEFAULT 0`，这个 default 0 让历史数据都是 0，理论上不影响排序（因为 secondary orderBy 是 `createdAt desc`，旧数据按 createdAt 排）。但若用户拖拽过一次后 sortOrder 被重写为连续值，未参与拖拽的记录仍是 0。这是可接受的——首次拖拽前同 sortOrder=0 下按 createdAt desc 排序。

### 2.2 seed 改动

`packages/backend/prisma/seed.ts`：为 Project / Area 记录设置连续 `sortOrder`（按创建顺序）。

## 3. 后端设计

### 3.1 Service.reorder 通用模式

以 `TasksService.reorder` 为例（Projects/Areas 同构）：

```typescript
async reorder(userId: string, orderedIds: string[]) {
  // 校验所有 id 属于该用户（越权防护，504→404）
  // 注意：不能逐个 findFirst（N 次查询），用 count + findMany 对齐
  const owned = await this.prisma.task.findMany({
    where: { id: { in: orderedIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((t) => t.id));
  if (ownedSet.size !== orderedIds.length) {
    throw new NotFoundException('Task not found');
  }

  await this.prisma.$transaction(
    orderedIds.map((id, index) =>
      this.prisma.task.updateMany({
        where: { id, userId },
        data: { sortOrder: index },
      }),
    ),
  );
}
```

**为什么用 `updateMany` 而不是 `update`**：`updateMany` 的 where 可以加 `userId`，符合 database-guidelines "所有业务查询必须包含 userId" 规范。`update` 仅按 `@id` 更新，无法加 userId 约束。

**为什么不用单条 updateMany 批量**：Prisma 的 `updateMany` 不支持不同的 data per row，只能逐个 id 写。N 条 update 在一个 `$transaction` 里保证原子性。N 通常 < 100，PostgreSQL 本地事务开销可忽略。

### 3.2 Controller

```typescript
@Post('reorder')
reorder(
  @Request() req: { user: { id: string } },
  @Body() dto: ReorderDto,
) {
  return this.tasksService.reorder(req.user.id, dto.orderedIds);
}
```

**路由顺序注意**：`@Post('reorder')` 必须声明在 `@Post(':id/restore')` 等 `:id` 参数路由之前，否则 `reorder` 被当作 `:id`。NestJS 路由按声明顺序匹配，把 `reorder` 放在 controller 第一个路由即可。同理 `@Patch('reorder')`（若用 PATCH）要早于 `@Patch(':id')`。

> 实际选用 `POST /tasks/reorder`（用 POST 而非 PATCH）：因为是"批量重排"动作而非"更新单个资源"，POST 更语义化，且与现有 `POST /tasks/:id/complete` 等动词风格保持一致。

### 3.3 DTO

后端 `dto/tasks.dto.ts` 等：

```typescript
export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
```

### 3.4 Project/Area create 时的初始 sortOrder

```typescript
async create(userId: string, dto: CreateProjectDto) {
  const max = await this.prisma.project.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return this.prisma.project.create({
    data: {
      ...,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
}
```

Task create 已有 sortOrder=0 default，但更一致的做法也加上 max+1。**决定**：本次只对 Project/Area 加，Task 保留默认 0（保持 minimal 改动；Task 新建总是出现在同视图列表底部因为 createdAt desc 作为 secondary sort）。若后续发现 Task 新建顺序问题再补。

> 实际上 Task 同 sortOrder=0 的新任务按 createdAt desc 排在最前——这会让刚创建的任务出现在顶部而非底部，与用户预期可能不符。但这是**既存行为**，拖拽功能不引入回归。若用户反馈创建应在底部，单独开任务处理。

## 4. shared DTO

### 4.1 改动

`packages/shared/src/dtos/project.dto.ts`：

```typescript
export interface ProjectResponseDto {
  id: string;
  title: string;
  notes: string | null;
  areaId: string | null;
  sortOrder: number;   // 新增
  createdAt: string;
  updatedAt: string;
}

export interface ReorderDto {        // 新增
  orderedIds: string[];
}
```

`packages/shared/src/dtos/area.dto.ts`：同理加 `sortOrder: number` + `ReorderDto` 接口。

> ReorderDto 在 project.dto.ts 与 area.dto.ts 各定义一份各自的同名 interface 也可以，但无所谓——结构相同。**决定**统一放在 `task.dto.ts` 一份，其他两个文件 re-export。实际更简洁：在 `dtos/reorder.dto.ts` 单独定义一份 ReorderDto，index 已 re-export。

**最终决定**：新建 `packages/shared/src/dtos/reorder.dto.ts`，里面只 export `ReorderDto`，被 index.ts 统一导出。task/project/area 各自的 dto 文件不动 ReorderDto 部分。

## 5. 前端设计

### 5.1 DnD 库选型

**选 dnd-kit**：
- 维护活跃，与 React 18 严格模式兼容
- 体积小（core ~15KB gzip）
- 内置可访问性（键盘拖拽）

**不选 react-beautiful-dnd**：
- 2023 年起官方停止维护
- React 18 严格模式下有副作用警告
- 不支持键盘拖拽（无 ARIA）

### 5.2 依赖

`packages/frontend/package.json` 新增：
```json
"@dnd-kit/core": "^6.x",
"@dnd-kit/sortable": "^8.x",
"@dnd-kit/utilities": "^3.x"
```

### 5.3 API 函数

```typescript
// tasks.api.ts
export function reorderTasks(orderedIds: string[]): Promise<void> {
  return apiClient.post('/tasks/reorder', { orderedIds }).then(() => undefined);
}

// projects.api.ts
export function reorderProjects(orderedIds: string[]): Promise<void> {
  return apiClient.post('/projects/reorder', { orderedIds }).then(() => undefined);
}

// areas.api.ts
export function reorderAreas(orderedIds: string[]): Promise<void> {
  return apiClient.post('/areas/reorder', { orderedIds }).then(() => undefined);
}
```

### 5.4 Mutation hook（乐观更新）

`useReorderTasks`：

```typescript
export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTasks(orderedIds),
    onMutate: async (orderedIds) => {
      // 取消进行中的 ['tasks'] 查询，避免回写冲突
      await queryClient.cancelQueries({ queryKey: taskKeys.all });

      // 对所有 ['tasks', params] 缓存做重排快照
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) => {
          if (!old) return old;
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
          // 只重排缓存里在 orderedIds 集合中的任务，保持未参与任务原位
          return [...old].sort((a, b) => {
            const ai = orderMap.get(a.id);
            const bi = orderMap.get(b.id);
            if (ai !== undefined && bi !== undefined) return ai - bi;
            return 0; // 不在拖拽集合的任务保持原顺序
          });
        },
      );
    },
    onError: () => {
      // 回滚：invalidate 重新拉取
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

**设计权衡**：
- `setQueriesData` 会命中所有以 `['tasks']` 为前缀的 list query 缓存（每个 view 后缀 params 不同），对所有缓存统一重排。
- `onError` 直接 invalidate 触发 refetch——比手工保存 snapshot 回滚更简单可靠，因为 list 数据本身不大、refetch 快。
- 这其实是"半乐观"：UI 即时更新；若失败则 refetch 恢复。**不**做严谨 snapshot 回滚（复杂度不匹配收益）。

`useReorderProjects` / `useReorderAreas` 同构，query key 用各自 `projectKeys.all` / `areaKeys.all`。

### 5.5 TaskList 改造

`TaskList.tsx` 新增 props：

```typescript
interface Props {
  tasks: TaskResponseDto[];
  // ...原有 props
  onReorder?: (orderedIds: string[]) => void;  // 新增
  sortable?: boolean;                            // 新增，默认 true
}
```

- `sortable` 默认 true，但允许 UpcomingSearchModal 等场景关闭
- 包裹层：

```tsx
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

export function TaskList({ tasks, onReorder, sortable = true, ... }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = topTasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    const reordered = arrayMove(ids, oldIndex, newIndex);
    onReorder?.(reordered);
  };

  const content = topTasks.map((task) => (
    <SortableTaskItem key={task.id} task={task} ... />
  ));

  if (!sortable) {
    return <div className="flex flex-col">{content}</div>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={topTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">{content}</div>
      </SortableContext>
    </DndContext>
  );
}
```

**关键约束**：
- `PointerSensor` 的 `activationConstraint: { distance: 5 }`：必须拖动 5px 才认为是拖拽，否则视为点击——这样不会误触发 `onRowClick` 状态机
- `closestCenter` 适合垂直列表
- `verticalListSortingStrategy` 性能好，适合长列表

### 5.6 SortableTaskItem 封装

在 TaskItem 之上包一层 `useSortable`（不污染 TaskItem 本身，便于复用）：

```tsx
function SortableTaskItem({ task, ...props }: TaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskItem task={task} {...props} />
    </div>
  );
}
```

**关注点**：
- `useSortable` 的 listeners 设在外层 div，整行可拖
- `attributes` 包含 `role="button"`、`tabIndex`、`aria-roledescription`（键盘可拖拽）
- `transform` 用 `CSS.Translate.toString` 而非 `Transform`，避免 transform 同时影响子元素动画（与现有 `.task-complete-anim` 不冲突）

### 5.7 TaskListView 衔接

`TaskListView.tsx` 接入 `useReorderTasks`：

```tsx
const reorderTasks = useReorderTasks();

// ...
<TaskList
  tasks={tasks}
  onReorder={(ids) => reorderTasks.mutate(ids)}
  ...
/>
```

**为什么 reorder 放在 TaskListView 而不是 TaskList**：TaskList 是纯展示组件（按既有 component-guidelines 风格），数据动作由 container（TaskListView）执行。保持职责分离。

### 5.8 Upcoming 隔离

`Upcoming.tsx` 自己渲染 `TaskItem`（未走 `TaskListView`），本次**不引入** DnD。它的 list 渲染保持原有 `<div>` + `.map` 结构，无改动。

### 5.9 Projects / Areas 页面改造

参考 TaskList 模式，`Projects.tsx`：

```tsx
const reorderProjects = useReorderProjects();
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

// 在列表分支：
<DndContext sensors={sensors} collisionDetection={closestCenter}
  onDragEnd={(e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    reorderProjects.mutate(reordered);
  }}>
  <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
    <div className="flex flex-col">
      {projects.map((p) => (
        <SortableProjectItem key={p.id} project={p} />
      ))}
    </div>
  </SortableContext>
</DndContext>
```

`SortableProjectItem` 同样用 `useSortable` 包 `ProjectItem`。

`Areas.tsx` 同构。

`AreaDetail.tsx` 内的项目子列表：同 Projects 模式，但只在该项目列表分支加 DnD（任务列表区直接用 `TaskListView`，自动支持）。

### 5.10 乐观更新的可重排性约束

`useReorderTasks.onMutate` 里只重排缓存里存在于 `orderedIds` 的任务，**未参与拖拽的任务保持原顺序**。这与后端 `reorder` 只更新传入 ids 的行为一致，避免把其他视图缓存的全量任务重排丢排序。

但有一个边界：如果用户在 Inbox 视图拖拽，缓存 key `['tasks', {view: 'inbox'}]` 内只有 inbox 任务，全部在 orderedIds 里——所以是全量重排。`['tasks', {view: 'today'}]` 缓存内任务可能在 inbox 的 orderedIds 里也可能不在；不在的保持原序，在的按新顺序重排。这是正确行为。

**已知小问题**：若 today 缓存里有两个任务不在 inbox 的 orderedIds 中，它们之间的相对顺序保持原样，这是期望的。但严格说它们的 sortOrder 没有更新，refetch 后顺序可能因后端 sortOrder 改变而错位。`onSettled` 的 invalidate 会纠正，时序窗口很短，可接受。

## 6. 兼容性与回滚

- 后端新增字段 `sortOrder` 有 default 0，不破坏既有查询
- Project/Area findAll 排序从 pure `createdAt desc` 改为 `sortOrder asc, createdAt desc`：旧数据全是 sortOrder=0，行为与原来一致（fallback 到 createdAt desc）
- Project/Area 新建走 max+1：首批数据 max=null → sortOrder=0，与 default 一致，不破坏
- Reorder API 是新端点，不影响既有 API
- 前端 DnD 在 `sortable=false` 或未传 `onReorder` 时退化为纯展示，向后兼容

**回滚**：若 DnD 出问题，前端回滚到无 DnD 版本即可，后端字段/API 都向后兼容（多出来的 sortOrder 字段不影响）。

## 7. 测试策略

### 7.1 后端
- `tasks.service.reorder.spec.ts`（或并入 existing test 文件）：mock prisma，验证 orderedIds 校验、事务调用
- `projects.service.spec.ts`：reorder + findAll 排序 + create max+1
- `areas.service.spec.ts`：同上
- 既有 e2e / spec 不破坏

### 7.2 前端
- 不新增 DnD 交互单测（dnd-kit 自身测试覆盖）
- 现有 `TaskCheckbox.test.tsx` 等不破坏
- typecheck + lint 通过

## 8. 待后续考虑

- spaced sortOrder（用大间隔值避免每次拖拽全量重写）——当前规模不需要
- 跨视图拖拽任务——独立大功能
- 子任务拖拽——本次范围外
- Tag / TagGroup 的 reorder UI——已有 sortOrder 字段，做 UI 即可，本次不做