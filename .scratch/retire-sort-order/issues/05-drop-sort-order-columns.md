# 05 删除 sortOrder 列与 DTO 字段

Status: implemented
Blocked by: 04

## Design

- Prisma 迁移删除七张表的 `sortOrder`（可与 `fieldDigests` 删列合并为一条迁移，前提是那边也已确认没有旧 hub 在跑）。
- 副本迁移：`ALTER TABLE ... DROP COLUMN sortOrder`（SQLite ≥ 3.35；确认 node:sqlite、sqlite-wasm、Tauri 内置 SQLite 版本均满足，否则走重建表）。
- `@taskora/shared` 各 DTO 删除 `sortOrder`；mappers、REST 序列化、测试夹具（`engine/src/testing`、`backend/prisma/seed.ts`）同步。
- `CHANGELOG.md` 记一条。

## Acceptance

- `grep -rn sortOrder packages/` 只剩历史迁移文件。

## Comments

**2026-10-02 实现记录**

- Prisma：迁移 `20261002180000_drop_sort_order` 删七张表的 `sortOrder`。迁移开头先检查七张表里是否还有 `position IS NULL` 的行，有就 `RAISE EXCEPTION`、不删列（说明 04 的启动物化没跑过，删列会丢掉这些行唯一的排序信息）。已在独立库上验证：插入一行空 position 的 Area 后迁移失败、七个列都还在。失败后要先补齐 position，再用 `prisma migrate resolve --rolled-back 20261002180000_drop_sort_order` 解除失败状态重跑。`fieldDigests` 没有合并进来（spec 里的前提「确认没有旧 hub 在跑」与本次无关，单独处理）。
- hub：删除 `legacy-position-backfill`（读的就是 `sortOrder` 列）及其启动调用；`feed.service` 的 Tag 映射改为下发 `position`。
- 副本迁移 8 → 9：有 `sortOrder` 列就 `DROP COLUMN`（rusqlite 0.32 bundled 是 SQLite 3.46，sqlite-wasm 与 node:sqlite 也都 ≥ 3.35）。7 → 8 仍在它之前用这个列填 position，所以迁移顺序安全。
- shared：八个 DTO（Task / Subtask / Project / ProjectHeading / Area / Tag / TagGroup / Feed）删除 `sortOrder`。api 的 mappers 与乐观更新不再写它；分组布局的乐观更新改为直接按目标顺序排，不再借 `sortOrder` 字段中转。
- seed：Area / Project / Task 带上 position。
- 测试夹具：全仓测试里的 `sortOrder` 改为 `position` 或删除；契约测试去掉 `sortOrder` 豁免。

`git grep sortOrder -- packages` 剩下的只有：历史迁移文件、副本迁移 7 → 9 本身（及其测试）、`synthPosition` 的参数名、协议版本注释，以及断言 wire 上没有 sortOrder 的测试。

CHANGELOG：仓库的 CHANGELOG 只有已发布版本的小节（由发版流程写），没有 Unreleased，这次没有加；发版时需要写明协议 4 会让旧客户端停止同步。
