# 02 出现日与改期即例外

Status: implemented

## Problem

改期重复项会按规则写法隐式改变节奏（见 spec Problem 1）。

## Design

见 spec 第 1、2、6 节。要点：

- Task / Project 新增 `occurrenceDate`（Prisma 迁移、codec、副本 schema 与迁移、DTO、mappers、数据包）。
- `planTaskUpdate` / `planProjectUpdate` 按写入口径表写出现日；不变式清理。
- `nextOccurrenceDate` / `skipOccurrenceDate` 接收出现日；派生、跳过、预告、重复项目、RepeatRuleField 预览传入；平移量以出现日为基准。
- 派生实例出现日为空；Duplicate 照抄。
- CONTEXT.md 新增 Occurrence Date 词条，更新 Repeat Rule / Skip Occurrence / Repeat Instance。

## Acceptance

- engine 单测覆盖 spec Testing 的 engine 部分。
- backend：codec 往返、REST 改期与完成、迁移。
- 各包 typecheck 与测试通过。

## Comments

### 2026-10-25 — 实现

- 新增 `domain/occurrence.ts`（`planOccurrenceDate` / `occurrenceKeyOf`），任务与项目的更新共用；副本 schema 16 → 17，Prisma 迁移 `20261025120000_occurrence_date`。
- REST 侧 `planTaskUpdate` / `planProjectUpdate` 的 existing 需先解析 `repeatRule`（Postgres 列为 JSON 文本）。
- 项目内任务的出现日在复制与跳过时随日期平移（spec 已同步）。
