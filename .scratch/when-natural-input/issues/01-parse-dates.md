# 01 解析器：日期表达与增量补全

Status: implemented

## Problem

When 输入需要一个与 UI 无关、可充分单测的解析器，把查询文本变成有序的候选列表。

## Design

见 spec 第 1 节「规则」「增量补全」。

- 新增 `packages/shared/src/when-query.ts`，从 `index.ts` 导出 `parseWhenQuery` 与类型。
- 用 Temporal `PlainDate` 在 date key 上计算；不读系统时钟，today 由调用方传入。
- 本 issue 不含时刻解析（见 02），但 `WhenCandidate` 的 `time` 字段先定义好。

## Acceptance

- spec 规则表中除「时刻」外的每一行都有用例，today 固定。
- 跨月、跨年、闰年、月末收敛（1/31 + 1 个月 → 2/28）、`weekStartsOn` 为 0 / 1 / 6 的「这周五 / 下周 / 下周五」。
- 前缀补全：`t`、`tom`、`f`、`明`、`下`、`周`、`1` 的候选与顺序。
- `allowSomeday: false` 时不出现 Someday。
- 候选最多 6 个且按日期去重。

## Comments

### 2026-10-05 — 实现

- `packages/shared/src/when-query.ts`，与 02 合在一个文件里。测试放在 `packages/api/src/utils/when-query.test.ts`（shared 包没有测试运行器，沿用 `later-project.test.ts` 的做法）。
- `weekStartsOn` 只有 0 / 1（`UserPreferencesDto` 只允许这两个值）。
- `f` 的候选是周五和 Feb 1（月份名前缀），不是 spec 原先写的「周五、下周五」。
- 不带年份且已过的月份（今天 10-05 输入「10月」）落到明年 10 月 1 日。
