# Add i18n support (zh/en) with locale-aware formatting

## Goal

为 taskora 前端引入国际化基础设施，支持中文（zh）与英文（en）两种语言，用户可在 UI 内切换语言、选择被持久化，且日期/数字按当前 locale 格式化。后端无需 i18n（其文案仅代码注释）。

## Background

- 前端（React 18 + Vite + Zustand + TanStack Query + Radix UI + Tailwind）当前无任何 i18n 基础设施。
- 用户可见文案大量硬编码中文（200 处，29 文件），分布在 `pages/` 与 `components/`。
- Sidebar 导航标签硬编码英文（Inbox/Today/Upcoming/Projects/Areas/Tags/Trash/Logbook/Anytime/Someday）。
- `lib/utils/date.ts` 的 `formatDateLabel` 含中文写死文案（"今天"/"明天"/"周X"/"X月X日"），且非 locale 感知。
- 已有持久化先例：`useTheme`（localStorage key `taskora-theme`）、`auth.store`（zustand persist key `taskora-auth`）。
- 后端 `packages/backend/src` 中的中文均为代码注释，无面向用户文案 → 后端不纳入本次范围。

## Requirements

### R1 · i18n 基础设施
- 引入 `react-i18next` + `i18next` + `i18next-browser-languagedetector`。
- 在应用入口初始化 i18n 实例，挂载 `I18nextProvider`（或 `React.Suspense`）。
- 资源文件按 namespace / page 维度组织于 `src/locales/{zh,en}/`。

### R2 · 语言检测与持久化
- 默认检测顺序：localStorage（`taskora-lang`）→ `navigator.language` → fallback `en`。
- 仅保留 zh / en 两个 locale；探测到其他语言时回退到 en。
- 语言选择持久化到 localStorage key `taskora-lang`。

### R3 · 语言切换 UI
- 在 Sidebar 底部、`ThemeToggle` 旁新增语言切换入口。
- 切换即时生效，无需刷新页面。
- 切换组件文案本身亦经过 i18n。

### R4 · 文案抽取
- 全量抽取前端用户可见硬编码文案为翻译 key，覆盖：
  - 所有 `pages/*.tsx` 的标题、空状态、按钮、确认框、toast、表单字段/校验提示
  - 所有 `components/**/*.tsx` 中用户可见文案（含 Sidebar 导航标签、ThemeToggle aria-label、ContentBottomBar aria-label）
  - 动态插值用 i18next interpolation（如 `确认删除区域「{{name}}」？` → key + `{{name}}`）
  - 复数/选择（若有）用 i18next plural / `<Trans>`
- 不改变任何非文案相关逻辑或样式。

### R5 · 日期与数字 locale 格式化
- 重构 `formatDateLabel`：依据当前 locale 输出本地化相对日期（今天/明天/周X → en: Today/Tomorrow/Mon…），非近期日期用 `Intl.DateTimeFormat` 按 locale 格式化（如 en: `Mar 5`，zh: `3月5日`）。
- 任何现有 `toLocaleDateString` 等调用改用显式传 locale。
- 数字展示（如有）用 `Intl.NumberFormat(locale)`。

### R6 · 不破坏现有功能
- 所有现有交互（确认删除、toast、动态标题、分组渲染）在两种语言下行为一致。
- 现有测试需同步更新文案断言为通过翻译 key/函数返回的新值。

## Acceptance Criteria

- [ ] AC1 应用默认以 `navigator.language` 探测语言，非 zh 时回退 en；localStorage `taskora-lang` 存在时优先使用之。
- [ ] AC2 Sidebar 底部存在语言切换入口；切换后整页文案立即变更为目标语言，无需刷新。
- [ ] AC3 语言选择写入 localStorage `taskora-lang`，刷新后保留。
- [ ] AC4 前端全量无硬编码用户可见中文/英文字符串残留（通过 grep `[\u4e00-\u9fff]` 与导航标签英文校验，排除翻译资源文件自身）。
- [ ] AC5 zh 与 en 两份资源文件 key 集合一致（无缺漏 key），运行 `tsc` 不报错。
- [ ] AC6 `formatDateLabel` 在 zh 下输出「今天/明天/周一/3月5日」，en 下输出「Today/Tomorrow/Mon/Mar 5」等对等表达。
- [ ] AC7 动态插值文案（如删除区域确认框）在两种语言下正确插入变量。
- [ ] AC8 现有测试（`pnpm test`）通过；若断言需改成基于 i18n 的值，已同步更新。
- [ ] AC9 `pnpm typecheck` 与 `pnpm lint` 通过。

## Out of Scope

- 后端国际化（无面向用户文案）。
- 除 zh/en 外的其他语言（但资源结构允许后续追加）。
- RTL 布局支持。
- 服务端渲染 (SSR) i18n。
- 用户账号维度的语言偏好持久化到数据库（仅 localStorage）。

## Technical Notes

- 现有持久化模式参考：`useTheme`（localStorage 直接读写）、`auth.store`（zustand persist）。
- 语言切换入口位置：`components/layout/Sidebar.tsx` 底部 `<ThemeToggle>` 旁。
- `lib/utils/date.ts` 的 `formatDateLabel` / `WEEKDAYS` 为 R5 改造核心。
- 动态插值示例：`AreaDetail.tsx:27` `window.confirm(\`确认删除区域「${area.title}」？区域内的项目不会被删除。\`)`。
- 导航标签硬编码英文位于 `Sidebar.tsx` 的 `mainNav` 与各 `CollapsibleSection` label。