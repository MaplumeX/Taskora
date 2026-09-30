# 04 助手支持重复规则与跳过本次

Status: implemented
Blocked by: 02

## Problem

助手的 `create_task` / `update_task` 无法设置重复规则，读工具也不返回规则。用户说「每两周三提醒我交周报」时，只能得到一个一次性任务。

## Design

见 spec 第 3 节。改动集中在 `packages/backend/src/agent/tools/agent-tools.ts`：

- `repeatRuleSchema`（typebox）：`unit`、`interval`、`weekdays?`（0=周日…6=周六）、`anchor?`（默认 scheduled）、`until?`（YYYY-MM-DD）。
- `create_task`：新增 `repeatRule`。`update_task`：新增 `repeatRule`（null 表示清除）和 `skipOccurrence`。执行前先调用 `normalizeRepeatRule`，非法时返回可读错误。工具描述写明规则只适用于 ScheduledType=DATE。
- `list_tasks` / `get_task` / `list_feed`：返回 `repeatRule`。
- 确认 `TasksService.create` / `update` 已经接受 `repeatRule`；如果不接受，需要补上。

## Acceptance

- 工具层测试：合法规则写入后，读回的规则是规范化后的形式；非法规则返回错误；skipOccurrence 映射到 `TasksService.skip`；不可跳过时返回原因。
- 手动验证：让助手建出「每 2 周的周三」任务，在 UI 中 ↻ 徽标与规则编辑器都显示正确。

## Comments

### 2026-09-30 — 实现

- `repeatRuleSchema`（typebox）：unit / interval / weekdays? / anchor? / until?，字段描述写明 0=周日、anchor 两种语义、只适用于 DATE。
- `create_task`：新增 `repeatRule`。`TasksService.create` 不接受规则（与 UI 同一口径：新建任务不带规则），所以先创建，再调用一次 `update` 写入规则。没有 scheduledType DATE 或 scheduledDate 时，在写入前报错。
- `update_task`：新增 `repeatRule`（null 表示清除）和 `skipOccurrence`。设置规则时如果本次调用没有传 scheduledType，就先查任务现有的计划类型，不是 DATE 则在写入前报错。执行顺序是：完成 / 取消 → 字段更新（含规则）→ 跳过本次，这样同一次调用里改的规则和日期先生效。跳过被拒（409）时，把原因翻译成给模型看的英文解释。
- 规则经 `normalizeRepeatRule` 校验，非法时抛出可读错误，由模型自行更正（沿用工具层「错误以异常抛出」的约定）。
- `list_tasks` / `get_task` / `list_feed` 的返回中带上 `repeatRule`（null 时由 compact 省略）。
- 系统提示词没有改动：它是通用说明，规则的用法写在工具描述里。
- 测试（`test/agent/agent-tools.spec.ts`）：
  - create 先建后写规则，且写入的是规范化后的形式；
  - 没有日期、规则非法时报错且不写入；
  - update 设置规则、清除规则、任务无日期时拒绝；
  - skip 在字段更新之后执行，并返回新日期；
  - 409 被翻译成可读原因；
  - get_task 返回规则。
- 验证：backend typecheck 与 eslint 通过，295 个测试全部通过（含真库 e2e）。尚未与真实模型对话手动验证。
