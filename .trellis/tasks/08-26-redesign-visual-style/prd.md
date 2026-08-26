# 重构项目视觉风格

## Goal

将 frontend 的 UI 视觉风格从当前的 "Things3 蓝 + Inter + 中性灰" 整体替换为 **Soft Studio**（柔和工作室）风格：奶油白/暖灰底色、单一柔和紫罗兰强调色、更大的圆角、柔和多层阴影、更细腻的 hover/active 反馈。仅做视觉层重构，不改交互逻辑、不改组件 API、不改文案与功能。

## Scope

- **In scope（仅 frontend，packages/frontend）**
  - Design token 层：`src/index.css` 的 CSS 变量（色板 / 圆角 / 阴影 / 字体栈）
  - `tailwind.config.js` 的字体与圆角扩展
  - shadcn 风格基础组件样式：`components/ui/*`（button / input / dialog / popover / dropdown-menu / calendar / checkbox / scroll-area / separator / sonner / textarea / label）
  - 布局与业务组件的视觉样式（不改 DOM 结构与 props）：
    - `components/layout/*`（Sidebar / AppShell / MainContent / 上下边栏）
    - `components/task/*`（任务行 / 复选框 / 日期徽章 / 上下文菜单）
    - `components/project/`、`components/area/`、`components/feed/`、`components/search/`、`components/settings/`、`components/common/` 中所有视觉相关 className
  - 各 `pages/*` 页面的视觉细节（间距、标题字级、空状态观感）
  - 全局细节：`noise-overlay`、`shadow-soft` 工具类、登录/注册页、i18n 文案不动
- **Out of scope**
  - 后端 / shared 包
  - 功能行为、路由、状态管理、i18n 文案
  - 图标库替换（保留 `lucide-react`，只统一 stroke 视觉权重感）
  - 新增页面或信息架构调整

## Design Direction: Soft Studio

> 参考气质：Cron / Amie / 现代奶油系 SaaS。整体暖、软、克制，但强调色明确。

- **色板（light mode）**
  - 背景 `--background`：奶油白 ≈ `36 33% 97%`（`#FAF8F3` 区间，落地时微调）
  - 前景 `--foreground`：暖炭 ≈ `260 12% 18%`（非纯黑）
  - 强调 `--primary`：柔和紫罗兰 ≈ `262 60% 58%`，前景白
  - 辅助玫瑰（仅用于极少量强调场景，如 destructive-hover 或选中描边）：≈ `350 65% 60%`，不进入主 token
  - `--secondary` / `--muted` / `--accent` / `--popover` / `--card` / `--border` / `--input` / `--ring` 全部改为暖灰系（hue 30–40），不再使用冷蓝灰
  - `--destructive`：去饱和红 ≈ `0 55% 52%`
- **色板（dark mode）**
  - 背景：暖深棕灰 ≈ `260 14% 9%`（避免纯黑、避免蓝调）
  - 强调：同 hue 提亮 ≈ `262 65% 68%`
  - 其它 token 同步暖灰化
- **字体**
  - Display/标题：引入可变字体 `Outfit` 或 `Cabinet Grotesk`（最终选一个，落地时可访问 Google Fonts / fontsource 二选一）
  - 正文：保留 `Inter`（已有，避免多字体成本）
  - 数字 / 日期 / 计数场景：启用 `tabular-nums`（已有工具类，扩展应用范围）
  - 字级：页标题加大一档（text-2xl → 视觉 text-3xl 级别的 Display 字重）
- **圆角**
  - `--radius`：`0.5rem` → `0.75rem`
  - 卡片 / 弹层：`rounded-xl` 起步，按钮仍 `rounded-md` ~ `rounded-lg`，保持一致层次
- **阴影**
  - 重写 `shadow-soft`：暖色多层柔影（hue 与背景一致）
  - 弹层 / 下拉：更明显的浮起感（y 偏移 + 大模糊 + 低透明度）
- **交互反馈（不改行为，仅视觉）**
  - hover：背景向暖色方向微移 + 微提升（`translateY(-1px)` 或亮度微增）
  - active：`scale(0.98)` + `translateY(0)`
  - focus ring：`--ring` 改为主色紫色，2px offset
- **布局与表面**
  - Sidebar：奶油底色 + 胶囊形选中态（圆角加大 + 淡紫底 + 主色文字）
  - 顶/底栏：保留结构，统一暖灰描边与背景
  - 登录 / 注册页：居中卡片保留，背景加柔和径向渐变 + 现有 `noise-overlay`
  - 空状态 / 列表分隔：用更柔和的间距与 `muted-foreground` 文字，去掉生硬 border，必要时用留白替代

## Constraints

- 不新增运行时依赖（字体通过 Google Fonts link 或 `fontsource` 构建期引入，二选一，落地再决）
- 不破坏任何现有组件 props / DOM 语义；只允许改 `className` 与样式文件
- 所有现有测试（vitest + testing-library）必须通过
- `pnpm lint` / `pnpm typecheck` 必须通过
- Tailwind v3 配置风格不变（不迁移 v4）
- i18n 文案 / 路由 / API 一律不动

## Acceptance Criteria

- [ ] `src/index.css` 与 `tailwind.config.js` 反映新的 Soft Studio token（light + dark 均生效）
- [ ] 字体栈切换：标题使用新 Display 字体，正文 Inter，关键数字启用 `tabular-nums`
- [ ] `components/ui/*` 全部 base 组件外观更新到新 token 与新圆角/阴影
- [ ] Sidebar / AppShell / MainContent 视觉与 PRD 描述一致（胶囊选中态、暖灰描边）
- [ ] `components/task/*`、`project/`、`area/`、`feed/`、`search/`、`settings/`、`common/` 中不再出现旧 "Things3 蓝" 直写值或冷灰硬编码颜色
- [ ] 所有 `pages/*` 标题层级 / 间距 / 空状态观感与 Soft Studio 方向一致
- [ ] Light 与 Dark 两种模式均完整可用，无残留旧 token
- [ ] `pnpm test` / `pnpm lint` / `pnpm typecheck` 全部通过
- [ ] 无新增运行时依赖（字体加载方式除外）
- [ ] 视觉回归由开发者人工 review 通过（截图或本地 dev 服务器巡检关键页面）

## Notes

- 参考产品：Cron Calendar、Amie、Things 3 的留白感
- 若落地过程中发现 Soft Studio 在某些高密度页面（Upcoming / Logbook）可读性受损，可在不破坏整体方向的前提下微调 token，不必回到旧蓝
- 图标（lucide）保留；如发现 stroke 不一致可在本任务内顺手统一为同一 stroke-width
