# 02: Project / Area 的 hideLaterItems 同步字段

Status: done

## 内容

Project 与 Area 新增 `hideLaterItems: boolean`（默认 false，字段级 LWW），链路同 `lastReviewedOn`：Prisma schema + migration、engine `entities.ts` / `migrations.ts`、`backend/src/sync/entity-codec.ts`、`api/src/engine/mappers.ts`、shared DTO（Update / Response）。

切换照常进撤销栈（ADR 0024 在写入边界统一记录）。

`UserPreferences` 新增 `hideLaterItemsInQuickFind?`、`hideLaterItemsInMovePicker?`（缺省 false，LWW）。

## 验收标准

- [x] 新建 / 存量 Project、Area 读出 false
- [x] 一端切换后另一端同步到；并发修改按字段 LWW
- [x] 偏好字段可读写、跨端同步

## Comments

- 2026-10-12：完成。第一个布尔同步字段：引擎 `FieldDef.bool`（SQLite 0 / 1，副本迁移 15 → 16），Hub codec `boolFields`，Prisma 迁移 `20261012120000_hide_later_items`。不升同步协议：旧 Hub 按 unknown-fields 拒收、留在 Outbox。原定「不进撤销栈」取消：撤销在引擎写入边界统一记录，跳过需绕开包装层，不值得。测试：`engine/test/versioning.test.ts`（15 → 16）、`backend/test/sync.entity-codec.spec.ts`（布尔校验）、`api/src/engine/hide-later-items.engine.test.ts`（默认值、两端同步）、`api/src/utils/preferences.test.ts`。后端 e2e 未在本地跑（需数据库）。
