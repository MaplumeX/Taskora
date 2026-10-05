# 04 计划日期选择器接入输入框

Status: implemented
Blocked by: 01, 02, 03

## Problem

在 `ScheduledDateField` 顶部加入自然语言输入，覆盖所有调用方（TaskRowExpanded、TaskContextMenu、MultiSelectToolbar、QuickAddCard、ProjectMetaRow、ProjectContextMenu）。

## Design

见 spec「布局」「候选的写入」与第 3、4 节。

- 新组件 `task/fields/WhenQueryInput.tsx`。
- `query` 非空时用候选列表替换「快捷项 + 日历」，提醒区隐藏。
- 带时刻的候选仅在 `showReminder` 为真时写入 `reminderTime` 并请求通知授权。
- 从输入框选中后一律 `onClose`。
- 桌面端自动聚焦，触控端不聚焦。
- i18n：`whenQueryPlaceholder`、`whenQueryNoResults`。

## Acceptance

- 输入为空时 UI 与现在一致（现有测试通过）。
- 组件测试：候选渲染、↑↓ / Enter 写入的 patch、`showReminder` 真 / 假两种情况下的时刻处理、Esc 先清空、IME 组字时 Enter 不触发、选中后关闭。
- 实机检查桌面与 Android 上的布局与焦点行为。

## Comments

### 2026-10-05 — 实现

- Esc 不先清空输入：Radix 在 document 捕获阶段处理 Escape，与 MovePicker 一致交给宿主关闭。
- 测试：`WhenQueryInput.test.tsx`。实机布局与焦点行为尚未检查。
