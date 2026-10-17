# 01：通知操作规则与快速添加草稿转换下沉为共用纯函数

Status: implemented

Spec：`../spec.md`「规则只有一份」。

## 范围

- `resolveReminderAction` / `snoozeTarget` 从 `packages/api/src/reminders/reminder-action.ts` 迁到 `@taskora/engine` 的 domain，
  api 重新导出，现有调用方不改。测试随之迁移。
- 从 `packages/api/src/quick-add/draft.ts` 的 `createFromQuickAddDraft` 拆出纯函数（放 `@taskora/shared`）：
  输入草稿 + 已知的 Project / Area / Tag，输出 `{ dto, reminderTime?, subtasks, placedIn }`。
  `createFromQuickAddDraft` 改为调用它，行为不变。

## 验收

- 现有 reminder-action、quick-add draft 测试全部通过，未改断言。
- 新纯函数单测：各字段、Project 非 ACTIVE / Area 不存在回落 Inbox、未知 Tag 丢弃、Reminder 仅在 when 为日期时保留。
- backend 能 import 这两个函数（`pnpm -F backend build` 通过）。

## Comments

### 2026-10-17 — 实现

- `resolveReminderAction` / `snoozeTarget` 及类型移到 `packages/engine/src/domain/reminder-action.ts`，经 domain index 导出；
  api 的 index、协调器、notification-shell 改从 `@taskora/engine` 引入。测试随文件迁移，未改断言。
- 新增 `packages/shared/src/quick-add.ts`：`QuickAddDraft` / `QuickAddWhen` / `QuickAddPlacement` 类型、`toQuickAddDraft`
  （hub 也要规整不可信的请求体，一并移入），以及纯函数 `planQuickAddTask(draft, refs)`。
  - `refs` 是调用方按草稿 id 查好的引用（`project` / `area` / `knownTagIds`），不是全量列表，
    这样 `createFromQuickAddDraft` 保持「只查草稿用到的数据」（原有测试断言了这一点），hub 也可以按 id 单查。
  - 输出 `{ dto, reminderTime?, subtasks, placedIn }`。
- `createFromQuickAddDraft` 改为查引用 → `planQuickAddTask` → 按计划写入，行为不变；api 仍从 `./quick-add/draft` 导出原有名字。
- 验证：新增 `api/src/quick-add/quick-add-plan.test.ts`（6 个用例）；api 790、engine 328、mobile 108、desktop 79 个测试全部通过；
  `pnpm -r run typecheck` 全部通过；backend 运行时能 require 到 4 个函数。
