# 01 放回语义：保留了结状态 + 编辑隐式放回

Status: resolved

Spec: `../spec.md`（Decisions）

## What to build

数据层（engine domain 纯函数 + 设备 engine 后端 + REST 后端）统一「放回」语义：

- `taskRestorePatch`（`packages/engine/src/domain/tasks.ts`）只清 `trashedAt`，不再改 `status` / `settledAt`；`reminderTime` 不恢复。
- 任务隐式放回：任务在 Trash 中时，更新若涉及计划日期、截止日期、归属（Inbox / 区域 / 项目 / 分组）、标签、重复规则，同一次写入附带 `trashedAt: null`；只改状态（完成 / 取消 / 撤销）、标题、备注、子任务不放回。规则写成 domain 纯函数，`task-backend.engine.ts` 的 `updateTask` 与 `backend/src/tasks/tasks.service.ts` 的 `update` 共用。
- 项目隐式放回：项目在 Trash 中时，改计划日期、截止日期、标签、区域等同调用放回（`planProjectRestore` 级联放回同一时刻进 Trash 的任务）；改状态、标题、备注不放回。`project-backend.engine.ts` 的 `updateProject` 与 `backend/src/projects/projects.service.ts` 的 `update` 共用。
- 更新 `CONTEXT.md` 的 **Trash** 词条：放回 = 只清 `trashedAt`、保留了结状态；列出隐式放回的字段。

## Acceptance criteria

- [x] 已完成任务删除后放回，仍为 COMPLETED、`settledAt` 不变，出现在 Logbook。
- [x] Trash 中任务改计划日期 / 移动 / 改标签后离开 Trash；完成 / 取消 / 改标题 / 改备注后仍在 Trash。
- [x] Trash 中项目改日期 / 标签后连同级联任务离开 Trash；完成项目仍在 Trash。
- [x] 放回后 `reminderTime` 为空。
- [x] engine 与 REST 两条路径行为一致，domain 函数有单测。
