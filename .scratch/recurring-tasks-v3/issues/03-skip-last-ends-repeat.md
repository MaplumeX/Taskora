# 03 跳过最后一次即结束重复

Status: implemented

## Problem

`until` 已到（例如设为今天）时「跳过本次」被禁用，用户无法用它表达「这次不做、重复到此为止」，只能想到去取消。

## Design

见 spec 第 3 节。要点：

- `planRepeatSkip` 没有下一次时返回取消 patch 与 `ends: true`；`next-exists` 仍优先阻止。
- 设备端与 REST 的跳过在 `ends` 时不重置 Subtask。
- 重复项目没有取消态：最后一次跳过即完成项目、未了结任务取消，不派生。
- UI 入口不再禁用，最后一次文案「跳过本次并结束重复」；助手工具描述与返回的 `status`。

## Acceptance

- domain：until 为今天、已错过多轮且 until 已过 → 取消 patch；有派生实例 → next-exists。
- engine 后端与 REST e2e：最后一次跳过后任务 CANCELLED、提醒清除、计划日期不变、不派生、Subtask 不动。
- UI：任务与项目在最后一次时入口可用、文案正确、点击调用 skip。
- 项目：domain、engine 后端、REST e2e 覆盖「项目完成、未了结任务取消、不派生」。

## Comments

### 2026-10-13 — 实现

- 按上述设计实现；CONTEXT.md 的 Skip Occurrence 词条已更新。

### 2026-10-14 — 重复项目

- 选择方案「完成项目、剩余任务取消」：`planProjectRepeatSkip` 在 `ends` 时复用 `planProjectComplete(…, 'cancelled')`；设备端 `skipProject` 与 REST `ProjectsService.skip` 原样写入，无需改动。
- `useSkipProjectOccurrence` 新增 `last`，项目右键菜单入口不再禁用。
