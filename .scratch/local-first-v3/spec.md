# Local-First V3 Spec（引擎设计收口）

Status: in-progress

V1/V2（`.scratch/local-first-v1`、`.scratch/local-first-v2`）交付了 Engine、桌面端与移动端的全实体离线，以及 Sync Hub。2026-09 的一轮审查修复了同步正确性与性能问题（Outbox 因果序、推送分批、Compact 登记持久化、持久化变更日志、时钟校准、单行重排、批量写与合并失效等，见 ADR-0007 的 amended 条目）。本 spec 收口审查中发现的**设计层面**问题：它们不是单点 bug，而是会持续产生 bug 的结构。

架构基底不变（ADR-0007）：字段级 LWW + HLC、Sync Hub 只合并不判断业务、无冲突 UI。领域术语沿用根 `CONTEXT.md`。

## Problem Statement

1. **并发编辑可能合并出违反业务规则的数据。** 字段级 LWW 逐字段裁决，但任务的许多规则横跨多个字段（分组必须属于任务所在项目；只有 DATE 任务才有提醒和重复规则；Bucket 由计划类型与归属推导）。两台设备分别改了相关字段时，合并结果每个字段都「合法」、组合却违反规则。REST 写路径守这些规则（`tasks.service.heading-invariant.spec.ts`），同步合并路径没有。
2. **web 端仍是 thin client，系统有两条写入路径。** REST 写绕过合并器，hub 为此维护了字段摘要检测、虚拟设备 0 合成时钟、collector tap、sortOrder/position 双排序键——回声闪烁、REST 写日志崩溃窗口、时钟口径等问题都源于此。
3. **领域规则在客户端 Engine 后端与服务端 REST 服务各实现一份**（Engine 后端里 17 处「与 REST 同语义」注释；重复任务派生三处实现），只能靠测试发现漂移。
4. **UI 数据层仍按远程 API 设计。** Engine 被包装成返回 DTO 的 REST 形状后端，上面叠 React Query 缓存与 32 处乐观更新；本地写只需几毫秒，乐观更新多余且易错（#8/#10/#11/#12 这一类缺陷的根源）。
5. **没有 schema 与协议版本。** 副本迁移靠「列不存在就 ALTER」；同步协议无版本号，新旧客户端与服务端之间的差异只能静默出错。
6. **长文本字段整字段 LWW。** 两台设备并发编辑备注时丢掉整段。
7. **数据只增不减。** 每台设备保存全部历史，bootstrap 整包返回，删除登记永不清理。
8. **其他。** 移动端无后台同步（提醒只反映上次打开 App 时的数据）；实时提示通道（SSE）不跨 hub 实例；同步几乎不可观测（LWW 败方、hub 的静默丢弃都无记录）。

## Solution

按正确性优先、改动面从小到大推进，每条一个 issue：

| # | Issue | 对应问题 | 优先级 |
|---|---|---|---|
| 01 | [合并后的确定性修复（跨字段不变量）](issues/01-merge-invariant-repair.md) | 1 | P0，本轮实现 |
| 02 | [Engine 模式的缓存更新：单一刷新来源与完整补丁](issues/02-drop-optimistic-updates.md) | 4（短期） | P1 |
| 03 | [副本 schema 版本与同步协议版本](issues/03-schema-and-protocol-versioning.md) | 5 | P1 |
| 04 | [领域规则共享包](issues/04-shared-domain-rules.md) | 3 | P2 |
| 05 | [web 接入 Engine，退役 REST 写旁路](issues/05-web-on-engine.md) | 2 | P2（大） |
| 06 | [响应式查询](issues/06-live-queries.md) | 4（长期） | P3 |
| 07 | [备注字段的文本合并](issues/07-notes-text-merge.md) | 6 | P3（评估） |
| 08 | [数据增长：Logbook 按需、bootstrap 分页、登记清理](issues/08-data-growth.md) | 7 | P3，已实现 |
| 09 | [移动端后台同步](issues/09-mobile-background-sync.md) | 8 | P3 |
| 10 | [同步可观测性](issues/10-sync-observability.md) | 8 | P2 |
| 11 | [实时提示跨 hub 实例](issues/11-cross-instance-hints.md) | 8 | 视部署而定 |

依赖：05 依赖 04（web 与桌面共用同一份规则）；06 依赖 02；08 的 bootstrap 分页与 03 的协议版本一起上线最省事。

## Out of Scope

- 冲突 UI（ADR-0007 明确不做）。
- 改变字段级 LWW 的基本模型（文档 CRDT、OT 已在 ADR-0007 否决）。07 只评估单字段例外。
