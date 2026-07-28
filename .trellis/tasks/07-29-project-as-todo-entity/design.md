# Design — Project 升级为与 Task 同级的待办实体

## 1. 目标与边界

见 prd.md。本设计聚焦：数据模型、后端服务/接口契约、聚合接口、前端数据流与组件改造。

## 2. 枚举复用决策

### 决策：复用现有 `ScheduledType`，新增 `ProjectStatus` / `ProjectBucket`

- `ScheduledType`（NONE/DATE/SOMEDAY）语义通用，Project 直接复用，不新增。
- `TaskStatus` / `TaskBucket` 在 Prisma 中是独立 enum type（虽然值相同）。为避免跨模型共享同一 enum 带来的迁移复杂度与语义耦合，**新增 `ProjectStatus` / `ProjectBucket` 枚举**，值与 `TaskStatus` / `TaskBucket` 完全一致。
- `packages/shared/src/enums/task.enum.ts` 中 TS enum 已被前后端共享。新增 `project.enum.ts`（`ProjectStatus`、`ProjectBucket`），与 task.enum 形态一致；或在 task.enum.ts 内追加。**选择：新建 `packages/shared/src/enums/project.enum.ts`**，保持职责清晰。

理由：Prisma enum 是数据库级 TYPE，Task 与 Project 共用同一 enum type 在迁移上可行但会让两个模型耦合（改一个要同时考虑两个表）。新增独立 enum type 成本低、隔离性好。

## 3. 数据模型变更（schema.prisma）

### 3.1 新增枚举

```prisma
enum ProjectStatus {
  ACTIVE
  COMPLETED
  TRASHED
}

enum ProjectBucket {
  INBOX
  ANYTIME
  SCHEDULED
}
```

`ScheduledType` 复用现有。

### 3.2 Project 模型新增字段

```prisma
model Project {
  id        String   @id @default(uuid())
  title     String
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  areaId    String?
  area      Area?    @relation(fields: [areaId], references: [id])
  tasks     Task[]

  sortOrder Int @default(0)

  // 新增：与 Task 对齐
  status        ProjectStatus  @default(ACTIVE)
  bucket        ProjectBucket  @default(INBOX)
  scheduledType ScheduledType  @default(NONE)
  scheduledDate DateTime?
  dueDate       DateTime?
  completedAt   DateTime?
  trashedAt     DateTime?

  tags ProjectTag[]

  @@index([userId])
  @@index([areaId])
}
```

### 3.3 新增 ProjectTag 关联表

```prisma
model ProjectTag {
  id        String   @id @default(uuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tagId     String
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([projectId, tagId])
  @@index([projectId])
  @@index([tagId])
}
```

需在 `Tag` 模型补 `projects ProjectTag[]` 反向关系。

### 3.4 迁移策略

`prisma migrate dev --name project_as_todo_entity`。新增 enum + ALTER TABLE ADD COLUMN（带默认值，存量 Project 自动 ACTIVE/INBOX/NONE，日期字段 null）+ CREATE TABLE ProjectTag。属增量迁移，不破坏存量。

## 4. shared DTO 变更

### 4.1 新增 `packages/shared/src/enums/project.enum.ts`

```ts
export enum ProjectStatus { ACTIVE='ACTIVE', COMPLETED='COMPLETED', TRASHED='TRASHED' }
export enum ProjectBucket { INBOX='INBOX', ANYTIME='ANYTIME', SCHEDULED='SCHEDULED' }
```

从 `packages/shared/src/index.ts` 导出。

### 4.2 `project.dto.ts` 升级

```ts
export interface CreateProjectDto {
  title: string;
  notes?: string;
  areaId?: string;
  scheduledDate?: string;
  scheduledType?: ScheduledType;
  dueDate?: string;
  bucket?: ProjectBucket;
  tagIds?: string[];
}

export interface UpdateProjectDto {
  title?: string;
  notes?: string;
  areaId?: string | null;
  scheduledDate?: string | null;
  scheduledType?: ScheduledType;
  dueDate?: string | null;
  bucket?: ProjectBucket;
  tagIds?: string[];
}

export interface ProjectResponseDto {
  id: string; title: string; notes: string | null; areaId: string | null;
  sortOrder: number;
  status: ProjectStatus; bucket: ProjectBucket;
  scheduledType: ScheduledType;
  scheduledDate: string | null; dueDate: string | null;
  completedAt: string | null; trashedAt: string | null;
  tags?: TagResponseDto[];
  createdAt: string; updatedAt: string;
}
```

### 4.3 聚合 DTO

新增 `packages/shared/src/dtos/feed.dto.ts`：

```ts
export type FeedItemType = 'task' | 'project';

export interface FeedItemBase {
  id: string;
  type: FeedItemType;
  title: string;
  notes: string | null;
  scheduledDate: string | null;
  scheduledType: ScheduledType;
  dueDate: string | null;
  status: TaskStatus | ProjectStatus; // 值集相同
  bucket: TaskBucket | ProjectBucket;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  tags: TagResponseDto[];
}

export interface TaskFeedItem extends FeedItemBase {
  type: 'task';
  parentId: string | null;
  projectId: string | null;
  areaId: string | null;
}

export interface ProjectFeedItem extends FeedItemBase {
  type: 'project';
  areaId: string | null;
}

export type FeedItem = TaskFeedItem | ProjectFeedItem;
```

> `status` / `bucket` 值集在 Task/Project 间相同，聚合 DTO 用联合类型即可，前端按 `type` 区分行为。

## 5. 后端服务变更

### 5.1 ProjectsService 升级

- 引入与 `TasksService.resolveBucket` 相同逻辑（可抽到共享 helper 或在 ProjectsService 内复制）。**决策：复制一份 `resolveBucket` 到 ProjectsService**（Task 的 resolveBucket 涉及 parentId/projectId/areaId，Project 无 parentId/projectId，逻辑略简，复制更清晰）。
  - Project resolveBucket：DATE/SOMEDAY → SCHEDULED；NONE → 有 areaId 则 ANYTIME，否则 INBOX（Project 无 projectId）。
- `create`：支持 scheduledDate/scheduledType/dueDate/bucket/tagIds（nested create 模式，同 Task）。
- `update`：支持新字段，scheduledType 变化时同步 scheduledDate，重算 bucket；tagIds 全量 set（deleteMany + createMany 事务）。
- `findOne` / `findAll`：include `tags: { include: { tag: true } }`，map 成 `Tag[]`。
- 新增 `remove`（软删除：status=TRASHED + trashedAt）、`restore`、`complete`、`uncomplete`、`reorder`（已有）。
  - 注意：现有 `remove` 是物理删除。**决策：改为软删除**，与 Task 对齐。若需保留物理删除能力，另开接口——本次不做，统一软删除。
- ProjectController 新增 `POST :id/restore`、`POST :id/complete`、`POST :id/uncomplete`，`DELETE :id` 改为软删除。

### 5.2 聚合服务 FeedService（新模块）

新增 `packages/backend/src/feed/`：
- `feed.module.ts` / `feed.controller.ts` / `feed.service.ts` / `dto/feed.dto.ts`

`FeedController`：`@Controller('feed')`，`@UseGuards(JwtAuthGuard)`，`GET /feed?view=...`。

`FeedService.findAll(userId, view)`：
- 根据 view 分别构建 Task where 与 Project where（复用 TasksService.findAll 的 view 分发逻辑，但拆成两个 where）。
- 并行 `Promise.all([taskFindMany, projectFindMany])`。
- 各自 map 成 FeedItem（带 `type`），合并后按统一规则排序。
- 排序规则：默认 `sortOrder asc, createdAt desc`；logbook 按 `completedAt desc`；upcoming 在前端按 scheduledDate 分组（后端只返回平铺 + 排序）。

**复用策略**：把 TasksService.findAll 中 view→where 的逻辑抽成纯函数 `buildTaskViewWhere(view, userId)`（放 `tasks/views.ts` 或 service 内静态方法），FeedService 调用。Project 侧写 `buildProjectViewWhere`。避免在 FeedService 重写一遍 view 逻辑。

view 对 Project 的语义（与 Task 对齐）：
- inbox: bucket=INBOX, status=ACTIVE, scheduledType=NONE
- today: status=ACTIVE, scheduledType=DATE, scheduledDate<=now
- upcoming: status=ACTIVE, scheduledType=DATE, scheduledDate>now
- anytime: bucket=ANYTIME, status=ACTIVE, scheduledType=NONE
- someday: scheduledType=SOMEDAY, status=ACTIVE
- trash: status=TRASHED
- logbook: status=COMPLETED

## 6. 前端变更

### 6.1 API 层

- `lib/api/feed.api.ts`：`getFeed(view) → FeedItem[]`。
- `lib/api/projects.api.ts`：扩展 create/update 入参类型；新增 `restoreProject`/`completeProject`/`uncompleteProject`；`deleteProject` 语义变为软删除（接口路径不变）。

### 6.2 hooks 层

- `lib/hooks/useFeed.ts`：`useFeedQuery(view)` + `feedKeys`。
- `useProjects.ts`：补 `useRestoreProject` / `useCompleteProject` / `useUncompleteProject`；更新 ProjectResponseDto 类型。
- 聚合视图失效策略：feed 查询 key 为 `['feed', view]`，task/project mutation onSuccess 需 invalidate `['feed']`。

### 6.3 页面改造

Today / Upcoming / Anytime / Someday / Logbook / Trash / Inbox：将 `useTasksQuery({view})` 换成 `useFeedQuery(view)`，渲染 `FeedItem[]`。

- 现有 `TaskListView` / `TaskItem` / `TaskList` 紧耦合 `TaskResponseDto`。**决策：新建 `FeedListView` / `FeedItem` 组件**（放 `components/feed/`），接收 `FeedItem[]`，按 `item.type` 分发渲染：
  - `type==='task'`：渲染 TaskItem（复用现有 TaskItem，传入 TaskFeedItem 并做适配/类型断言）。
  - `type==='project'`：渲染新的 `ProjectFeedRow`（标题 + 日期 badge + 标签），点击跳转 `/projects/:id`，不展开。
- Upcoming/Logbook 的分组逻辑改为基于 FeedItem（scheduledDate / completedAt），分组函数参数类型放宽为 `FeedItem`。

**复用 vs 新建权衡**：TaskItem 内部耦合 `useTaskQuery` / `useUpdateTask` 等 task 专属逻辑，Project 行无法直接套用。新建 `ProjectFeedRow` 更清晰，避免在 TaskItem 内塞 `type` 分支污染。Task 行通过把 TaskFeedItem 断言为 TaskResponseDto 复用 TaskItem（字段超集兼容）。

### 6.4 Project 字段编辑

- ProjectFeedRow 支持展开编辑面板（复用 ScheduledDateField/DueDateField/TagsField 思路，但调用 `updateProject`）。**本期最小实现**：行内显示日期/标签，点击跳转详情页编辑；详情页 ProjectDetail 增加字段编辑区（复用 field 组件 + updateProject）。
- 是否在聚合列表行内直接编辑 Project 字段：**本期先不做**，聚合列表点击即跳转，编辑在详情页完成。降低耦合，后续可加。

## 7. 兼容性 / 回滚

- Schema 迁移为增量（新增列/表/枚举），存量 Project 默认值安全。
- 旧 `GET /projects` 接口保留并返回新字段（前端 ProjectDetail/侧栏仍用），不破坏。
- 旧 `DELETE /projects/:id` 改为软删除——前端 Trash 视图需能显示被软删的 Project（聚合接口已覆盖）。
- 回滚：反向迁移（drop ProjectTag 表、drop Project 新列、drop 新 enum）。Prisma migrate 不自动生成反向，需手写或 `migrate reset`（开发环境）。

## 8. 风险

- `TaskItem` 复用断言：TaskFeedItem 缺 `children` 等字段，TaskItem 若访问需补默认值。实现时检查 TaskItem 对 TaskResponseDto 字段的依赖。
- 聚合接口排序跨类型混合：sortOrder 在 Task 与 Project 各自空间独立，混合排序后相对顺序稳定但无全局意义——可接受（与现有"各视图内 sortOrder 排序"一致）。
- Project 软删除后其下 Task 行为：Task.projectId 仍指向被软删 Project。本期不处理（Project 在 Trash 中显示，其下 Task 不自动进 Trash）。