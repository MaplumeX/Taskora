# scheduledType field and Someday as view refactor

## Goal

把"Someday"从任务"归属位置"（bucket）提升为计划日期字段的一种取值，使 Someday 成为一种 view 而非 bucket。当前 Someday 是 `TaskBucket` 枚举值；重构后由新增的 `scheduledType` 字段表达"计划日期的类型 = someday"。

## Background

现有模型：

- `TaskBucket` 枚举：`INBOX | ANYTIME | SOMEDAY | SCHEDULED`
- `scheduledDate: DateTime?` 只能存具体日期，无法表达"留到某天"这一语义
- `resolveBucket` 优先级：scheduledDate → bucket → project/area → INBOX
- Someday view = `bucket=SOMEDAY + scheduledDate=null`

用户已确认选型：方案 A（新增 scheduledType 字段），保留 SCHEDULED bucket，不需要存量数据迁移（仍在开发期，可直接重置库）。

## Requirements

### R1. 新增 ScheduledType 枚举与字段

- shared enums (`packages/shared/src/enums/task.enum.ts`)：新增
  ```ts
  enum ScheduledType { NONE='NONE', DATE='DATE', SOMEDAY='SOMEDAY' }
  ```
- `TaskBucket` 枚举删除 `SOMEDAY`，变为 `INBOX | ANYTIME | SCHEDULED`
- Prisma schema：新增 `enum ScheduledType`；`Task` 模型新增 `scheduledType ScheduledType @default(NONE)` 字段；删除 `TaskBucket` 中的 `SOMEDAY`；生成 migration

### R2. shared DTOs 加 scheduledType

- `packages/shared/src/dtos/task.dto.ts`：
  - `CreateTaskDto.scheduledType?: ScheduledType`
  - `UpdateTaskDto.scheduledType?: ScheduledType | null`
  - `TaskResponseDto.scheduledType: ScheduledType`

### R3. backend DTO 校验

- `packages/backend/src/tasks/dto/tasks.dto.ts`：
  - CreateTaskDto / UpdateTaskDto 增加 `scheduledType` 字段及 `@IsEnum(ScheduledType)` 校验
  - UpdateTaskDto 允许传 `null` 吗？不允许；ScheduledType 永远有值（NONE 为默认）

### R4. resolveBucket 重写

`tasks.service.ts` 的 `resolveBucket` 改为接受 `scheduledType`：

```ts
if (scheduledType === ScheduledType.DATE) return TaskBucket.SCHEDULED;
if (scheduledType === ScheduledType.SOMEDAY) return TaskBucket.SCHEDULED;
// scheduledType === NONE 时
if (bucket) return bucket === TaskBucket.SCHEDULED ? TaskBucket.INBOX : bucket;
if (projectId || areaId) return TaskBucket.ANYTIME;
return TaskBucket.INBOX;
```

要点：
- scheduledType=DATE 需配合 scheduledDate 非 null（省略校验，由前端保证；切到 DATE 时若没传 scheduledDate，保留已有 scheduledDate）
- scheduledType=SOMEDAY → bucket=SCHEDULED，scheduledDate 置 null
- 切回 NONE → bucket 降级为 INBOX/ANYTIME（按 project/area），scheduledDate 置 null

### R5. create / update 逻辑

- create：scheduledType 默认 NONE；若传 SOMEDAY 且未传 scheduledDate，则存 null；按新 resolveBucket 决定 bucket
- update：当 dto.scheduledType 变化时，同步维护 scheduledDate：
  - DATE：保留或设置 scheduledDate
  - SOMEDAY：scheduledDate = null
  - NONE：scheduledDate = null
  - 重新 resolveBucket

### R6. view 过滤逻辑改写（`findAll`）

- `inbox`：bucket=INBOX, status=ACTIVE, scheduledType=NONE（替换原 scheduledDate=null）
- `today`：status=ACTIVE, scheduledType=DATE, scheduledDate<=now
- `upcoming`：status=ACTIVE, scheduledType=DATE, scheduledDate>now
- `anytime`：bucket=ANYTIME, status=ACTIVE, scheduledType=NONE
- `someday`：scheduledType=SOMEDAY, status=ACTIVE（替换原 bucket=SOMEDAY）
- `trash` / `logbook` 不变

### R7. 前端

- `packages/frontend/src/lib/api/tasks.api.ts`：保持 `TaskView` 类型不变
- `packages/frontend/src/components/task/QuickAddTask.tsx`：删除 `defaultBucket` 用法，新增 `scheduledType` prop
- `QuickAddTask` 在 `dueToday` 分支里应设 `scheduledType='DATE' + scheduledDate=today`
- `packages/frontend/src/pages/Someday.tsx`：QuickAddTask 改传 `scheduledType='SOMEDAY'`（而非 defaultBucket='SOMEDAY'）
- `packages/frontend/src/pages/Inbox.tsx`：QuickAddTask 可移除 `defaultBucket` 调用
- `packages/frontend/src/pages/Upcoming.tsx`：若按 scheduledDate 聚合，仍只处理 DATE 任务，无需特改
- `packages/frontend/src/components/task/TaskDetail.tsx`：日期区扩展为类型选择（None / 日期 / Someday），编辑 scheduledType + scheduledDate
- 任何使用 `TaskBucket.SOMEDAY` 或 defaultBucket='SOMEDAY' 的地方需替换

### R8. seed / 测试

- `packages/backend/prisma/seed.ts` 中的 `bucket: TaskBucket.SOMEDAY` 改为 `scheduledType: ScheduledType.SOMEDAY + bucket=ANYTIME`
- 现有测试 spec 中 `bucket: TaskBucket.SOMEDAY` 的用例同步修正（tasks.service.tags.spec.ts / logbook.spec.ts）

## Out of Scope

- 存量数据迁移（开发期可直接重置库）
- dueDate 字段及其 view 逻辑
- 新的 UI 视觉设计（保持现有日期 input + 类型选择控件）
- Today/Someday 之外的其他新 view

## Acceptance Criteria

- [ ] `TaskBucket` 枚举不再包含 `SOMEDAY`，仅 `INBOX | ANYTIME | SCHEDULED`
- [ ] `Task` 模型含 `scheduledType` 字段，默认 `NONE`
- [ ] Prisma migration 生成且 `prisma migrate dev` 成功
- [ ] Someday view 过滤条件为 `scheduledType=SOMEDAY` 而非 `bucket=SOMEDAY`
- [ ] Inbox/Anytime view 过滤排除 SCHEDULED 的 Someday/Date 任务（通过 scheduledType=NONE）
- [ ] 创建 task 时 scheduledType=SOMEDAY → bucket=SCHEDULED + scheduledDate=null
- [ ] 创建 task 时 scheduledType + scheduledDate=具体日期 → bucket=SCHEDULED
- [ ] 更新 task 从 DATE → SOMEDAY → scheduledDate 清空，bucket 仍 SCHEDULED
- [ ] 更新 task 从 SOMEDAY → NONE → bucket 降级为 INBOX 或 ANYTIME，scheduledDate=null
- [ ] Someday 页面 QuickAddTask 创建的任务出现在 Someday view
- [ ] TaskDetail 日期区可切换 None / 日期 / Someday
- [ ] 现有测试（调整后）通过，新增 scheduledType 相关最小测试

## Open Questions

（无）