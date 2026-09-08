# 技术设计：移动端适配（底部标签栏 + 响应式布局）

## 1. 总体方案

利用 Tailwind 内置 `md:` 断点（768px）做双布局：

- **≥768px（桌面）**：现有 `AppShell` 结构不变（Sidebar + MainContent + ContentBottomBar）。
- **<768px（手机）**：
  - Sidebar 隐藏，内容区占满全宽。
  - 底部改为「标签栏（TabBar）」，固定 4 个主导航 + 「更多」。
  - 「更多」打开底部抽屉（Drawer），收纳其余全部导航入口（复用 Sidebar 的导航数据与行组件）。
  - 搜索入口移到页面顶部，添加任务用右下角 FAB。
  - ContentBottomBar 在手机端隐藏。

不引入额外依赖：Radix Dialog 已在项目中（`@radix-ui/react-dialog`），抽屉用现有 `dialog.tsx` 封装 + 自定义方向样式即可实现，无需 vaul 等新库。

## 2. 组件设计

### 2.1 `MobileTabBar`（新组件 `components/layout/MobileTabBar.tsx`）

- `fixed bottom-0 inset-x-0 md:hidden`，含 `env(safe-area-inset-bottom)` 安全区 padding。
- 5 个项：今天 `/today`、收件箱 `/inbox`、日历 `/calendar`、任何时间 `/anytime`、更多（受控打开 `MobileNavDrawer`）。
- 使用 `NavLink` 保持与 Sidebar 一致的 active 态；「更多」在当前路由属于抽屉内入口（upcoming/someday/logbook/tags/trash/projects/areas/设置）时高亮。
- 高度约 56px + 安全区，触控目标 ≥44px。

### 2.2 `MobileNavDrawer`（新组件 `components/layout/MobileNavDrawer.tsx`）

- 基于现有 `Dialog`（Radix）从底部滑入（`slide-up` 动画，`max-h-[85dvh]`，底部圆角）。
- 内容分三段：主导航剩余项（最近/将来/日志）、项目/区域（复用 `SidebarProjectSection`）、标签 + 回收站 + 设置 + 账号菜单。
- 点任意链接后自动关闭抽屉。

### 2.3 `MobileFab`（新组件 `components/layout/MobileFab.tsx`）

- `fixed bottom-20 right-4 md:hidden` 圆形主色按钮（Plus 图标）。
- 行为完全复用 `ContentBottomBar.handleAddTask`（含 addProject/addHeading 的路由条件逻辑，抽成共享 hook `useContentBottomActions`，避免复制）。
- FAB 菜单（长列表页隐藏任务按钮时）：在 area 详情页显示添加项目、project 详情页显示添加标题——用 FAB 点击后弹出小菜单（复用 DropdownMenu，方向朝上）。

### 2.4 顶部搜索入口（改动 `MainContent` 或新 `MobileTopBar`）

- 手机端在内容顶部固定一条工具栏（`sticky top-0 md:hidden`），含搜索图标按钮，点击打开现有 `SearchModal`。
- 桌面端不渲染（搜索仍由 Cmd+K + 底部功能条承担）。

### 2.5 现有组件改动

| 文件 | 改动 |
|---|---|
| `AppShell.tsx` | Sidebar/ContentBottomBar 加 `hidden md:flex`；挂载 MobileTabBar、MobileNavDrawer、MobileFab、MobileTopBar（手机件均 `md:hidden`）；主内容区加 `pb-[calc(56px+safe-area)]` 防止被标签栏遮挡 |
| `ContentBottomBar.tsx` | 逻辑抽到 `useContentBottomActions` hook 供 FAB 复用；外层加 `hidden md:flex` |
| `Sidebar.tsx` | 外层 `hidden md:flex`（组件本身不改结构，桌面零回归） |

## 3. 响应式细节（各页面）

### 3.1 全局

- `MainContent` 非 canvas 页 `max-w-2xl px-6` → 手机端 `px-4 md:px-6`。
- 弹窗通用：`DialogContent` 增加手机样式 `max-w-[calc(100vw-2rem)] md:max-w-xl`、`max-h-[85dvh]` 已有滚动则保持。
- 日历 canvas 页 `px-6 pt-4` → `px-3 pt-2 md:px-6 md:pt-4`。

### 3.2 日历月视图（CalendarMonthGrid）

- 7 列网格保留（日历本质需要 7 列），手机端降级策略：
  - 单元格内任务行缩略为「点 + 截断标题」，隐藏次要信息。
  - 星期表头用超短文案（一/二/三…，i18n 已有 locale 资源则复用，否则补 `calendar:weekdayShort*` 键）。
  - 单元格最小高度 80px → 手机端 `minmax(64px,1fr)`。
- 若实测仍不可读，备选：手机端单元格只显示任务数量圆点，点按弹出当日任务列表（Dialog）——作为 fallback 方案记入 implement.md 的风险项。

### 3.3 任务列表 / 展开行（TaskItem / TaskRowExpanded）

- TaskItem 行：勾选框、标题、日期徽章在 375px 下自然换行/截断（`truncate` + `flex-wrap`），操作按钮区 `hidden md:flex`（移动端操作走展开行）。
- TaskRowExpanded：两列布局（若有）改 `flex-col md:flex-row`；表单字段全宽。

### 3.4 其他页面

- Tags / Trash / 登录注册 / 设置各页：排查 `max-w-*`、`grid-cols-*`、`whitespace-nowrap`，统一加 `md:` 前缀让手机端为单列堆叠。
- `SettingsModal`：手机端全宽近全屏（`w-[95vw] max-w-lg md:max-w-2xl` 之类），导航列在手机端折叠为顶部标签行。

## 4. 数据流与契约

- 无后端/API/shared 改动。
- 新增 hook `useContentBottomActions`（从 ContentBottomBar 提取），输入无参数，返回 `{ showAddTask, showAddProject, showAddHeading, handleAddTask, handleAddProject, handleAddHeading }`，两处消费。
- 导航数据 `mainNav` 从 `Sidebar.tsx` 提取到 `layout/navItems.ts` 导出，供 Sidebar / MobileTabBar / MobileNavDrawer 共用（单一数据源）。

## 5. 兼容与回归

- 所有手机端新组件均为增量挂载（`md:hidden`），桌面渲染路径不变 → 桌面回归风险极低。
- 关键回归点：`ContentBottomBar` 重构为 hook 后行为需与现状一致（桌面按钮组）。
- 现有测试（SidebarProjectSection、TaskCheckbox 等）不应受影响；新增组件补基础渲染测试。

## 6. 回滚

纯前端增量改动，单分支多个 commit；出问题可按 commit 粒度 revert，无数据迁移。
