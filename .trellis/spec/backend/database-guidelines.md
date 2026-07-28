# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

- ORM：Prisma Client
- 数据库：PostgreSQL 16
- 迁移：`prisma migrate dev`（开发）、`prisma migrate deploy`（生产）
- Schema 位置：`packages/backend/prisma/schema.prisma`
- 核心模型：`User`、`RefreshToken`、`Task`、`Project`、`Area`、`Tag`、`TagGroup`、`TaskTag`

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

### RefreshToken 模型（唯一例外）

`RefreshToken` 按 `tokenHash`（`@unique`）查找，不经过 `userId` 隔离——RT 本身即凭证，持有 RT 即代表登录会话。这是数据隔离规范的唯一例外：

```typescript
const row = await this.prisma.refreshToken.findUnique({
  where: { tokenHash },
});
```

RT 设计要点：
- `tokenHash` 存 SHA-256 哈希，不存明文；明文 RT 通过 HttpOnly cookie 传递，数据库不可逆推。
- `familyId` 用于复用检测：同一登录会话的 RT 共享一个 family，复用检测时吊销整个 family。
- `revokedAt` 为软吊销标记（非物理删除），轮换时设为旧 RT 的时间戳，复用检测查 `revokedAt !== null` 即为攻击。
- `expiresAt` 独立于 `revokedAt`：过期是时间判定，吊销是状态判定。

### 软删除

Task 使用软删除（`status = TRASHED`），不使用 Prisma `DELETE`：
- 删除：`update({ where: { id, userId }, data: { status: 'TRASHED', trashedAt: new Date() } })`
- 恢复：`update({ where: { id, userId }, data: { status: 'ACTIVE', trashedAt: null } })`
- 查询默认排除已删除：`where: { status: { not: 'TRASHED' } }`

### RefreshToken 吊销（软吊销）

`RefreshToken` 同样采用软吊销（`revokedAt`），不物理删除，以便复用检测能查到历史记录：
- 轮换：`update({ where: { id: row.id }, data: { revokedAt: new Date() } })`
- 复用攻击批量吊销：`updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })`
- logout：`updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })`

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

- 模型名：`PascalCase`（User, Task, Project, Area, RefreshToken, TagGroup）
- 字段名：`camelCase`（createdAt, scheduledDate, passwordHash, tokenHash, familyId）
- 枚举名：`PascalCase`，枚举值：`UPPER_SNAKE_CASE`（TaskBucket.INBOX, TaskStatus.ACTIVE）
- 数据库表名：Prisma 默认使用模型名（不改）

## 模型字段约定

### User

- `email`：`@unique`，登录凭证
- `passwordHash`：bcrypt 哈希（`bcrypt.hash(pw, 10)`），不存明文
- `displayName` / `avatarUrl` / `timezone` / `locale`：可选 profile 字段（`String?`），由 `PUT /users/me` 更新
- `refreshTokens`：关联 `RefreshToken[]`（`onDelete: Cascade`，删除用户时自动清理 RT）

### RefreshToken

- `tokenHash`：`@unique`，SHA-256 哈希（`createHash('sha256')`），不存明文
- `familyId`：同登录会话的 RT 共享，用于复用检测时批量吊销
- `expiresAt`：绝对过期时间（`RT_TTL_MS = 30 天`）
- `revokedAt`：软吊销标记，`null` 表示有效
- `@@index([userId])` + `@@index([familyId])`：按用户/家族查询优化

### Task / Project / Area

- 均有 `sortOrder Int @default(0)` 字段，默认 orderBy `[{ sortOrder: 'asc' }, { createdAt: 'desc' }]`
- 详见后续「批量重排」章节

---

## Common Mistakes

### Prisma DATABASE_URL 连接字符串

**Symptom**：Prisma 连接 PostgreSQL 报 `Can't reach database server`

**Cause**：Prisma 不支持 Unix socket 的 `host` 和 `port` 参数（如 `?host=/var/run/postgresql&port=5433`）

**Fix**：使用 TCP 连接字符串：`postgresql://user:password@localhost:PORT/taskora?schema=public`

---

## Bucket 与 scheduledType 转换逻辑

Task 有三个相关字段：
- `scheduledType: ScheduledType`（计划日期类型，`NONE | DATE | SOMEDAY`，驱动 bucket 推导与视图查询）
- `scheduledDate: DateTime?`（具体计划日期；仅 `scheduledType=DATE` 时有值，`SOMEDAY`/`NONE` 时为 null）
- `dueDate: DateTime?`（截止/通知日期，仅存储，不参与 bucket 或任何视图查询）
- `bucket: TaskBucket`（`INBOX | ANYTIME | SCHEDULED`，始终由 service 层 `resolveBucket` 从 scheduledType 推导，**不再含 SOMEDAY 值**）

核心不变量：`bucket=SCHEDULED` ⟺ `scheduledType ∈ {DATE, SOMEDAY}`。

`scheduledType` 驱动 bucket 推导（`resolveBucket`）：

| scheduledType | scheduledDate 联动 | bucket |
|---|---|---|
| `DATE` | 保留或设置具体日期 | `SCHEDULED` |
| `SOMEDAY` | 置 null | `SCHEDULED` |
| `NONE` | 置 null | 降级为 `INBOX`（无 project/area）或 `ANYTIME`（有 project/area）；若旧 bucket 为 SCHEDULED 则必降级 |

update 级联规则：当 `dto.scheduledType` 变化时，service 层必须同步维护 `scheduledDate`（SOMEDAY/NONE 清空，DATE 保留或设置）并重新 `resolveBucket`。前端只传意图，后端保证一致性。

> `dueDate` 仅在 create/update 中被写入，`resolveBucket` 与 `findAll` 视图查询都用 `scheduledType`（而非 scheduledDate）。

> Someday 是 view（`scheduledType=SOMEDAY`），不是 bucket 值。参见 `.trellis/tasks/07-25-scheduled-type-refactor/design.md`。

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

### create() 的 tagIds 处理（nested create 模式）

`create()` 与 `update()` 的 tagIds 处理方式不同：

- **update()**：任务已存在，有既存关联 → 用 `deleteMany` + `createMany` 事务包裹（见上节）。
- **create()**：新任务无既存关联 → 在 `prisma.task.create` 的 data 块内用 Prisma nested create 直接建关联，无需显式事务（单个 `task.create` 带 nested create 已是原子的）：

```typescript
const created = await this.prisma.task.create({
  data: {
    // ...其他字段...
    ...(dto.tagIds?.length
      ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
      : {}),
  },
  include: { tags: { include: { tag: true } } },
});
return { ...created, tags: created.tags.map((tt) => tt.tag) };
```

注意 nested create 的 `tags: { create: [...] }` 里不需传 `taskId`（Prisma 自动从父 create 关联）；而 `createMany` 模式需显式传 `taskId`。

按标签筛选：`where.tags = { some: { tagId } }`。
### View 模式（列表查询）

`TasksService.findAll` 通过 `query.view` 在单个方法内分发多个预定义列表视图（inbox / today / upcoming / anytime / someday / trash / logbook），而非为每个视图写独立方法。每个 view case 构建 `where` 条件：

```typescript
switch (query.view) {
  case 'today':
    where.status = TaskStatus.ACTIVE;
    where.scheduledType = ScheduledType.DATE;
    where.scheduledDate = { lte: new Date() };
    break;
  case 'someday':
    where.scheduledType = ScheduledType.SOMEDAY;
    where.status = TaskStatus.ACTIVE;
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

### 关键词搜索（q 参数）

`findAll` 支持 `q?: string` 查询参数，对 `title` 和 `notes` 做 case-insensitive `contains` 模糊匹配。`q` 与 `view` 正交：`q` 构造 `where.OR` 条件，`view` 构建各自的 `where` 字段，两者可叠加。

```typescript
if (query.q) {
  where.OR = [
    { title: { contains: query.q, mode: 'insensitive' } },
    { notes: { contains: query.q, mode: 'insensitive' } },
  ];
}
// q 模式无 view 时设置 status：默认 ACTIVE，completed=true 时 [ACTIVE, COMPLETED]，始终排除 TRASHED
if (query.q && !query.view) {
  where.status = query.completed
    ? { in: [TaskStatus.ACTIVE, TaskStatus.COMPLETED] }
    : TaskStatus.ACTIVE;
}
```

约定：不引入 Postgres FTS，使用 Prisma `contains` + `mode: 'insensitive'`；数据量增长后可升级。

---

## 批量重排（Reorder）API 模式

当资源支持拖拽排序时，用 `POST /xxx/reorder` 端点批量更新 `sortOrder`。已有 Task / Project / Area 三类资源遵循此模式。

### Service.reorder 通用模式

```typescript
async reorder(userId: string, orderedIds: string[]) {
  // 1. 批量校验归属：findMany + userId 隔离（不用逐个 findFirst）
  const owned = await this.prisma.task.findMany({
    where: { id: { in: orderedIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((t) => t.id));
  if (ownedSet.size !== orderedIds.length) {
    throw new NotFoundException('Task not found');
  }

  // 2. 事务内逐条 updateMany（where 含 userId 保证隔离）
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

**为什么用 `updateMany` 而非 `update`**：`updateMany` 的 where 可以加 `userId`，符合
「所有业务查询必须包含 userId」规范。`update` 仅按 `@id` 更新，无法加 userId 约束。

**为什么不用单条 updateMany 批量**：Prisma 的 `updateMany` 不支持不同的 data per row，只能逐个 id 写。N 条 update 在一个 `$transaction` 里保证原子性。N 通常 < 100，PostgreSQL 本地事务开销可忽略。

### Controller 路由顺序

`@Post('reorder')` 必须声明在 `@Get(':id')` / `@Patch(':id')` 等参数路由之前，否则 `reorder` 会被当作 `:id` 匹配。NestJS 路由按声明顺序匹配：

```typescript
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  @Post('reorder')          // ← 必须在 :id 路由之前
  reorder(...) { ... }

  @Post()                    // create
  create(...) { ... }

  @Get(':id')
  findOne(...) { ... }

  @Patch(':id')
  update(...) { ... }
}
```

### create 时的初始 sortOrder

新建 Project / Area 时设 `sortOrder = (max _max.sortOrder ?? -1) + 1`，使新记录出现在列表末尾：

```typescript
async create(userId: string, dto: CreateProjectDto) {
  const max = await this.prisma.project.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return this.prisma.project.create({
    data: { ..., sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
}
```

### sortOrder 字段约定

- `Task` / `Project` / `Area` 均有 `sortOrder Int @default(0)` 字段
- 默认 orderBy 为 `[{ sortOrder: 'asc' }, { createdAt: 'desc' }]`：同 sortOrder 下按 createdAt 降序
- 旧数据 backfill：迁移加列 `DEFAULT 0`，旧记录均为 0，行为等同于按 createdAt desc 排序
- 拖拽后 `reorder` 将传入的 ids 按顺序设为 0,1,2,...，未传入的记录不变

> 局限：Task 的 `sortOrder` 是全局的，不同视图（inbox / today）返回的任务子集不同；拖拽重排会在全局层面改变这批任务的相对顺序。这是与 Things3 一致的有意行为。
