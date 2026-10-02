# 04 从 wire 移除 sortOrder（协议 4）

Status: implemented
Blocked by: 01, 02, 03

## Problem

01–03 之后没有代码再读 `sortOrder`，但它仍在注册表、wire 与所有写路径里，并且过渡期双写让每次重排多写一个字段。

## Design

- `SYNC_PROTOCOL_VERSION` 3 → 4，`protocol.ts` 注释补「4：wire 不再携带 sortOrder；排序只看 position」。hub `minProtocolVersion` 升到 4（理由见 spec 决定 4，待确认）；更新 ADR-0007「协议版本」段落。
- 实体注册表删除七个实体的 `sortOrder`；副本 `normalizeWrite` 的 `sortOrder → 0`、hub `sortOrder null → 0` 归一化删除。hub 落库时 `sortOrder` 列仍存在且非空，由 Prisma 默认值 0 兜住（列在 05 删除）。
- 停止双写：`orderFields` / `newRowOrder` 只返回 `position`；Engine 各 backend 删除 `sortOrder` 计算（`max + 1` 等）。
- 设备 Outbox 中残留的带 `sortOrder` 的写：协议 4 hub 按 unknown-fields 丢弃该字段、合并其余字段（现有行为），无需额外处理。
- 删除合成兜底（从 03 移来；此时 hub 启动物化已补齐残余空行，且协议 4 客户端新建总带 position）：`wireViewOfRow` 的合成分支、`effectivePosition` 的回退、engine `positionAfter` 的 `positionOfRow` 兜底、`event-applier` 的 `byPosition` 合成、`replica.list` 的 `ORDER BY sortOrder` 分支、`Positioned.sortOrder`。`synthPosition` 只剩迁移使用。
- 删除过渡期双写：`planReorder` 只写 Position；`orderFields` / `newRowOrder` 与各处 `max + 1`、Subtask 插入时的整体顺延删除。
- CONTEXT.md「Position」条目与 `entities.ts` 头注释更新。

## Acceptance

- 协议 3 客户端得到 426 并显示升级提示，Outbox 保留。
- 契约测试：注册表与 Prisma 列对齐规则允许 hub 侧暂存的 `sortOrder` 列（05 前的过渡）。

## Comments

**2026-10-02 实现记录**

- 协议：`SYNC_PROTOCOL_VERSION` 4、`MIN_SYNC_PROTOCOL_VERSION` 4（不带版本头与协议 3 的请求得到 426）。ADR-0007 补「Position is the only ordering key」一段。
- 注册表删除七个实体的 `sortOrder`，同时删掉不再需要的 `EntityDef.orderField`（全部实体都按 position 排）。副本 `list` 改为 `ORDER BY position, id`，与 `sortByEffectivePosition` 同口径；`normalizeWriteValue` 与 InMemorySyncHub 的 sortOrder 归一化删除。副本里旧的 sortOrder 列仍在、不读不写（05 删）。7 → 8 迁移在第 1 步补建的表上没有 sortOrder 列时按 0 处理。
- 合成兜底删除：`wireViewOfRow`、`effectivePosition`（空 position 只作防御，排最前、不参与插入邻居）、engine `positionAfter`（改为调用 domain 的 `positionAtStart` / `positionAfterRow`）、`event-applier`。`Positioned` 只剩 `id` / `position`。
- 双写删除：`planReorder` 只写 Position；Engine 与 REST 的 `max + 1` / 置 0 / Subtask 顺延全部删除。`orderFields` / `newRowOrder` 删除。
- REST 的 Task / Project / Tag 新建与转项目改为与设备同一口径：新任务、新标签置顶，新项目、派生实例追加末尾，提升出的任务按原顺序插到最前。列表两端用 `edgePositions`（`ORDER BY position COLLATE "C"` 取一行，字节序）。REST 重排（Task / Project / Tag / 分组布局里的任务）改为 `planReorder`，不再整列重写合成键。
- `legacy-position-backfill` 保留：04 部署时 hub 启动先物化 03 之后旧客户端留下的空 position，再接受请求。
- 测试：协议版本（426）、序列化不含 sortOrder、契约测试把 sortOrder 列列入豁免（05 删列后移除）、REST 新建在大小写混排时按字节序取邻居、重排只动一行、派生实例子任务沿用原 Position；Engine / api / ui 的夹具从 sortOrder 改为 position。

DTO 上的 `sortOrder` 与 mappers、乐观更新里的 `sortOrder` 留给 05。
