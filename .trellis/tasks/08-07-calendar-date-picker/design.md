# Design: Calendar date picker for scheduled date field

## 架构与边界

新增一个 `Calendar` 基础 UI 组件，重写 `ScheduledDateField`，不动后端与 DTO。

```
packages/frontend/
├── src/components/ui/calendar.tsx            [新增] 基于 react-day-picker 的月历
└── src/components/task/fields/ScheduledDateField.tsx [重写] 日历 + 底部操作行
```

## 数据流

`scheduledType` 不再由 segmented control 直接声明，而是用户动作的派生结果：

| 用户动作              | patch 载荷                                    |
|----------------------|----------------------------------------------|
| 点日历某天            | `{ scheduledType: DATE, scheduledDate }`      |
| 点「今天」            | `{ scheduledType: DATE, scheduledDate: 今天 }` |
| 点「Someday」         | `{ scheduledType: SOMEDAY }`                  |
| 点「清除」            | `{ scheduledType: NONE, scheduledDate: null }` |

`patch` 仍走 `TaskRowExpanded` 传入的 `onPatch`（`useUpdateTask` + invalidate），与现状一致，无新增 mutation。

## Calendar 组件契约

```tsx
// src/components/ui/calendar.tsx
interface CalendarProps {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  locale: Locale; // react-day-picker Locale，来自 i18n.language
  initialFocus?: boolean;
}
```

- 基于 `react-day-picker` 的 `DayPicker`，mode="single"
- Tailwind className 通过 `react-day-picker` 的 `classNames` prop 注入，全部走 CSS 变量
- 选中态：`bg-primary text-primary-foreground` 圆形填充
- 今日标记：`text-primary font-semibold`（不抢选中态的填充）
- 翻月 nav 按钮：`text-muted-foreground hover:text-foreground`

`react-day-picker` 自 v9 起内置 `date-fns` 依赖用于 locale 与格式化，无需额外引入 `date-fns`。locale 对象按 `i18n.language` 在 `ScheduledDateField` 内解析后传入 `Calendar`，避免 `Calendar` 直接依赖 `i18next`。

## ScheduledDateField 重写

```tsx
<PopoverContent align="start" className="w-auto p-0">
  <Calendar
    selected={scheduledType === DATE ? scheduledDate : undefined}
    onSelect={(d) => d && onPatch({ scheduledType: DATE, scheduledDate: d.toISOString() })}
    locale={locale}
  />
  <div className="flex gap-1 border-t p-2">
    <Button variant="ghost" size="sm" onClick={today}>今天</Button>
    <Button variant={scheduledType === SOMEDAY ? 'secondary' : 'ghost'} size="sm" onClick={someday}>Someday</Button>
    <Button variant="ghost" size="sm" disabled={scheduledType === NONE} onClick={clear} className="ml-auto">清除</Button>
  </div>
</PopoverContent>
```

- `selected` 仅在 `scheduledType === DATE` 时传入日期，否则 `undefined`（SOMEDAY/NONE 不在日历选中）
- 点日历选中后不自动关闭（让用户可连续微调日期），但点「今天」关闭面板（一次到位）

## 依赖

新增 `react-day-picker`（`packages/frontend/package.json`）。v9+ 内置 `date-fns` 作为 peer/transitive，无需单独装 `date-fns`。

## 兼容性与回滚

- `DueDateField` 不改动，不受影响
- 后端 `ScheduledType` 枚举 / DTO / 视图逻辑不变
- 回滚：还原 `ScheduledDateField.tsx` + 删除 `calendar.tsx` + 卸载 `react-day-picker` 即可

## 不引入 date-fns 的说明

`react-day-picker` v9 自带 locale 能力（`date-fns/locale`），但我们在 `ScheduledDateField` 只用它做月名/周名显示，不直接 import `date-fns` 工具函数。日期工具仍用 `@/lib/utils/date` 的 `startOfToday` / `toInputDateValue`（今天按钮构造日期用）。

## 关键 trade-off

- **为何不手写月历**：手写要处理月首周对齐、翻月、闰年、locale 周首日，重复造轮子且易出 bug；`react-day-picker` ~14kb gzipped，轻量。
- **为何不动 DueDateField**：本次目标是「选日期 + Someday」体验，DueDate 是纯日期无类型切换，改造价值低且会扩大改动面。