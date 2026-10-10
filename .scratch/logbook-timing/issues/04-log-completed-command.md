# 04 Log Completed 命令与撤销

Status: implemented
Blocked by: 01

## Problem

手动模式需要一个命令把 Unlogged Item 移入 Logbook，每天模式下也可以提前移入。

## Design

见 spec 第 4 节。

- store 动作 `logCompleted()`：记下旧的 `loggedThrough`，写入当前时刻，返回撤销函数（写回旧值）。
- keymap 注册表新增动作，缺省 `⇧⌘Y`（ADR 0004 / 0017）。命令面板与条目右键菜单加入口，手机端放在列表「…」菜单。立即模式下全部隐藏。
- toast：「已移入 N 条」+「撤销」，N 为执行前 Unlogged Item 的数量。

## Acceptance

- 执行后所有 Unlogged Item 进入 Logbook；撤销后回到原视图。
- 立即模式下快捷键无效、菜单项不显示。
- 用户自定义的快捷键生效。

## Comments

### 2026-10-10 — 实现

- keymap：`logCompleted` 动作，默认 mac ⇧⌘Y / Windows Ctrl+Shift+Y / Web Alt+Shift+Y（Ctrl+Shift+Y 被浏览器占用）。`docs/keyboard-shortcuts.md` 已补。
- `ui/components/task/useLogCompleted.ts`：执行 + toast 撤销；`available` 为 false 时各入口隐藏。
- 入口：快捷键、任务右键菜单、项目右键菜单（含项目页「…」）、Logbook 页顶部按钮。没有命令面板，也没有通用的手机列表菜单，以 Logbook 按钮代替（见 spec 第 4 节）。
- toast 不显示条数。
