# 退役 sortOrder 排序键

Status: implemented

## 问题

local-first-v3 issue 05 之后，web 也跑 Engine，`sortOrder` 作为「web 端 REST 读序列」的理由已经不在，但它仍分两种处境留在系统里：

- **Task / Project / Tag**：与 Position 冗余。Engine 的 `reorderProjects` / `reorderTags` / `reorderTasks` 只写 `position`（`repositionMinimal`），hub 的 REST reorder 写 `orderFields`（`sortOrder` + 同口径合成的 Position）。两条路径写的不是同一组字段，于是**仍按 `sortOrder` 排序的读取点会和真实顺序脱节**（见下文「现存偏差」）。
- **Area / ProjectHeading / TagGroup / Subtask**：`sortOrder` 是唯一排序字段（原记录漏了 Subtask）。重排要整列重写整数序号，并发拖拽不会收敛，和 ADR-0007 的 Position 语义不一致。

此外，legacy 行（`position` 为 null）的 Position 不是存下来的，而是在 hub `wireViewOfRow`、engine `effectivePosition` / `positionAfter`、web `event-applier` 的 `byPosition`、副本 `ORDER BY sortOrder` 这几处各自**按 `synthPosition(sortOrder, createdAt)` 当场合成**。只要 `sortOrder` 还在，这些兜底就删不掉。

### 现存偏差（Engine 模式下 sortOrder 已过时，但仍被用来排序）

- `ui/components/layout/sidebarProjectLayout.ts` `mergeVisibleProjectOrder`：以 `sortOrder` 排出的全量顺序为底回填可见项目——桌面 / web 拖过侧边栏后，底序与真实 Position 不一致，隐藏项目会被挪位。
- `ui/components/project/laterProjectLayout.ts`：稍后项目「计划」「Someday」两节按 `sortOrder` 排，与侧边栏（Position）不同序。
- `api/status-bar/content.ts` `sortStatusBarTasks`（Android 状态栏）：同日任务按 `sortOrder` 排，与 Today 列表（Position）不同序。

## 决定

1. **所有可排序实体都用 Position**：Area / ProjectHeading / TagGroup / Subtask 新增可空 `position`（fractional indexing，进实体注册表，字段级 LWW）。新增字段按 ADR-0007 的按能力服务规则进 wire，不需要升协议版本。
2. **legacy Position 物化**：hub 启动时把 `position IS NULL` 的行按 `synthPosition(sortOrder, createdAt)` 写成真实值（与 `materializeLegacyClocks` 同性质：不改 `updatedAt`、不入日志——合成值与设备早已从 wire 收到的值逐字相同，不产生可见变化）。副本做同样的一步迁移。之后 Position 恒非空，合成兜底全部删除。
3. **过渡期双写**：在旧客户端仍可能连上的期间，所有重排 / 新建同时写 `position` 与 `sortOrder`，让旧客户端仍看到正确顺序；新代码只读 Position。反方向不保证：协议 3 客户端对 Area / ProjectHeading / TagGroup / Subtask 的重排只写 sortOrder，新客户端看不到，直到 04。
4. **从 wire 移除 sortOrder，`SYNC_PROTOCOL_VERSION` 3 → 4**，hub 的 `minProtocolVersion` 同步升到 4。理由（ADR-0007「只在旧客户端会造成损害时才提高最低版本」）：移除后旧客户端对 Area / Heading / TagGroup / Subtask 的重排只写 `sortOrder`，会被 hub 以 unknown-fields 拒绝并永久滞留 Outbox，用户的排序操作在其他设备上静默丢失——属于损害，不只是「看不到新功能」。
5. **最后删列**：Prisma 迁移删 `sortOrder`，副本迁移删列（SQLite `ALTER TABLE ... DROP COLUMN`），shared DTO 去掉 `sortOrder`。

## 范围

- 实体：Task、Subtask、Project、ProjectHeading、Area、Tag、TagGroup。
- 不包括：`fieldDigests` 列的删除（另一项待办，可与第 5 步同批迁移）、Feed Position 的语义（不变）、Logbook 按 `settledAt` 的排序（不涉及 sortOrder）。
- Assistant 的 `reorder_*` 工具走服务层，随服务改动自然生效，不单独改。

## 兼容与发布顺序

| 阶段 | hub | 新客户端 | 旧客户端（协议 ≤ 3） |
| --- | --- | --- | --- |
| 01–02 发布 | 双写；新字段 `position` 下发 | 读 Position，双写 | 忽略未知 `position`，按 `sortOrder` 排，顺序正确 |
| 03 发布 | 启动物化 legacy Position | 副本迁移物化 | 无变化 |
| 04 发布 | 协议 4、最低 4；不再接收 / 下发 `sortOrder` | 不再写 `sortOrder` | 收到 426，停止同步、保留 Outbox，提示升级 |
| 05 发布 | 删列 | 副本删列 | — |

01–03 必须先于 04 全部发布，并在桌面 / Android 自动更新覆盖大部分安装后再发 04。

## Issues

- `01` 读取点统一按 Position 排序（Task / Project / Tag），修复现存偏差
- `02` Area / ProjectHeading / TagGroup / Subtask 新增 Position
- `03` 物化 legacy Position（合成兜底的删除移到 04）
- `04` 从 wire 移除 sortOrder（协议 4），删除合成兜底与双写
- `05` 删除 sortOrder 列与 DTO 字段

## 已定

- 第 4 条（2026-10-02 确认）：升 `minProtocolVersion` 到 4，旧客户端停同步并提示升级。未采用的替代方案：hub 对协议 ≤ 3 的请求按 Position 秩派生 `sortOrder`、并把旧客户端的 `sortOrder` 重排翻译成 Position——要维护一条只为旧版本存在的翻译层，与本次目的相反。

## 待确认

- 04 发布前的等待窗口多长（取决于自动更新覆盖率，目前没有安装版本分布的数据）。
