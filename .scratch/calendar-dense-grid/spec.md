# 日历：高密度月网格（滴答清单式）

Status: implemented — awaiting device acceptance

Calendar 视图改为高密度月网格：格内以浅底色块显示任务标题，点格子打开当天完整列表（窄屏底部面板 / 宽屏居中卡片）。窄屏先行落地，随后宽屏统一为同一结构（仅字号 / 色块尺寸不同）。相关：`.scratch/android-app/spec.md`（窄屏导航）、`.scratch/mobile-field-dialogs/spec.md`（窄屏模态约定）。

## Problem Statement

390px 宽屏幕上，月网格沿用桌面样式缩小：页面左右 12px 内边距 + 格间 6px + 每格圆角边框与内边距，单格宽约 47px；格内再放 12px 勾选框，标题只剩约 20px（1–2 个汉字 + 省略号）。格高最小 64px 且固定最多 3 行，12px 字号行行紧贴。结果是格子里的条目基本无法辨认，勾选框与「+N」也难以点中。

## Solution

- **贴边网格**：日历页在窄屏去掉左右内边距，格间无间隙，仅以细横线分隔；6 行平分页面剩余高度。
- **任务色块**：格内不放勾选框；每条任务是 10px 字号、14px 行高的浅底色块，超长直接截断（不加省略号，省出一个字的宽度）。能放几条按格子实际高度计算；放不下时末行显示「+N」。
- **点格子看当天**：整个格子是一个按钮，点击从底部弹出当天的完整任务列表（标准任务行：完整标题、勾选、项目归属、原地展开编辑）。

## User Stories

1. As a Taskora 手机用户, I want 月视图格子里能认出每条任务的前几个字, so that 不点进去也知道哪天有什么事
2. As a Taskora 手机用户, I want 格子尽可能多地显示任务、放不下时看到「+N」, so that 我知道当天还有多少没显示
3. As a Taskora 手机用户, I want 到期 / 逾期的截止任务以红色浅底标出, so that 紧急事项一眼可见（红色只属于 Deadline）
4. As a Taskora 手机用户, I want 已完成任务弱化、已取消任务加删除线, so that 与其他列表的了结态一致
5. As a Taskora 手机用户, I want 点任意一天打开底部面板列出当天全部任务, so that 我能完整阅读、勾选和编辑
6. As a Taskora 手机用户, I want 今天的日期有主题色圆底、非本月日期置灰, so that 快速定位
7. As a Taskora 桌面用户, I want 宽屏月视图与手机同一风格（细线网格、色块、点格子看当天）, so that 各端观感一致；宽屏色块更大（12px、加省略号），点格子弹出居中卡片

## Implementation Decisions

- **单一结构**：`CalendarMonthGrid` + `CalendarDayCell` 窄屏与宽屏共用，旧的宽屏格子（格内勾选框 + `CalendarTaskRow` + 「还有 N 项」popover）移除。尺寸：窄屏 10px 字 / 14px 色块、不加省略号，「+N」；宽屏 12px 字 / 20px 色块、加省略号，「还有 N 项」。行最小高度窄屏 72px、宽屏 96px。
- **键盘 Selection**：日历页仍注册全部任务为可遍历行，选中任务的色块以主题色描边高亮。
- **容量计算**：对网格容器测高（ResizeObserver），行高 = 网格高 / 6，容量 = ⌊(行高 − 日期行高) / 色块节距⌋（窄屏 20 / 15px，宽屏 32 / 22px）；任务数超过容量时显示「容量 − 1」条 + 「+N」。测不到高度（测试环境）时按默认容量 4。
- **色块配色**：Project / Area 目前没有颜色字段，统一主题色浅底；截止日期 ≤ 今天（到期 / 逾期）的 ACTIVE 任务用红色浅底（与 Deadline 行上红色语义一致）。
- **当天面板**：Radix Dialog；窄屏为底部 sheet、宽屏为 28rem 居中卡片（最大 70vh）（`role="dialog"`，系统返回手势可关），标题为当天日期，内容复用 `TaskListView`（不可拖拽排序），最大高度 85dvh 并随键盘上移（`--kb-inset`）。关闭时收起展开中的任务。
- **页面布局**：`MainContent` 的 canvas 路由在窄屏去掉左右内边距，由 Calendar 页头自行补齐；宽屏保留原内边距。

## Testing Decisions

- compact 网格：渲染格内色块标题；超过容量显示「+N」；点格子打开以当天日期为标题的 dialog，内含该日任务行；非本月日期标记。
- 旧宽屏格子的 `CalendarDayCell` 测试随组件一并移除。

## Out of Scope

- 左右滑动切换月份、周视图 / 三日视图、格内拖拽改期。
- 在选中日期上新建任务（日历页暂不显示 +）。
- Project / Area 颜色。
