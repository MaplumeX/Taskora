# 05: Repeat 派生复制附件、Archived Logbook 连带裁剪

Status: implemented
Blocked by: 01

Spec：`../spec.md`（「设备侧」Repeat 派生、「数据模型」Archived Logbook）。

## 范围

- `packages/engine/src/repeat.ts`：Repeat Instance 与 Repeat Project Instance 复制附件行，id = `hash('attachment', parentInstanceId, ordinal)`，`blobHash` 不变。
- `packages/engine/src/archive.ts`：裁剪任务时连带其附件行；归档分页读取返回附件。

## 验收

- 两台设备离线各自完成同一重复任务，派生出的附件 id 一致、合并后不重复；归档裁剪 / 回读测试。

## Comments

### 2026-10-07 — 实现

- 归档裁剪 / 回填在 01 里随 `TASK_CHILD_ENTITIES` 一起做了（副本 `pruneArchive`、两端 hub 的快照省略、`fetchEntities` 经 `DELETE_CASCADES` 补齐）。
- `deriveAttachmentId(instanceId, ordinal)`；`planRepeatInstance(…, attachments)` 返回 `attachmentsFor`；重复项目的 `copyFor` 接收 `attachments`，副本 id 用 `deriveRepeatCopyId(instanceId, 'attachment', sourceId)`（与 Subtask 同口径）。复制的附件指向同一 Blob。
- 设备（`task-backend.engine` / `project-backend.engine`）与 hub（`TasksService` / `ProjectsService`）都接上。
- 测试：领域函数、两台设备离线并发完成同一重复任务后附件 id 一致、REST 完成重复任务 / 重复项目。
