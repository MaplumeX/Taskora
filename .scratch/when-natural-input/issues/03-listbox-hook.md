# 03 抽出列表导航 hook

Status: implemented

## Problem

MovePicker 里的高亮、滚动、键盘和 ARIA 逻辑 When 输入要原样复用。

## Design

见 spec 第 2 节。新增 `packages/ui/src/hooks/useListboxNavigation.ts`，返回 `activeIndex`、`setActiveIndex`、`onKeyDown`、`inputProps`（combobox ARIA）、`optionProps(index)`。MovePicker 改用它，行为不变。

## Acceptance

- MovePicker 现有测试全部通过，无行为变化。
- hook 自带 IME 组合输入保护。

## Comments

### 2026-10-05 — 实现

- 放在 `packages/ui/src/lib/useListboxNavigation.ts`（ui 包的 hook 都在 lib 下）。用相对路径导入：frontend / desktop / mobile 的 tsconfig 只给 `@/lib/utils` 配了别名。
- TagPicker、QuickFind 有同样的逻辑，本次没迁移。
