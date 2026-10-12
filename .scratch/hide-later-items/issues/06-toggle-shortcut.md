# 06: ⇧⌘E 快捷键

Status: done
Blocked by: 03, 04, 05

## 内容

keymap 新增 `toggleLaterItems`，默认 `shiftAltOnWebDefaults('E')`（⇧⌘E / Ctrl+Shift+E / Alt+Shift+E），出现在快捷键设置里可改（ADR 0017）。作用于当前列表：项目页、区域页；Quick Find / Move 选择器打开时作用于弹窗。其他页面无操作。

## 验收标准

- [x] 项目页、区域页、Quick Find、Move 选择器中切换对应状态
- [x] 其他页面按下无副作用
- [x] 可在设置中重绑

## Comments

- 2026-10-12：完成。`toggleLaterItems`（global 组，`shiftAltOnWebDefaults('E')`），设置页文案、`docs/keyboard-shortcuts.md` 已补。项目 / 区域页走全局处理（按路由找到项目 / 区域，其他页面不拦截）；Quick Find 与移动选择器的输入框里全局处理让路，由 `isToggleLaterItemsKey` 在各自 keydown 里匹配（同样读用户改绑）。测试 `KeyboardShortcuts.test.tsx`、`MovePicker.test.tsx`。网页版实测 Alt+Shift+E：项目页、区域页、Quick Find 均来回切换。
