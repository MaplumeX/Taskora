# 02 Area / ProjectHeading / TagGroup / Subtask 新增 Position

Status: implemented
Blocked by: —

## Problem

这四个实体只有 `sortOrder`：重排要整列重写整数序号（`reorderAreas`、`reorderTagGroups`、`reorderSubtasks`、`reorderProjectHeadingLayout` 的 heading 部分），并发拖拽不收敛；也是 sortOrder 不能退役的直接原因。

## Design

- 数据：
  - Prisma：`Area` / `ProjectHeading` / `TagGroup` / `Subtask` 加 `position String?`（一条迁移）。
  - 实体注册表：四个实体加 `f('position')` 与 `orderField: 'position'`；`replica.list` 随之按 Position 排。
  - 副本迁移 7 → 8：四张表 `addColumnIfMissing(..., 'position', 'TEXT')`。
  - 新字段按能力服务（旧 hub 拒绝 unknown-fields，设备留 Outbox），不升协议。
- hub：`wireViewOfRow` 的 legacy 合成对新实体同样生效（`orderField === 'position'` 即可覆盖）。合成的平局方向要保持各实体现有语义——ProjectHeading 现在是 `createdAt asc`（先建的在前），而 `synthPosition` 编码的是 `createdAt desc`，需要正向变体，或在物化前确认现有数据没有 sortOrder 平局。Subtask 的平局方向目前本身就不一致（`search.ts` 是 asc，`repeat-instance.ts` 与 `TasksService` 的 `orderBy` 是 desc），先统一成一个口径。
- 写：
  - Engine：四个 reorder 改为 `repositionMinimal` 写 `position`，同时按新下标写 `sortOrder`（过渡期双写，spec 决定 3）；新建用 `positionAfter` 追加 / 置顶，保持现有「末尾 / 最前」语义。
  - REST 服务：改用 `orderFields` / `newRowOrder`。
  - 派生实例的 Subtask（`planRepeatInstance`）、转项目提升的任务、`planConvertHeadingToProject` 等复合操作一并写 Position。
- 读：`sortHeadings`、`search.ts` 的 `sortSubtasks`、`repeat-instance.ts` 的子任务顺序、REST 服务的 `orderBy: sortOrder`、mappers 与 DTO 增加 `position`，排序改用 Position。
- 契约测试（`sync.schema-contract.spec.ts`、`domain-contract.spec.ts`）覆盖新字段。

## Acceptance

- 两台设备离线各自重排同一项目的分组标题 / 同一任务的子任务，联网后收敛为同一顺序，且只有被移动的行产生变更。
- 旧客户端（不认识新字段）看到的顺序仍正确（靠双写的 sortOrder）。
- 副本 7 → 8 迁移测试。

## Comments

**2026-10-02 实现记录**

- 数据：Prisma 迁移 `20261002120000_sort_order_entity_positions`；注册表四个实体加 `position` 与 `orderField`；副本 7 → 8（加列并按 `synthPosition(sortOrder, createdAt)` 填充，不入 Outbox）。Engine 的 re-balance 覆盖这四个实体。
- 平局方向：统一为 `synthPosition` 的口径（sortOrder 升序、平局后建的在前）。ProjectHeading 原为先建的在前、Subtask 原本两种都有；平局只出现在并发新建，接受这处细微变化，换来所有实体同一排序函数。Repeat 派生的 Subtask 顺序与之前完全一致（原本就是这个口径），确定性 id 不受影响。
- domain（`order.ts`）：`positionAtEnd` / `positionAtStart` / `positionAfterRow`（新建）与 `planReorder`（重排：Position 走 `repositionMinimal`，sortOrder 按下标双写，只返回有变化的行）。设备与 REST 共用。`sortHeadings`、搜索的 Subtask 顺序、Repeat 派生改用有效 Position；派生实例的 Subtask 沿用原 Position。
- 写：Engine 四个 backend 与 REST 四个服务改为上述函数；Subtask afterId 插入只给新行分配 Position，sortOrder 仍按旧规则整体顺延。REST 读改为 `sortByPosition`（不再 `orderBy: sortOrder`）。
- web REST 回退路径：`event-applier` 的分组 / Subtask 比较器改用 Position。
- DTO：Area / Subtask / ProjectHeading / TagGroup / Tag 增加可选 `position`。
- 测试：domain 单测（新建位次、legacy 合成、最小重排、未知 id），Engine backend（Area 只动被移动的行、sortOrder 与 Position 冲突时以 Position 为准、TagGroup 置顶、Heading 布局、Subtask 插入），REST 真库（同上 + legacy 空 position 行的读序与重排），副本迁移 7 → 8。

已知过渡期限制：协议 3 的客户端只写 sortOrder，它对这四个实体的重排在新客户端上不可见（反方向由双写保证）。04 升最低协议版本后消失。
