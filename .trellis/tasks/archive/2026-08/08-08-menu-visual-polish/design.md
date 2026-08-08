# Design — 统一菜单视觉美化

## 架构边界

改动限于前端 `packages/frontend/src/components/` 下的菜单组件，不涉及后端、i18n key、路由或状态管理。

## 核心设计：`MenuRow` 共享组件

### 问题

`TaskContextMenu`、`ProjectContextMenu`（`ProjectMenuPanel`）、`AreaMoreMenu` 三处各自定义了完全相同的常量：

```ts
const MENU_ITEM_CLASS =
  'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent';
```

### 方案

提取 `src/components/common/MenuRow.tsx`：

```tsx
interface MenuRowProps {
  icon: LucideIcon;          // 必传图标
  onClick: () => void;
  destructive?: boolean;     // 危险项 hover 样式
  ref?: React.RefObject<HTMLButtonElement>;  // 首项 autoFocus
  children: React.ReactNode; // 菜单文案
}
```

布局：`[icon h-4 w-4] gap-2 [text]`，图标 `text-muted-foreground`，hover 时图标跟随 `currentColor`。

destrutive 模式：
- 默认：`text-destructive`（保持静态红色文字）
- hover/focus：`hover:bg-destructive/10 hover:text-destructive`
- 非危险项：`hover:bg-accent hover:text-accent-foreground`

### 分隔线

`src/components/common/MenuSeparator.tsx` 或直接内联 `<div className="-mx-1 my-1 h-px bg-muted" />`。倾向内联——只一行，不值得新建组件。

## 改动清单

### 1. 新建 `MenuRow`（`src/components/common/MenuRow.tsx`）

三处菜单共用。替代各自独立的 `MENU_ITEM_CLASS`。

### 2. `TaskContextMenu`（`src/components/task/TaskContextMenu.tsx`）

- 删除本地 `MENU_ITEM_CLASS`，改用 `MenuRow`
- 6 个 `<button>` → 6 个 `<MenuRow>` + 分隔线
- 图标映射：`Check`/`Circle`（完成切换）、`CalendarClock`、`CalendarDays`、`Tag`、`FolderInput`（仅 default）、`Trash2`/`RotateCcw`（末项）
- 分隔线位置：完成后 / 标签后 / 转为项目后（仅 default）

### 3. `ProjectContextMenu`（`src/components/project/ProjectContextMenu.tsx`）

- `ProjectMenuPanel` 内同上改造
- 删除本地 `MENU_ITEM_CLASS`，改用 `MenuRow`
- 图标与 Task 一致（菜单结构镜像）
- 分隔线位置同 Task

### 4. `AreaMoreMenu`（`src/components/area/AreaMoreMenu.tsx`）

- 删除本地 `MENU_ITEM_CLASS`，改用 `MenuRow`
- 图标：`Tag`、`Trash2`
- 分隔线：标签后、删除前

### 5. `SidebarBottomBar`（`src/components/layout/SidebarBottomBar.tsx`）

- 语言切换：`●` → `Check`（当前语言 `opacity-100`，非当前 `opacity-0` 保持占位）
- 新增菜单项加图标：`FolderPlus`（新项目）、`Layers`（新区域）— 可选增强

### 6. `ProjectHeadingRow`（`src/components/project/ProjectHeadingRow.tsx`）

- 已有图标，仅补危险项 `focus:bg-destructive/10 focus:text-destructive`

## 数据流

无变化。菜单项的 `onClick` 逻辑（mutation、toast、invalidation）完全不动，只改视觉层。

## 兼容性

- `MenuRow` 必须支持 `ref` 转发，因为 `TaskContextMenu` 和 `ProjectContextMenu` 首项需要 `firstItemRef` autoFocus
- `ProjectMenuPanel` 的 props 签名不变（`firstItemRef` 仍通过 props 传入）
- 现有测试 `ProjectHeadingRow.test.tsx` 通过 `role='menuitem'` 查询——`MenuRow` 是 `<button>`，天然有 `menuitem` role，无需额外 aria

## 风险与权衡

| 风险 | 缓解 |
|------|------|
| `MenuRow` 的 `ref` 转发与 `firstItemRef` 兼容 | 用 `React.forwardRef` 或直接传 ref prop（项目用 React 18，forwardRef 安全） |
| 图标增加菜单宽度 | 当前 `w-44`（176px）够放 `h-4` 图标 + gap-2 + 文案；若不够可加宽到 `w-48` |
| 分隔线在短菜单（AreaMoreMenu 2 项）中显得割裂 | 2 项分组也有语义价值（编辑 vs 危险），保留 |

## 回滚

纯视觉改动，无数据/状态变更。回滚 = `git revert`，无迁移风险。