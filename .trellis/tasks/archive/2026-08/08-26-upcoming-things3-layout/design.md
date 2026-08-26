# Design: Things 3 style Upcoming visual skeleton

## 边界

只改前端近期页的分组与日头。Backend `upcoming` view、feed DTO、主栏宽度、底部栏、任务完成/展开逻辑都不动。

日期键继续用现有 `toDateKey`（本地日历日），与当前 Upcoming 分组一致，避免引入新的时区语义。

## 布局模型

抽出纯函数，便于单测，页面只负责渲染：

```ts
type UpcomingDay = {
  dateKey: string; // yyyy-mm-dd
  dayOfMonth: number;
  isTomorrow: boolean;
  items: FeedItem[];
};

type UpcomingLaterMonth = {
  year: number;
  month: number; // 1-12
  showYear: boolean;
  days: UpcomingDay[];
};

type UpcomingLayout = {
  week: UpcomingDay[]; // 永远 length === 7
  later: UpcomingLaterMonth[];
};

function buildUpcomingLayout(items: FeedItem[], today: Date): UpcomingLayout
```

规则：

1. `weekStart` = 本地明天 00:00；`week` = `[weekStart, weekStart+6]`，每天先占位 `items: []`。
2. 有 `scheduledDate` 的条目按 `toDateKey` 分桶。落在 week 内的推进对应天；晚于 `weekStart+6` 的进入 later；更早或无效日期丢弃（upcoming feed 不应出现今天/过期，防御即可）。
3. later 按 dateKey 升序。连续同月的日子收进同一个 `UpcomingLaterMonth`。
4. 若 later 的第一个月与 `week[6]` 的年月相同，该月仍输出（里面是窗口后的日子），渲染时**不画月份标题**——用 `monthEquals(week[6], firstLaterMonth)` 判断。更干净的做法：给每个 later month 设 `showHeading: boolean`，当该月与「上一组的最后一天」不同月才为 true。第一组 later 的「上一组」是 `week[6]`。
5. `showYear`：该月年份 ≠ `today` 的年份。
6. 日内 `items` 保持传入顺序（feed 已排序）。

`today` 由调用方传入（页面用 `new Date()`，测试注入固定日期），禁止在纯函数里读系统时钟。

## 组件

| 文件 | 职责 |
|---|---|
| `packages/frontend/src/lib/utils/upcomingLayout.ts` | `buildUpcomingLayout` 及月份标题是否显示 |
| `packages/frontend/src/lib/utils/upcomingLayout.test.ts` | AC1–AC6 结构断言 |
| `packages/frontend/src/pages/Upcoming.tsx` | 拉 feed、建 layout、渲染日头 + `FeedItemRow` |
| `packages/frontend/src/components/task/TaskItem.tsx` | 新增可选 `showScheduledBadge?: boolean`，默认 `true` |
| `packages/frontend/src/components/feed/ProjectFeedRow.tsx` | 同样的可选 prop |
| `packages/frontend/src/components/feed/FeedItemRow.tsx` | 把 prop 传给 TaskItem / ProjectFeedRow |

日头足够小，内联在 `Upcoming.tsx`，不单开组件。结构：

```text
[tabular-nums text-2xl/3xl font-semibold] [tomorrow | weekday] ────
items...
```

月份标题用略大于日头标签、小于页面 h1 的 `font-semibold`，上边距大于普通日头。颜色走现有 token（`foreground` / `muted-foreground` / `border`），不引入 Things 黄。

不使用 `FeedListView`：它带整页空态和可选排序，和「永远 7 天」冲突。Upcoming 继续自管 `useTaskRowSelection`、完成 mutation、project/area 标题 map。

## 徽章

Upcoming 传 `showScheduledBadge={false}`。`TaskDueDateBadge` 无条件保留。默认值保证 Today / Inbox / 项目页零改动。

## 数据流

```
useFeedQuery('upcoming')
  → buildUpcomingLayout(items, now)
  → week[7] + later[]
  → 每日 map FeedItemRow
```

无新 API、无新 query key、无 Zustand。失败/加载分支留在页面，不进入 layout 函数。

## 兼容与回滚

- 回滚：还原 `Upcoming.tsx` + 删除 `upcomingLayout.*` + 去掉两行徽章 prop。
- `task:upcomingEmpty` 可留在文案文件，页面不再引用。
- 不迁移、不改路由。
