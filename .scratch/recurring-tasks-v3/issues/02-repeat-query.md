# 02 When 输入框识别重复说法（Repeat Query）

Status: implemented
Blocked by: 01

## Problem

When 输入框能识别「下周五 9点」，但识别不了「每周五」「每月 15 号」，设重复要先选日期再逐项点规则编辑器。

## Design

见 spec 第 2 节。要点：

- 新纯函数 `parseRepeatQuery`（`packages/shared/src/repeat-query.ts`），复用 when-query 的归一化、数字 / 星期词表与 `extractTime`；输出规范形规则 + 第一次出现日（≥ 今天）+ 可选时刻。
- `WhenCandidate` 加入 `repeat` 分支；`parseWhenQuery` 新增 `allowRepeat`，以重复触发词开头时只出重复候选。
- `ScheduledDateField` / `WhenQueryInput` 新增 `allowRepeat`，只在单个实体的计划日期入口打开（清单见 spec）。
- 候选行：↻ + `formatRepeatSummary` 摘要 + 「从 X 开始」+ 可选时刻；选中写 `{ start: ANYTIME, scheduledDate, repeatRule, reminderTime? }` 并关闭弹层。
- i18n 与 placeholder；CONTEXT.md 新增 Repeat Query 词条。

## Acceptance

- 解析器：规则表逐条、中英文、时刻、前缀补全与排序、`allowRepeat: false` 不出重复候选、原有 when-query 测试全部通过、与 engine 交叉校验。
- UI：重复候选写出的 patch（含 reminderTime、Project 忽略时刻）；未开 `allowRepeat` 的入口不出重复候选。
- 各包 typecheck 与测试通过。

## Comments

### 2026-10-13 — 实现

- 重构：把归一化、数字、时刻提取、星期 / 月份名、`exactDate` 从 `when-query.ts` 移到 `packages/shared/src/query-lexicon.ts`，两个解析器共用；原有 122 个 when-query 测试不改即通过。
- 解析器 `packages/shared/src/repeat-query.ts`：`parseRepeatQuery` 与 `parseRepeat`（后者另给出 `exclusive`）。完全匹配走中英文语法；补全用一张已归一化的说法表做前缀匹配，通用说法（每天 / 每周…）排在具体说法（每周五…）之前，同档按单位、第一次日期排序。第一次出现日在解析器内用 PlainDate 计算，不依赖 engine。
- `parseWhenQuery`：`allowRepeat` 为真时，若重复说法完全匹配或以 每 / 完成后 / every / each 开头，只出重复候选；否则重复补全接在日期候选之后，总数仍不超过 6。
- UI：`ScheduledDateField` / `WhenQueryInput` 新增 `allowRepeat`。打开的入口：TaskContextMenu（非多选）、TaskRowExpanded（两处）、SwipeWhenPicker、ProjectContextMenu（单个项目）、ProjectMetaRow、KeyboardFieldPicker（单个目标）。候选行为 ↻ + `formatRepeatSummary` + 「从 X 开始」+ 可选时刻；选中写 `{ start, scheduledDate, repeatRule, reminderTime? }` 并关闭。`allowRepeat` 时占位文字换成「输入日期或重复，如「下周五」「每周一」」。
- CONTEXT.md 新增 Repeat Query 词条。
- 测试：api 新增 `repeat-query.test.ts`（105 条：规则表、钳制、非法输入、补全、与 engine 交叉校验、parseWhenQuery 集成）；ui 新增 5 条（候选写入、提醒、忽略时刻、未开入口、占位文字）。全仓：engine 310、api 784、ui 1158、backend 401（临时 Postgres 真库）、desktop 79、mobile 108、frontend 28 通过；typecheck、eslint、prettier 通过。尚未在真实应用里手动验证。
