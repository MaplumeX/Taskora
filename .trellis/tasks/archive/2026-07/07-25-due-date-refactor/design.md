# Design — dueDate refactoring

## Architecture & Boundaries

改动横跨三层 + 数据库：

```
shared (DTO types)
   │
   ▼
backend (DTO validation + TasksService logic + Prisma schema/migration)
   │
   ▼
frontend (api client types, hooks, components, pages)
```

无外部服务边界变化，REST 路径与 controller 签名不变。

## Data Model Changes

### Prisma `schema.prisma` — Task model

```prisma
model Task {
  ...
  scheduledDate DateTime?   // was: dueDate（重命名，原数据保留）
  dueDate       DateTime?   // 新增，默认 null，不参与视图查询
  ...
}
```

### Migration strategy

单个 migration 做两件事：

1. `ALTER TABLE "Task" RENAME COLUMN "dueDate" TO "scheduledDate";`
   — 保留数据，零拷贝。
2. `ALTER TABLE "Task" ADD COLUMN "dueDate" TIMESTAMP(3);`
   — 新列为 nullable，旧行默认 null。

> 不使用 Prisma 的 drop+create（会丢数据），必须用 `@map` / 原生 SQL 或让 Prisma 识别为 rename。实际操作时先用 `prisma migrate dev --create-only` 生成迁移文件，再手工核对 SQL 确保是 RENAME COLUMN，而不是 DROP + ADD。

## Contracts

### shared `task.dto.ts`

```ts
export interface CreateTaskDto {
  title: string;
  notes?: string;
  scheduledDate?: string; // ISO 8601（原 dueDate）
  dueDate?: string;       // ISO 8601（新增，通知用）
  bucket?: TaskBucket;
  parentId?: string;
  projectId?: string;
  areaId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  scheduledDate?: string | null;
  dueDate?: string | null;
  bucket?: TaskBucket;
  parentId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  tagIds?: string[];
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: string | null; // 原 dueDate
  dueDate: string | null;      // 新增
  bucket: TaskBucket;
  status: TaskStatus;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  parentId: string | null;
  projectId: string | null;
  areaId: string | null;
  tags?: TagResponseDto[];
  children?: TaskResponseDto[];
  createdAt: string;
  updatedAt: string;
}
```

### backend `tasks.dto.ts`

`CreateTaskDto` / `UpdateTaskDto` 的 class-validator 装饰器同步：
- `scheduledDate?: string` — `@IsOptional() @IsDateString()`（替换原 `dueDate`）
- `dueDate?: string | null` — `@IsOptional() @IsDateString()`（新增）

`TaskQueryDto` 无 `dueDate` 字段（view 查询不暴露新 dueDate）。

### `resolveBucket` 逻辑

签名不变，参数名从 `dueDate` → `scheduledDate`：

```ts
private resolveBucket(
  bucket: TaskBucket | undefined,
  scheduledDate: string | null | undefined,
  projectId: string | null | undefined,
  areaId: string | null | undefined,
): TaskBucket {
  if (scheduledDate) return TaskBucket.SCHEDULED;
  if (bucket) return bucket;
  if (projectId || areaId) return TaskBucket.ANYTIME;
  return TaskBucket.INBOX;
}
```

关键：新 `dueDate` **不传入** resolveBucket，对 bucket 无影响。

### `findAll` view 查询

所有 `where.dueDate` → `where.scheduledDate`。新 dueDate 不进入任何 where 子句。

### `update` 逻辑

- `dto.scheduledDate` 改变 → 触发 resolveBucket 重算（与原 dueDate 行为一致）。
- `dto.dueDate` 改变 → 仅写入，**不触发** resolveBucket。
- `newScheduledDate` 计算从 `existing.scheduledDate` + `dto.scheduledDate` 派生。
- `newDueDate` 计算从 `existing.dueDate` + `dto.dueDate` 派生，但仅用于写入，不参与 bucket 判断。

条件改为：
```ts
if (dto.scheduledDate !== undefined || dto.projectId !== undefined || dto.areaId !== undefined || dto.bucket !== undefined) {
  bucket = this.resolveBucket(...);
}
```

### `create` 逻辑

```ts
const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
const bucket = this.resolveBucket(dto.bucket, dto.scheduledDate, dto.projectId, dto.areaId);

return this.prisma.task.create({
  data: {
    title: dto.title,
    notes: dto.notes,
    scheduledDate,
    dueDate,         // 新增字段写入
    bucket,
    userId,
    parentId: dto.parentId,
    projectId: dto.projectId,
    areaId: dto.areaId,
  },
});
```

## Frontend Changes

### 全量字段名替换（dueDate → scheduledDate，仅原语义处）

| 文件 | 改动 |
|------|------|
| `frontend/src/components/task/TaskDateBadge.tsx` | prop `dueDate` → `scheduledDate` |
| `frontend/src/components/task/TaskItem.tsx` | `task.dueDate` → `task.scheduledDate`，传给 TaskDateBadge |
| `frontend/src/components/task/QuickAddTask.tsx` | `dueToday` 时设 `payload.scheduledDate`（原 `payload.dueDate`）；注释同步 |
| `frontend/src/components/task/TaskDetail.tsx` | `current.dueDate` → `current.scheduledDate`；`patch({ scheduledDate })` |
| `frontend/src/pages/Upcoming.tsx` | `t.dueDate` → `t.scheduledDate` |
| `frontend/src/pages/Trash.tsx` | `task.dueDate` → `task.scheduledDate`，传给 TaskDateBadge |

> TaskDateBadge 的 prop 改名只是命名一致性，不涉及新 dueDate。

### 新 dueDate 在前端

本次**不添加**任何前端编辑/展示入口。`TaskResponseDto` 类型会自动带上新 `dueDate` 字段，但 UI 暂不消费。

## Compatibility & Migration Notes

- REST API 字段名变了：`dueDate`（旧语义）→ `scheduledDate`。这是**破坏性变更**，但项目无外部消费者（单仓前端），前端会被同步更新。
- 旧 `dueDate` 语义在 API 上消失，取而代之的是同名但不同语义的 `dueDate`（通知日期，默认 null）。前端本次不使用它，所以语义切换无感知。
- 数据迁移零丢失：旧 dueDate 数据 → scheduledDate，新 dueDate 全 null。

## Trade-offs

| 决策 | 取舍 |
|------|------|
| 新 dueDate 列复用 `dueDate` 名字 | 优点：未来通知功能直接用 `dueDate` 语义自然；缺点：同名不同语义在迁移期内可能混淆。通过文档+注释缓解。 |
| 本次不实现前端新 dueDate UI | 缩小范围，让通知功能独立迭代。 |
| 单个 migration 做两件事 | 简化部署，一步到位。需手工核对 SQL 为 RENAME。 |

## Rollback

- 回滚 = revert migration + revert 代码。
- migration down：`ALTER TABLE "Task" DROP COLUMN "dueDate"; ALTER TABLE "Task" RENAME COLUMN "scheduledDate" TO "dueDate";`
- 由于是 nullable 字段，回滚不丢数据（新 dueDate 本来就全 null）。