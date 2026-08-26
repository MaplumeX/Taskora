# Design: Upcoming date month labels and empty-day spacing

## 边界

只改前端近期布局与日头渲染。Backend `upcoming` view、feed DTO、主栏宽度、底部栏、任务完成/展开逻辑都不动。3 个月之外的事项仍可能出现在 feed 响应里，由 `buildUpcomingLayout` 丢弃，不请求新 API。

日期键继续用 `toDateKey` / `toInputDateValue`。

## 布局模型

扩展现有纯函数，页面只负责渲染：

```ts
type UpcomingDay = {
  dateKey: string;
  numberLabel: string; // "31" | "9.1"
  isTomorrow: boolean;
  items: FeedItem[];
};

type UpcomingLaterMonth = {
  year: number;
  month: number; // 1-12
  showYear: boolean;
  headingKind: 'range' | 'name';
  rangeStartDay: number | null; // headingKind === 'range'
  rangeEndDay: number | null;
  days: UpcomingDay[]; // 只含有事项的日子
};

type UpcomingLayout = {
  week: UpcomingDay[];          // 永远 length === 7
  later: UpcomingLaterMonth[];  // 永远 length === 3
};

function buildUpcomingLayout(items: FeedItem[], today: Date): UpcomingLayout
```

删除 `dayOfMonth` 对外用途（改由 `numberLabel` 表达）和 `showHeading`（3 块始终有标题）。

### 日头数字

`numberLabel(date, today)`：同年同月 → `String(date.getDate())`；否则 `` `${date.getMonth() + 1}.${date.getDate()}` ``。不补零。week 与 later 日子共用。

### 3 个月份区块

```
weekEnd = week[6] 的本地日期
cursor  = weekEnd + 1 天
laterEnd = 第 3 个区块所在月的最后一天
```

循环 3 次：

1. `ym = cursor` 的年月；`monthEnd = 该月最后一天`。
2. 若 week 里存在同一年月的日子 → `headingKind: 'range'`，`rangeStartDay = cursor.getDate()`，`rangeEndDay = monthEnd.getDate()`。
3. 否则 `headingKind: 'name'`，range 字段为 `null`。`showYear = ym.year !== today.year`。
4. `cursor = monthEnd + 1 天`。

因为 7 天最多跨两个月，只有 `later[0]` 可能是 `range`。

### 分桶

- 有 `scheduledDate` 且 `dateKey` 落在 week → 推进对应天。
- `weekEnd < dateKey <= laterEndKey` → 推进对应 later 月（按年月匹配）。该月 `days` 只在有事项时才插入，按 dateKey 升序。
- 更早、无效、或晚于 `laterEndKey` → 丢弃。
- 日内顺序保持传入顺序。

`today` 由调用方传入，禁止读系统时钟。

## 组件

| 文件 | 职责 |
|---|---|
| `packages/frontend/src/lib/utils/upcomingLayout.ts` | 布局 + `numberLabel` |
| `packages/frontend/src/lib/utils/upcomingLayout.test.ts` | AC1–AC5、AC8–AC10 的结构断言 |
| `packages/frontend/src/pages/Upcoming.tsx` | 渲染日头 / 月份标题 / 空位 |

日头数字改为 `{day.numberLabel}`。月份标题：

- `headingKind === 'range'` → `` `${month}/${rangeStartDay}-${month}/${rangeEndDay}` ``（与 `numberLabel` 一样不走 i18n）。
- `headingKind === 'name'` → 现有 `Intl` `{ month: 'long' }`，`showYear` 时加 `year`。

不新增 i18n key。不单开日头组件。

## 空位

每个日头（week）和每个月份区块标题下方放一块内容槽：有事项时渲染 `FeedItemRow`；无事项时槽仍在，用 `min-h-12`（48px）占位。外层日/月间距保持现有 `gap-6`。不为「有任务的日子」再加额外底边。

## 数据流

```
useFeedQuery('upcoming')
  → buildUpcomingLayout(items, now)
  → week[7] + later[3]
  → 日头 / 月份标题 + FeedItemRow
```

无新 query key、无 Zustand。失败/加载分支不动。

## 兼容与回滚

- 回滚：还原 `upcomingLayout.ts`、`upcomingLayout.test.ts`、`Upcoming.tsx`。
- `task:upcomingEmpty` 仍不引用。
- 3 个月外的事项只是不渲染，数据仍在 feed 里；回滚后重新出现。
- 规格：更新 `component-guidelines.md` 的 Upcoming 段（日头 `M.D`、固定 3 个月、区间标题、空位、丢弃窗口外事项）。
