# Design: Settings modal refactor

## 1. 概述

将设置中心从路由驱动的整页视图改造为全局 modal。复用现有4个设置页组件内容，用 `uiInteractionStore` 扩展管理 modal 开关与当前 tab，在 `AppShell` 层挂载唯一 `SettingsModal` 实例。

## 2. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| modal 内 tab 切换 | 左侧导航列表 + 右侧内容 | 延续现有 `SettingsLayout` 视觉结构，改动最小 |
| `/settings` 路由 | 彻底移除 | 用户确认不需要保留深链接；通配兜底路由已覆盖 |
| 账户删除确认 Dialog | 保留嵌套 | 用户确认可接受；Radix Dialog z-index 层级独立，技术上可行 |
| modal 尺寸 | `max-w-2xl`（≈672px） | Account 页内容较多（资料+密码+删除区），`max-w-lg` 偏窄；`max-w-3xl` 对其他3页过大 |
| modal 开关状态归属 | `uiInteractionStore` 扩展 | 两个入口分散在不同组件（`SidebarBottomBar` / `Sidebar`），需跨组件控制；符合 store "跨组件 UI 态" 定位 |

## 3. 架构设计

### 3.1 状态管理：`uiInteractionStore` 扩展

在现有 `uiInteraction.store.ts` 新增两个字段：

```typescript
type SettingsTab = 'appearance' | 'account' | 'data' | 'about';

interface UiInteractionState {
  // ...existing fields...
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
}
```

- `settingsOpen`：modal 是否打开（内存态，不持久化——与 `expandedId` / `pendingAutoEditId` 同类瞬态）
- `settingsTab`：当前激活的 tab
- `openSettings(tab?)`：打开 modal，`tab` 默认 `'appearance'`
- `closeSettings()`：关闭 modal

### 3.2 `SettingsModal` 组件

位置：`src/components/settings/SettingsModal.tsx`（替换原 `SettingsLayout.tsx`）

结构：
```
<Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>{t('common:settings')}</DialogTitle>
    </DialogHeader>
    <div className="flex gap-6">
      <nav> 左侧导航列表（4项，点击切换 settingsTab）</nav>
      <div> 右侧内容区（按 settingsTab 渲染对应设置页）</div>
    </div>
  </DialogContent>
</Dialog>
```

关键实现：
- **受控 Dialog**：`open` 读 store `settingsOpen`；`onOpenChange` 在 `false` 时调 `closeSettings()`
- **tab 切换**：左侧导航项点击 → `setSettingsTab(item.tab)`（不关闭 modal）
- **内容渲染**：用 `settingsTab` 映射到对应设置页组件，用 `lazy` + `Suspense` 延迟加载（与原 router lazy import 一致）
- **滚动归位**：右侧内容区用 `key={settingsTab}` 强制 remount，确保切换 tab 时滚动位置归零
- **标题处理**：modal 已有 `DialogTitle`（"设置"），设置页组件内的页面级 `<h1>` 需移除或隐藏（见 §3.4）

### 3.3 设置页组件适配

4个设置页组件从"路由页面"变为"modal 内嵌内容"，需处理页面级标题冗余：

- `SettingsAppearance`：无 `<h1>`，无需改动
- `SettingsData`：无 `<h1>`，无需改动
- `SettingsAbout`：无 `<h1>`，无需改动
- `SettingsAccount`：有 `<h1>{t('auth:accountSettings')}</h1>`，移除该标题行（modal 已有"设置"标题）

### 3.4 路由清理

`router.tsx`：
- 移除 `SettingsLayout` lazy import
- 移除 `SettingsAppearance` / `SettingsAccount` / `SettingsData` / `SettingsAbout` 的 lazy import（它们改为在 `SettingsModal` 内 lazy import）
- 移除 `/settings` 路由对象及其 children

### 3.5 入口点改造

**`SidebarBottomBar` 齿轮按钮**：
```typescript
// before: onClick={() => navigate('/settings/appearance')}
// after:  onClick={() => openSettings('appearance')}
```
移除 `useNavigate`（若该组件不再有其他导航用途——但 `handleNewProject` / `handleNewArea` 仍用 `navigate`，保留）。

**`Sidebar` 用户下拉菜单"账户设置"**：
```typescript
// before: onClick={() => navigate('/settings/account')}
// after:  onClick={() => openSettings('account')}
```
`Sidebar` 仍用 `navigate`（其他菜单项），保留 `useNavigate`。

### 3.6 `SettingsModal` 挂载点

在 `AppShell` 挂载唯一实例：
```tsx
export function AppShell() {
  return (
    <div className="flex h-dvh w-full noise-overlay">
      <Sidebar />
      <div className="flex h-dvh flex-1 flex-col">
        <MainContent />
        <ContentBottomBar />
      </div>
      <SettingsModal />
    </div>
  );
}
```

## 4. 数据流

```
SidebarBottomBar 齿轮按钮 ──┐
                           ├─→ openSettings(tab) ──→ uiInteractionStore ──→ AppShell 内 <SettingsModal open={...}>
Sidebar 用户菜单"账户设置" ─┘                                                       │
                                                                                   ▼
                                                                    左侧导航点击 → setSettingsTab
                                                                                   │
                                                                                   ▼
                                                                    右侧内容区按 tab 渲染对应设置页
                                                                                   │
                                                                                   ▼
                                                                    用户关闭 → closeSettings()
```

## 5. 影响范围

| 文件 | 改动 |
|---|---|
| `src/lib/stores/uiInteraction.store.ts` | 新增 `settingsOpen` / `settingsTab` / `openSettings` / `closeSettings` |
| `src/components/settings/SettingsModal.tsx` | 新建（替代 `SettingsLayout`） |
| `src/components/settings/SettingsLayout.tsx` | 删除 |
| `src/components/layout/AppShell.tsx` | 挂载 `<SettingsModal />` |
| `src/components/layout/SidebarBottomBar.tsx` | 齿轮按钮 `navigate` → `openSettings('appearance')` |
| `src/components/layout/Sidebar.tsx` | 用户菜单项 `navigate('/settings/account')` → `openSettings('account')` |
| `src/pages/SettingsAccount.tsx` | 移除页面级 `<h1>` |
| `src/pages/SettingsAppearance.tsx` | 无需改动 |
| `src/pages/SettingsData.tsx` | 无需改动 |
| `src/pages/SettingsAbout.tsx` | 无需改动 |
| `src/router.tsx` | 移除 `/settings` 路由及相关 lazy import |
| `src/components/settings/SettingsLayout.tsx` | 删除 |

## 6. 兼容性与回滚

- **兼容性**：`/settings` URL 不再可达，通配兜底路由跳首页。无后端改动。
- **回滚**：git revert 单次 commit 即可恢复路由式设置页。改动集中在前端组件层，无数据迁移。

## 7. 不改动项

- 4个设置页组件内部的表单逻辑、mutation、toast、i18n key
- 后端接口
- `dialog.tsx` UI 组件
- `SearchModal` 及其他现有 modal
- i18n 翻译文件（现有 key 足够，无需新增）