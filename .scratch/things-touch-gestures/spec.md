# 触控手势对齐 Things 3 iPhone

Status: implemented — awaiting device acceptance

补齐手机端与 Things 3 iPhone 在手势和交互上的五处差距。术语见根 `CONTEXT.md`（Multi-Select Mode、Magic Plus、Undo），撤销的架构取舍见 ADR-0024。

## Problem Statement

- 任务行只能左滑进多选，改计划要先展开任务或进多选，Things 右滑直接弹出 When。
- 除「移入 Logbook」的 toast 外没有任何撤销，误删、误移、误改期都无法回退。
- 多选模式里长按只拖被按住的那一行，Things 会把勾选的条目一起拖走。
- 拖拽、滑动越过阈值时没有触感反馈。
- 区域页点 + 先弹「任务 / 项目」菜单，Things 是直接新建任务。

## Solution

1. **右滑弹出计划卡片**：`useSwipeToSelect` 增加 `onSwipeRight`（与左滑同样的锁定、阈值和互斥规则），任务行右滑越过阈值后松手，打开全局唯一的 `SwipeWhenPicker`（`FieldPickerDialog` + `ScheduledDateField`，可设提醒的端带提醒区）。多选模式中、展开态和 Trash 里的行不响应。行左侧随位移露出日历图标，越过阈值后高亮。
2. **摇一摇撤销**：`UndoHistory`（api 包）包装 Engine 的写入方法，以用户输入为界划分步骤，撤销时写回旧值（ADR-0024）。Android `background` 插件监听加速度计，检测到摇晃后推送 `shake` 事件，`UndoPrompt` 弹出「撤销「完成」？」确认。已有弹层时不叠加确认，没有可撤销的步骤时不弹。
3. **多选拖拽**：`dragSelectionIds()` 在多选模式中返回勾选集合，否则返回键盘 Selection。四个任务列表（TaskList / 分组 feed / 项目 / Upcoming）的多项拖拽因此直接适用于触控多选。
4. **触感**：`haptic(kind)` 注入点（api 包，默认 no-op），Android 壳经 `performHapticFeedback` 实现，跟随系统触感设置，不需要权限。触发点：
   - 横滑或下拉查找越过阈值：`tick`。
   - 长按拖起、拖出 Magic Plus：`lift`。
   - 在列表或 Inbox 目标上松手落位：`drop`。
   - 摇一摇撤销完成：`confirm`。
5. **区域页 +**：只有首页弹菜单，区域页点按直接新建任务。区域内的新项目由首页 Magic Plus 拖进区域新建。

## Out of Scope

- 点按新建落在列表顶部（保留追加到末尾的决定）。
- 重做（Redo），以及桌面 / Web 的 ⌘Z（同一个 `UndoHistory` 可以接入，见 ADR-0024）。
- 撤销不可还原的物理删除（清空 Trash、删除区域 / 标签 / Heading / 附件、转换为项目）。
- 项目行右滑。

## 验收要点（真机）

- 摇一摇的灵敏度：阈值 2.3g、两次峰值间隔 120–700ms、冷却 1.5s（`BackgroundPlugin.kt`）。需要确认走路、放下手机时不会误触发。
- 触感种类在不同机型上的手感，尤其是 API < 30 时 `drop` / `confirm` 会退回 `VIRTUAL_KEY`。
- 右滑与 Android 系统返回手势（屏幕左边缘）是否冲突。
- 多选模式中长按勾选行，整组能否一起拖动并落位。
