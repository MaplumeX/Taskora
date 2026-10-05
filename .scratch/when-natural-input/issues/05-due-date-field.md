# 05 截止日期选择器接入输入框

Status: implemented
Blocked by: 04

## Problem

`DueDateField` 也需要同样的输入框。

## Design

复用 `WhenQueryInput`，`allowSomeday: false`、`showTime: false`；选中写 `{ dueDate }`，清除写 `{ dueDate: null }`。i18n：`deadlineQueryPlaceholder`。

## Acceptance

- 不出现 Someday；带时刻的输入只取日期。
- 组件测试同 04 的对应部分。

## Comments

### 2026-10-05 — 实现

- 测试与 04 同文件。实机尚未检查。
