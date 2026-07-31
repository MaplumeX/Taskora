# Design: 独立 Subtask 表重构

## 1. Schema 变更

### 1.1 新增 Subtask 模型

```prisma
model Subtask {
  id          String      @id @default(uuid())
  title       String
  status      TaskStatus  @default(ACTIVE)
  completedAt DateTime?
  sortOrder   Int         @default(0)
  taskId      String
  task        Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([taskId])
}
```

- 复用 `TaskStatus` 枚举（ACTIVE / COMPLETED），不新建枚举
- `onDelete: Cascade`：父 Task 物理删除时 Subtask 自动删除（用于 emptyTrash 场景）
- 无 `trashedAt`：Subtask 不参与软删。父 Task 软删时 Subtask 保留不动；父恢复后子任务仍在

### 1.2 Task 模型变更

移除：
```prisma
  parentId   String?
  parent     Task?    @relation("TaskChildren", fields: [parentId], references: [id], onDelete: NoAction)
  children   Task[]   @relation("TaskChildren")
```

新增 relation：
```prisma
  subtasks   Subtask[]
```

Task 保留 `projectId` / `headingId` / `areaId` 不变。

## 2. DTO 变更 (packages/shared)

### 2.1 新增 SubtaskDto

```ts
// shared/src/dtos/subtask.dto.ts
export interface CreateSubtaskDto {
  title: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  status?: TaskStatus;
}

export interface SubtaskResponseDto {
  id: string;
  title: string;
  status: TaskStatus;
  completedAt: string | null;
  sortOrder: number;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderSubtasksDto {
  orderedIds: string[];
}
```

### 2.2 Task DTO 变更

- `CreateTaskDto`：移除 `parentId`
- `UpdateTaskDto`：移除 `parentId`
- `TaskQueryDto`：移除 `parentId`
- `TaskResponseDto`：移除 `parentId` / `children`，新增 `subtasks: SubtaskResponseDto[]`

### 2.3 Feed DTO 变更

- `TaskFeedItem`：移除 `parentId`

## 3. 后端 API 设计

### 3.1 新增 SubtasksController

```
POST   /tasks/:taskId/subtasks          创建子任务
POST   /tasks/:taskId/subtasks/reorder  重排子任务
PATCH  /subtasks/:id                    更新（title / status）
DELETE /subtasks/:id                    删除
POST   /subtasks/:id/complete           标记完成
POST   /subtasks/:id/uncomplete         取消完成
```

### 3.2 新增 SubtasksService

```ts
@Injectable()
export class SubtasksService {
  create(userId, taskId, dto: CreateSubtaskDto): Promise<SubtaskResponseDto>
  update(userId, id, dto: UpdateSubtaskDto): Promise<SubtaskResponseDto>
  remove(userId, id): Promise<void>
  complete(userId, id): Promise<SubtaskResponseDto>
  uncomplete(userId, id): Promise<SubtaskResponseDto>
  reorder(userId, taskId, orderedIds: string[]): Promise<void>
}
```

- 所有方法通过 `taskId → task.userId` 或直接 `subtask.task.userId` 做归属校验
- `create`：校验 task 归属，计算 next sortOrder（max+1）
- `update`：`status → COMPLETED` 时设 `completedAt`，`→ ACTIVE` 时清空
- `reorder`：同 task 下的 subtask 按 orderedIds 批量更新 sortOrder

### 3.3 TasksService 变更

- `create`：移除 `parentId` 入参，移除 `resolveBucket` 中对 `parentId` 的处理
- `findAll`：移除 `parentId` query 分支
- `findOne`：`include` 从 `{ children, tags }` 改为 `{ subtasks, tags }`，按 `sortOrder` 排序
- `update`：移除 `parentId` 处理及 `heading disconnect on parentId` 逻辑
- `remove` / `restore`：**移除全部 BFS 逻辑**，仅软删/恢复 task 本身
- `convertToProject`：改为读取 `subtasks`，将每条 subtask 创建为新项目下的 Task，然后删除原 task（Subtask 走 CASCADE）

### 3.4 FeedService 变更

- `emptyTrash`：移除 parentId BFS 后代收集。trashed task 物理删除时 Subtask 自动 CASCADE
- `findAll`：`TaskFeedItem` 映射移除 `parentId`

### 3.5 ProjectHeadingsService 变更

- `reorder`：移除 `parentId: null` 过滤条件（3 处 `where` 子句）
- `remove`：移除 parentId BFS 后代收集。heading 下属 task 软删时，其 subtask 保留

## 4. 前端变更

### 4.1 API 层 (tasks.api.ts)

新增：
```ts
createSubtask(taskId, data): Promise<SubtaskResponseDto>
updateSubtask(id, data): Promise<SubtaskResponseDto>
deleteSubtask(id): Promise<void>
completeSubtask(id): Promise<SubtaskResponseDto>
uncompleteSubtask(id): Promise<SubtaskResponseDto>
reorderSubtasks(taskId, orderedIds): Promise<void>
```

移除：`TaskQuery.parentId`

### 4.2 Hooks (useTasks.ts)

新增：
```ts
useCreateSubtask()
useUpdateSubtask()
useDeleteSubtask()
useCompleteSubtask()
useUncompleteSubtask()
useReorderSubtasks()
```

`useCreateTask` 不再传 `parentId`。

### 4.3 TaskRowExpanded

- `addSubtask` → 调用 `createSubtask(task.id, { title })`
- `SubtaskRow` 的 props 类型从 `TaskResponseDto` 改为 `SubtaskResponseDto`
- `SubtaskRow` 内部 mutation 换用 subtask hooks
- `children` → `current.subtasks ?? []`

### 4.4 列表过滤清理

- `FeedListView`：移除 `!parentId` 过滤
- `ProjectTaskLayout`：移除 `!task.parentId` 过滤和 parentId map

## 5. 数据迁移

```sql
-- 1. 删除所有 parentId 非空的 task（现有子任务，测试数据）
DELETE FROM "Task" WHERE "parentId" IS NOT NULL;
-- TaskTag cascade 自动清理

-- 2. 移除 parentId 列和自引用 FK
ALTER TABLE "Task" DROP CONSTRAINT "Task_parentId_fkey";
ALTER TABLE "Task" DROP COLUMN "parentId";

-- 3. 创建 Subtask 表
CREATE TABLE "Subtask" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
  "completedAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "taskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE
);
CREATE INDEX "Subtask_taskId_idx" ON "Subtask"("taskId");
```

通过 `prisma migrate dev --name subtask_own_table` 生成。

## 6. 风险与权衡

| 风险 | 缓解 |
|------|------|
| `convertToProject` 中 subtask → task 提升后丢失归属层级 | 提升后的 task 挂到新 project 下，projectId 明确，可接受 |
| Subtask 不支持嵌套 | 明确 out of scope，符合产品定位 |
| 父 Task 软删期间 Subtask 仍在 | 父恢复后子任务完整保留，语义正确 |
| 前端 `SubtaskResponseDto` 缺少 `projectId`/`areaId` | 创建子任务时后端不需要这些字段（Subtask 不含），前端 `addSubtask` 也不传 |
