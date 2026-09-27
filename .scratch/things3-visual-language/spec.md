# 视觉语言改版：Things 3 式「纸面安静感」

Status: in progress (01–06 done)

把 Web / 桌面 / 手机三端的视觉语言从「暖米色 + 柔紫 + 颗粒纹理」统一改为 Things 3 式的安静界面：白纸内容区、浅灰侧边栏、蓝色只做选中与交互、黄 / 红 / 绿只承载 CONTEXT.md 已定义的语义（今天 / Deadline / 了结）。改版覆盖 token、基础组件、业务组件与动效，不改数据模型与交互流程。相关：`.scratch/things3-when-display/`、`.scratch/things3-ownership-display/`（行内信息结构）、`.scratch/calendar-dense-grid/spec.md`（日历网格）。

## Problem Statement

- 产品定位是 Things 风格，但当前视觉（`40 33% 97%` 米色底、`262 60% 58%` 紫色主色、Outfit 展示字体、noise 纹理、0.75rem 大圆角）与 Things 的冷静白纸感相去甚远；手机端 #104 已走向 Things 3 结构，三端观感割裂。
- 基础组件基本是 shadcn 默认样式（`rounded-md` 实心按钮、`active:scale-[0.98]`、带 `shadow` 的方形 Checkbox），缺少统一的状态规范（hover / 选中 / 聚焦 / 禁用各处写法不一）。
- 主题 token 在 `packages/frontend`、`packages/desktop`、`packages/mobile` 各复制一份 `index.css` 与 `tailwind.config.js`，任何视觉改动都要改三处。
- 字体经 Google Fonts 在线加载，桌面 / 手机壳离线时回退不一致。
- Bucket 图标颜色写死在 `navItems.ts`（`text-sky-500` 等 Tailwind 色板），暗色模式下未单独调校。

## Solution

一套以 token 驱动的设计系统，放在 `packages/ui` 作为三端唯一来源；在其上逐层重做基础组件、任务行、侧边栏、弹层与动效。

### 设计原则

1. **内容优先**：界面元素默认隐身（无边框、无卡片、无阴影），只有交互或选中时才显形。
2. **层级靠留白与字重**：分割线仅在 Group Header / Project Heading 下方出现；其余分隔全部用间距。
3. **颜色即语义**：蓝 = 交互 / 选中；黄星 = 今天；红 = Deadline 到期 / 逾期（红色只属于 Deadline）；绿 = Logbook。装饰性用色只出现在 Bucket 图标与 Tag。
4. **浮起即编辑**：展开的任务、弹层是界面中仅有的「浮起」表面，靠阴影而非边框与背景区分。
5. **动效有物理感**：统一 spring 曲线；完成任务有「勾上—停留—离开」三段节奏。

## Design Tokens

### 颜色（HSL，沿用 `--xxx: H S% L%` 约定）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--background` | `0 0% 100%` | `225 6% 13%` | 内容区 |
| `--foreground` | `220 9% 15%` | `220 9% 92%` | 正文 |
| `--sidebar` | `220 14% 96%` | `225 6% 16%` | 侧边栏底色（新增） |
| `--sidebar-accent` | `220 10% 90%` | `225 6% 22%` | 侧边栏选中项（新增） |
| `--card` / `--popover` | `0 0% 100%` | `225 6% 18%` | 展开任务卡片 / 弹层 |
| `--primary` | `213 94% 52%` | `213 94% 62%` | 交互蓝 |
| `--selection` | `213 100% 94%` | `213 50% 26%` | 行选中底色（新增） |
| `--muted` | `220 14% 96%` | `225 6% 20%` | 次级表面 |
| `--muted-foreground` | `220 6% 46%` | `220 6% 62%` | 元信息、归属小字 |
| `--accent` | `220 14% 95%` | `225 6% 20%` | hover 底色 |
| `--border` / `--input` | `220 13% 90%` | `225 6% 24%` | 仅在必须时使用 |
| `--today` | `44 96% 54%` | `44 96% 58%` | 黄星（新增） |
| `--deadline` | `3 90% 56%` | `3 85% 62%` | Deadline 到期 / 逾期（新增，取代 `--destructive` 在 Deadline 上的使用） |
| `--destructive` | `3 90% 56%` | `3 85% 62%` | 删除等破坏性操作 |
| `--success` | `145 58% 40%` | `145 50% 50%` | Logbook（新增） |
| `--warning` | `36 95% 50%` | `36 95% 56%` | Agent 审批等警示（新增） |
| `--ring` | 同 `--primary` | 同 `--primary` | 聚焦环 |

Bucket 图标色（新增 `--nav-inbox` / `--nav-today` / `--nav-upcoming` / `--nav-calendar` / `--nav-anytime` / `--nav-someday` / `--nav-logbook`），`navItems.ts` 的 `colorClass` 改用 `text-nav-*`，亮 / 暗各自调校。

### 字体

- 字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif`。
- 移除 Inter / Outfit 的 Google Fonts 链接与 `font-display` 族。
- 字阶：

| 名称 | 尺寸 / 行高 / 字重 | 用途 |
|---|---|---|
| `title-1` | 28 / 34 / 700 | 视图大标题（PageHeading） |
| `title-2` | 20 / 26 / 700 | 展开任务的标题、Dialog 标题 |
| `section` | 13 / 18 / 600 | Group Header、Project Heading、侧边栏 Area |
| `body` | 14 / 20 / 400 | 任务标题、正文 |
| `meta` | 12 / 16 / 400 | 归属小字、日期 chip、计数 |

### 形状、阴影、间距

- `--radius: 0.5rem`（lg 8px / md 6px / sm 4px）；行、按钮用 md，弹层与展开卡片用 lg + 2px（10px）。
- 阴影只保留两级：`shadow-row-lift`（展开任务卡片：`0 1px 3px /8%, 0 8px 24px /12%`）与 `shadow-popover`（弹层：`0 0 0 0.5px /10%, 0 10px 30px /16%`，0.5px 环代替边框）。移除 `shadow-soft`。
- 移除 `noise-overlay`。
- 间距基于 4px；任务行水平内边距 8px，列表左右页边距桌面 48px / 手机 16px。

### 动效

- 曲线：`--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)`（弹出类：菜单、Switch、勾选）；`--ease-expand: cubic-bezier(0.45, 0, 0.2, 1)`（展开 / 收起，前后均匀，spring 过于前倾会显得一闪而过）。时长 `--dur-fast: 120ms`、`--dur-base: 200ms`、`--dur-slow: 320ms`、`--dur-expand: 240ms`，Tailwind 中用 `duration-fast/base/slow/expand`（不要写 `duration-[var(...)]`：与 tailwindcss-animate 冲突，不生成 CSS）。
- 移除按钮 `active:scale`；按压反馈改为背景加深。
- `prefers-reduced-motion` 下所有位移 / 缩放动画降级为瞬时或纯透明度变化。

## Component Specs

### 基础组件（`packages/ui/src/components/ui`）

- **Button**：默认变体仍为实心蓝（仅用于 Dialog / 表单主操作，其余调用点显式使用 ghost）；按压改为底色加深、去掉 scale；高度 28px（sm）/ 32px（default），手机端最小触控 44px 保持不变；icon 按钮 28×28、图标 16px、`text-muted-foreground`，hover 显 `bg-accent`。
- **Input / Textarea**：默认为表单样式（1px `--input` 边框、聚焦时蓝边 + 3px 蓝色光晕）；任务内编辑沿用调用点的无边框覆盖（`border-0 shadow-none focus-visible:ring-0`），不另设变体。
- **Popover / DropdownMenu / Tooltip**：`--popover` 底 + `backdrop-blur-xl` + 90% 不透明；`shadow-popover`；圆角 10px；菜单项高 28px、圆角 6px、hover / 键盘高亮为 `bg-primary text-primary-foreground`（macOS 菜单式），破坏性项高亮为红底白字；分隔线上下 4px。
- **Dialog / Drawer**：圆角 12px；遮罩 `black/20`（亮）/ `black/50`（暗）；出现为 opacity + scale(0.97→1)，200ms spring。
- **Switch**：iOS 式，开启为 `--success` 绿（Things 设置页一致）。
- **Separator**：默认 0.5px（高 DPR 下 `scaleY(0.5)`）。

### 任务行（`TaskItem` / `TaskCheckbox`）

- 单行高 32px（手机 44px）；有归属小字时自然撑高。圆角 6px。
- 状态：hover `bg-accent/60`；选中 `bg-selection`（取代 `bg-accent`）；多选同色；键盘聚焦未选中时 1px `ring/40`。
- **Checkbox**：14px 圆角方形（radius 3.5px），1.5px `muted-foreground/50` 描边，无阴影；hover 描边转 `--primary`。勾选：填 `--primary`、白色 ✓ 以 stroke 绘制动画出现（120ms）；取消态为 ✕。
- **完成节奏**：勾选后保持勾选态停留 600ms（期间再次点击可撤销），随后行高收起 + 淡出 200ms。把现有 `setTimeout(onToggleComplete, 350)` 调整为停留 + 收起两段，保持 `task-complete-anim` 的 reduced-motion 降级。
- 行首 chip：黄星用 `text-today`；未来日期 chip 为 `meta` 字号、`bg-muted` 圆角 4px、`text-muted-foreground`。
- 行尾：Tag 以胶囊（`meta`、1px 描边、圆角 full，最多 3 个，超出 `+N`）替代当前色点；Deadline 旗帜 + 文案使用 `text-deadline`（到期 / 逾期）或 `muted-foreground`。

### 展开的任务（`TaskRowExpanded`）

- 展开时整个任务（标题行 + 详情）变为一张浮起卡片：`bg-card`、圆角 10px、`shadow-row-lift`、上下各 12px 外边距推开相邻行。展开与收起对称：详情区高度（grid 0fr↔1fr）、透明度、外边距与阴影统一 `duration-expand` + `ease-expand`，收起结束后才卸载详情。标题行隐藏日期 / 标签 / Deadline 徽标。
- 卡片内：标题 `body` 600；备注区无边框、placeholder 为「备注」；Subtasks 为 12px 圆形 checkbox 的紧凑列表。
- 底栏：已设值字段在左侧显示为 chip（图标 + 值，点击打开编辑器），未设值字段在右侧为图标按钮（日期 / 重复 / 标签 / 子任务 / Deadline）。

### 侧边栏（`Sidebar` 及其行组件）

- 底色 `bg-sidebar`，右侧无边框（与内容区靠色差分隔）；宽 240px。
- 行高 28px、圆角 6px、图标 16px 彩色（`text-nav-*`）、文字 `body`；选中 `bg-sidebar-accent` + 文字 600；计数 `meta` 右对齐。
- 分区之间 16px 留白，去掉 `Separator`。
- Area 行：`section` 字重、立方体图标；Project 行：`ProjectProgressRing` 缩为 16px（与图标同宽）。
- 底部栏：「+ 新建列表」与设置按钮均为 ghost，`muted-foreground`。

### 页面与列表

- **PageHeading**：`title-1`；桌面端也在标题前显示 28px Bucket 彩色图标（Things Mac 一致），Project 标题前显示进度环。
- **Group Header / Project Heading**：`section` 字号，蓝色（Project Heading）或 `foreground`（Group Header），下方 0.5px 分割线，上方 24px 留白。
- **Project 行（Feed 中）**：进度环 14px + `body` 600 标题。
- **Logbook**：已了结行 `muted-foreground`，了结日期 `meta`；Checkbox 保持实心蓝。
- **空状态**：居中 48px 线性灰色 Bucket 图标 + 一行 `muted-foreground` 文案，不加插画。
- **快速新建 / MobileFab**：圆形 48px 蓝底白「+」，`shadow-popover`；桌面 ContentBottomBar 为 ghost 图标按钮。

### 日期选择（When 弹层 / `FieldPicker`）

- 顶部快捷项纵列：★ 今天 / ☾ 今晚（若无该概念则省略）/ 明天 / 某天（Someday）；图标沿用语义色。
- 下方月历：日期 28px 圆形命中区，今天为蓝字、选中为蓝底白字，过去日期灰。
- 底部「清除」为 ghost 文字按钮。

## User Stories

1. As a Taskora 用户, I want 界面安静、以内容为主, so that 我专注于任务本身
2. As a Taskora 用户, I want 颜色只在有意义时出现（今天黄、Deadline 红、选中蓝）, so that 一眼读出任务状态
3. As a Taskora 用户, I want 勾选任务后看到它停留片刻再离开, so that 有完成的满足感且可以误点撤销
4. As a Taskora 用户, I want 展开的任务像一张浮起的卡片, so that 清楚知道自己在编辑哪一条
5. As a Taskora 桌面用户, I want 侧边栏与 Things Mac 相似的彩色图标与选中态, so that 快速定位视图
6. As a Taskora 用户, I want 暗色模式同样经过调校, so that 夜间使用舒适
7. As a Taskora 用户, I want Web / 桌面 / 手机三端观感一致, so that 切换设备没有割裂感
8. As a Taskora 离线桌面用户, I want 字体不依赖网络, so that 离线启动时排版不跳动

## Implementation Decisions

- **单一来源**：`packages/ui/src/styles/tokens.css`（token + base + utilities）与 `packages/ui/tailwind.preset.js`；三个壳的 `tailwind.config.js` 改为 `presets: [require('@taskora/ui/tailwind.preset')]` + 各自 `content`；壳的 `index.css` 仅 `@import` 共享文件并追加壳专属样式（mobile 的 `--kb-inset`、`.ptr-indicator`）。
- **语义 token 优先**：组件内不再出现 Tailwind 色板类名（`text-sky-500` 等）与 hex；Tag 颜色是用户数据，保持内联 style。
- **分阶段、每阶段可发布**：token 收敛 → token 值与字体 → 基础组件 → 业务组件 → 动效 → 暗色走查；每阶段独立 PR。
- **不引入新动效库**：先用 CSS（`grid-template-rows` 0fr→1fr 做高度展开、View Transitions 不作要求）；若列表重排动画在 CSS 下不可行，再单独评估 `motion`。
- **不新增用户可见的主题 / 强调色设置**：Appearance 仍只有亮 / 暗 / 跟随系统。

## Testing Decisions

- 视觉改动以 `/run` 截图验收：Today、Upcoming、Project 详情、展开任务、When 弹层、侧边栏、Settings、Calendar，亮 / 暗各一张，窄屏 390px 与宽屏 1280px。
- 行为改动需测试：完成节奏（停留期内再次点击撤销、停留结束后调用 `onToggleComplete`）；reduced-motion 下不延迟收起动画。
- 现有测试中依赖样式类名的断言（如 `bg-accent` 选中态）随实现更新。

## Out of Scope

- Project / Area 颜色、自定义强调色、主题预设切换。
- 新交互（拖拽改期、Magic Plus 拖放插入位置、快捷键变更）。
- 插画、品牌 Logo 重绘、应用图标。
- 「今晚」（This Evening）数据概念——若 When 弹层需要，另开 spec。
