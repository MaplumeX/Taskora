# Implement — Soft Studio 视觉重构

> 严格按 design.md 落地。每个 phase 完成后跑验证；任何 phase 失败先修复再进下一阶段。**只改 className / CSS / config，不改 props、DOM 语义、i18n、路由、API。**

## Phase 0 — 准备

- [ ] 在仓库根目录创建本任务工作分支（若尚未在 `feat/project-visual-style-refactor`）
- [ ] 确认 `pnpm install` 完成、`pnpm --filter @taskora/frontend dev` 可启动
- [ ] 跑一次基线：`pnpm --filter @taskora/frontend test`、`pnpm --filter @taskora/frontend lint`、`pnpm --filter @taskora/frontend typecheck`，全部通过才开始

## Phase 1 — Token 与字体

- [ ] 修改 `packages/frontend/index.html`：在 Inter link 后追加 Outfit link（`family=Outfit:wght@500;600;700&display=swap`）
- [ ] 修改 `packages/frontend/tailwind.config.js`：`fontFamily` 新增 `display: ['Outfit', 'Inter', ...]`，删除冗余 `fontWeight` 扩展（Tailwind 默认已覆盖）
- [ ] 修改 `packages/frontend/src/index.css`：
  - `:root` 与 `.dark` 全量替换为 design.md 的 token 表
  - `--radius: 0.5rem` → `0.75rem`
  - 重写 `shadow-soft`、新增 `shadow-lift`
  - `body` 的 `font-family` 保持 Inter（Display 由 `font-display` 工具类按需使用）
- [ ] 验证：`pnpm --filter @taskora/frontend typecheck` 通过；启动 dev 服务器，肉眼确认整体底色与 primary 已换

## Phase 2 — Base UI 组件（`src/components/ui/*`）

按 design.md 的组件表逐项修改，**只允许动 className**：

- [ ] `button.tsx`：`default` variant `shadow-sm` → `shadow-soft`
- [ ] `input.tsx` / `textarea.tsx`：focus ring 改 `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- [ ] `checkbox.tsx`：`rounded-sm` → `rounded-md`
- [ ] `dialog.tsx`：overlay `bg-black/80` → `bg-foreground/30 backdrop-blur-sm`；content `rounded-lg` → `rounded-xl`、新增 `shadow-lift`
- [ ] `popover.tsx` / `dropdown-menu.tsx`：content `rounded-md` → `rounded-lg`、`shadow-md` → `shadow-lift`
- [ ] `calendar.tsx`：`rounded-md` → `rounded-lg`
- [ ] `scroll-area.tsx`：thumb `bg-border` → `bg-muted-foreground/30`
- [ ] `sonner.tsx`：toast `rounded-lg` → `rounded-xl`、`shadow-lg` → `shadow-lift`
- [ ] 其它（`label.tsx` / `separator.tsx`）：仅在发现直写颜色时才动
- [ ] 验证：`pnpm --filter @taskora/frontend test` 通过；打开 dev 服务器抽查 Dialog / Popover / Calendar 视觉

## Phase 3 — Layout（`src/components/layout/*`）

- [ ] `Sidebar.tsx`：背景 `bg-secondary/40` → `bg-secondary/60`，分隔线若硬编码颜色 → 改 `border-border`
- [ ] `SidebarProjectSection.tsx` / `SidebarAreaRow.tsx` / `SortableProjectItem.tsx` / `SortableAreaRow.tsx`：
  - 选中态 `bg-accent text-accent-foreground` → `bg-accent rounded-full text-foreground font-medium`
  - 未选中项 hover：补 `hover:bg-accent/60 rounded-full`
  - 计数徽章（如有）加 `tabular-nums`
- [ ] `AppShell.tsx` / `MainContent.tsx`：仅确认 `bg-background` 与 padding 合理，不主动重写
- [ ] `ContentBottomBar.tsx` / `SidebarBottomBar.tsx`：按钮 variant 保留；如有直写色 token 化
- [ ] 验证：`pnpm --filter @taskora/frontend test` 通过；手动跑 dev，巡检 Sidebar 选中/悬停/拖拽（拖拽 placeholder 仍对齐）

## Phase 4 — 业务组件

- [ ] `components/task/TaskItem.tsx`：
  - 折叠态行 hover 加 `hover:bg-accent/50 rounded-lg transition-colors`
  - 选中态 `bg-accent rounded-lg`
  - 展开态根 div `bg-muted/60` → `bg-muted/50 rounded-lg`
- [ ] `components/task/TaskRowExpanded.tsx`：根容器 `shadow-sm` → `shadow-soft`
- [ ] `components/task/TaskCheckbox.tsx`：`border` 颜色统一 `border-muted-foreground/40`，保留 `active:scale-90`
- [ ] `components/task/TaskDateBadge.tsx` / `TaskDueDateBadge.tsx`：`text-[#CC4444]` → `text-destructive`
- [ ] `components/task/TaskListView.tsx` / `TaskList.tsx`：空状态标题加 `font-display text-2xl font-semibold`，描述 `text-muted-foreground`
- [ ] `components/project/*` / `components/area/*` / `components/feed/*`：
  - 排查任何 `text-[#` / `bg-[#` / `border-[#` 直写 → 替换为 token
  - 卡片/弹层圆角统一 `rounded-xl`
- [ ] `components/search/*`：搜索面板 `rounded-xl shadow-lift`
- [ ] `components/settings/*`：保留结构；确认 segmented control 走 token
- [ ] `components/common/InlineTitleEdit.tsx`：display 态 `text-2xl font-semibold tracking-tight` → `font-display text-3xl font-semibold tracking-tight`
- [ ] `components/common/MenuRow.tsx` / `IconPopover.tsx`：保持 `hover:bg-accent`，圆角 `rounded-md`
- [ ] 验证：`pnpm --filter @taskora/frontend test` 通过；视觉巡检任务展开、项目进度环、右键菜单、搜索

## Phase 5 — 页面（`src/pages/*`）

- [ ] `Login.tsx` / `Register.tsx`：
  - 外层加 `noise-overlay` 类
  - 背景加柔和径向渐变：例如 `bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.06),transparent)]`
  - 卡片 `rounded-lg` → `rounded-2xl`、`shadow-md` → `shadow-lift`
  - 标题改 `font-display text-3xl font-semibold tracking-tight`
- [ ] `Today.tsx` / `Inbox.tsx` / `Upcoming.tsx` / `Anytime.tsx` / `Someday.tsx` / `Logbook.tsx` / `Trash.tsx` / `Tags.tsx` / `TagDetail.tsx` / `ProjectDetail.tsx` / `AreaDetail.tsx`：
  - 页面标题：`font-display text-3xl font-semibold tracking-tight`（如已有 `text-2xl` 标题）
  - 空状态：主标题 `font-display text-2xl font-semibold`，副文案 `text-muted-foreground`
  - 删除任何硬编码 hex / 冷灰直写
- [ ] `Settings*.tsx`：保留结构，仅确认 token 生效
- [ ] 验证：`pnpm --filter @taskora/frontend test` 通过

## Phase 6 — 回归与扫描

- [ ] 硬编码扫描：
  ```bash
  grep -rn "#[0-9a-fA-F]\{3,8\}" packages/frontend/src --include='*.tsx' --include='*.ts' --include='*.css' \
    | grep -vE '(\.test\.|notes-prose|shadow-soft|shadow-lift|backgroundImage|radial-gradient)'
  ```
  目标：除白名单（`.notes-prose` 变量映射、工具类、登录渐变）外无裸 hex
- [ ] `grep -rn "text-\[#\|bg-\[#\|border-\[#" packages/frontend/src --include='*.tsx' | grep -v '.test.'` → 应仅剩 Login/Register 渐变
- [ ] `pnpm --filter @taskora/frontend test`
- [ ] `pnpm --filter @taskora/frontend lint`
- [ ] `pnpm --filter @taskora/frontend typecheck`
- [ ] 手动巡检 light + dark：
  - /login、/today、/inbox、/upcoming、/anytime、/someday、/logbook、/trash、/tags、/projects/:id、/areas/:id、/settings
  - 重点：Sidebar 选中胶囊、任务展开卡片、Dialog/Popover/Calendar 弹层阴影、focus ring 紫色、暗色 primary 对比度

## 回滚指引

每个 Phase 对应一次独立 commit：

```
feat(frontend): soft-studio tokens and fonts
feat(frontend): soft-studio base ui components
feat(frontend): soft-studio layout
feat(frontend): soft-studio domain components
feat(frontend): soft-studio pages
chore(frontend): visual regression sweep
```

任一 Phase 出问题：`git revert <commit>` 即可，不影响其它阶段。

## Review Gates

- **Phase 1 后**：暂停，由主 agent 检查 token 渲染（截图/dev），确认方向 OK 再继续
- **Phase 3 后**：暂停，确认 Sidebar 拖拽 + 选中态无回归
- **Phase 6 后**：用户肉眼验收 → 通过后 `task.py archive`
