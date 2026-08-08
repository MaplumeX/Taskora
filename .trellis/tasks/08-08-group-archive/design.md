# Design — 为分组提供归档功能

## 架构与边界

### 数据模型变更

`ProjectHeading` 新增两个字段，与 Project/Task 的完成机制对齐：

```prisma
model ProjectHeading {
  // ...existing fields...
  status      HeadingStatus @default(ACTIVE)
  completedAt DateTime?
  // ...
}

enum HeadingStatus {
  ACTIVE
  COMPLETED
}
```

- `status`：ACTIVE（默认）| COMPLETED。归档 = COMPLETED，取消归档 = ACTIVE。
- `completedAt`：归档时间戳，与 Project/Task 的 completedAt 语义一致。
- 不新增 `archivedAt`——复用 `status`/`completedAt` 与现有模式对齐，减少概念冗余。

### 后端变更

#### 1. ProjectHeadingsService

**`findAll(userId, projectId)`** — 过滤归档 heading
- 当前返回所有 heading。改为只返回 `status=ACTIVE` 的 heading（活跃任务区使用）。
- 归档的 heading 不再出现在 `ProjectTaskLayout` 的活跃区。

**新增 `archive(userId, id)`**
- 事务内：
  1. 查 heading（含 projectId），校验归属 + project 归属
  2. 将 heading 下所有 `status=ACTIVE` 的 task 标记为 COMPLETED + 设 completedAt
  3. 将 heading 自身标记为 COMPLETED + 设 completedAt
- 已 COMPLETED 的 task 不动。
- 不级联 subtask（与现有 task complete 行为一致——subtask 独立管理状态）。

**新增 `unarchive(userId, id)`**
- 事务内：
  1. 查 heading，校验归属
  2. 将 heading 标记为 ACTIVE + 清除 completedAt
  3. **不动任何 task**

**`reorder(userId, dto)`** — 已有逻辑天然兼容
- 当前 `reorder` 查询 `headings = findMany({ where: { userId, projectId } })` 获取所有 heading id 用于校验。归档 heading 仍在此集合中。
- 但 `visibleTasks` 查询条件是 `status=ACTIVE`，归档后其下 task 变 COMPLETED，不在 visibleTasks 中。
- **风险**：前端 `normalizeLayout` 只处理传入的 tasks/headings。归档 heading 不在 `findAll` 返回中（改后），所以前端不会把它放入 layout。reorder 的 `assertExactIdSet` 校验 headingId 集合时，归档 heading 仍在 DB 中但前端不提交它——**会导致校验失败**。
- **修复**：`reorder` 的 heading 校验集合改为只查 `status=ACTIVE` 的 heading，与 `findAll` 对齐。

**`remove(userId, id)`** — 不变
- 删除 heading 仍硬删除记录。归档状态不影响删除逻辑。

**`convertToProject(userId, id)`** — 需评估
- 当前会移动 heading 下所有 task（含 trashed）到新项目。
- 归档 heading（COMPLETED）如果被转换为项目：新 project 应继承 COMPLETED 状态？还是重置为 ACTIVE？
- **决策**：convertToProject 仍可工作，但归档 heading 转换后的 project 保持 ACTIVE（新项目默认 ACTIVE）。理由：转换是一个"开始新项目"的动作，归档状态不应继承。如果需要，后续可单独加约束，当前不在归档功能范围内强加限制。

#### 2. ProjectHeadingsController

新增两个端点：
```
POST /project-headings/:id/archive
POST /project-headings/:id/unarchive
```

#### 3. DTO（shared 包）

`ProjectHeadingResponseDto` 新增：
```typescript
status: HeadingStatus;       // 'ACTIVE' | 'COMPLETED'
completedAt: string | null;
```

`HeadingStatus` enum 加入 shared 包（与 TaskStatus/ProjectStatus 并列）。

### 前端变更

#### 1. API + hooks（`project-headings.api.ts` / `useProjectHeadings.ts`）

- 新增 `archiveProjectHeading(id)` / `unarchiveProjectHeading(id)`
- 新增 `useArchiveProjectHeading` / `useUnarchiveProjectHeading` mutations
- 成功后 invalidate headings + tasks + feed

#### 2. ProjectTaskLayout — 活跃区不变

`useProjectHeadingsQuery` 返回的 heading 经 `findAll` 改后只含 ACTIVE heading。`normalizeLayout` 天然只处理 ACTIVE heading，无需改动。

#### 3. ProjectCompletedTasks — 核心改造

当前 `ProjectCompletedTasks`：
- 查询 `useTasksQuery({ projectId, completed: true })`（后端返回 ACTIVE + COMPLETED，前端过滤出 COMPLETED）
- 扁平展示 COMPLETED task

改造后：
- 仍查询 `useTasksQuery({ projectId, completed: true })`
- **额外查询归档 headings**：`useProjectHeadingsQuery` 已返回 ACTIVE heading，不够。需要新增一个查询或扩展 `findAll` 以返回归档 heading。
  - **方案**：`findAll` 新增 `includeArchived?: boolean` query 参数。默认（无参）只返回 `status=ACTIVE` heading，供活跃任务区使用；`includeArchived=true` 返回全部 heading（ACTIVE + COMPLETED），供已完成面板使用，前端按 status 分流。不新增端点，复用 `GET /project-headings`。
- 展示逻辑：
  - 归档 heading（COMPLETED）作为分组标题行显示（复用精简版 `ProjectHeadingRow` 或新建 `ArchivedHeadingRow`），标题行有下拉菜单含"取消归档"
  - 其下 COMPLETED task 按 headingId 关联展示
  - 无归档 heading 关联的 COMPLETED task（无 headingId 或 headingId 指向 ACTIVE heading）扁平展示

#### 4. ProjectDetail — 无结构变化

`ProjectDetail` 已渲染 `ProjectCompletedTasks`，改造后自动生效。

### 数据流

```
归档操作：
  User → POST /project-headings/:id/archive
    → Service: heading.status=COMPLETED, tasks.status=COMPLETED
    → invalidate headings/tasks/feed
    → findAll 不再返回该 heading（活跃区消失）
    → ProjectCompletedTasks 重新渲染，归档 heading 出现在面板内

取消归档：
  User → POST /project-headings/:id/unarchive
    → Service: heading.status=ACTIVE
    → invalidate
    → findAll 返回该 heading（活跃区出现）
    → ProjectCompletedTasks 中归档分组消失，其下 task 转入扁平区
```

## 兼容性与迁移

- Prisma 迁移：`ProjectHeading` 新增 `status`（默认 ACTIVE）+ `completedAt`（nullable）。现有数据自动获得 ACTIVE 状态，行为不变。
- `HeadingStatus` enum 新增到 shared 包，后端和前端同步引用。
- `findAll` 行为变更（过滤 ACTIVE）：现有前端 `useProjectHeadingsQuery` 用于 `ProjectTaskLayout`，过滤后更正确。不破坏现有行为。

## 权衡

- **复用 status/completedAt 而非新增 archivedAt**：与 Project/Task 一致，Logbook feed 可选支持归档 heading（本期不做）。代价是"归档"和"完成"共享同一字段，如果将来要区分"归档"和"完成"两种状态需要再拆分。
- **findAll 过滤 ACTIVE**：简化活跃区逻辑，但需要额外查询获取归档 heading 给已完成面板使用。
- **convertToProject 不继承归档状态**：保持简单，但归档 heading 转换后归档信息丢失（heading 被删除）。可接受——转换本身就是"把分组变成独立项目"的动作。

## 回滚

- 迁移可回滚（drop column status/completedAt）。
- 后端端点删除即可。
- 前端改动集中在 ProjectCompletedTasks + 新增 hooks/api，可 revert。