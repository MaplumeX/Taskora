# 设计文档：软删除级联 + status enum 拆分

## 核心决策：TRASHED 从 status enum 移除

### 问题

`status: ACTIVE | COMPLETED | TRASHED` 把生命周期状态和删除标记混在一个字段。
TRASHED 覆盖 ACTIVE/COMPLETED → trash 一个 COMPLETED 任务会丢失"已完成"信息。
级联 trash 子任务时若子任务是 COMPLETED，同样丢状态。

### 决策

```
status:        ACTIVE | COMPLETED        ← 纯生命周期，trash/restore 永不改动
trashedAt:     DateTime?                  ← 唯一的"是否已删除"判据
```

trash 只写 `trashedAt`，restore 只清 `trashedAt`，`status` 纹丝不动。
COMPLETED 任务 trash 后在 trash 视图可见，restore 后仍是 COMPLETED。无需 preTrashStatus 补丁字段。

### 为什么不用单独布尔 `trashed` 而用 `trashedAt`

已有 `trashedAt: DateTime?` 字段，`null` = 未删除，非空 = 已删除 + 时间戳。语义完整，无需新字段。

---

## Migration 策略

现存库中 `status=TRASHED` 的行需迁移：

```sql
-- 先把 TRASHED 行的 trashedAt 补上（若为 null）
UPDATE "Task" SET "trashedAt" = COALESCE("trashedAt", NOW()) WHERE "status" = 'TRASHED';
UPDATE "Project" SET "trashedAt" = COALESCE("trashedAt", NOW()) WHERE "status" = 'TRASHED';
-- 再把 status 拉回 ACTIVE
UPDATE "Task" SET "status" = 'ACTIVE' WHERE "status" = 'TRASHED';
UPDATE "Project" SET "status" = 'ACTIVE' WHERE "status" = 'TRASHED';
-- 最后从 enum 移除 TRASHED 值
ALTER TYPE "TaskStatus" DROP VALUE 'TRASHED';
ALTER TYPE "ProjectStatus" DROP VALUE 'TRASHED';
```

> PostgreSQL 不支持事务内 ALTER TYPE DROP VALUE 与数据 UPDATE 混合的回滚安全。Prisma migration 会把数据 UPDATE 和 enum 变更放在同一迁移文件顺序执行，可接受。

---

## 级联 trash/restore 算法

### Task.remove（trash 父任务）

交互式事务（`$transaction(async (tx) => { ... })`），复用 emptyTrash 已验证的"全量读 + 内存算集合"模式：

1. `findFirst({ where: { id, userId } })` 校验存在
2. `findMany({ where: { userId }, select: { id, parentId } })` 取全量 task id + parentId
3. 从被 trash 的 task 出发，沿 `parentId` BFS 收集所有后代 id（同 emptyTrash 的 descendantIds 算法）
4. `updateMany({ where: { id: { in: [id, ...descendantIds] }, userId }, data: { trashedAt: now } })`

> 不级联 COMPLETED 的区分：级联只写 trashedAt，status 不动，COMPLETED 后代自动保留。

### Task.restore

对称操作：收集后代 → `updateMany({ data: { trashedAt: null } })`。

### Project.remove / restore

- trash：`update project.trashedAt` + `updateMany({ where: { projectId, userId }, data: { trashedAt: now } })`
- restore：对称清空

> Project 下属 task 的级联只按 `projectId`，无需递归（task 树的递归只在 Task.remove 内处理）。

---

## 查询条件映射

| 场景 | 旧 | 新 |
|---|---|---|
| trash 视图 | `status: TRASHED` | `trashedAt: { not: null }` |
| 默认排除已删除 | `status: { not: TRASHED }` | `trashedAt: null` |
| emptyTrash 收集 | `status === TRASHED` | `trashedAt !== null` |
| 前端 trashed 判断 | `item.status === 'TRASHED'` | `item.trashedAt !== null` |

---

## 影响面清单

| 文件 | 改动 |
|---|---|
| `schema.prisma` | TaskStatus/ProjectStatus enum 去掉 TRASHED |
| `packages/shared/src/enums/task.enum.ts` | TaskStatus 去掉 TRASHED |
| `packages/shared/src/enums/project.enum.ts` | ProjectStatus 去掉 TRASHED |
| `tasks/views.ts:49` | trash case → `trashedAt: { not: null }` |
| `projects/views.ts:49` | 同上 |
| `tasks.service.ts` remove/restore | 只写 trashedAt；remove 加级联 |
| `projects.service.ts` remove/restore | 只写 trashedAt；remove 加级联 |
| `tasks.service.ts:93` | 搜索注释简化 |
| `feed.service.ts:42` | `trashedAt !== null` 替代 status 判断 |
| `projects.service.ts:68` | findAll 默认 `trashedAt: null` |
| `ProjectFeedRow.tsx:20` | trashed 判断改用 trashedAt |
| 测试 mock | `status: TRASHED` → `trashedAt: ...` |

---

## 风险与回滚

- **Migration 不可逆**：PostgreSQL `ALTER TYPE DROP VALUE` 不可回滚（即使 Prisma 回滚也无法恢复 enum 值）。开发库可用 `prisma migrate reset` 重置，生产需谨慎。
- **级联事务性能**：全量读 user 的 task（预期 < 1000）+ 内存 BFS + 单次 updateMany，性能可接受。
- **回滚点**：若级联逻辑出问题，可先部署 status 拆分（R1+R2+R4+R5），级联（R3）作为独立 PR 后跟。
