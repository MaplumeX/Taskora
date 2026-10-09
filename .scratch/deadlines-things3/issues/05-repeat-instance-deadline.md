# 05 重复实例继承截止日期偏移

Status: implemented

## Problem

`packages/engine/src/domain/repeat-instance.ts` 派生实例时写死 `dueDate: null`，带截止日期的重复任务下一轮就丢了截止日期。

## Design

- 来源任务有截止日期时，实例截止日期 = `shiftDateKey(dueKey, daysBetweenKeys(来源计划日期, 出现日))`，和 `planRepeatSkip` 的平移写法一致；来源没有截止日期则为 null。
- 计划日期锚点、完成日期锚点都适用；id 不变（ADR 0012）。
- `CONTEXT.md` Repeat Instance 词条补上截止日期平移。

## Acceptance

- engine 单测：
  - 计划日期锚点：周重复、截止日期 = 计划日期 + 2 天 → 实例同样 +2 天；
  - 完成日期锚点同样正确；
  - 负偏移（截止日期早于计划日期）正确；
  - 来源没有截止日期 → 实例也没有；
  - 两台设备并发完成同一来源时，派生结果一致。

## Comments

### 2026-10-09 — 实现

- 单测 / 契约测试已补并通过；实机尚未检查。
