# 02: 新 token 值、语义 token 与系统字体

Status: done
Blocked by: 01

## 内容

1. 按 spec「颜色」表替换亮 / 暗 token 值；新增 `--sidebar`、`--sidebar-accent`、`--selection`、`--today`、`--deadline`、`--success`、`--nav-*`，并在 preset 中注册为 Tailwind 颜色。
2. 字体栈改为系统字体 + CJK 回退；删除三个 `index.html` 的 Google Fonts 链接与 `font-display` 族，现有 `font-display` 用法改为字阶类。
3. 在 preset 中定义字阶（`text-title-1` / `text-title-2` / `text-section` / `text-body` / `text-meta`）、`--radius: 0.5rem`、`shadow-row-lift` / `shadow-popover`、动效变量；删除 `noise-overlay`、`shadow-soft`。
4. 替换写死色板：`navItems.ts` 的 `colorClass` → `text-nav-*`；黄星 → `text-today`；Deadline 红 → `text-deadline`；其余 Tailwind 色板类名逐一换为语义 token。

## 验收标准

- [x] `packages/ui/src` 内（Tag 用户颜色除外）无 Tailwind 色板类名与 hex 颜色（手机设置页 iOS 式图标底色除外）
- [x] 离线启动桌面端，字体无跳动
- [x] 亮 / 暗截图走查 Today、Project、Settings 无明显对比度问题（正文 ≥ 4.5:1）

## Comments

- 2026-09-27：完成。token / 字阶 / 阴影 / 动效变量在 `tokens.css` 与 `tailwind.preset.js`；`cn()` 通过 `extendTailwindMerge` 登记字阶，避免 `text-body` 被当作颜色与 `text-muted-foreground` 互相覆盖。`--muted-foreground` 亮色取 46%（白底 ≥ 4.5:1），新增 `--warning`（Agent 审批卡）。`MobileSettings` 的 iOS 式彩色图标底保留色板类名（装饰性，非语义）。注意：Vite dev server 不监听 preset 文件，改 preset 后需重启。
