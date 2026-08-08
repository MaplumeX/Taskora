# Implement — 统一菜单视觉美化

## 执行清单

### Step 1: 新建 `MenuRow` 组件

- [ ] 创建 `src/components/common/MenuRow.tsx`
  - `React.forwardRef` 包装 `<button>`
  - props: `icon: LucideIcon`、`destructive?: boolean`、`onClick`、`children`
  - 布局: `flex items-center gap-2 px-2 py-1.5 text-sm`
  - 正常 hover: `hover:bg-accent`
  - 危险 hover: `hover:bg-destructive/10 hover:text-destructive` + 静态 `text-destructive`

### Step 2: 改造 `TaskContextMenu`

- [ ] import `MenuRow`
- [ ] 删除本地 `MENU_ITEM_CLASS` 常量
- [ ] 6 个 `<button>` → `<MenuRow>`，加图标：
  - 完成/未完成：`Check` / `Circle`
  - 计划日期：`CalendarClock`
  - 到期：`CalendarDays`
  - 标签：`Tag`
  - 转为项目（仅 default）：`FolderInput`
  - 删除/恢复：`Trash2` / `RotateCcw`（`destructive`）
- [ ] 插入分隔线（`<div className="-mx-1 my-1 h-px bg-muted" />`）：
  - 完成项之后
  - 标签项之后
  - 转为项目之后（仅 default，即转为项目和删除之间）
- [ ] 首项 `firstItemRef` 通过 `ref` 传入 `MenuRow`

### Step 3: 改造 `ProjectContextMenu`（`ProjectMenuPanel`）

- [ ] 同 Step 2 结构（菜单结构镜像 TaskContextMenu）
- [ ] 删除本地 `MENU_ITEM_CLASS`
- [ ] `ProjectMenuPanel` 的 `firstItemRef` 通过 `ref` 传入 `MenuRow`
- [ ] 分隔线位置与 Task 一致

### Step 4: 改造 `AreaMoreMenu`

- [ ] import `MenuRow`，删除本地 `MENU_ITEM_CLASS`
- [ ] 标签项：`<MenuRow icon={Tag}>`
- [ ] 删除项：`<MenuRow icon={Trash2} destructive>`
- [ ] 两项间加分隔线

### Step 5: 改造 `SidebarBottomBar`

- [ ] 语言切换 `●` → `Check` 图标（`lucide-react` 已有 `Check`）
- [ ] 当前语言 `opacity-100`，非当前 `opacity-0`（保持 `mr-2 h-4 w-4` 占位）
- [ ] 新增菜单项加图标：`FolderPlus`（新项目）、`Layers`（新区域）

### Step 6: 改造 `ProjectHeadingRow` DropdownMenu

- [ ] 删除项补 `focus:bg-destructive/10 focus:text-destructive`

### Step 7: 验证

- [ ] `pnpm --filter frontend lint`
- [ ] `pnpm --filter frontend test`
- [ ] `pnpm --filter frontend build`
- [ ] 手动验证：暗色模式下图标/分隔线/危险项 hover 视觉正确

## 验证命令

```bash
pnpm --filter frontend lint
pnpm --filter frontend test
pnpm --filter frontend build
```

## 风险文件

| 文件 | 风险点 |
|------|--------|
| `TaskContextMenu.tsx` | `firstItemRef` 转发到 `MenuRow` 的 `ref` |
| `ProjectContextMenu.tsx` | `ProjectMenuPanel` 的 `firstItemRef` 同上 |
| `ProjectHeadingRow.test.tsx` | 测试通过 `role='menuitem'` 查询，`MenuRow` 是 `<button>` 天然兼容 |

## 回滚点

每步独立可回滚。若 `MenuRow` 设计有误，Step 1 回滚后其余步骤的 `MENU_ITEM_CLASS` 仍可用。