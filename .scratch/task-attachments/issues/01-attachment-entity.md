# 01: Attachment 同步实体（Engine + hub）

Status: implemented

Spec：`../spec.md`（「数据模型」）。ADR 0019。是 02–06 的前置。

## 范围

- `packages/engine/src/entities.ts`：新增 `attachment`（`taskId`、`name`、`mimeType`、`size` INTEGER、`blobHash`、`position`、`createdAt`、`updatedAt`）；Engine migration。
- Prisma `Attachment` 模型（`taskId` onDelete Cascade，`fieldClocks` / `fieldDigests`），`entity-codec`、snapshot 分页、bootstrap 纳入。
- `repairEntity` / hub 校验：`taskId` 归属；`blobHash` 格式；`mimeType` / `size` / `blobHash` 创建后改写丢弃。
- 生命周期：所有硬删 Task 的 hub 路径级联 Attachment 并登记 `CompactedEntity`；Delete Request 接受 `attachment`（归属经父 Task 认领，同 subtask）。
- api 层：attachment 的 live query 与 add / rename / reorder / remove 写操作（暂不处理 Blob）。

## 验收

- 契约测试两端字段对齐；merger / repair / 级联删除 / Compact 的 vitest 覆盖 spec「Testing Decisions → Engine / Hub」相关项。

## Comments

### 2026-10-07 — 实现

- Engine：`attachment` 实体（`size` 为 INTEGER）、`TASK_CHILD_ENTITIES` / `isTaskChildEntity` 收敛原先散落的 `entity === 'subtask'` 判断（两端 hub 的归属认领、孤儿防御、快照省略归档、副本归档裁剪与回填）；`DELETE_CASCADES.task` 加附件。
- 副本迁移 11 → 12 建表并留下 `attachmentResync` 标记；`consumeTagTreeResync` 泛化为 `consumeResync(key)`，连上协议 6 的 hub 时做一次 bootstrap，取回旧版本跳过的附件。
- 协议升到 6（`ATTACHMENT_PROTOCOL`），最低协议不变：旧 hub 逐条拒绝 attachment（留在 Outbox），旧客户端跳过 attachment 变更。
- Hub：Prisma `Attachment`（无 userId，经父 Task 认领）+ 迁移；codec 新增 `intFields`（非整数 size 剔除）；`PrismaService.attachment` getter——新增契约测试保证每个同步实体都有 getter（hub 经它读写，测试用的裸 PrismaClient 测不出缺失）。
- REST：`AttachmentsModule`（create / rename / delete / reorder），任务详情带 `attachments`。
- api：`TaskBackend` 增加 4 个附件方法（Engine 与 REST 各一份）、`useAttachments.ts` hooks；`useTaskQuery` 依赖 `attachment`。
- 与 spec 的差异：内容字段不可变由写接口保证，hub 不拒绝改写（见 spec「数据模型」）。
