# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

- ORM：Prisma Client
- 数据库：PostgreSQL 16
- 迁移：`prisma migrate dev`（开发）、`prisma migrate deploy`（生产）
- Schema 位置：`packages/backend/prisma/schema.prisma`
- 核心模型：`User`、`RefreshToken`、`Task`、`Project`、`Area`、`Tag`、`TagGroup`、`TaskTag`、`ProjectTag`、`AreaTag`

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

### 删除策略总览

本系统有三类删除策略，按模型区分：

| 模型 | 策略 | 删除判据 | FK 行为 |
|------|------|---------|---------|
| Task | 软删除 | `trashedAt: DateTime?` | parentId `onDelete: NoAction`，projectId/areaId 不阻断 |
| Project | 软删除 | `trashedAt: DateTime?` | areaId `onDelete: SetNull`；下属 task 级联 trash |
| Area | 物理删除 | `prisma.area.delete` | 下属 task/project 的 `areaId` `onDelete: SetNull` 脱钩为 null |

---

### status enum 拆分决策

`TaskStatus` / `ProjectStatus` 只保留 `ACTIVE | COMPLETED`（纯生命周期），**不含 `TRASHED`**。
删除状态唯一由 `trashedAt: DateTime?` 表达。

**为什么移除 `TRASHED`**：

1. **避免 trash 覆盖 COMPLETED 状态**：如果一个已完成的 task 被 trash，旧设计中 `status` 被改为 `TRASHED`，完成状态丢失——从废纸篓恢复后任务不再是 COMPLETED。
2. **避免级联 trash 丢状态**：trash 父任务会级联后代，若级联也写 `status = TRASHED`，所有后代的 COMPLETED 状态全部丢失。
3. **正交关注点分离**：`status` 表示生命周期（active ↔ completed），`trashedAt` 表示删除状态（null ↔ timestamp），两者正交，一个 task 可以同时是 COMPLETED + trashed。

> **核心不变量**：trash/restore **只写 `trashedAt`，绝不动 `status`**。

---

### 软删除（Task / Project）

Task 和 Project 使用软删除（`trashedAt`），不使用 Prisma `DELETE`：

- 删除（trash）：`updateMany({ where: { id, userId }, data: { trashedAt: new Date() } })` — 只写 `trashedAt`，不动 `status`
- 恢复（restore）：`updateMany({ where: { id, userId }, data: { trashedAt: null } })` — 只清 `trashedAt`，不动 `status`
- 查询默认排除已删除：`where: { trashedAt: null }`
- 废纸篓视图：`where: { trashedAt: { not: null } }`

```typescript
// trash — 只写 trashedAt，status 不变
await tx.task.updateMany({
  where: { id: { in: allIds }, userId },
  data: { trashedAt: now },
});

// restore — 对称恢复
await tx.task.updateMany({
  where: { id: { in: allIds }, userId },
  data: { trashedAt: null },
});
```

> views.ts 中每个非-trash view case 都带 `trashedAt: null`；`trash` case 用 `trashedAt: { not: null }`。

---

### trash / restore 级联语义

#### Task 级联（后代）

trash 父任务级联**所有后代**（不限层级）。实现方式：交互式事务内全量读 `select: { id, parentId }`，内存 BFS 从根任务向下收集所有后代 id，然后 `updateMany trashedAt`。

- 级联只写 `trashedAt`，不动 `status`（保持每个后代的 COMPLETED 状态不被破坏）
- `parentId` 的 FK 使用 `onDelete: NoAction`（数据库层不做级联删除，由 service 层 BFS 管 trash 级联），见 schema.prisma
- restore 对称：同样的 BFS 集合，`updateMany trashedAt: null`

```typescript
// BFS 收集后代
const allTasks = await tx.task.findMany({
  where: { userId },
  select: { id: true, parentId: true },
});
const childrenOf = new Map<string, string[]>();
for (const t of allTasks) {
  if (t.parentId) {
    const arr = childrenOf.get(t.parentId) ?? [];
    arr.push(t.id);
    childrenOf.set(t.parentId, arr);
  }
}
const descendantIds = new Set<string>();
const queue = [rootId];
while (queue.length) {
  const layer = queue.splice(0);
  for (const parentId of layer) {
    const kids = childrenOf.get(parentId);
    if (!kids) continue;
    for (const kid of kids) {
      if (!descendantIds.has(kid)) {
        descendantIds.add(kid);
        queue.push(kid);
      }
    }
  }
}
const allIds = [rootId, ...descendantIds];
```

> 为什么 BFS 而不递归 SQL：单用户 task 量 << 1000，全量读 + 内存算比递归 CTE 更可控、类型安全，且在交互式事务内保证快照一致。

#### Project 级联（下属 Task）

trash Project 级联其**直接下属 Task**（`projectId` 匹配），不递归 task 的 parentId 层级。

- Project 无 `parentId`，不存在后代级联；只需把 `projectId = id` 的 task 一并 trash
- 用数组式 `$transaction` 并行 `project.updateMany` + `task.updateMany`
- restore 对称：同时清 project 和下属 task 的 `trashedAt`

```typescript
await this.prisma.$transaction([
  this.prisma.project.updateMany({
    where: { id, userId },
    data: { trashedAt: now },
  }),
  this.prisma.task.updateMany({
    where: { projectId: id, userId },
    data: { trashedAt: now },
  }),
]);
```

---

### Area 删除策略（物理删除 + SetNull）

Area 是**唯一走物理删除**的模型——不走软删除，直接 `prisma.area.delete`。

- 删除：`this.prisma.area.delete({ where: { id } })`（在 `findOne` 校验归属后）
- 下属 Task / Project 的 `areaId` 通过 schema 的 `onDelete: SetNull` **自动脱钩为 null**，不阻塞删除
- Task / Project 的 `areaId` 为 `String?`（可空），脱钩后变成「无 Area」状态，bucket 降级为 `INBOX`（详见 resolveBucket 逻辑）

**为什么 Area 不走软删除**：

1. **Things3 一致性**：在 Things3 中，Area 是顶层容器，删除即直接移除，不存在「废纸篓」概念——Area 不含待办事项本身，只是容器，删除容器后下属项脱离即可。
2. **无状态丢失风险**：与 Task/Project 不同，Area 没有 `status` 生命周期或 `trashedAt` 语义，物理删除不会丢失需要恢复的信息。
3. **FK 自动脱钩**：`onDelete: SetNull` 确保下属 Task/Project 的 `areaId` 变 null，不会因 FK 约束阻塞删除，也不需要 service 层手工级联。

```typescript
async remove(userId: string, id: string) {
  await this.findOne(userId, id); // 校验归属
  return this.prisma.area.delete({ where: { id } });
}
```

> Task / Project 的 `areaId` 为 `String?`，脱钩后变成「无 Area」状态，bucket 降级为 `INBOX`（详见 resolveBucket 逻辑）。TaskTag/ProjectTag 不受 Area 删除影响。

---

### RefreshToken 吊销（软吊销）

`RefreshToken` 同样采用软吊销（`revokedAt`），不物理删除，以便复用检测能查到历史记录：
- 轮换：`update({ where: { id: row.id }, data: { revokedAt: new Date() } })`
- 复用攻击批量吊销：`updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })`
- logout：`updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })`

### 物理删除受控例外（FeedService.emptyTrash）

Task / Project 默认使用软删除（见上节），但「倾倒废纸篓」需要永久删除已软删除的项。这是除 Area 外仅有的物理 delete 触点：

- **只允许在 `FeedService.emptyTrash` 内**使用 Prisma `deleteMany` 物理删除 task / project。
- 物理删除的 `where` 必须同时含 `userId` + `id IN`（集合来自已确认 `trashedAt != null` 的数据）。
- 任何其他路径（service / controller）仍保持软删除，**禁止** `prisma.task.delete` / `prisma.project.delete`。
- 中间表 `TaskTag` / `ProjectTag` 通过 `onDelete: Cascade` 自动清理，无需手工删。

### 交互式事务（读-算-写序列）

`$transaction` 有两种用法，按场景选择：

| 模式 | 语法 | 适用场景 |
|------|------|---------|
| **数组式** | `$transaction([op1, op2, ...])` | 多个已知写操作并行执行（如 tag 全量替换 `deleteMany` + `createMany`） |
| **交互式** | `$transaction(async (tx) => { ... })` | 读-算-写序列（先查询、内存计算、再写入，三步须同事务快照一致） |

`FeedService.emptyTrash` 用交互式事务：先读 `trashedAt != null` 的 task / project 集合，内存算级联删除集（后代 + project 下属 task），再 `deleteMany`。保证读到的快照与删除在同一事务内，不会因并发插入新 trashed task 而漏删或 FK 冲突。

> emptyTrash 级联算法：删除集 = trashed tasks ∪ trashed tasks 的所有后代 ∪ trashed projects 的下属 tasks。与 trash 级联的 BFS 逻辑一致，但以「trashed tasks 全体」为根集（而非单个根任务）。

> 测试 mock 交互式事务：`$transaction: vi.fn(async (cb) => cb(mockPrisma))`，将 tx 句柄回传为 mock 本身。

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

### Project（与 Task 同级的待办实体）

Project 既是 Task 的容器（`Task.projectId`），本身也是一个可出现在聚合视图的待办实体，字段与 Task 对齐：

- `status: ProjectStatus`（`ACTIVE | COMPLETED`，独立枚举，值与 `TaskStatus` 一致；不含 `TRASHED`，删除判据见「status enum 拆分决策」）
- `bucket: ProjectBucket`（`INBOX | ANYTIME | SCHEDULED`，独立枚举，值与 `TaskBucket` 一致）
- `scheduledType: ScheduledType`（复用 Task 的枚举）
- `scheduledDate: DateTime?`（仅 `scheduledType=DATE` 有值）
- `dueDate: DateTime?`（仅存储，不参与 bucket/视图查询）
- `completedAt: DateTime?` / `trashedAt: DateTime?`：软删除与完成标记

> Project 与 Task 使用**独立的** Prisma enum type（`ProjectStatus`/`ProjectBucket` vs `TaskStatus`/`TaskBucket`），值相同但类型隔离，避免跨模型耦合。

Project 的 bucket 推导（`ProjectsService.resolveBucket`）与 Task 规则一致，但 Project 无 `parentId`/`projectId`：
- `DATE`/`SOMEDAY` → `SCHEDULED`
- `NONE` → 有 `areaId` 则 `ANYTIME`，否则 `INBOX`

Project 软删除/恢复/完成/撤销完成与 Task 行为一致（`remove` 为软删除，非物理删除）。

### 标签关联策略 (Tag / TaskTag / ProjectTag / AreaTag)

Task ↔ Tag、Project ↔ Tag、Area ↔ Tag 均为多对多，分别通过 `TaskTag` / `ProjectTag` / `AreaTag` 中间表实现。三张中间表结构一致：

- `id`（`@default(uuid())`）+ `createdAt`，因此不用 Prisma 隐式 `{ set: [...] }` 语法，在 service 层用 `deleteMany` + `createMany` 全量替换（`$transaction` 包裹）。
- `@@unique([taskId, tagId])` / `@@unique([projectId, tagId])` / `@@unique([areaId, tagId])` 防重复，配合 `skipDuplicates`。
- 删除 Tag 时三张中间表（`TaskTag` / `ProjectTag` / `AreaTag`）均 `onDelete: Cascade` 自动清理。
- `include` + map 模式：`include: { tags: { include: { tag: true } } }` 返回中间表数组，service 层 map 成 `Tag[]`，不漏出中间表字段。
- create 用 nested create（`tags: { create: [...] }`），update 用 `deleteMany` + `createMany` 事务。

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

## 标签关联策略 (Tag / TaskTag / ProjectTag) — 补充说明

> 总体约定见上方「Project」节的「标签关联策略」小节。以下为 Task 侧的历史示例代码（Project 侧 `ProjectTag` 用法相同，把 `taskId`/`TaskTag` 换成 `projectId`/`ProjectTag`）：

全量 set 语义：`UpdateTaskDto.tagIds?: string[]`，传 `undefined` 不动关联；传数组（含空数组）则先删旧关联再建新关联。两步须用 `$transaction` 包裹保证原子性：

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
- **删除 Tag** 时 `TaskTag`/`ProjectTag` 走 `onDelete: Cascade` 自动清理关联（无需手动删中间表）。
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
    where.trashedAt = null;
    break;
  case 'someday':
    where.scheduledType = ScheduledType.SOMEDAY;
    where.status = TaskStatus.ACTIVE;
    where.trashedAt = null;
    break;
  case 'trash':
    where.trashedAt = { not: null };
    break;
  case 'logbook':
    where.status = TaskStatus.COMPLETED;
    where.trashedAt = null;
    break;
  // ...
}
```

新增 view 时：在 DTO 的 `@IsEnum` 数组与联合类型中加入新值，然后在 `buildTaskViewWhere` / `buildProjectViewWhere` 的 switch 中追加 case。

### 动态 orderBy

默认 orderBy 为 `[{ sortOrder: 'asc' }, { createdAt: 'desc' }]`。当某 view 需要不同排序时（如 `logbook` 按 `completedAt desc`），在 `findMany` 调用前根据 `query.view` 条件决定 orderBy，而非在 case 内部修改：

```typescript
const orderBy =
  query.view === 'logbook'
    ? [{ completedAt: 'desc' as const }]
    : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];
```

> 约定：orderBy 的动态化仅按 `view` 分支，默认分支保持所有其他视图的原始排序不变。

### view→where 抽取与 Feed 聚合接口

`TasksService.findAll` / `ProjectsService` 的 view 分支已抽为纯函数，供聚合接口复用：

- `packages/backend/src/tasks/views.ts`：`buildTaskViewWhere(view): Prisma.TaskWhereInput`
- `packages/backend/src/projects/views.ts`：`buildProjectViewWhere(view): Prisma.ProjectWhereInput`

两个函数对同一 `view` 值产出语义一致的 where（inbox/today/upcoming/anytime/someday/trash/logbook），Task 与 Project 各自映射到本模型的字段。新增 view 时两处都要加 case。

聚合接口 `FeedModule`（`GET /feed?view=...`）返回 Task + Project 混合的 `FeedItem[]`：

- `FeedService.findAll(userId, view)` 用 `Promise.all` 并行 `task.findMany` + `project.findMany`（各自 where 由 `buildTaskViewWhere`/`buildProjectViewWhere` 构建）。
- 各自 map 成带 `type: 'task' | 'project'` 的 `FeedItem`，合并后统一排序。
- 排序规则与单模型一致：默认 `sortOrder asc, createdAt desc`；`logbook` 按 `completedAt desc`。
- `FeedItem` 是联合类型，前端按 `type` 区分渲染（task 行复用 `TaskItem`，project 行点击跳转 `/projects/:id`）。

> 单模型接口（`GET /tasks?view=...`、`GET /projects`）保留不变，供 ProjectDetail/TagDetail/AreaDetail 等按 `projectId`/`tagId`/`areaId` 拉纯列表使用。

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
