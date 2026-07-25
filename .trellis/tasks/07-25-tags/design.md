# Tags — 技术设计

## 1. Schema 设计

在 `packages/backend/prisma/schema.prisma` 新增：

```prisma
model TagGroup {
  id        String   @id @default(uuid())
  title     String
  sortOrder Int      @default(0)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tags      Tag[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

model Tag {
  id          String    @id @default(uuid())
  title       String
  color       String    @default("#3B82F6") // hex
  sortOrder   Int       @default(0)
  tagGroupId  String?
  tagGroup    TagGroup? @relation(fields: [tagGroupId], references: [id], onDelete: SetNull)
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks       TaskTag[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId])
  @@index([tagGroupId])
}

model TaskTag {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tagId     String
  tag       Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([taskId, tagId])
  @@index([taskId])
  @@index([tagId])
}
```

### 关键决策

- **TagGroup 删除时 Tag 的 tagGroupId 置 null**：用 `onDelete: SetNull`，符合 PRD"删除分组不删标签"
- **Tag 删除时 TaskTag 级联删除**：用 `onDelete: Cascade`，自动清理关联
- **TaskTag 唯一约束**：`@@unique([taskId, tagId])` 防重复贴标签
- **User 级隔离**：Tag / TagGroup 都有 userId，查询都 where userId

### Task 模型补充

```prisma
model Task {
  // ... existing fields
  tags TaskTag[]
}
```

## 2. API 设计

### 2.1 Tags Module 结构

```
packages/backend/src/tags/
├── tags.module.ts
├── tags.controller.ts
├── tags.service.ts
└── dto/
    └── tags.dto.ts

packages/backend/src/tag-groups/
├── tag-groups.module.ts
├── tag-groups.controller.ts
├── tag-groups.service.ts
└── dto/
    └── tag-groups.dto.ts
```

> Tags 与 TagGroups 拆为两个 module（虽然都操作用户标签），保持单一职责；TagGroups 可独立 CRUD，Tags 引用 TagGroup。

### 2.2 DTO（shared 包）

`packages/shared/src/dtos/tag.dto.ts`:

```ts
export interface CreateTagDto {
  title: string;
  color?: string;        // hex, 默认 "#3B82F6"
  tagGroupId?: string | null;
}

export interface UpdateTagDto {
  title?: string;
  color?: string;
  tagGroupId?: string | null;
}

export interface TagResponseDto {
  id: string;
  title: string;
  color: string;
  sortOrder: number;
  tagGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`packages/shared/src/dtos/tag-group.dto.ts`:

```ts
export interface CreateTagGroupDto {
  title: string;
}

export interface UpdateTagGroupDto {
  title?: string;
}

export interface TagGroupResponseDto {
  id: string;
  title: string;
  sortOrder: number;
  tags: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 Task DTO 扩展

`packages/shared/src/dtos/task.dto.ts` 的 `CreateTaskDto` / `UpdateTaskDto` 增加：

```ts
export interface UpdateTaskDto {
  // ... existing
  tagIds?: string[];   // 全量 set 语义
}
```

`TaskResponseDto` 增加：

```ts
export interface TaskResponseDto {
  // ... existing
  tags?: TagResponseDto[];
}
```

注意：`CreateTaskDto` 不加 `tagIds`（创建时默认无标签，贴标签走 update）。

## 3. Service 逻辑

### 3.1 TagsService

```ts
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId, dto) {
    return this.prisma.tag.create({
      data: { title: dto.title, color: dto.color ?? "#3B82F6", tagGroupId: dto.tagGroupId, userId },
    });
  }

  findAll(userId) {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId, id) {
    const tag = await this.prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  async update(userId, id, dto) {
    await this.findOne(userId, id);
    return this.prisma.tag.update({
      where: { id },
      data: { title: dto.title, color: dto.color, tagGroupId: dto.tagGroupId },
    });
  }

  async remove(userId, id) {
    await this.findOne(userId, id);
    return this.prisma.tag.delete({ where: { id } });
    // TaskTag 关联通过 onDelete: Cascade 自动清理
  }
}
```

### 3.2 TasksService.update 扩展 tagIds

在 `TasksService.update` 现有逻辑后追加：

```ts
if (dto.tagIds !== undefined) {
  // 全量 set：先 delete 旧关联，再 create 新关联
  await this.prisma.taskTag.deleteMany({ where: { taskId: id } });
  if (dto.tagIds.length > 0) {
    await this.prisma.taskTag.createMany({
      data: dto.tagIds.map(tagId => ({ taskId: id, tagId })),
    });
  }
}
```

> 不用 `set` 关系语法（Prisma 隐式 set 不支持 TaskTag 的额外字段如 id/createdAt），用 deleteMany + createMany 显式控制。

### 3.3 TasksService.findAll / findOne 返回 tags

在 `findMany` 和 `findFirst` 的 include 中加 `tags: { include: { tag: true } }`，并在返回前 map 为 `tags: tag[]`。

> 决策：在 service 层就把 `TaskTag[]` map 成 `Tag[]`（前端只需 Tag 数据，不需 TaskTag 中间表字段），保持 DTO 契约清晰。

## 4. 前端设计

### 4.1 API 层

`packages/frontend/src/lib/api/tags.api.ts`：getTags / getTag / createTag / updateTag / deleteTag
`packages/frontend/src/lib/api/tag-groups.api.ts`：getTagGroups / createTagGroup / updateTagGroup / deleteTagGroup

### 4.2 Hooks

`packages/frontend/src/lib/hooks/useTags.ts`：useTagsQuery / useCreateTag / useUpdateTag / useDeleteTag
`packages/frontend/src/lib/hooks/useTagGroups.ts`：useTagGroupsQuery / useCreateTagGroup / useUpdateTagGroup / useDeleteTagGroup

`useTasks` 的 `UpdateTaskDto` 调用扩展支持 `tagIds`（无需改 hook，DTO 已共享）。

### 4.3 页面与组件

- `/tags` 页面：标签管理（左：分组列表，右：标签列表，支持创建/编辑/删除/拖拽到分组—MVP 仅 select 切换分组）
- `/tags/:tagId` 页面：按标签筛选的任务列表（调 `GET /tasks?tagId=xxx`，需后端 TasksController 的 query 加 `tagId` 参数）
- Sidebar 新增 Tags 区：折叠显示标签列表（点击跳 `/tags/:tagId`），底部"管理"链接到 `/tags`
- TaskDetail 新增"标签"行：多选下拉（从 useTagsQuery 拉标签，当前 task 的 tagIds 预选）
- TaskItem 新增标签徽章：小色块行（`<span style={{background: tag.color}}>` 12px 圆点）

### 4.4 TasksController 扩展

`TaskQueryDto` 增加 `tagId?: string`，`findAll` where 中加 `tags: { some: { tagId } }`。

## 5. 兼容性

- 新增 model 不影响现有 Task / Project / Area 查询（除非显式 include tags）
- `TaskResponseDto.tags` 为可选字段，旧前端调用不传 tagIds 时不报错
- migration 是纯新增表 + Task 增加 relation，无破坏性变更

## 6. 风险

- **全量 set 语义的并发**：deleteMany + createMany 非原子，Prisma 不支持嵌套事务包裹两步；用 `$transaction` 包裹
- **颜色校验**：hex 格式校验在 DTO 用 `@Matches(/^#[0-9A-Fa-f]{6}$/)` class-validator