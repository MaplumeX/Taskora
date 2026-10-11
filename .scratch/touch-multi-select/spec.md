# 触控：长按只拖动，左滑进入多选

Status: implemented — awaiting device acceptance

对齐 Things 3 iPhone：任务行长按只负责拖动排序；行级 / 批量操作改由左滑进入 Multi-Select Mode（见 `CONTEXT.md`），底部工具栏提供「计划 / 移动 / 删除 / 更多」。取代 `.scratch/mobile-touch-issues` 中「长按 500ms 开菜单、300ms 拖拽」并存的方案。

## Problem Statement

- 同一行上长按既激活拖拽（TouchSensor 300ms）又打开菜单（useLongPress 500ms），按住不动时行先进入拖拽态再弹菜单，两个手势互相干扰。
- Android WebView 长按还会派发原生 `contextmenu`，同样走到右键菜单路径。
- 触屏没有批量操作入口（键盘 ⌘A 批量只在桌面可用）。

## Solution

- **长按**：`TaskContextMenu`（默认变体）与 `ProjectContextMenu` 不再挂 `useLongPress`；触屏派发的 `contextmenu`（`isTouchContextMenu`）只 `preventDefault`。鼠标右键不变。
- **左滑**：`useSwipeToSelect` 挂在 `TaskItem` 行上（`touch-action: pan-y`）。越过 8px 后按主方向锁定；向左且在按下后 250ms 内开始移动才算左滑（长按拖拽需先按住 300ms，两者互斥）。行跟手左移（最多 88px）并露出多选图标，≥ 64px 松手触发。
- **多选模式**：`useMultiSelectStore`（api 包，独立于键盘 Selection）。进入时收起展开行、清空 Selection；模式中点击行（含复选框）只切换勾选，勾选行用 `bg-selection` 高亮。
- **工具栏**：`MultiSelectToolbar` 挂在 `AppShell`，模式中替代 FAB。计划 / 移动 / 删除直达；「更多」内含完成 / 取消 / 截止日期，以及只勾选一项时才出现的标签 / 重复 / 转换为项目（批量改标签会覆盖各任务原有的标签）。字段卡片复用 `FieldPickerDialog`（从 `FieldPicker` 抽出的受控窄屏卡片）。
- **退出**：动作执行完（字段卡片关闭时如有改动）、点「完成」、切换路由、Android 系统返回（返回级联在关闭浮层之后、路由返回之前）。

## Out of Scope

- ~~Trash 行：不可拖动，保留长按菜单（恢复的唯一触屏入口）。~~ 已被 `.scratch/trash-things3`（03）取代：Trash 行接入左滑多选，工具栏提供「放回」。
- 子任务行：不可拖动，保留长按菜单。
- 搜索弹窗、日历当天卡片中的任务列表：工具栏会被浮层遮住，用 `MultiSelectEnabledContext` 关闭左滑。
- ~~右滑快速设计划日期、多选状态下拖动多项、拖拽时的触觉反馈。~~ 已由 `.scratch/things-touch-gestures` 实现。
