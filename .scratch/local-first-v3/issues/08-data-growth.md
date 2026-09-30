# 08 数据增长：Logbook 按需、bootstrap 分页、登记清理

Status: implemented — awaiting device acceptance

## Problem

- 每台设备保存全部历史，Logbook 只增不减。
- bootstrap 一次性整包返回全部数据（新设备、超过 30 天未同步、升级后各一次），数据量大时移动端有内存与超时风险。
- 删除登记（设备 `_compacted`、hub `CompactedEntity`）永不清理。

## Design

- **bootstrap 分页**：快照按实体、按 id 游标分页；仍在第一页前固定 cursor fence。设备端分页写入临时表，全部到齐后在一个事务里替换（保持「重建期间读不到半份数据」）。
- **Logbook 分层**：副本只保留最近 N 个月的已了结任务；更早的 Logbook 由 UI 在滚动到底时从 hub 分页拉取（只读、不进副本）。LWW 不受影响：被裁掉的是已了结、未修改的行，若 hub 上后来被修改会随变更日志回到副本。
- **登记清理**：删除登记只需覆盖「仍可能推送迟到写的设备」。在所有设备游标都越过登记时刻（`Device.lastSeenAt` + 日志保留期）后清理；超过保留期的设备会走 bootstrap，bootstrap 带当前登记，不会复活。

## Acceptance

- 10 万行任务的账号 bootstrap 峰值内存有上限；新设备首屏在第一页到达后即可渲染。
- 副本大小随时间有上界（可配置）。

## Comments

**2026-09-30 实现记录**

三部分都已实现。协议升到 2（ADR-0007 amendment 2026-09-30）。

bootstrap 分页
- hub：`GET /sync/bootstrap` 对协议 2 起的请求分页（`page` 令牌、`settledAfter`），协议 2 以下仍回整包。规则在 `backend/src/sync/snapshot-pages.ts`：每页最多 500 行；阶段顺序是结构 → 未了结任务 → 已了结任务 → Subtask → Compact 登记；令牌是 base64url JSON，里面带着第一页之前固定的 fence 和归档截止时刻，hub 不保存状态。
- 设备：`LocalReplica.beginBootstrap / stageSnapshot / finishBootstrap`。已有数据的副本先把各页写进暂存表（`_stage_*`，列与实体表相同），最后在一个事务里 `INSERT … SELECT` 换表、登记、回放 Outbox、推进 cursor。新设备（cursor 为 0 且没有任何行）直接按 LWW 把各页合并进副本，第一页到了就能渲染。中途崩溃时 cursor 不会前进，下次再 bootstrap 时走暂存路径。

Logbook 分层
- 归档规则只有一份（`engine/src/archive.ts` 的 `isArchivedTask`，hub 与副本各有一份同义的 SQL）：已了结、了结时间早于截止、不在 Trash、不属于进行中的项目（项目进度按项目下全部任务计数）。缺省保留 365 天，可用 `EngineOptions.archiveAfterDays` 配置，传 null 表示保留全部。
- bootstrap 省略归档任务及其 Subtask。`engine.maintain()` 按同一规则裁剪副本；`sync` 每小时最多跑一次。裁剪只删除本地行，不登记 compact，也不进 Outbox；任务本身或其 Subtask 还有待推送写时保留。
- 回到副本的归档任务（远端修改后随日志到达：本地原本没有，且创建时间早于截止；或者父任务不在副本里的 Subtask）记入待补齐名单，这个名单和 cursor 在同一事务里提交。Engine 随后调用 `POST /sync/entities` 取回任务及其 Subtask。断网时名单保留，下次 pull 再补。
- Logbook 页面：本地条目之后，滚到底时调用 `GET /feed/logbook/archive?settledBefore=` 分页读取，按了结时间倒序、`(settledAt, id)` keyset 分页，结果只读。本地早于已读位置的条目先隐藏，归档页读过那个位置后再按时间插回（`mergeLogbookArchive`）。REST 模式没有截止时刻，行为不变。

登记清理
- hub：`CompactedEntity` 和它的 Compact Event 在 `PrismaSyncChangeLog.prune` 里同一事务、按同一阈值删除；两者 `createdAt` 相同，所以是同期清理。还没拉到这条事件的设备，cursor 已早于 prunedThrough，下次会先走 bootstrap。
- 登记清理后 push 仍然安全：
  - 设备对不存在的行发来局部写（不带 `createdAt`，所以不是创建）时，按 Compact 处理：登记并下发 Compact Event，不再建出残缺行，也不会让 push 永远失败。
  - 引用了不存在、未登记、也不在本次 push 里的实体时，按已删除清洗，不再当作 pending 等外键重试。
  - 同一实体前面的事件失败后，本批后面的事件跳过。
- 设备：`_compacted.registered_at`（副本迁移 4 → 5，已有登记按迁移时刻计）。本机登记满 `COMPACT_REGISTRY_RETENTION_DAYS`（32 天，比 hub 多 2 天）后由 `maintain` 清理。收到 Compact Event 时撤掉 Outbox 里针对这些实体的待推送写。bootstrap 回放 Outbox 时，快照里没有这行、这条写又不是创建的，不在副本里造残缺行，只留在 Outbox 里交给 hub 决定。
- 没有使用 `Device.lastSeenAt`：只按保留期清理，再加上上面这些 push 侧规则，就已经不会复活实体，也不需要跟踪各设备的 cursor。

其他：修了进程内测试 hub 的一个问题，只改标题等字段的 Subtask 局部更新以前会被它当成孤儿丢掉（NestJS hub 没有这个问题）。

验证：engine（新增 `test/data-growth.test.ts` 12 个用例和迁移用例）、backend（含真实 Postgres 的 `sync.data-growth.e2e-spec.ts` 8 个用例）、api、ui、frontend、desktop、mobile 测试全部通过，全仓 typecheck 与 lint 通过；迁移 `20260930150000_data_growth_indexes` 与 schema 做过 `prisma migrate diff` 核对，结果一致。

已知限制
- 已完成的项目被重开后，它下面已归档的旧任务不会自动回到副本（它们没有变化），项目进度会少算这些任务；在别处改动其中某个任务后，那个任务会回来。
- Calendar 里超过保留期的过去日期不再显示已了结任务。
- 归档行只读：勾选框和行点击已禁用；行内菜单（右键 / 长按）没有专门处理，对归档行执行操作会失败。

待验收
1. 大账号（10 万行任务）的新设备登录：第一页到达即显示侧边栏和 Today，内存平稳。
2. 已有设备走 resync（例如超过 30 天未同步）：重建期间界面不闪空。
3. Logbook 一直滚到底：衔接处不跳序，断网时显示重试。

