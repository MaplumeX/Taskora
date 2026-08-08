# Settings modal refactor

## Goal

将设置中心从"占用主内容区的整页路由视图"改为"点击触发的弹出 modal"。用户点击侧边栏齿轮按钮或用户下拉菜单的"账户设置"后，设置以 modal 形式浮于当前页面之上，不再离开当前视图。

## Background

当前实现：
- `/settings` 路由 → `SettingsLayout`（左侧导航4项 + 右侧 `<Outlet>` 内容），占满 `AppShell` 主内容区
- 4 个设置页：`SettingsAppearance`（主题/语言/周首日）、`SettingsAccount`（资料/密码/删除账户）、`SettingsData`（导出）、`SettingsAbout`（关于）
- 2 个入口：`SidebarBottomBar` 齿轮按钮 → `navigate('/settings/appearance')`；`Sidebar` 用户下拉菜单 → `navigate('/settings/account')`
- `SettingsAccount` 内部有一个删除账户二次确认 `Dialog`（嵌套）

## Requirements

### 功能需求

- R1: 点击设置入口后弹出 modal，不再导航离开当前页面
- R2: modal 内布局为左侧导航列表 + 右侧内容区（延续现有 `SettingsLayout` 的视觉结构）
- R3: modal 内左侧导航支持4个设置分类切换：外观 / 账户 / 数据 / 关于
- R4: 复用现有4个设置页组件的内容（`SettingsAppearance` / `SettingsAccount` / `SettingsData` / `SettingsAbout`），不重写表单逻辑
- R5: 两个入口点均打开 modal：
  - `SidebarBottomBar` 齿轮按钮 → 打开 modal，默认显示"外观"tab
  - `Sidebar` 用户下拉菜单"账户设置" → 打开 modal，默认显示"账户"tab
- R6: 保留 `SettingsAccount` 内的删除账户二次确认 Dialog（modal 内嵌套 Dialog 可接受）

### 路由需求

- R7: 移除 `/settings` 路由及其所有子路由（`/settings/appearance`、`/settings/account`、`/settings/data`、`/settings/about`）
- R8: 移除 `SettingsLayout` 组件（其布局逻辑迁入 modal）
- R9: 直接访问 `/settings` URL 时，由通配路由 `{ path: '*', element: <Navigate to="/" replace /> }` 兜底跳转首页（现有兜底已覆盖，无需额外处理）

### 交互需求

- R10: modal 可通过以下方式关闭：点击右上角 X、点击遮罩、按 Esc（Radix Dialog 默认行为）
- R11: 关闭 modal 后回到打开前的页面（因不再导航离开，天然满足）
- R12: 切换 tab 时右侧内容区滚动位置归位（切换到新 tab 从顶部开始）

## Constraints

- 不改动后端接口
- 不改动4个设置页组件内部的表单逻辑/mutation/toast 行为
- 不新增 npm 依赖（复用现有 `@radix-ui/react-dialog` + `dialog.tsx`）
- 遵循现有 i18n 约定（复用 `settings:` namespace 现有 key，zh/en key 集合保持一致）
- 遵循现有状态管理分层（modal 开关属跨组件 UI 态 → `uiInteractionStore`）

## Acceptance Criteria

- [ ] AC1: 点击 `SidebarBottomBar` 齿轮按钮，设置 modal 弹出，默认显示"外观"tab，当前页面不变
- [ ] AC2: 点击 `Sidebar` 用户下拉菜单"账户设置"，设置 modal 弹出，默认显示"账户"tab，当前页面不变
- [ ] AC3: modal 内左侧导航4项可切换，右侧内容区跟随切换对应设置页
- [ ] AC4: modal 可通过 X / 遮罩 / Esc 关闭
- [ ] AC5: `/settings` 及子路由已从 `router.tsx` 移除，直接访问 URL 跳转首页
- [ ] AC6: `SettingsLayout` 组件已删除
- [ ] AC7: 账户页删除账户二次确认 Dialog 在 modal 内正常弹出与关闭
- [ ] AC8: 外观页主题/语言/周首日切换在 modal 内即时生效（与改前行为一致）
- [ ] AC9: 数据页导出功能在 modal 内正常工作
- [ ] AC10: zh/en 两语言下 modal 文案正确显示
- [ ] AC11: TypeScript 编译无错误，ESLint 无新增错误
- [ ] AC12: 前端构建成功

## Notes

- modal 尺寸：`max-w-2xl`，内容区超出时纵向滚动
- 设置页组件内的 `max-w-lg` 限制在 modal 内不再需要（modal 自身已限宽），实现时评估是否调整
- `SettingsAccount` 原有页面级 `<h1>` 标题在 modal 内重复（modal 已有标题），需要处理标题冗余