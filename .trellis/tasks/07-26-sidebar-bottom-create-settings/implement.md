# Implement — 侧边栏底栏新增/设置按钮与标题内联编辑

## 执行顺序

### Step 1 — i18n 文案补齐

新 key（`zh` / `en` 同步）：

- `common.json`:
  - `add` — "新增" / "New"
  - `settings` — "设置" / "Settings"
  - `newProject` — "新增项目" / "New Project"
  - `newArea` — "新增区域" / "New Area"
  - `theme` — "主题" / "Theme"（若 `theme.json` 中没有通用标题）
- `nav.json`: 无变化。
- 不再使用 `project:new` / `area:new` 作为创建默认标题（改为空标题）。

验证：`grep` 确认两语言文件结构与 key 一致。

### Step 2 — 新增 `InlineTitleEdit` 组件

文件：`packages/frontend/src/components/common/InlineTitleEdit.tsx`

- 实现 D3 契约。
- 仅依赖 React + `cn` + `sonner`（toast） + i18n（titleRequired 提示）。
- 受控 `value`，内部 `editing` state。
- `autoFocusAndSelect` 触发初始进入编辑态。

自测点：
- 点击 h1 → input 出现并全选。
- Enter 提交、Escape 取消、blur 提交。
- 空标题 → toast 提示并回滚。

### Step 3 — `ProjectDetail.tsx` 接入

- 用 `<InlineTitleEdit>` 替换 `<h1>`。
- 读取 `useLocation().state?.editTitle` → 传 `autoFocusAndSelect`。
- 实现 `handleTitleSubmit` = `updateProject.mutate({ id, data: { title } })` + toast。
- 保留现有"编辑/删除"按钮与 `ProjectForm` 对话框。

### Step 4 — `AreaDetail.tsx` 接入

- 同 Step 3，使用 `useUpdateArea`。

### Step 5 — 抽离 `SidebarBottomBar` 并重构底栏

文件：`packages/frontend/src/components/layout/SidebarBottomBar.tsx`

- 左：新增按钮（`Plus` 图标 + `common:add` 文案） → `DropdownMenu` 两个条目（`common:newProject` / `common:newArea`）。
  - 点击 → 调用对应 hook 创建空标题条目（`{ title: '' }`），成功后 `navigate` 带 state。
- 右：设置按钮（`Settings` 图标） → `DropdownMenu`：
  - 主题项（图标 + `theme:<mode>` 文案，点击 `cycle()`）。
  - 分隔线。
  - 语言两个条目（`中文` / `English`），点击 `i18n.changeLanguage`。
- `Sidebar.tsx` 底部 `ThemeToggle` + `LanguageToggle` 平铺替换为 `<SidebarBottomBar />`。
- 旧 `ThemeToggle`（写在 `Sidebar.tsx` 内）移除；`LanguageToggle.tsx` 可保留文件不变（仍被新底栏内部逻辑替代），也可继续被引用。为最小改动，底栏直接内联实现两个菜单内容，不强制重写 `LanguageToggle`。

### Step 6 — 质量校验

```bash
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend build
```

手动验证流程（如有 dev 环境）：
- [ ] 新增菜单两个入口可创建并跳转 + 标题自动编辑全选。
- [ ] 设置菜单主题 cycle / 语言切换正常。
- [ ] 项目 / 区域详情页标题点击编辑、Enter/Escape/blur 行为正确。
- [ ] 拖拽排序未被破坏。

### Step 7 — 规格更新与提交

- 按 Phase 3.3 更新 `.trellis/spec/frontend/*` 相应条目（若存在组件约定文档）。
- Phase 3.4 commit。

## Review Gates

- Step 1 后：确认 i18n key 在两种语言都存在。
- Step 2 后：`InlineTitleEdit` 单组件可渲染。
- Step 5 后：lint/typecheck 通过。
- Step 6：build 通过。

## Rollback Points

- Step 5（SidebarBottomBar 抽离）：未接入 Sidebar 前，单独引入不破坏现有 UI。
- 任何步骤失败 → 还原对应文件即可。