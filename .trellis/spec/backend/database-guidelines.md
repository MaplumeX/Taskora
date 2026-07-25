# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

- ORM：Prisma Client
- 数据库：PostgreSQL 16
- 迁移：`prisma migrate dev`（开发）、`prisma migrate deploy`（生产）
- Schema 位置：`packages/backend/prisma/schema.prisma`

---

## Query Patterns

### 用户数据隔离（CRITICAL）

所有业务查询必须包含 `userId`：

```typescript
// Correct — findFirst 带 userId 隔离
const task = await this.prisma.task.findFirst({
  where: { id, userId },
});

// Wrong — findUnique 仅用 id，可越权访问
const task = await this.prisma.task.findUnique({
  where: { id },
});
```

**注意**：Prisma 的 `findUnique` 在 `@id` 上是唯一的，不支持额外的 `userId` 条件。必须用 `findFirst` 来实现 `id + userId` 的复合查询。越权访问返回 404（不暴露资源存在性）。

### 软删除

Task 使用软删除（`status = TRASHED`），不使用 Prisma `DELETE`：
- 删除：`update({ where: { id, userId }, data: { status: 'TRASHED', trashedAt: new Date() } })`
- 恢复：`update({ where: { id, userId }, data: { status: 'ACTIVE', trashedAt: null } })`
- 查询默认排除已删除：`where: { status: { not: 'TRASHED' } }`

### 自关联查询（子任务）

Task 有自关联 `parentId`。查询子任务用 `TaskChildren` 关系：

```typescript
const task = await this.prisma.task.findFirst({
  where: { id, userId },
  include: { children: true },
});
```

---

## Migrations

```bash
cd packages/backend
pnpm prisma migrate dev --name <description>  # 开发环境
pnpm prisma migrate deploy                       # 生产环境
pnpm prisma migrate reset                        # 重置（开发环境）
pnpm prisma db seed                              # 填充种子数据
```

---

## Naming Conventions

- 模型名：`PascalCase`（User, Task, Project, Area）
- 字段名：`camelCase`（createdAt, scheduledDate, passwordHash）
- 枚举名：`PascalCase`，枚举值：`UPPER_SNAKE_CASE`（TaskBucket.INBOX, TaskStatus.ACTIVE）
- 数据库表名：Prisma 默认使用模型名（不改）

---

## Common Mistakes

### Prisma DATABASE_URL 连接字符串

**Symptom**：Prisma 连接 PostgreSQL 报 `Can't reach database server`

**Cause**：Prisma 不支持 Unix socket 的 `host` 和 `port` 参数（如 `?host=/var/run/postgresql&port=5433`）

**Fix**：使用 TCP 连接字符串：`postgresql://user:password@localhost:PORT/taskora?schema=public`

---

## Bucket 转换逻辑

Task 有两个日期字段：`scheduledDate`（计划日期，驱动 bucket 与视图查询）和 `dueDate`（截止/通知日期，仅存储，不参与 bucket 或任何视图查询）。`bucket` 字段是显式字段，需在 service 层维护转换：

| 操作 | bucket 变化 |
|---|---|
| 设 scheduledDate | → `SCHEDULED` |
| 清除 scheduledDate（原 INBOX） | → `INBOX` |
| 清除 scheduledDate（原 ANYTIME） | → `ANYTIME` |
| 分配 project/area（无 scheduledDate） | → `ANYTIME` |
| 修改 dueDate | 不变（dueDate 不参与 bucket） |
| 移到 Someday | → `SOMEDAY` |

> `dueDate` 仅在 create/update 中被写入，`resolveBucket` 与 `findAll` 视图查询都只用 `scheduledDate`。

参见 `.trellis/tasks/07-25-gtd-app/design.md` §2.3。

---

## 标签关联策略 (Tag / TaskTag)

Task ↔ Tag 为多对多关系，通过 `TaskTag` 中间表实现：

- `TaskTag` 有自己的 `id`（`@default(uuid())`) + `createdAt`，因此 **不用** Prisma 的隐式 `{ set: [...ids] }` 语法（无法携带中间表额外字段），而是在 service 层显式用 `deleteMany` + `createMany` 替换关联。
- 全量 set 语义：`UpdateTaskDto.tagIds?: string[]`，传 `undefined` 不动关联；传数组（含空数组）则先删旧关联再建新关联。两步须用 `$transaction` 包裹保证原子性：

```typescript
if (dto.tagIds !== undefined) {
  await this.prisma.$transaction([
    this.prisma.taskTag.deleteMany({ where: { taskId: id } }),
    ...(dto.tagIds.length > 0
      ? [this.prisma.taskTag.createMany({
          data: dto.tagIds.map((tagId) => ({ taskId: id, tagId })),
          skipDuplicates: true,
        })]
      : []),
  ]);
}
```

- `@@unique([taskId, tagId])` 防重复贴标签，配合 `skipDuplicates` 避免竞态抛错。
- **删除 Tag** 时 `TaskTag` 走 `onDelete: Cascade` 自动清理关联（无需手动删中间表）。
- **删除 TagGroup** 时 `Tag.tagGroupId` 走 `onDelete: SetNull`，标签变“未分组”而非删除。

### include + map 模式

查询 Task 时 include `tags: { include: { tag: true } }` 返回 `TaskTag[]`；service 层把 `TaskTag[]` map 成 `Tag[]`，保持 DTO 契约仅暴露 `TagResponseDto`，不漏出中间表字段。

按标签筛选：`where.tags = { some: { tagId } }`。
### View 模式（列表查询）

`TasksService.findAll` 通过 `query.view` 在单个方法内分发多个预定义列表视图（inbox / today / upcoming / anytime / someday / trash / logbook），而非为每个视图写独立方法。每个 view case 构建 `where` 条件：

```typescript
switch (query.view) {
  case 'today':
    where.status = TaskStatus.ACTIVE;
    where.scheduledDate = { lte: new Date() };
    break;
  case 'logbook':
    where.status = TaskStatus.COMPLETED;
    break;
  // ...
}
```

新增 view 时：在 DTO 的 `@IsEnum` 数组与联合类型中加入新值，然后在 switch 中追加 case。

### 动态 orderBy

默认 orderBy 为 `[{ sortOrder: 'asc' }, { createdAt: 'desc' }]`。当某 view 需要不同排序时（如 `logbook` 按 `completedAt desc`），在 `findMany` 调用前根据 `query.view` 条件决定 orderBy，而非在 case 内部修改：

```typescript
const orderBy =
  query.view === 'logbook'
    ? [{ completedAt: 'desc' as const }]
    : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];
```

> 约定：orderBy 的动态化仅按 `view` 分支，默认分支保持所有其他视图的原始排序不变。
