# 01 数据层：Tag.parentId 取代 TagGroup，同步协议 5 和迁移

Status: implemented

## Problem

Tag Group 是不可打标、只有一层的容器，和 Things 3 的嵌套 Tag 不一致。要对齐 Things，模型要改成 Tag 自己构成一棵树。

## Design

见 spec「模型决策」和 Implementation Decisions「同步与迁移」。

- `entities.ts`：删除 `tag-group`；`tag.tagGroupId` 改为 `parentId`；同步修改 `REFERENCE_FIELDS`、`COMPACT_NULL_REFS`、索引，以及 `replica.ts` / `engine.ts` / `snapshot-pages.ts` / `entity-codec.ts` / `sync-hub.service.ts` / `legacy-clock-backfill.ts` 里的实体清单。
- `protocol.ts`：协议 5，hub 的 `minProtocolVersion` 升到 5，注释写清原因。
- hub Prisma migration：Group 转 Tag（同 id），成员改为子 Tag，`fieldClocks` 键改名，删除 `TagGroup` 表和 `tagGroupId` 列。补一个 legacy fixture 和 `migrations.e2e-spec.ts` 用例；`migration-smoke.mjs` 跟上。
- 副本迁移：追加一步，规则和 hub 逐字相同；Outbox 改写；在 `_engine_meta` 记录「需要一次 bootstrap」的标记。`engine.ts` 的 `sync()` 在 hub 协议 ≥ 5 且有这个标记时走一次 bootstrap，然后清除标记（参照 `NUMERIC_HLC_PROTOCOL` 的一次性修复）。
- 断环：`invariants.ts` 的 `repairEntity` 增加 Tag 规则和祖先探针，两个 hub（NestJS、InMemory）都要接上。
- engine `domain/tags.ts`：`buildTagTree`、`descendantsOf`、`ancestorsOf`（这一步只加函数，查询语义在 02 改）。
- 文档：ADR 0016，在 ADR 0015 加 superseded 注记，更新 `CONTEXT.md` 的 Tag 词条。

## Acceptance

- 有 Group 的老库在 hub 和副本上迁移后，产出逐字相同的 Tag 行和时钟（契约测试）。
- Outbox 里待推的 Group 改名或 Tag 改组，迁移后能正常推送并落地。
- 协议 4 的请求收到 426。
- 并发写出环之后，hub 合并修复，各端收敛到同一棵树。
- engine / api / backend 测试全部通过（backend 用临时 Postgres）。

## Comments

### 2026-10-06 — 实现

- engine：`entities.ts` 删除 `tag-group`，`tag.tagGroupId` 改为 `parentId`（`REFERENCE_FIELDS`、`COMPACT_NULL_REFS`、索引 `tag_parent`）；`domain/tags.ts` 增加 `buildTagTree`、`tagParentCreatesCycle`、`DEFAULT_TAG_COLOR`。
- 协议 5：`SYNC_PROTOCOL_VERSION = 5`、`TAG_TREE_PROTOCOL = 5`；hub 的 `MIN_SYNC_PROTOCOL_VERSION = 5`。
- 副本迁移 10 → 11（`nestTagGroups`）：Group 转同 id 的顶层 Tag，成员 `tagGroupId` → `parentId`（值与时钟键），Outbox 和 Compact 登记一并改写，`_engine_meta.tagTreeResync` 标记。已发布步骤 7 → 9 改用冻结的表集合（含 `tag_group`），并容忍表缺失；第 1 步先给旧 tag 表补 `parentId` 列（新 DDL 的索引要用）。
- 一次性 bootstrap：`LocalReplica.consumeTagTreeResync()`，`sync()` 在 hub 协议 ≥ 5 时消费标记、游标归零后重新 pull。
- 断环：`repairEntity(entity, fields, probes, id)`，探针改为对象 `{ headingProject, tagParent }`；`applyRepairs` 增加 `id` 参数。NestJS hub 只在本次合并写了 `parentId` 时读该用户全部 Tag 的父关系。
- hub：Prisma migration `20261006120000_nested_tags`（`prisma migrate diff` 与 schema 一致）；`InMemorySyncHub` 增加 `protocolVersion` 选项（测试模拟旧 hub）。
- `migration-smoke.mjs`：升级后的 TagGroup 行到 Tag 表里核对。**未运行**（需要构建好的镜像）。
- 文档：ADR 0016；ADR 0015 加 superseded 注记；`CONTEXT.md` 的 Tag 与 Effective Tags 词条；README。
- 测试：engine 迁移（10 → 11 全量改写、只在协议 5 上 bootstrap 一次）、树函数、断环、离线互设父 Tag 收敛、删父 Tag 子 Tag 提升；backend hub/副本迁移逐字一致的对比用例、真实 Postgres 上的断环往返。
