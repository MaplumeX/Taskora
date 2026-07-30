# 软删除级联 + status enum 拆分

## Goal

当前 `TRASHED` 混入 `status` enum，与 ACTIVE/COMPLETED（生命周期）正交却共用一个字段，导致 trash 一个 COMPLETED 任务会丢失完成状态；且 trash 操作不级联子任务/下属任务，造成数据孤儿。需拆分 `status` 与删除标记，并实现 trash/restore 的级联语义。

## Requirements

### R1 — status enum 拆分（schema 层）
- `TaskStatus` enum 去掉 `TRASHED`，只保留 `ACTIVE | COMPLETED`
- `ProjectStatus` enum 同样去掉 `TRASHED`
- `trashedAt: DateTime?` 成为"是否已删除"的唯一判据
- migration 需把现存 `status=TRASHED` 的行迁成 `status=ACTIVE, trashedAt=now()`（trashedAt 为 null 的保留原 status）

### R2 — trash/restore 逻辑改造（service 层）
- `TasksService.remove`：只设 `trashedAt`，**不写 `status`**
- `TasksService.restore`：只清 `trashedAt`，**不写 `status`**
- `ProjectsService.remove` / `restore` 同理

### R3 — trash 级联
- trash 父任务时，所有后代子任务一并 trash（设 `trashedAt`）
- trash Project 时，下属 Task 一并 trash
- restore 父任务时，所有后代子任务一并 restore（清 `trashedAt`），`status` 不变
- restore Project 时，下属 Task 一并 restore
- 级联只动 `trashedAt`，`status` 永不被 trash/restore 改动

### R4 — 查询条件改造
- `tasks/views.ts` / `projects/views.ts` 的 trash case：`trashedAt: { not: null }` 替代 `status: TRASHED`
- 默认视图（非 trash）排除已删除：`trashedAt: null` 替代 `status: { not: TRASHED }`
- `tasks.service.ts` 全文搜索的 `status: [ACTIVE, COMPLETED]` 注释简化（不再需"exclude TRASHED"）

### R5 — emptyTrash 改造
- `FeedService.emptyTrash` 收集 trashed task 的判断从 `status === TRASHED` 改为 `trashedAt !== null`
- 级联算法（后代 + project 下属）不变，仍用交互式事务

### R6 — 前端 + shared
- `ProjectFeedRow.tsx` 的 `trashed` 判断从 `item.status === 'TRASHED'` 改为 `item.trashedAt !== null`
- `packages/shared/src/enums/{task,project}.enum.ts` 去掉 `TRASHED`

## Acceptance Criteria

- [ ] `TaskStatus` / `ProjectStatus` enum 不含 `TRASHED`
- [ ] trash 一个父任务 → 所有后代 `trashedAt` 被设、`status` 不变
- [ ] trash 一个 Project → 下属 Task `trashedAt` 被设
- [ ] restore 父任务 → 后代 `trashedAt` 清空、`status` 不变（COMPLETED 仍 COMPLETED）
- [ ] trash 视图返回 `trashedAt !== null` 的项
- [ ] 非 trash 视图不含 `trashedAt !== null` 的项
- [ ] emptyTrash 按 `trashedAt !== null` 收集并物理删除
- [ ] migration 可在现存库执行（TRASHED → ACTIVE + trashedAt）
- [ ] 全部测试通过

## Notes

- 本子任务包含一个 schema 拆分决策，详见 `design.md`
- 与 fix-area-delete-fk 的 migration 独立，不冲突
