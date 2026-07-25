# Design: scheduledType field and Someday as view refactor

## 架构与边界

本次重构横跨四个层，改动按依赖顺序：

```
shared/enums  →  prisma schema  →  shared/dtos  →  backend dto + service  →  frontend
```

每层只依赖前一层，无循环。

## 数据模型变更

### TaskBucket 枚举

```prisma
enum TaskBucket {
  INBOX
  ANYTIME
  SCHEDULED
}
// SOMEDAY 删除
```

### 新增 ScheduledType 枚举

```prisma
enum ScheduledType {
  NONE
  DATE
  SOMEDAY
}
```

### Task 模型新增字段

```prisma
model Task {
  ...
  scheduledType ScheduledType @default(NONE)
  scheduledDate DateTime?     // DATE 时有值，SOMEDAY/NONE 时为 null
  bucket        TaskBucket @default(INBOX)
  ...
}
```

字段语义：

| scheduledType | scheduledDate | bucket      | 出现的 view       |
|---------------|---------------|-------------|-------------------|
| NONE          | null          | INBOX       | Inbox             |
| NONE          | null          | ANYTIME     | Anytime           |
| DATE          | <= today      | SCHEDULED   | Today             |
| DATE          | > today       | SCHEDULED   | Upcoming          |
| SOMEDAY       | null          | SCHEDULED   | Someday           |

关键不变量：`bucket=SCHEDULED` ⟺ `scheduledType ∈ {DATE, SOMEDAY}`。bucket 始终由 resolveBucket 从 scheduledType 推导，均为服务端推导。

## resolveBucket 新逻辑

```ts
private resolveBucket(
  bucket: TaskBucket | undefined,
  scheduledType: ScheduledType | undefined,
  projectId: string | null | undefined,
  areaId: string | null | undefined,
): TaskBucket {
  if (scheduledType === ScheduledType.DATE) return TaskBucket.SCHEDULED;
  if (scheduledType === ScheduledType.SOMEDAY) return TaskBucket.SCHEDULED;
  // scheduledType === NONE（含 undefined，默认 NONE）
  if (bucket && bucket !== TaskBucket.SCHEDULED) return bucket;
  if (projectId || areaId) return TaskBucket.ANYTIME;
  return TaskBucket.INBOX;
}
```

为什么 `bucket !== SCHEDULED` 检查：当从 DATE 切回 NONE 时，旧 bucket=SCHEDULED 已失效，需降级到 INBOX/ANYTIME。

数据来源：`packages/backend/src/tasks/tasks.service.ts:18-28` 原有实现。

## update 逻辑：scheduledType 驱动的级联

当 `dto.scheduledType` 传入时，需要同步维护 scheduledDate：

```ts
const newScheduledType = dto.scheduledType ?? existing.scheduledType;

// 计算 effective scheduledDate
let effectiveScheduledDate = existing.scheduledDate;
if (newScheduledType === ScheduledType.SOMEDAY) {
  effectiveScheduledDate = null;
}
if (newScheduledType === ScheduledType.NONE) {
  effectiveScheduledDate = null;
}
if (newScheduledType === ScheduledType.DATE) {
  // 若 dto.scheduledDate 传入则用之，否则保留 existing
  effectiveScheduledDate =
    dto.scheduledDate !== undefined
      ? (dto.scheduledDate ? new Date(dto.scheduledDate) : null)
      : existing.scheduledDate;
}

// 以 newScheduledType 重算 bucket
bucket = resolveBucket(/* 旧 bucket, newScheduledType, projectId, areaId */);
```

写入 prisma：当 dto.scheduledType !== undefined 时，`data.scheduledType = newScheduledType`，并在上述分支里设置 `data.scheduledDate`。

## findAll view 过滤改写

```ts
case 'inbox':
  where.bucket = TaskBucket.INBOX;
  where.status = TaskStatus.ACTIVE;
  where.scheduledType = ScheduledType.NONE;  // 替换 scheduledDate=null
  break;
case 'today':
  where.status = TaskStatus.ACTIVE;
  where.scheduledType = ScheduledType.DATE;
  where.scheduledDate = { lte: new Date() };
  break;
case 'upcoming':
  where.status = TaskStatus.ACTIVE;
  where.scheduledType = ScheduledType.DATE;
  where.scheduledDate = { gt: new Date() };
  break;
case 'anytime':
  where.bucket = TaskBucket.ANYTIME;
  where.status = TaskStatus.ACTIVE;
  where.scheduledType = ScheduledType.NONE;
  break;
case 'someday':
  where.scheduledType = ScheduledType.SOMEDAY;  // 替换 bucket=SOMEDAY
  where.status = TaskStatus.ACTIVE;
  break;
```

为提升查询性能，可在 Task 上加 `@@index([userId, scheduledType])`（视实际需要，可选）。

## 前端契约

### QuickAddTask

- 删除 `defaultBucket?: TaskBucket`
- 新增 `scheduledType?: ScheduledType`
- `dueToday` 分支：同时设 `scheduledType='DATE'`（而非只设 scheduledDate）
- Someday 页面：传 `scheduledType='SOMEDAY'`，不再传 `bucket='SOMEDAY'`

### TaskDetail

现有日期区（`TaskDetail.tsx:65-93`）只有一个 `<input type="date">`。扩展为 segmented 选择：

```
[无] [ Soon ] [ Someday ]   ← 类型选择
[ 日期 input ]              ← 仅当类型 = DATE 时显示
```

patch 顺序：
- 选 None：`patch({ scheduledType: 'NONE' })`
- 选 Someday：`patch({ scheduledType: 'SOMEDAY' })`
- 选 DATE 且选日期：`patch({ scheduledType: 'DATE', scheduledDate: iso })`
- 清空日期但保持 DATE：`patch({ scheduledDate: null })`（这种情况不会发生？输入框清空等价于切到 NONE，更简洁）

为简化：清空 input 视为切到 NONE（`patch({ scheduledType: 'NONE' })`）。

## 兼容性与迁移

- 不做数据迁移（用户已确认开发期可重置库）
- migration 仅 `ALTER TYPE` 删除 SOMEDAY + 新增 ScheduledType enum + 新增列
- 删除 enum 值在 Postgres 需要 先清理引用行；开发期直接 `prisma migrate dev` + reset 可接受

## Trade-offs

- **为什么不把 Someday 留在 bucket 改为按 scheduledType 过滤？** 因为 bucket 语义是"归属位置"，Someday 本质是"计划日期的一种取值"，强行塞进 bucket 会与其他 view 的过滤产生冲突（bucket=SOMEDAY + bucket=ANYTIME 这种组合语义混乱）。提升为 scheduledType 让 bucket 回归纯粹。
- **为什么保留 SCHEDULED bucket？** 保持现有"有 scheduledDate 就进 SCHEDULED"的语义稳定；bucket 还能快速识别"任何已被排期的任务"。如果删除 SCHEDULED，需要每次反查 scheduledType∈{DATE,SOMEDAY}，且 Anytime/Inbox view 还需要排除 SOMEDAY，增加查询复杂度。
- **为什么 scheduledType=SOMEDAY 时 bucket 还是 SCHEDULED？** 保持不变量 `bucket=SCHEDULED ⟺ 已被排期（含 someday）`。Someday view 不需要用 bucket 过滤。

## 风险与回滚

- 回滚点：每个 PR/commit 是独立层；如出问题可停在前一步
- 主要风险：Prisma migration 删除 enum 值在 PG 里受限——解决方式是开发期 `prisma migrate reset`，生产若存在需先迁移数据再删 enum 值。本任务不涉及生产。
- Secondly：scheduledType + scheduledDate 两者一致性由服务端在 update 里保证，前端只负责传意图；因此即使前端漏传 scheduledDate，后端也能防御性降级。