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
- 字段名：`camelCase`（createdAt, dueDate, passwordHash）
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

Task 的 `bucket` 字段是显式字段，需在 service 层维护转换：

| 操作 | bucket 变化 |
|---|---|
| 设 dueDate | → `SCHEDULED` |
| 清除 dueDate（原 INBOX） | → `INBOX` |
| 清除 dueDate（原 ANYTIME） | → `ANYTIME` |
| 分配 project/area（无 dueDate） | → `ANYTIME` |
| 移到 Someday | → `SOMEDAY` |

参见 `.trellis/tasks/07-25-gtd-app/design.md` §2.3。