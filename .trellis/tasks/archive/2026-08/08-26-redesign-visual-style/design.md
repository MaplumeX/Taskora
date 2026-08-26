# Design — Soft Studio 视觉重构

> 仅视觉层，不动交互/路由/i18n/数据流。所有颜色、圆角、阴影、字体走设计 token，业务组件只调 `className`，不改 DOM/props/行为。

## Token 表（`src/index.css`）

### Light mode（`:root`）

| Token | HSL | 说明 |
|---|---|---|
| `--background` | `40 33% 97%` | 奶油白 |
| `--foreground` | `270 12% 18%` | 暖炭 |
| `--card` | `40 30% 98%` | 略亮于 background |
| `--card-foreground` | `270 12% 18%` | 同 fore |
| `--popover` | `40 30% 98%` | 同 card |
| `--popover-foreground` | `270 12% 18%` | |
| `--primary` | `262 60% 58%` | 柔和紫罗兰 |
| `--primary-foreground` | `0 0% 100%` | |
| `--secondary` | `36 18% 93%` | 暖米灰 |
| `--secondary-foreground` | `270 12% 18%` | |
| `--muted` | `36 18% 93%` | 同 secondary |
| `--muted-foreground` | `280 6% 45%` | 暖中灰 |
| `--accent` | `36 22% 90%` | 略深 muted（hover 底） |
| `--accent-foreground` | `270 12% 18%` | |
| `--destructive` | `0 55% 52%` | 去饱和红 |
| `--destructive-foreground` | `0 0% 100%` | |
| `--border` | `36 14% 87%` | 暖灰描边 |
| `--input` | `36 14% 87%` | 同 border |
| `--ring` | `262 60% 58%` | 同 primary |
| `--radius` | `0.75rem` | 由 0.5 提升 |

### Dark mode（`.dark`）

| Token | HSL | 说明 |
|---|---|---|
| `--background` | `270 14% 9%` | 暖深棕灰（避纯黑/蓝调） |
| `--foreground` | `38 18% 90%` | 暖白 |
| `--card` | `270 12% 12%` | |
| `--card-foreground` | `38 18% 90%` | |
| `--popover` | `270 12% 12%` | |
| `--popover-foreground` | `38 18% 90%` | |
| `--primary` | `262 65% 68%` | 同 hue 提亮 |
| `--primary-foreground` | `270 20% 10%` | 深色文字保证对比 |
| `--secondary` | `270 10% 15%` | |
| `--secondary-foreground` | `38 18% 90%` | |
| `--muted` | `270 10% 15%` | |
| `--muted-foreground` | `275 8% 60%` | |
| `--accent` | `270 10% 18%` | |
| `--accent-foreground` | `38 18% 90%` | |
| `--destructive` | `0 58% 55%` | |
| `--destructive-foreground` | `0 0% 98%` | |
| `--border` | `270 10% 20%` | |
| `--input` | `270 10% 20%` | |
| `--ring` | `262 65% 68%` | |

## 字体

- **新 Display**：`Outfit`（weights 500 / 600 / 700）
- **正文**：保留 `Inter`（300–700 已加载）
- `index.html` 在现有 Inter `<link>` 后追加：
  ```html
  <link
    href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&display=swap"
    rel="stylesheet"
  />
  ```
- `tailwind.config.js` → `theme.extend.fontFamily` 增加：
  ```js
  display: ['Outfit', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
  ```
- 应用范围：页标题（`PageHeader` / `InlineTitleEdit` 的 display 态 / `Login` / `Register` / 空状态标题）。**不**全局限默认 sans，正文仍 Inter。
- `tabular-nums` 工具类已存在，扩展到：Sidebar 计数、Upcoming 日期头、Logbook 计数、任务/项目空状态计数文案、`ContentBottomBar`（若有数字）。

## 圆角策略

- `--radius: 0.75rem` 之后，Tailwind 派生：`sm 0.5`、`md 0.625`、`lg 0.75`、`xl 1`
- 业务侧规则：
  - 按钮 / 输入：`rounded-md`（不变）
  - 卡片 / 展开编辑面板 / 弹层：`rounded-xl`
  - Sidebar 选中项：胶囊 → `rounded-full`（仅选中态背景）
- **不要**把所有 `rounded-sm/md` 全局替换成大圆角——保持层级感

## 阴影

重写 `index.css` 的 `shadow-soft`（保留类名，业务已经引用）：

```css
.shadow-soft {
  box-shadow:
    0 1px 2px hsl(270 12% 18% / 0.05),
    0 4px 16px hsl(270 12% 18% / 0.07);
}
.dark .shadow-soft {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.25),
    0 4px 16px hsl(0 0% 0% / 0.3);
}
```

新增 `shadow-lift`（弹层专用）：

```css
.shadow-lift {
  box-shadow:
    0 2px 4px hsl(270 12% 18% / 0.06),
    0 12px 32px hsl(270 12% 18% / 0.12);
}
.dark .shadow-lift {
  box-shadow:
    0 2px 4px hsl(0 0% 0% / 0.3),
    0 12px 32px hsl(0 0% 0% / 0.4);
}
```

应用到：`popover`、`dropdown-menu`、`dialog`、`sonner` toast、`calendar` 弹层；现有 `TaskRowExpanded` 的 `shadow-sm` 升级为 `shadow-soft`。

## 微交互

不动 JS 行为，只调 className：

- **hover**：`hover:bg-accent` 维持，重要交互行（任务行 / Sidebar 项目行）补 `hover:-translate-y-px transition-transform duration-150`
- **active**：保留现有 `active:scale-90`（`TaskCheckbox` / `ProjectProgressRing`），按钮类补 `active:scale-[0.98]`
- **focus**：`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`，`--ring` 已是紫色
- **transition**：默认 `transition-colors` 保留；新增 transform 类用 `transition-[transform,colors]`

## 组件改造清单

> 仅列改动点；具体 className 落地时按现有结构最小侵入调整。

### `components/ui/*`

| 文件 | 改动 |
|---|---|
| `button.tsx` | variants 内 `rounded-md` → 维持；`shadow-sm` → 仅 `default` variant 用 `shadow-soft`；`default` 主色已是 token |
| `input.tsx` / `textarea.tsx` | `rounded-md` 维持；`border-input` 维持；focus 改 `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` |
| `checkbox.tsx` | `rounded-sm` → `rounded-md`（视觉更柔）；保持 `data-state=checked:bg-primary` |
| `dialog.tsx` | overlay 改为 `bg-foreground/30 backdrop-blur-sm`；content `rounded-lg` → `rounded-xl shadow-lift` |
| `popover.tsx` / `dropdown-menu.tsx` | content `rounded-md` → `rounded-lg`；`shadow-md` → `shadow-lift` |
| `calendar.tsx` | `rounded-md` → `rounded-lg`；选中态已是 `bg-primary` |
| `scroll-area.tsx` | scrollbar thumb `bg-border` → `bg-muted-foreground/30`（更柔） |
| `separator.tsx` | `bg-border` 维持（token 已暖灰） |
| `sonner.tsx` | toast `classNames` 内 `rounded-lg` → `rounded-xl`、shadow 换 `shadow-lift` |
| `label.tsx` | 无改 |

### `components/layout/*`

- `Sidebar.tsx`：根容器 `bg-secondary/40` → `bg-secondary/60`；分隔线 `border-sidebar-border` → `border-border`（已是暖灰）
- `SidebarProjectSection` 选中态：`bg-accent text-accent-foreground` → `bg-accent rounded-full text-foreground font-medium`，同时给未选中项 `hover:bg-accent/60 rounded-full`
- `SidebarAreaRow` / `SortableProjectItem` / `SortableAreaRow`：同选中态胶囊化
- `AppShell.tsx` / `MainContent.tsx`：主体背景已经是 `bg-background`，主要改 inner padding 与标题字级
- `ContentBottomBar.tsx`：按钮 `variant="ghost"` 保留；底部栏 `border-t bg-background/80 backdrop-blur` 保留
- `SidebarBottomBar.tsx`：按钮视觉不变

### `components/task/*`

- `TaskItem` 折叠态：行 hover 改 `hover:bg-accent/50`，选中态 `bg-accent`，展开态根 div 用 `bg-muted/50 rounded-lg`（保持画布感）
- `TaskRowExpanded`：根容器保留 paper 卡片（`rounded-xl border bg-card shadow-sm` → `shadow-soft`）
- `TaskCheckbox`：视觉保留圆形；`border` 颜色改 `border-muted-foreground/40`
- `TaskDateBadge` / `TaskDueDateBadge`：`text-[#CC4444]` 硬编码 → `text-destructive`（顺手清理，与旧蓝无直写值目标一致）
- `TaskListView` / `TaskList`：空状态字体加大、改 Display 字重（`font-display text-2xl font-semibold`）

### `components/project/`、`area/`、`feed/`、`search/`、`settings/`、`common/`

- `ProjectProgressRing`：`text-primary` 已是 token
- `InlineTitleEdit`：display 态 `text-2xl font-semibold` → `font-display text-3xl font-semibold tracking-tight`（页面主标题感）
- `PageHeader`（如存在）：同上
- `SearchModal`：input `border-b` 保留；面板 `rounded-xl shadow-lift`
- `MenuRow` / `IconPopover`：圆角与 hover 色统一 `rounded-md hover:bg-accent`
- `SettingsAppearance` 主题 segmented control：保留，颜色走 token

### `pages/*`

- `Login.tsx` / `Register.tsx`：外层包 `.noise-overlay` + 柔和径向渐变（`bg-[radial-gradient(...)]` 以 primary 5% 染边）；卡片 `rounded-2xl shadow-lift`
- `Today.tsx` / `Inbox.tsx` / `Upcoming.tsx` / `Anytime.tsx` / `Someday.tsx` / `Logbook.tsx`：页面标题改用 `font-display`；空状态用 Display 字重 + 柔和描述 `text-muted-foreground`
- `Settings*`：modal 已是 dialog，无需重构；只确认 token 生效

## 硬编码扫描清单

落地时跑：
```bash
grep -rn "#[0-9a-fA-F]\{3,6\}\|text-\[#\|bg-\[#\|border-\[#" packages/frontend/src --include='*.tsx' --include='*.ts' --include='*.css' | grep -v '.test.'
grep -rn "text-\[#CC4444\]\|text-\[#" packages/frontend/src
```
目标：除 `.notes-prose` 的 prose 变量映射、`shadow-soft` / `shadow-lift` 自身、`Login/Register` 渐变背景外，无裸 hex。

## 兼容性 / 风险

- **风险 1**：`Outfit` 在小字号下可读性弱于 Inter → 仅用于 ≥ `text-xl` 的标题位置
- **风险 2**：Sidebar 选中态改为胶囊后，行高/拖拽 placeholder 位置可能受影响 → 落地后用 `sidebarProjectLayout.test.ts` 与手动拖拽验证
- **风险 3**：暗色模式 primary 提亮（`262 65% 68%`）在 `primary-foreground` 上需要新的对比度 → 用深色文字 `270 20% 10%`，避免暗底白字发闷
- **风险 4**：`rounded-full` 选中态影响 `SortableProjectItem` 高度计算 → 落地时人工巡检
- **不引入**新运行时依赖；`Outfit` 仅通过 Google Fonts link

## 落地阶段（与 implement.md 对应）

1. Token 层（index.css + tailwind.config.js + index.html 字体）
2. Base UI 组件（ui/*）
3. Layout（Sidebar / AppShell / 底栏）
4. 业务组件（task / project / area / feed / search / settings / common）
5. 页面（pages）+ 空状态 + 登录注册
6. 硬编码扫描 + 测试回归 + 暗色模式巡检
