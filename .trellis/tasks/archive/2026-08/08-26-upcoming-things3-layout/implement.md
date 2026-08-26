# Implement: Things 3 style Upcoming visual skeleton

## 执行清单

### 1. 布局纯函数

- [ ] 新增 `packages/frontend/src/lib/utils/upcomingLayout.ts`：`buildUpcomingLayout(items, today)`。
- [ ] 复用 `toDateKey` / `toInputDateValue`，不要再写一套日期键。
- [ ] 新增 `upcomingLayout.test.ts`：固定 `today = 2026-08-26`，覆盖：
  - week 永远 7 天，从 08-27 到 09-02，第一天 `isTomorrow`；
  - 空 items → 7 个空日、later 为空；
  - 窗口内条目进对应天、不进 later；
  - 09-12（与 week 末日同月）进 later 且该月 `showHeading === false`；
  - 10-03 进 later 且 `showHeading === true`、当前年不带年；
  - 2027-01-05 的 later 月 `showYear === true`；
  - 无 scheduledDate 的条目被丢弃；
  - 日内顺序与输入一致。
- [ ] 回滚点：删除这两个文件即可。

### 2. 徽章开关

- [ ] `TaskItem` / `ProjectFeedRow` 增加 `showScheduledBadge?: boolean`（默认 true）。
- [ ] `FeedItemRow` 转发该 prop。
- [ ] 默认路径不传，现有页面行为不变。
- [ ] 若有 TaskItem 单测，补一条「false 时不渲染计划日徽章、仍渲染截止日」。

### 3. 重写 Upcoming 页面

- [ ] `Upcoming.tsx` 用 layout 函数替换现有 `grouped` Map。
- [ ] 加载失败 → `common:loadFailed`；加载中 → 不渲染骨架。
- [ ] 成功后始终渲染 7 天日头 + later（含月份标题）。
- [ ] 日头：大号日期数字 + `t('common:tomorrow')` 或 `Intl` weekday long + 细线。
- [ ] 月份标题：`Intl` month long，`showYear` 时带 year。
- [ ] 每条仍走 `FeedItemRow`，`showScheduledBadge={false}`。
- [ ] 选择/完成/projectMap/areaMap 保持现有写法。
- [ ] 不再引用 `task:upcomingEmpty`。
- [ ] 不改 `ContentBottomBar`、`MainContent`、backend。

### 4. 质量门

```bash
pnpm --filter @taskora/frontend test -- upcomingLayout
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend test
git diff --check
```

浏览器手工（有数据时）：

- 近期页顶部 7 天含空日；第一天标签为明天。
- 窗口内任务在对应日下，行上无计划日徽章、有截止日徽章（若该任务有 dueDate）。
- 更远且换月的任务前有月份标题。
- 点任务可展开；勾选可完成。
- Today / Inbox 计划日徽章仍在。
- 窄屏与桌面宽度下日头不撑破 `max-w-2xl`。

## Review Gates

1. layout 单测对齐 AC1–AC6 后再改页面。
2. 页面完成后派发 `trellis-check`。
3. check 有问题先修再重跑质量门。

## 规格更新

通过后在 `.trellis/spec/frontend/component-guidelines.md` 补一段 Upcoming 约定：7 天空日骨架、later 月份标题、`showScheduledBadge=false`。不把 Things 3 交互（拖拽改期、月历）写成已实现。
