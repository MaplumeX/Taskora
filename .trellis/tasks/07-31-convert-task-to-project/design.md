# Design: Convert task to project

## 1. 数据模型对照

| Task 字段 | Project 字段 | 迁移策略 |
|---|---|---|
| title | title | 直接平移 |
| notes | notes | 直接平移 |
| scheduledDate | scheduledDate | 直接平移 |
| dueDate | dueDate | 直接平移 |
| scheduledType | scheduledType | 共享枚举，直接平移 |
| status (TaskStatus) | status (ProjectStatus) | 枚举值同名(ACTIVE/COMPLETED)，直接平移 |
| completedAt | completedAt | 直接平移 |
| trashedAt | trashedAt | 直接平移 |
| bucket (TaskBucket) | bucket (ProjectBucket) | 枚举值同名(INBOX/ANYTIME/SCHEDULED)，可安全转换 |
| areaId | areaId | 任务自带 areaId 优先；任务为 null 时继承原所属 project 的 areaId（见 §3） |
| tags (TaskTag[]) | tags (ProjectTag[]) | 按 tagId 重建为 ProjectTag |
| sortOrder | sortOrder | 不沿用，取 user 维度 max+1 |
| parentId | — | 丢弃（项目无父任务概念） |
| projectId | — | 丢弃（新项目独立） |
| headingId | — | 丢弃（新项目无 heading） |
| children (Task[]) | tasks (Task[]) | 后代迁移到新项目（见 §3） |

## 2. API 设计

### 端点

```
POST /tasks/:id/convert-to-project
```

- 鉴权：`JwtAuthGuard`
- 路由放在 `TasksController`（操作对象是 task，语义上是 task 的转换）
- 返回：新建的 `Project`（与 `GET /projects/:id` 同 shape，含 tags 数组）

### Service 方法

`TasksService.convertToProject(userId, id)`：
- 不新增 DTO / 不接收 body（无额外入参）
- 复用 `ProjectsService` 的 bucket 解析？**不复用**——直接平移原 bucket 值，避免改变用户的桶归属语义（原任务 SCHEDULED 则项目也 SCHEDULED）。注：Project 与 Task 的 resolveBucket 逻辑对 area/parentId 不同，但转换时我们沿用原值，不重新解析。

## 3. 转换事务逻辑

在 `prisma.$transaction` 内执行：

```
1. existing = tx.task.findFirst({ where: { id, userId }, include: { tags: true, project: true } })
   if !existing → NotFoundException
   解析 effectiveAreaId：existing.areaId ?? existing.project?.areaId ?? null

2. 收集所有后代 id（BFS on parentId），复用 remove() 中已有的 BFS 模式：
   - descendantIds: Set（不含 converted task 自身）
   - directChildIds: parentId == id 的任务

3. 计算 nextSortOrder = max(project.sortOrder) + 1（tx 内）

4. 创建 Project：
   tx.project.create({
     data: {
       title, notes, scheduledDate, dueDate, scheduledType,
       status, completedAt, trashedAt, areaId: effectiveAreaId,
       bucket: existing.bucket as ProjectBucket,
       sortOrder: nextSortOrder,
       userId,
       tags: { create: existing.tags.map(tt => ({ tagId: tt.tagId })) }
     },
     include: { tags: { include: { tag: true } } }
   })

5. 迁移后代任务（一条 updateMany 即可，project 指向新项目 + heading 清空）：
   tx.task.updateMany({
     where: { id: { in: [...descendantIds] }, userId },
     data: { projectId: newProject.id, headingId: null }
   })

6. 直接子节点 parentId 置空（必须在硬删除原任务前完成，满足 onDelete: NoAction）：
   tx.task.updateMany({
     where: { id: { in: [...directChildIds] }, userId },
     data: { parentId: null }
   })

7. 硬删除原任务：
   tx.task.delete({ where: { id } })
   （TaskTag 由 onDelete: Cascade 自动随任务删除而清除）

8. return { ...newProject, tags: newProject.tags.map(pt => pt.tag) }
```

### 关于步骤 5/6 的合并

步骤 5 已把所有后代的 projectId/headingId 更新，但只有直接子节点需要 parentId=null。因 updateMany 批量设置 parentId 不能区分层级，故分开两次 updateMany：先 5（全后代 projectId+headingId），再 6（直接子 parentId=null）。顺序无强依赖，但均在 delete 之前。

### 边界情况

- **无子任务**：descendantIds 为空，步骤 5/6 的 updateMany 影响 0 行，无副作用。
- **任务本身是子任务（有 parentId）**：直接子节点 parentId 置空后，原父任务的 children 列表自然减少一项（关系断裂），符合预期。
- **completed 任务**：status/completedAt 平移，新项目即为已完成项目。
- **trashed 任务**：设计方案下 trash 变体菜单不展示转换项，故不会触发；即便触发，trashedAt 平移不影响。
- **任务归属某 project（projectId 非空）**：新项目独立，原 project 的 tasks 列表减少一项，符合 1A 语义。
- **任务的 areaId 为 null 但所属 project 有 areaId**：effectiveAreaId 继承原 project 的 areaId（B1 策略），保证区域归属不丢失。

## 4. 前端设计

### 4.1 API 层（`lib/api/tasks.api.ts`）

新增 `convertTaskToProject(id: string): Promise<ProjectResponseDto>`，调用 `POST /tasks/:id/convert-to-project`。类型从 `@taskora/shared` 引用 `ProjectResponseDto`（若不存在则引用现有 projects API 的返回类型）。

### 4.2 Hook（`lib/hooks/useTasks.ts`）

新增 `useConvertTaskToProject()` mutation：
- onSuccess: 失效 `['tasks']`、`['projects']`、`taskKeys.detail(task.id)`
- 由调用方传 id

### 4.3 菜单（`components/task/TaskContextMenu.tsx`）

- 在 Tags 项与 Delete/Restore 项之间插入"转换为项目"按钮（仅 `variant === 'default'` 时渲染）。
- onClick: closeMenu → mutate(task.id) → onSuccess toast(t('convertSuccess')) / onError toast(t('convertFailed'))。
- 复用现有 MENU_ITEM_CLASS。

### 4.4 i18n

`task` namespace 新增（zh / en）：
- `convertToProject`: 转换为项目 / Convert to Project
- `convertSuccess`: 已转换为项目 / Converted to project
- `convertFailed`: 转换失败 / Conversion failed

## 5. shared 包

- `convertTaskToProject` 无入参 DTO，无需在 shared 新增类型。
- 返回类型复用现有 `ProjectResponseDto`（projects API 已有的 response shape）。

## 6. 风险与权衡

- **bucket 直接平移 vs 重新解析**：选择平移以保留用户原意。若任务原 bucket=ANYTIME（因有 area），转项目后 areaId 仍在，bucket=ANYTIME 一致，无矛盾。
- **硬删除 vs 软删除原任务**：硬删除符合 1A（不进废纸篓）。代价是不可恢复——但转换是"形态变化"而非"删除"，数据全部保留在项目中，故可接受。
- **parentId NoAction 约束**：通过步骤 6 先清空直接子节点 parentId 规避。
