# Implement: Settings modal refactor

## 执行清单

### Phase A: 状态层

- [ ] A1. `uiInteraction.store.ts`：新增 `SettingsTab` 类型、`settingsOpen` / `settingsTab` state、`openSettings(tab?)` / `closeSettings` actions
  - validate: `pnpm --filter @taskora/frontend exec tsc --noEmit`

### Phase B: Modal 组件

- [ ] B1. 新建 `src/components/settings/SettingsModal.tsx`
  - 受控 Dialog（读 store `settingsOpen` / `onOpenChange` → `closeSettings`）
  - `max-w-2xl` 尺寸
  - 左侧导航4项（外观/账户/数据/关于），点击调 `setSettingsTab`
  - 右侧内容区按 `settingsTab` 渲染，`lazy` + `Suspense`
  - 右侧内容区 `key={settingsTab}` 强制 remount 滚动归位
  - 复用 `settings:` namespace 现有 i18n key（`appearance` / `account` / `data` / `about`）
  - validate: `pnpm --filter @taskora/frontend exec tsc --noEmit`

### Phase C: 设置页适配

- [ ] C1. `SettingsAccount.tsx`：移除页面级 `<h1>{t('auth:accountSettings')}</h1>`
  - validate: `pnpm --filter @taskora/frontend exec tsc --noEmit`

### Phase D: 入口改造

- [ ] D1. `SidebarBottomBar.tsx`：齿轮按钮 `onClick` 从 `navigate('/settings/appearance')` 改为 `openSettings('appearance')`
- [ ] D2. `Sidebar.tsx`：用户下拉菜单"账户设置" `onClick` 从 `navigate('/settings/account')` 改为 `openSettings('account')`
  - validate: `pnpm --filter @taskora/frontend exec tsc --noEmit`

### Phase E: 挂载与路由清理

- [ ] E1. `AppShell.tsx`：挂载 `<SettingsModal />`
- [ ] E2. `router.tsx`：移除 `SettingsLayout` / `SettingsAppearance` / `SettingsAccount` / `SettingsData` / `SettingsAbout` 的 lazy import，移除 `/settings` 路由对象
- [ ] E3. 删除 `src/components/settings/SettingsLayout.tsx`
  - validate: `pnpm --filter @taskora/frontend exec tsc --noEmit`

### Phase F: 质量检查

- [ ] F1. ESLint：`pnpm --filter @taskora/frontend exec eslint src/ --max-warnings 0`
- [ ] F2. 构建：`pnpm --filter @taskora/frontend build`
- [ ] F3. i18n key parity 检查：`for f in common nav task project area tag auth search theme settings; do diff <(jq -S 'keys' src/i18n/locales/zh/$f.json) <(jq -S 'keys' src/i18n/locales/en/$f.json) && echo "✓ $f"; done`

## 验证命令汇总

```bash
# 类型检查
pnpm --filter @taskora/frontend exec tsc --noEmit
# Lint
pnpm --filter @taskora/frontend exec eslint src/ --max-warnings 0
# 构建
pnpm --filter @taskora/frontend build
# i18n parity
cd packages/frontend && for f in common nav task project area tag auth search theme settings; do diff <(jq -S 'keys' src/i18n/locales/zh/$f.json) <(jq -S 'keys' src/i18n/locales/en/$f.json) && echo "✓ $f"; done
```

## 回顾点

- 每个 Phase 完成后跑 `tsc --noEmit` 确认类型安全
- Phase F 为最终质量门，全部通过后方可提交

## 回滚点

- 任何 Phase 出现阻塞且无法修复 → `git checkout -- <files>` 回滚到上一个绿色状态
- 全部改动在单次 commit，可整体 revert