# 技术设计

## 改动总览

| 层 | 文件 | 改动 |
|---|---|---|
| shared DTO | `packages/shared/src/dtos/task.dto.ts` | `CreateTaskDto` 新增 `tagIds?: string[]` |
| 后端 DTO | `packages/backend/src/tasks/dto/tasks.dto.ts` | `CreateTaskDto` class 新增 `tagIds` 验证 |
| 后端 service | `packages/backend/src/tasks/tasks.service.ts` | `create()` 处理 `tagIds` + include tags 返回 |
| 前端 hook | `packages/frontend/src/lib/hooks/usePageTaskContext.ts` | 扩展返回类型 + 补 `/anytime`、`/areas/:id`、`/tags/:tagId` |
| 前端 UI | `packages/frontend/src/components/layout/ContentBottomBar.tsx` | `/upcoming`、`/logbook`、`/trash` 隐藏添加任务按钮 |

## 1. shared DTO — `CreateTaskDto` 新增 `tagIds`

`packages/shared/src/dtos/task.dto.ts`:

```ts
export interface CreateTaskDto {
  title: string;
  notes?: string;
  scheduledDate?: string;
  scheduledType?: ScheduledType;
  dueDate?: string;
  bucket?: TaskBucket;
  parentId?: string;
  projectId?: string;
  areaId?: string;
  tagIds?: string[];  // ← 新增
}
```

与 `UpdateTaskDto` 的 `tagIds` 语义一致：全量 set。

## 2. 后端 DTO — `CreateTaskDto` class 新增验证

`packages/backend/src/tasks/dto/tasks.dto.ts`:

```ts
export class CreateTaskDto {
  // ... 现有字段 ...

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
```

复用 `UpdateTaskDto.tagIds` 的验证装饰器组合。

## 3. 后端 service — `create()` 处理 tagIds

`packages/backend/src/tasks/tasks.service.ts` `create()`:

当前 `create()` 的 `prisma.task.create` data 块不包含 tags 关联，返回结果也不 include tags。

改动：
1. `prisma.task.create` 的 data 里，如果 `dto.tagIds` 有值且非空，用嵌套 `tags: { create: tagIds.map(tagId => ({ tagId })) }` 建关联。Prisma nested create 会自动处理 TaskTag 记录。
2. `create()` 加 `include: { tags: { include: { tag: true } } }`，返回前 map tags（与 `findOne`/`update` 保持一致：`tags: t.tags.map(tt => tt.tag)`）。

```ts
async create(userId: string, dto: CreateTaskDto) {
  // ... 现有逻辑（resolveBucket 等）不变 ...

  const created = await this.prisma.task.create({
    data: {
      title: dto.title,
      notes: dto.notes,
      scheduledDate,
      scheduledType,
      dueDate,
      bucket,
      userId,
      parentId: dto.parentId,
      projectId: dto.projectId,
      areaId: dto.areaId,
      ...(dto.tagIds?.length
        ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
        : {}),
    },
    include: { tags: { include: { tag: true } } },
  });
  return { ...created, tags: created.tags.map((tt) => tt.tag) };
}
```

> 不用 `$transaction` — 单个 `prisma.task.create` 带 nested create 已是原子的，不需要显式事务。
> `@@unique([taskId, tagId])` 约束在 create 时不会有冲突（新任务无既有关联）。

## 4. 前端 hook — `usePageTaskContext`

`packages/frontend/src/lib/hooks/usePageTaskContext.ts`:

### 返回类型

```ts
type PageTaskContext = Omit<Partial<CreateTaskDto>, 'title'>;
```

去掉 `title` 因为 `ContentBottomBar` 始终设 `title: ''`，页面上下文不应覆盖它。`Omit` 而非 `Pick` 保持前向兼容（`CreateTaskDto` 新增字段时自动包含）。

### 路由映射

```ts
import { useLocation, useParams } from 'react-router-dom';
import { ScheduledType, TaskBucket } from '@taskora/shared';
import type { CreateTaskDto } from '@taskora/shared';

type PageTaskContext = Omit<Partial<CreateTaskDto>, 'title'>;

export function usePageTaskContext(): PageTaskContext {
  const { pathname } = useLocation();
  const params = useParams<{ id: string; tagId: string }>();

  if (pathname === '/today') {
    return {
      scheduledType: ScheduledType.DATE,
      scheduledDate: new Date().toISOString(),
    };
  }

  if (pathname === '/someday') {
    return { scheduledType: ScheduledType.SOMEDAY };
  }

  if (pathname === '/anytime') {
    return { bucket: TaskBucket.ANYTIME };
  }

  if (pathname.startsWith('/projects/') && params.id) {
    return { projectId: params.id };
  }

  if (pathname.startsWith('/areas/') && params.id) {
    return { areaId: params.id };
  }

  if (pathname.startsWith('/tags/') && params.tagId) {
    return { tagIds: [params.tagId] };
  }

  return {};
}
```

> `/inbox` 命中默认 `return {}`，后端 resolveBucket 默认落 INBOX — 符合预期，无需特殊处理。
> `/upcoming`、`/logbook`、`/trash` 也命中 `return {}`，但按钮会被隐藏（见下节），ctx 不会被使用。

## 5. 前端 UI — 隐藏添加任务按钮

`packages/frontend/src/components/layout/ContentBottomBar.tsx`:

在 `ContentBottomBar` 组件内用 `useLocation` 判断当前路由是否属于隐藏列表。职责分离：`usePageTaskContext` 只管上下文推断，按钮显隐归 `ContentBottomBar`。

```tsx
import { useLocation } from 'react-router-dom';

const HIDE_ADD_TASK_ROUTES = ['/upcoming', '/logbook', '/trash'];

// 在组件内：
const { pathname } = useLocation();
const showAddTask = !HIDE_ADD_TASK_ROUTES.includes(pathname);
```

渲染：

```tsx
{showAddTask && (
  <Button variant="ghost" size="icon" ...>
    <Plus className="h-5 w-5" />
  </Button>
)}
```

搜索按钮始终保留。

> 用精确匹配 `includes(pathname)` 而非 `startsWith` — 这三个路由都无子路由（如 `/logbook/xxx`），精确匹配安全且避免误隐藏。

## 兼容性

- **API 向后兼容**：`tagIds` 是 optional，旧客户端不传时行为不变。
- **类型前向兼容**：`Omit<Partial<CreateTaskDto>, 'title'>` 在 `CreateTaskDto` 新增字段时自动包含。
- **无数据库迁移**：不修改 schema，只利用现成的 `TaskTag` 关系表。
- **无 controller 改动**：`TasksController.create` 透传 DTO，签名不变。
