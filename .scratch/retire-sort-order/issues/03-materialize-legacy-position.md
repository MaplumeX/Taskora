# 03 物化 legacy Position，删除合成兜底

Status: implemented
Blocked by: 02

## Problem

`position IS NULL` 的 legacy 行靠多处当场合成（hub `wireViewOfRow`、engine `effectivePosition` / `positionAfter`、web `event-applier` `byPosition`、副本 `ORDER BY sortOrder, createdAt`）。只要还要合成，读取就离不开 `sortOrder`。

## Design

- hub 启动步骤 `materializeLegacyPositions`（参照 `materializeLegacyClocks`）：七个实体中 `position IS NULL` 的行写入 `synthPosition(sortOrder, createdAt)`（ProjectHeading / Subtask 用 02 确定的正向口径），不改 `updatedAt`、不入日志、不动字段时钟——值与设备早已从 wire 收到的合成值相同。分批执行、幂等。
- 副本：同口径填充本地 `position IS NULL` 的行（本地写入，不入 Outbox）。
- ~~物化完成后删除合成兜底~~ → 移到 04，见实现记录。

## Acceptance

- e2e：含 legacy 行的库启动后 Position 全部非空，变更日志无新增条目，设备 pull 不收到变更。
- 物化前后 hub 下发给设备的 wire 行逐字相同。

## Comments

**2026-10-02 实现记录**

- hub：`materializeLegacyPositions`（`src/sync/legacy-position-backfill.ts`），`SyncHubService.onModuleInit` 在摘要时钟物化之后调用。原生 SQL 分批（500 行，`FOR UPDATE`，`unnest` 一条 UPDATE），不经 Prisma `@updatedAt`、不动 `fieldClocks`、不入日志。每次启动都跑，幂等。
- 副本：并入尚未发布的 7 → 8 迁移（全部七张表的空 position 一起补），不再单独加 8 → 9。
- 测试：e2e 验证合成值、`updatedAt` 与时钟不变、bootstrap 快照逐字不变、日志不增长、二次运行为 0；副本迁移测试覆盖 Task 的空 position。

**范围调整：合成兜底的删除移到 04。** 协议 3 的客户端在过渡期仍会新建不带 position 的 Area / ProjectHeading / TagGroup / Subtask（它们不认识这个字段），只要它们还能连上，hub 与副本就还会遇到空 position，兜底删不掉。04 把最低协议升到 4 之后不再产生空行，届时启动物化先补齐残余，再删兜底。
