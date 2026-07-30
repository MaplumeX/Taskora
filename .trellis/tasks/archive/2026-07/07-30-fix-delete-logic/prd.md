# 修复删除逻辑一致性

## Goal

Taskora 当前的删除逻辑存在三类问题：Area 删除触发 FK 错误、trash 软删除不级联子任务、删除策略在 spec 中记录不全。本父任务统领 3 个独立可交付的子任务，统一删除语义。

## Requirements

### R1 — Area 删除 FK bug（子任务 fix-area-delete-fk）
- Area 删除时若有关联 Task/Project，会因 `Task.areaId`/`Project.areaId` 无 `onDelete` 策略（默认 NoAction）抛 FK 约束错误。
- schema 给两处关联加 `onDelete: SetNull`，删除 Area 时下属 task/project 的 `areaId` 置 null（符合 Things3「Area 是容器，删除后内容脱钩保留」语义）。

### R2 — 软删除级联 + status 拆分（子任务 trash-cascade）
- `TRASHED` 不应混入 `status` enum。`status` 只保留 `ACTIVE | COMPLETED`（纯生命周期），删除状态唯一由 `trashedAt: DateTime?` 表达。
- trash 父任务时级联 trash 所有后代子任务；trash Project 时级联 trash 下属 Task。
- restore 级联恢复后代/下属。
- emptyTrash 的物理删除级联判断从 `status === TRASHED` 改为 `trashedAt !== null`。
- 级联只动 `trashedAt`，`status` 永不被 trash/restore 改动 → COMPLETED 子任务 restore 后仍 COMPLETED。

### R3 — spec 补全（子任务 delete-strategy-spec）
- 在 `backend/database-guidelines.md` 显式记录：
  - Area 物理删除策略 + `onDelete: SetNull` 决策依据
  - `status` enum 拆分（去掉 TRASHED）的决策
  - trash/restore 级联语义

## Acceptance Criteria

- [ ] R1：Area 有关联 task/project 时可成功删除，下属 `areaId` 变 null
- [ ] R2：trash 父任务 → 所有后代 `trashedAt` 被设；trash project → 下属 task `trashedAt` 被设
- [ ] R2：restore 父任务 → 所有后代 `trashedAt` 清空且 `status` 不变
- [ ] R2：trash/restore 一个 COMPLETED 子任务后，其 `status` 仍为 COMPLETED
- [ ] R2：`status` enum 不含 TRASHED；trash 视图用 `trashedAt` 判断
- [ ] R2：emptyTrash 按 `trashedAt !== null` 收集删除集
- [ ] R3：spec 三处决策有显式文字记录
- [ ] 全部现有测试通过（含更新后的 mock）

## Child Task Map

| 子任务 | 优先级 | 依赖 |
|---|---|---|
| 07-30-fix-area-delete-fk | P0 | 无 |
| 07-30-trash-cascade | P1 | 独立（schema migration 与 R1 的 migration 可分离） |
| 07-30-delete-strategy-spec | P2 | 依赖 R1/R2 最终敲定的语义（最后执行） |
