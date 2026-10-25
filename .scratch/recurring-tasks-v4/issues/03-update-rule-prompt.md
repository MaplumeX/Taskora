# 03 日期选择器询问「仅此一次 / 更新规则」

Status: implemented
Blocked by: 02

## Problem

用户无法在改期时选择是否改变重复规则。

## Design

见 spec 第 3、4 节。要点：

- `retargetRepeatRule(rule, from, to)`（engine，导出到 api）。
- `ScheduledDateField` 在 `allowRepeat` 时按触发条件把面板原地切换为询问面板；「仅此一次」只写计划日期，「更新规则」同时写对齐后的规则，「取消」回到日期面板。
- `ScheduledFieldCurrent` 增加 `occurrenceDate`。
- 中英文文案。

## Acceptance

- engine：`retargetRepeatRule` 矩阵。
- UI：触发 / 不触发各条件；两个选项的 patch；任务与项目入口。

## Comments

### 2026-10-25 — 实现

- 询问面板 `RescheduleRepeatPrompt`，Esc 只退回日期面板。在 web 前端实际验证：「每周一」挪到周二选「更新规则」→ 规则变为每周二、出现日为空；「每 3 天」选「仅此一次」→ 规则不变、出现日保留原日期。
