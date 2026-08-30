# Optimize calendar view: enlarge month grid, remove week view

## Goal

继续优化日历视图：放大月视图网格使其占用更多屏幕空间，并移除周视图（用户认为不需要）。

## Requirements

- **R1 移除周视图**
  - `Calendar.tsx` 删除月/周切换器（pill 按钮）与 `viewMode` 状态，仅保留月视图
  - 删除 `CalendarWeekGrid.tsx` 组件
  - 清理 i18n 中不再使用的 `calendar:view_month` / `calendar:view_week` 键（zh/en）
  - `calendarGrid.ts` 中 `buildWeekDays` 若无其他使用方则一并删除，并同步更新其单测；若 `useDueTasksQuery` 等仍有引用则保留
  - 导航逻辑简化：prev/next 固定按月步进（`addMonths`），periodLabel 固定为年月格式
- **R2 放大月视图**
  - 增大 `CalendarDayCell` 单元格最小高度（`min-h-16` → 更高，如 `min-h-24` 或以上）与内边距，让 6×7 网格纵向占满主要视口区域
  - 视觉层级不回退：今日高亮、out-of-month 半透明、3 行溢出 + "+N more"、hover/quick-add 行为全部保留
- **R3 不破坏既有行为**
  - 快速添加（单击空白/加号/双击）、任务勾选完成、`weekStartsOn` 偏好、i18n（Intl 格式化）等行为保持不变
  - 相关既有测试（calendarGrid、CalendarDayCell、preferences.store）保持通过；因移除周视图导致的测试调整属预期范围

## Non-Goals

- 不改后端（`hasDue` 过滤等保持原样）
- 不改 Upcoming 页面的 week 布局（那是独立功能）
- 不新增年视图/日视图

## Acceptance Criteria

- [ ] AC1: `/calendar` 页面不再出现"月/周"切换器，页面只渲染月视图；翻页只按月前后切换
- [ ] AC2: `CalendarWeekGrid.tsx` 已删除且无残留引用；`view_month`/`view_week` i18n 键已移除；若 `buildWeekDays` 被删除，相关单测同步更新且全部通过
- [ ] AC3: 月视图单元格明显更高（min-h 提升），页面主体被日历网格占据；今日高亮、溢出 "+N more"、快速添加、勾选完成均正常
- [ ] AC4: 前端 lint / typecheck / test 全部通过
