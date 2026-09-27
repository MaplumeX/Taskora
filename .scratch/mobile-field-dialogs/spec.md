# 窄屏字段选择器改为居中 Dialog

Status: implemented — awaiting device acceptance

对齐 Things 3 iPhone：任务展开卡片里的计划日期 / 重复 / 截止日期 / 标签入口，在窄屏（< md，含 Android 与手机网页）以居中模态卡片呈现，而非锚定在按钮旁的 Popover。宽屏（桌面 / iPad 形态）保持 Popover。相关：`.scratch/android-app/spec.md`（窄屏导航采用 Things 3 iOS 结构）。

## Problem Statement

- 展开任务在屏幕下半部分时，锚定 Popover 被挤到按钮上方或压缩，日历显示不全，底部操作按钮被手势条遮挡。
- Popover 没有遮罩，和背后的列表视觉上混在一起；单手点击关闭区域模糊。
- 字段内部控件（日历快捷按钮、提醒开关、重复规则的步进 / 星期按钮）为鼠标尺寸（24–32px），触屏难以命中。

## Solution

新增通用容器 `FieldPicker`：`useIsDesktop()` 为真渲染原 Popover；否则渲染居中 Dialog 卡片——遮罩变暗、标题（字段名）+ 右上角关闭、内容区可滚动。字段组件（`ScheduledDateField` / `DueDateField` / `RepeatRuleField` / `TagsField`）不感知容器，仅用 `max-md:` 放大触控目标。

## User Stories

1. As a Taskora 手机用户, I want 点展开任务的日历图标弹出居中卡片, so that 日历无论任务在屏幕哪里都完整可见
2. As a Taskora 手机用户, I want 卡片背景变暗、点遮罩 / 右上角关闭 / 系统返回手势都能关闭, so that 关闭方式明确
3. As a Taskora 手机用户, I want 选中日期或点「今天 / 明天」后卡片保持打开、提醒区就地出现（可设提醒的端：Android / 桌面；web 与 Project 无提醒，选完即关），点「将来 / 清除」后关闭, so that 设日期后能接着设提醒，不必重开卡片（对齐 Things 3 的 When 卡片）
4. As a Taskora 手机用户, I want 卡片内按钮、开关、星期按钮都足够大, so that 单手也能准确点中
5. As a Taskora 手机用户, I want 卡片打开时不自动弹出键盘, so that 视线不被键盘打断；编辑提醒时刻 / 重复截止日时卡片避让键盘
6. As a Taskora 手机用户, I want 在卡片内按 Escape / 关闭卡片不会收起背后的展开任务, so that 连续编辑多个字段
7. As a Taskora 桌面用户, I want 宽屏仍是锚定 Popover, so that 鼠标操作路径不变

## Implementation Decisions

- **范围**：`TaskRowExpanded` 的四个字段入口 + `ProjectMetaRow` 的计划 / 截止 / 标签徽章（同一组字段组件，行为一致）。任务行右键 / 长按菜单不在范围。
- **断点**：与其余窄屏布局同口径，`useIsDesktop()`（≥ 768px）。
- **卡片尺寸**：宽 `min(22rem, 100vw - 2rem)`；垂直居中于「视口 − 键盘」区域（`--kb-inset`），最大高度同区域减 2rem，超出时内容区滚动。
- **关闭**：遮罩点击、右上角 44px 关闭按钮、Escape / 系统返回（back-navigation 级联已识别 `role="dialog"`）。
- **焦点**：`onOpenAutoFocus` 阻止默认聚焦首个控件，改聚焦卡片本身（不弹键盘、不显示焦点环），Tab 仍被焦点陷阱约束。
- **事件隔离**：卡片内 Escape 的 React 冒泡被截断，避免 `TaskItem` 的 Escape 收起逻辑误触；外点收起逻辑（`useTaskRowSelection`）已对打开中的 `role="dialog"` 放行。
- **字段触控尺寸**：仅 `max-md:` 生效，桌面样式不变。

## Testing Decisions

- `FieldPicker` 单测：窄屏渲染 `role="dialog"` 且带字段名标题、关闭按钮可关、`close()` 回调可关；宽屏渲染非 dialog 的 Popover。
- 既有 `TaskRowExpanded` / `ProjectMetaRow` / 字段组件测试须继续通过（jsdom 的 matchMedia 为 false → 走 Dialog 路径）。

## Out of Scope

- 移动（Move）全屏列表弹层、标签新建入口（Things 的标签卡片支持新建）。
- 任务展开卡片本身的布局改造、左右滑动手势、Magic Plus 拖拽插入。
