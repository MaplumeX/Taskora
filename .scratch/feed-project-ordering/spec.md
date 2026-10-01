# Feed 中独立项目行的拖拽排序

Status: implemented

## 问题

Today / Upcoming / Someday 等 feed 视图里，独立项目行（项目没有被收进分组标题时）与任务混排，但不能拖拽排序。
项目只有一个全局 Position，侧边栏顺序就由它决定；feed 混排时直接拿项目 Position 与任务 Position 比较，
两套键各自分配，项目行出现在哪里只是两者碰巧比较的结果。若拖动项目行时改写它的 Position，
就会同时改变侧边栏顺序，且可能跳到意想不到的位置。

## 决定

- Project 新增 **Feed Position**（`feedPosition`，可空 fractional indexing 字符串）：项目行在 feed 中与任务混排的位次，
  与 Task 的 `position` 同处一个键空间。只在 feed 中拖动时写入；为空时 feed 退回项目的 `position`（既有混排结果不变）。
  侧边栏顺序仍只由 `position` 决定。所有 feed 视图共用这一个字段（与任务的全局 Position 对称），不做逐视图排序。
- feed 排序键 `feedSortKey`（engine domain）：任务用 `position`，项目优先 `feedPosition`。hub 的 REST feed 与设备副本共用 `sortFeedItems`。
- 重排写回 `reorderFeed(items)`：items 为任务与独立项目行的目标显示顺序；`repositionFeed` 只为必须移动的行分配新键，
  任务写 `position`、项目写 `feedPosition`。设备走 Engine（进 Outbox），web REST 走 `POST /feed/reorder`。
- 分组视图里任务跨组时，即使显示顺序没变也写一次顺序：分组时组内任务总排在顶部区之后、与其位次无关，进入顶部区后才按真实位次排
  （键已在序则不写）。
- re-balance：任务 `position` 与项目 `feedPosition` 合成一张有序表一起修复膨胀键，避免只重排任务把夹在中间的项目行挪到错误一侧。
  项目 `position`、Tag 仍各自 re-balance。

## 范围

- 独立项目行只能在顶部未分组区内移动（它不属于任何分组）；拖到分组内的目标不生效。
- 被收进分组标题的项目不可拖（分组顺序由侧边栏持有）。
- Inbox / Anytime 不显示项目行，不受影响。

## 数据与同步

- Prisma：`Project.feedPosition TEXT NULL`（迁移 `20261001120000_project_feed_position`）。
- Local Replica：schema 6 → 7，`project` 加列 `feedPosition`。
- 同步：新字段经实体注册表进入 wire；旧 hub 把未知字段列入 `PushResponse.rejected`，设备保留在 Outbox 待 hub 升级后重推，
  无需提升 `SYNC_PROTOCOL_VERSION`（ADR-0007 的按能力服务规则）。
