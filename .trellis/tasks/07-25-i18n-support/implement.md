# Implement — i18n support (zh/en)

## Execution Checklist

### Phase A · 基础设施搭建（先行验证）
- [ ] A1 安装依赖：`pnpm --filter @taskora/frontend add i18next react-i18next i18next-browser-languagedetector`
- [ ] A2 创建 `src/i18n/config.ts`：配置资源（静态 import 各 namespace JSON）、`supportedLngs:['zh','en']`、`fallbackLng:'en'`、`detection`（localStorage `taskora-lang` + navigator）、`defaultNS:'common'`、`ns` 列表。
- [ ] A3 创建 `src/i18n/locales/zh/` 与 `src/i18n/locales/en/` 目录骨架及占位 JSON：`common/nav/task/project/area/tag/auth/search/theme.json`（先放少量 key 跑通）。
- [ ] A4 在 `src/main.tsx` 顶部 `import '@/i18n/config'`（在 React 渲染前）。
- [ ] A5 创建 `src/i18n/LanguageToggle.tsx`（DropdownMenu，中文/English 两项，调 `i18n.changeLanguage`），并在 `Sidebar.tsx` 底部容器内、`<ThemeToggle>` 旁挂载。
- [ ] A6 验证：切换语言后，已接入的占位 key 文案立即变化且 localStorage 写入。

### Phase B · 通用与布局文案迁移
- [ ] B1 `common` namespace：加载中/加载失败/暂无/新建/编辑/删除/取消/确认/返回/未登录/操作失败 等。
- [ ] B2 `nav` namespace：迁移 `Sidebar.tsx` `mainNav` 标签（Inbox/Today/Upcoming/Anytime/Someday/Logbook/Trash）与 CollapsibleSection label（Projects/Areas/Tags）及 emptyHint。
- [ ] B3 `theme` namespace：迁移 `themeLabels`（浅色/暗色/跟随系统）与 ThemeToggle 的 aria-label/title。
- [ ] B4 `Sidebar.tsx` 其他文案：用户头像 fallback「未登录」、「登出」、「收起/展开{{label}}」。

### Phase C · 各页面文案迁移
- [ ] C1 `pages/Inbox.tsx`、`Today.tsx`、`Upcoming.tsx`、`Anytime.tsx`、`Someday.tsx`、`Logbook.tsx`、`Trash.tsx`：空状态、加载、按钮。
- [ ] C2 `pages/Areas.tsx`、`AreaDetail.tsx`：含动态插值 `确认删除区域「{{name}}」？区域内的项目不会被删除。`、toast、空状态。
- [ ] C3 `pages/Projects.tsx`、`ProjectDetail.tsx`：同模式。
- [ ] C4 `pages/Tags.tsx`、`TagDetail.tsx`：同模式。
- [ ] C5 `pages/Login.tsx`、`Register.tsx`：表单 label、按钮、校验提示、错误 toast。
- [ ] C6 `components/search/SearchModal.tsx`：placeholder、空结果、分组标题。
- [ ] C7 `components/task/*`：TaskList、TaskListView、TaskItem、TaskRowExpanded、TaskCheckbox（aria-label）、TaskDateBadge、TaskDueDateBadge。
- [ ] C8 `components/area/AreaForm.tsx`、`components/project/ProjectForm.tsx`：表单字段、校验。
- [ ] C9 `components/layout/ContentBottomBar.tsx`：「新任务」、aria-label（搜索任务/添加任务）、「创建失败」toast。

### Phase D · 日期格式化 locale 化
- [ ] D1 重构 `lib/utils/date.ts` `formatDateLabel`：引入 `i18n` 实例，today/tomorrow 用 `t('date:today'/'date:tomorrow')`，周几与远期日期用 `Intl.DateTimeFormat(locale, …)`。
- [ ] D2 删除硬编码 `WEEKDAYS` 数组。
- [ ] D3 资源文件新增 `date` namespace 或并入 `common`（today/tomorrow 两个 key）。
- [ ] D4 检索所有 `toLocaleDateString` / 手写日期展示调用，统一改用 locale 感知版本。

### Phase E · 测试与收尾
- [ ] E1 更新 `components/task/TaskCheckbox.test.tsx` 等断言，使其基于 i18n 后文案或与语言无关的断言。
- [ ] E2 grep 校验：`grep -rnP '[\x{4e00}-\x{9fff}]' --include='*.tsx' --include='*.ts' src/` 仅命中 `i18n/locales/zh/` 路径下文件。
- [ ] E3 grep 校验导航标签无硬编码英文残留（mainNav 等改读 `t('nav:…')`）。
- [ ] E4 zh/en 两份资源 key 集合对齐（写一个临时脚本或人工 diff）。
- [ ] E5 `pnpm typecheck` 通过。
- [ ] E6 `pnpm lint` 通过。
- [ ] E7 `pnpm test` 通过。
- [ ] E8 手动验证（dev server）：zh ↔ en 切换，检查日期标签、删除确认插值、空状态、toast。

## Validation Commands

```bash
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend test
pnpm --filter @taskora/frontend dev   # 手动验证
# grep 残留校验（除 locales/zh 外应无命中）
grep -rnP '[\x{4e00}-\x{9fff}]' packages/frontend/src --include='*.tsx' --include='*.ts' | grep -v 'i18n/locales/zh/'
```

## Risky Files / Rollback Points

| 文件 | 风险 | 说明 |
|------|------|------|
| `lib/utils/date.ts` | 中 | `formatDateLabel` 被 TaskDateBadge/TaskDueDateBadge/Upcoming 等多处依赖，重构后行为需在两语言下对等 |
| `components/layout/Sidebar.tsx` | 中 | 同时承载 nav label、theme locale、新增 LanguageToggle，改动集中 |
| `main.tsx` | 低 | 新增 i18n import，需确保在 React 渲染前执行 |
| `*.test.tsx` | 低-中 | 文案断言需同步更新 |

## Follow-up Checks Before task.py start
- Phase A 完成后在 dev server 实际切换语言一次，确认基础设施通跑，再进入 Phase B/C/D 的大规模文案替换。
- 每 2~3 个页面迁移后跑一次 `typecheck`，避免累积类型错误。