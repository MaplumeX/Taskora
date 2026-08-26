# Implement: Upcoming date month labels and empty-day spacing

## 执行清单

### 1. 布局纯函数

- [ ] 改 `packages/frontend/src/lib/utils/upcomingLayout.ts`：
  - `UpcomingDay.numberLabel`；去掉对页面暴露的 `dayOfMonth` / `showHeading`。
  - `later` 永远 3 项；`headingKind: 'range' | 'name'` + range 起止日。
  - 分桶：week / 3 个月之内 / 丢弃更远。
- [ ] 重写 `upcomingLayout.test.ts`，固定日期覆盖：
  - today=2026-07-29 → week 数字 `30,31,8.1…8.5`（AC1）。
  - today=2026-08-26 → week `27…31,9.1,9.2`；later 标题 range `9/3-9/30` + 10 月 + 11 月（AC2、AC4）；空 items 时 later 仍 length 3、days 皆空。
  - today=2026-07-31 → later `8/8-8/31`、9、10（AC3）；8/12 任务进第一块，`numberLabel === '8.12'`（AC8）。
  - today=2026-08-24 → later 三个 `name`：9、10、11（AC5）。
  - today=2026-08-26 + 2026-12-01 任务 → 该任务不在 week/later 里（AC9）。
  - today=2026-11-26 → later range `12/4-12/31`，随后两块 `showYear === true`（AC10）。
  - 无 scheduledDate 仍丢弃；日内顺序不变。
- [ ] 回滚点：这两个文件。

### 2. 页面

- [ ] `Upcoming.tsx`：日头用 `numberLabel`。
- [ ] later 永远渲染 3 块。`range` 标题写成 `M/D-M/D`；`name` 仍 `Intl`。
- [ ] 日头下与月份标题下加 `min-h-12` 内容槽（空也占位）。
- [ ] 不改 FeedItemRow / 徽章 / 选择 / 完成。

### 3. 规格

- [ ] `.trellis/spec/frontend/component-guidelines.md` Upcoming 段改为：非当前月 `M.D`、窗口后固定 3 个月、重叠月区间标题、空标题占位、3 个月外不渲染。

### 4. 质量门

```bash
pnpm --filter @taskora/frontend test -- upcomingLayout
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend test
git diff --check
```

浏览器（有数据时）：

- 当前月日子只显示日；跨月显示 `9.1`。
- 7 天后出现 3 个月份标题；重叠月是 `M/D-M/D`。
- 空日头、空月份标题下有空白。
- 3 个月之外的计划日不出现。
- 点任务可展开；勾选可完成。Today / Inbox 计划日徽章仍在。

## Review Gates

1. layout 单测对齐 AC1–AC5、AC8–AC10 后再改页面。
2. 页面完成后派发 `trellis-check`。
3. check 有问题先修再重跑质量门。

## 规格更新

通过后更新 `component-guidelines.md` Upcoming 约定，明确 3 个月截断和区间标题。不要把拖拽改期、右侧月历写成已实现。
