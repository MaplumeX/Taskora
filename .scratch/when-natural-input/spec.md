# Feature: When 自然语言日期输入

Status: implemented (01–05) — awaiting visual acceptance

对照 Things 3 的 When popover：在计划日期（Scheduled Date）和截止日期（Deadline）选择器顶部加一个输入框，用自然语言输入日期（可带时刻），实时给出候选，键盘选中后写入。

## Problem Statement

现有 `ScheduledDateField` / `DueDateField` 只有快捷项（今天 / 明天 / Someday）和日历。想设「下周五」「3 天后」「10月12日」只能在日历上找格子、翻月，全键盘流程走不通。

## Solution

### 布局

```
┌──────────────────────────────┐
│ [输入日期，如「下周五」…]      │  桌面端自动聚焦；触控端不聚焦（免得弹出键盘）
├──────────────────────────────┤
│ ⭐今天  🌅明天  📦Someday   ✕ │  输入为空时：快捷项 + 日历 + 提醒区，与现在相同
│ ┌──────── 日历 ────────┐     │  （快捷项位置不动）
│ └──────────────────────┘     │
│ 提醒   09:00  [开关]           │
└──────────────────────────────┘

输入「下周五 9点」后，快捷项 + 日历区域被候选列表替换：
┌──────────────────────────────┐
│ [下周五 9点                 ] │
├──────────────────────────────┤
│ 📅 周五 10月16日 · ⏰ 09:00   │  ← 高亮
│ 📅 周五 10月23日 · ⏰ 09:00   │
└──────────────────────────────┘
```

- 输入为空时界面与现在完全一致。有输入时，「快捷项 + 日历」整块替换为候选列表；提醒区在输入期间隐藏，清空输入后恢复。
- 键盘：`↑` / `↓` 移动高亮，`Enter` 选中，`Esc` 由宿主 Popover / Dialog 关闭（Radix 在 document 捕获阶段处理 Escape，输入框拦不住，与 MovePicker 一致）。IME 组合输入期间忽略按键。
- 无候选时显示「无法识别」提示行。
- 每行：图标 + 主标签（`formatDateLabel` 的相对写法：今天 / 明天 / 周五 / 10月12日）+ 灰色副标签（完整短日期，跨年时带年份）+ 可选时刻。Someday、清除各自有固定行。

### 候选的写入

| 候选 | ScheduledDateField | DueDateField |
|---|---|---|
| 日期 | `{ scheduledType: DATE, scheduledDate }` | `{ dueDate }` |
| 日期 + 时刻 | 再加 `reminderTime`（仅 `showReminder`） | 忽略时刻 |
| Someday | 同现有 `handleSomeday` | 不出现 |
| 清除 | 同现有 `handleClear` | `{ dueDate: null }` |

- 带时刻的候选在 `showReminder` 为真时写入 `reminderTime`，并和开启提醒开关一样调用 `requestPermission()`。不可设提醒的上下文（Project、web、QuickAdd 未开提醒时）时刻部分照常解析，但候选不显示时刻、也不写入。
- 不带时刻的日期候选不动已有的 `reminderTime`（与点日历格子一致）。
- **从输入框选中后一律关闭弹层**，即使是可设提醒的上下文：输入是完整的键盘流程，时刻已经可以一起输入。点日历格子的现有行为不变。

## Implementation Decisions

### 1. 解析器（纯函数，`packages/shared/src/when-query.ts`）

```ts
interface WhenQueryOptions {
  today: string;          // 账号时区的今天，YYYY-MM-DD
  now: string;            // 账号时区的当前时刻，HH:mm（只有时刻时判断落今天还是明天）
  weekStartsOn: 0 | 1;
  allowSomeday: boolean;  // DueDateField 传 false
}

type WhenCandidate =
  | { kind: 'date'; date: string; time?: string /* HH:mm */ }
  | { kind: 'someday' }
  | { kind: 'clear' };

parseWhenQuery(query: string, options: WhenQueryOptions): WhenCandidate[]
```

- 在 date key 上用 Temporal `PlainDate` 计算，不涉及时刻和时区（ADR 0013）。调用方用 `todayDateKey()` 传入今天。
- 不引入 chrono-node：它只解析完整的句子，不支持前缀补全、也给不出多个候选，中文规则也不够。
- 中英文规则同时生效，与界面语言无关。大小写、全角/半角、多余空格先归一。
- 候选最多 6 个，按日期去重（保留排序靠前的）。

#### 规则

| 类别 | 英文 | 中文 | 结果 |
|---|---|---|---|
| 关键词 | today, tod, now | 今天, 今日 | 今天 |
| | tomorrow, tmr, tom | 明天, 明日 | 明天 |
| | day after tomorrow | 后天 / 大后天 | +2 / +3 |
| | someday, later | 某天, 以后, 将来 | Someday |
| | clear, none, no date | 清除, 无, 不设 | 清除 |
| 星期 | fri, friday | 周五, 星期五, 礼拜五 | 今天之后最近的周五（今天是周五则下周五） |
| | this fri | 这周五, 本周五 | 本周（按 `weekStartsOn`）的周五；已过去则同「fri」 |
| | next fri | 下周五 | 下一周的周五 |
| 相对 | in 3 days, 3d, +3 | 3天后, 三天后 | +3 天 |
| | in 2 weeks, 2w | 2周后, 两周后, 两个星期后 | +14 天 |
| | in 1 month, 1m | 1个月后, 一个月后 | 下月同日（月末收敛，1/31 → 2/28） |
| | in 1 year, 1y | 一年后 | 明年同日（2/29 → 2/28） |
| 模糊 | next week | 下周 | 下一周的第一天（按 `weekStartsOn`） |
| | weekend, this weekend | 周末, 这周末 | 最近的周六（今天是周六 / 周日则为今天） |
| | next weekend | 下周末 | 下一周的周六 |
| | next month | 下个月, 下月 | 下月 1 号 |
| | end of month, eom | 月底, 月末 | 本月最后一天 |
| | next year | 明年 | 明年 1 月 1 日 |
| | end of year | 年底, 年末 | 12 月 31 日 |
| 绝对 | 12 | 12号, 12日 | 最近的 12 号（今天或之后；本月没有 31 号则跳到下一个有的月份） |
| | aug 12, 12 aug, august 12 | 8月12日, 8月12号, 八月十二 | 不带年份时取今天或之后最近的一次 |
| | 8/12, 8-12 | — | 月/日（不支持日/月顺序，避免歧义） |
| | 2026-10-12, 2026/10/12 | 2026年10月12日 | 指定日期（允许过去） |

- 中文数字支持一到三十一（含「两」「廿」「卅」）。
- 「end of week」这类有歧义的写法不支持。

#### 时刻（可附在任意日期表达之前或之后）

| 英文 | 中文 | 结果 |
|---|---|---|
| 9am, 9 am, 9:30pm | 9点, 九点 | 09:00 / 09:00 / 21:30 |
| 21:00, 9:30 | 21点30, 9点半, 9点一刻 | 24 小时制 |
| noon, midnight | 中午, 午夜 | 12:00 / 00:00 |
| morning, afternoon, evening, tonight | 早上 / 上午 / 下午 / 晚上 + 时刻 | 修饰 am/pm；单独出现时分别取 09:00 / 14:00 / 19:00 / 20:00 |
| at 9 | 9点 | 带 `at` 或「点」才算时刻，裸数字一律当日期 |

- 只有时刻、没有日期：今天；时刻已过则明天。
- `9:30` 不带 am/pm 按 24 小时制；`3pm` / `下午3点` 加 12 小时。
- 时刻非法（`25:00`、`下午15点`）时整个查询不出候选。

#### 增量补全

用户每输入一个字都重新解析，最后一个词按前缀匹配展开：

- `t` → 今天、明天、周二、周四、this X…；`tom` → 明天；`f` → 周五（最近的）、Feb 1；`n` → next week、next month 等。
- `明` → 明天、明年；`下` → 下周、下个月、下周末；`周` → 周一…周日（只列最近的 7 天）。
- 纯数字 `1` → 最近的 1 号、10~19 号（最多凑满 6 个）。
- 排序：完全匹配 > 前缀匹配；同档按日期先后。Someday / 清除只在关键词匹配时出现。

### 2. 选择列表 hook（`packages/ui/src/lib/useListboxNavigation.ts`）

把 MovePicker 里的 `activeIndex`、`scrollIntoView`、`↑↓/Enter` 处理、IME 保护和 `aria-activedescendant` 抽成 hook，MovePicker 改用它，When 输入复用。

### 3. 组件（`task/fields/WhenQueryInput.tsx`）

- 接口：`{ placeholder, allowSomeday, showTime, todayIcon, onSelect(candidate), children }`。组件自持 `query` 并调用解析器（today / now 取 `todayDateKey()` / `currentWallTime()`）；输入为空时渲染 `children`（原有内容），否则渲染候选列表。
- `showTime` 为假时去掉时刻并按日期去重。
- 输入框是弹层第一个可聚焦元素：桌面 Popover 打开即聚焦；窄屏 `FieldPickerDialog` 聚焦卡片本身，不弹键盘。无需额外代码。
- 打开弹层后直接打字（焦点不在输入框）不做转发，交给自动聚焦。

### 4. i18n

`task.json`（en / zh）：`whenQueryPlaceholder`、`whenQueryNoResults`、`deadlineQueryPlaceholder`。账号时区的当前时刻由新增的 `currentWallTime()`（`api/utils/date.ts`）提供。候选标签复用 `common:today` / `common:tomorrow` / `task:somedayLabel` / `common:clear` 和 `formatDateLabel` / `formatShortDate`。

## Out of Scope

- 在任务标题里直接识别日期（QuickAdd 的标题内联解析）。
- 「This Evening」：Taskora 没有傍晚的概念。
- 用自然语言设置重复规则（「每周五」）。
- 打开弹层后、焦点不在输入框时直接打字转发。

## Testing

- 解析器：固定 today，逐条覆盖上表；跨月、跨年、闰年、月末收敛、`weekStartsOn` 为 0 / 1；前缀补全与排序；时刻的合法与非法输入；`allowSomeday: false`。
- hook：MovePicker 原有测试保持通过。
- 组件：输入后的候选、Enter 写入的 patch（含 `reminderTime` 与 `showReminder` 为假时忽略时刻）、IME 组字时 Enter 不触发、选中后关闭。
