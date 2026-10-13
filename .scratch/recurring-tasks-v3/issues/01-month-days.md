# 01 每月的几号（monthDays）

Status: implemented

## Problem

`unit=month` 只能按计划日期当天推进：「每月 1 号和 15 号」要拆两条链；31 号起算的链钳到短月月末后一直停在 28 / 30 号。

## Design

见 spec 第 1 节。要点：

- `RepeatRule.monthDays?: number[]`（shared DTO），仅 `unit=month`，1–31 升序去重。
- `normalizeRepeatRule` 处理 monthDays；`canonicalRepeatRule` 键序 `unit, interval, weekdays?, monthDays?, anchor, until?`，缺省不出现，存量规则的规范串与派生 id 不变。
- `nextOccurrenceDate` 新增 `nextMonthlyOccurrence`：锚点月为第 0 月，k×interval 月活跃；日子按当月钳制、合并重复；取严格晚于锚点的最小出现日。无 monthDays 时走原路径。
- REST `RepeatRuleDto` 加 monthDays 校验；助手 `repeatRuleSchema` 与描述、错误提示同步。无数据库迁移（repeatRule 为 JSON 字符串）。
- `RepeatRuleField`：month 时显示 1–31 日子网格；未选 = 按计划日期当天；离开 month 清除 monthDays。扩展现有 `formatRepeatSummary` 支持 monthDays（02 的候选行复用）。
- CONTEXT.md 更新 Repeat Rule 词条。

## Acceptance

- engine 测试：规范化、规范串锁定、`nextOccurrenceDate` 矩阵（见 spec Testing），skip / preview / 重复项目各一条 monthDays 用例。
- backend：DTO 校验、REST 完成派生日期正确、助手参数校验。
- UI：日子网格选择、切换单位清除、下一次预览正确、`formatRepeatSummary` 中英文。
- 各包 typecheck 与测试通过。

## Comments

### 2026-10-13 — 实现

- engine：`normalizeRepeatRule` / `canonicalRepeatRule` 支持 monthDays；新增 `nextMonthlyOccurrence`（只搜第 0、第 1 个活跃月，后者必有出现日）。无 monthDays 时走原 `addMonthsClamped` 路径。
- 规范串回归：锁定了 month / year 规则的现有规范串，并验证空 monthDays 与缺省派生同一 id。
- 后端：`RepeatRuleDto.monthDays`（1–31 校验）；助手 `repeatRuleSchema` 与非法规则提示加上 monthDays。
- UI：`RepeatRuleField` 在 month 时显示 7 列 1–31 网格；未选时提示「按计划日期当天」，选了 29–31 时提示短月落在月末；离开 month 剥离 monthDays。`formatRepeatSummary` 显示「每月 · 1、15 号」，31 显示为「最后一天」。
- 与 spec 的差异：没有新建 `formatRepeatRule`，复用已有的 `formatRepeatSummary`；规则编辑器顶部不加摘要行（编辑器本身已完整展示规则）。
- CONTEXT.md 的 Repeat Rule 词条已更新。
- 测试：engine 310、api 679、ui 1153、backend 401（含临时 Postgres 上的真库 e2e）、desktop 79、mobile 108、frontend 28 全部通过；全仓 typecheck 与改动文件 eslint 通过。尚未在真实应用里手动验证。
