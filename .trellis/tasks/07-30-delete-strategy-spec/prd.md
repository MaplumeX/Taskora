# spec 记录删除策略决策

## Goal

在 `backend/database-guidelines.md` 补充三类删除策略的显式决策说明，使"为何这样做"成为文档化共识而非隐含知识。

## Requirements

- 更新 `backend/database-guidelines.md`：
  - **Area 删除策略**：物理删除 + `onDelete: SetNull`（下属 task/project 的 `areaId` 脱钩为 null），并记录"Area 不走软删除"的决策依据（Things3 中 Area 是顶层容器，直接删除）
  - **status enum 拆分决策**：`TRASHED` 从 `TaskStatus`/`ProjectStatus` 移除，`status` 只保留 `ACTIVE | COMPLETED`（纯生命周期），删除状态唯一由 `trashedAt: DateTime?` 表达；记录原因（避免 trash 覆盖 COMPLETED 状态、避免级联 trash 丢状态）
  - **trash/restore 级联语义**：trash 父任务级联所有后代；trash Project 级联下属 Task；restore 对称恢复；级联只写 `trashedAt` 不动 `status`
  - **emptyTrash 级联**：物理删除按 `trashedAt !== null` 收集，交互式事务内做后代 + project 下属的级联

## Acceptance Criteria

- [ ] `database-guidelines.md` 软删除章节更新：不再出现 `status = TRASHED`，改为 `trashedAt` 判据
- [ ] 新增 Area 删除策略小节
- [ ] 新增 status enum 拆分决策小节
- [ ] 新增 trash/restore 级联语义小节
- [ ] emptyTrash 章节更新判断条件

## Notes

- 依赖 fix-area-delete-fk 和 trash-cascade 完成后，按最终实现的真实语义记录
