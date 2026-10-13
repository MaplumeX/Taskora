# Feature: Repeating Tasks v3（重复任务 v3）

Status: implemented (01–02) — awaiting manual verification

前作：`.scratch/recurring-tasks/spec.md`（v1）、`.scratch/recurring-tasks-v2/spec.md`（v2）、`.scratch/recurring-projects/spec.md`、ADR-0012；自然语言输入见 `.scratch/when-natural-input/spec.md`。

## Problem Statement

1. **按月只能有一个日子，而且会漂。** 规则 `unit=month` 只能从计划日期那天往后推：「每月 1 号和 15 号发工资 / 对账」只能拆成两条链；31 号起算的链遇到短月钳制到月末后，就一直停在 28 / 30 号，再也回不到 31 号（`addMonthsClamped` 以上一次的日为锚）。
2. **设重复只能点规则编辑器。** When 输入框已经能识别「下周五 9点」，但「每周五」「每月 15 号」这类重复说法识别不了（when-natural-input spec 的 Out of Scope），设一个重复任务要先选日期、再打开「重复」逐项点选。

## Solution

- **每月的几号（Month Days）**：`unit=month` 的规则新增可选的 `monthDays`（1–31 的集合），活跃月份内这些日子都是出现日；超过当月天数的日子钳制到月末，因此 `31` 即「每月最后一天」，且不会漂移。
- **自然语言重复（Repeat Query）**：计划日期选择器顶部的 When 输入框能识别重复说法，候选同时写入计划日期（第一次出现日）与重复规则，可带提醒时刻。

## User Stories

1. 作为用户，我想把一个任务设成「每月 1 号和 15 号」，一条链就够了。
2. 作为用户，我想设「每月最后一天」，二月落在 28 / 29 号，三月回到 31 号。
3. 作为用户，我想设「每两个月的 10 号」，按计划日期所在的月份起算，隔月出现。
4. 作为用户，我想在规则编辑器里按月时看到一个 1–31 的日子网格，不选任何日子时保持现在的行为（按计划日期当天）。
5. 作为用户，跳过本次、下次预告、重复项目、从完成日期起算，对「每月的几号」规则都照常工作。
6. 作为用户，我想在计划日期输入框里打「每周五」，回车后任务计划在最近的周五（今天是周五就是今天），并带上每周五的规则。
7. 作为用户，我想打「每周一三五 9点」「每个工作日」「每两周」「每月15号」「每月1号和15号」「每月最后一天」「每年」「每3天」，都能得到对应规则。
8. 作为用户，我想打「完成后每3天」「3 days after completion」，得到从完成日期起算的规则。
9. 作为用户，我想用英文打 `every fri`、`daily`、`every 2 weeks on mon`、`every month on the 1st and 15th`、`every weekday`。
10. 作为用户，打到一半（「每」「every」「每周」）时就能看到候选。
11. 作为用户，在不能设重复的地方（多选、批量改期、截止日期、快速添加），输入重复说法不会出现重复候选。
12. 作为用户，我想让助手建出「每月 1 号和 15 号」的任务。

## Implementation Decisions

### 1. 每月的几号（`monthDays`）

**形状**（`packages/shared/src/dtos/repeat-rule.dto.ts`）：

```ts
interface RepeatRule {
  unit: RepeatUnit;
  interval: number;
  weekdays?: number[];   // 仅 week
  monthDays?: number[];  // 仅 month：1–31，升序去重；缺省 = 计划日期当天（现有行为）
  anchor: RepeatAnchor;
  until?: string | null;
}
```

**规范化**（`normalizeRepeatRule`）：`monthDays` 仅在 `unit=month` 且过滤后非空时保留；值域 1–31 的整数，升序去重。其它单位一律丢弃。

**规范序列化与哈希稳定**（`canonicalRepeatRule`）：键序改为 `unit, interval, weekdays?, monthDays?, anchor, until?`。`monthDays` 缺省时不出现在串里，**存量规则的规范串与派生 id 不变**（加回归测试锁住若干现有规则的规范串）。

**下一次出现日**（`nextOccurrenceDate`，新增 `nextMonthlyOccurrence`）：

- 锚点所在月为第 0 月，第 k×interval 月为活跃月（同周模式的口径）。
- 活跃月内，`monthDays` 每个值钳制到当月天数后得到出现日（钳制后重复的合并）。
- 取严格晚于锚点的最小出现日；搜索范围为锚点所在月起 `interval + 1` 个活跃月，必有结果。
- 钳制只作用于本月，不改变下一个月的取值：`[31]` 依次得到 1/31、2/28、3/31，**不漂移**。
- 无 `monthDays` 时完全走原路径（`addMonthsClamped`），行为不变。

锚点为完成日期时同理，以完成日为锚。`skipOccurrenceDate`、`buildRepeatPreviews`、`planRepeatProjectInstance` 都经 `nextOccurrenceDate`，不用改。

**存储与同步**：`repeatRule` 在 Prisma 中是 JSON 字符串、在 replica 中是 JSON 字段，**无需迁移**。REST DTO `RepeatRuleDto` 增加 `monthDays`（`@IsOptional @IsArray @IsInt({each}) @Min(1) @Max(31)`）。

**旧客户端**：旧版 `normalizeRepeatRule` 会丢掉 `monthDays`，用旧语义派生出不同日期与不同 id。客户端版本跟随 hub（ADR-0026），这个窗口只存在于升级前，接受，不做兼容处理。

**助手**：`agent-tools.ts` 的 `repeatRuleSchema` 增加 `monthDays`，工具描述与非法规则提示同步更新（「monthDays integers 1-31, unit month only; 31 means the last day of the month」）。

**UI**（`RepeatRuleField`）：

- `unit=month` 时，在原来周模式行的位置显示 1–31 的 7 列日子网格（多选，样式同星期按钮），网格下一行小字提示「29–31 在短月份落在月末」。
- 不选任何日子 = 按计划日期当天（现有行为），网格上方的说明显示「按计划日期（N 号）」。
- 切换单位时：离开 month 清除 `monthDays`（同离开 week 清除 `weekdays`）。
- 已有的「下一次：…」预览自动反映新规则。

### 2. 自然语言重复（Repeat Query）

**解析器**（新文件 `packages/shared/src/repeat-query.ts`，纯函数，与 `when-query.ts` 并列，复用其 `normalize`、数字与星期词表、`extractTime`；必要时把这些从 `when-query.ts` 导出为内部共享模块）：

```ts
interface RepeatCandidate {
  kind: 'repeat';
  rule: RepeatRule;       // 已是规范形
  date: string;           // 第一次出现日，YYYY-MM-DD，≥ today
  time?: string;          // HH:mm
}

parseRepeatQuery(query: string, options: { today: string; now: string }): RepeatCandidate[]
```

- `WhenCandidate` 联合类型加入 `RepeatCandidate`；`parseWhenQuery` 增加选项 `allowRepeat: boolean`，为真时先尝试 `parseRepeatQuery`：**查询以重复触发词开头（每 / 完成后 / every / daily / weekly / monthly / yearly）时只出重复候选**，否则走原有日期规则。
- 中英文规则同时生效，与界面语言无关。

#### 规则

| 中文 | 英文 | 规则 | 第一次 |
|---|---|---|---|
| 每天, 每日 | every day, daily | day×1 | 今天 |
| 每3天, 每隔3天¹ | every 3 days | day×3 | 今天 |
| 每周, 每星期 | every week, weekly | week×1（无 weekdays） | 今天 |
| 每两周 | every 2 weeks | week×2 | 今天 |
| 每周五, 每个周五, 每星期五 | every fri, every friday | week×1, [5] | 今天或之后最近的周五 |
| 每周一三五, 每周一、三、五, 每周一和周三 | every mon, wed and fri / every mon/wed/fri | week×1, [1,3,5] | 今天或之后最近的一个 |
| 每两周周三 | every 2 weeks on wed | week×2, [3] | 同上 |
| 工作日, 每个工作日 | every weekday, weekdays | week×1, [1..5] | 同上 |
| 每周末 | every weekend | week×1, [0,6] | 同上 |
| 每月, 每个月 | every month, monthly | month×1（无 monthDays） | 今天 |
| 每月15号, 每月15日 | every month on the 15th, monthly on 15 | month×1, [15] | 今天或之后最近的 15 号（钳制口径） |
| 每月1号和15号, 每月1、15号 | every month on the 1st and 15th | month×1, [1,15] | 同上 |
| 每月最后一天, 每月月底 | every month on the last day, end of every month | month×1, [31] | 本月末 |
| 每两个月10号 | every 2 months on the 10th | month×2, [10] | 同上 |
| 每年, 每一年 | every year, yearly, annually | year×1 | 今天 |
| 每年3月8日 | every year on mar 8 | year×1 | 今天或之后最近的 3/8 |
| 完成后每3天, 完成后3天 | 3 days after completion, every 3 days after completion | day×3, anchor=completion | 今天 |

¹「每隔 N 天」有「中间空 N 天」（interval=N+1）的读法，歧义大；一律与「每 N 天」同义（interval=N），在测试中锁定。

- 未写锚点时 `anchor=scheduled`。
- 「每年3月8日」不新增规则字段：规则是 `year×1`，锚点就是第一次的计划日期（3/8）。
- 时刻可附在前后（「每周五9点」「9am every fri」），复用 `extractTime`；时刻非法时整个查询无候选（同 When）。
- 不支持：`until`（「直到…」「for 3 months」）、「第 N 个周几 / 最后一个周五」、COUNT。

#### 第一次出现日

在解析器内用 PlainDate 直接计算：无日子集合时为今天；有 weekdays / monthDays 时取今天或之后第一个命中的日子（monthDays 按当月钳制）；年度带月日时取今天或之后最近的该月日（2/29 钳制同 v1）。不依赖 `@taskora/engine`（shared 不能反向依赖）；测试中与 engine 交叉校验：`normalizeRepeatRule(rule)` 与 `rule` 相等；对 interval=1 的规则，以 `date` 前一天为锚的 `nextOccurrenceDate` 等于 `date`。

#### 增量补全

- 「每」→ 每天、每周、每月、每年、每个工作日；「每周」→ 每周（今天的星期几）、每周一…（只列最近的几个，凑满 6 个）；「每月」→ 每月、每月（今天的号）、每月最后一天。
- `e` / `ev` / `every` → every day、every week、every month、every year、every weekday；`every f` → every fri。
- 排序：完全匹配 > 前缀匹配；同档按规则粒度（天 < 周 < 月 < 年）。候选最多 6 个，按规范规则 + 第一次日期去重。

**UI**（`WhenQueryInput` / `ScheduledDateField`）：

- `ScheduledDateField` 新增 prop `allowRepeat`（默认 false），透传给 `WhenQueryInput` → `parseWhenQuery`。
- 只在**单个实体**的计划日期入口打开：`TaskContextMenu`、`TaskRowExpanded`、`ProjectContextMenu`、`ProjectMetaRow`、`SwipeWhenPicker`，以及 `KeyboardFieldPicker` 在只有一个目标时。多选（`MultiSelectToolbar`、多目标的 `KeyboardFieldPicker`）、`SidebarDropProvider`、`QuickAddCard`、截止日期（`DueDateField`）不打开。
- 候选行：↻ 图标 + 规则摘要（「每周五」「每月 1、15 号」，由现有的 `formatRepeatSummary`（项目页头徽章在用）生成，01 已扩展它支持 monthDays）+ 灰色副标签「从 周五 10月16日 开始」+ 可选时刻。
- 选中写入：`{ start: ANYTIME, scheduledDate: date, repeatRule: rule }`，带时刻且 `showReminder` 时再加 `reminderTime` 并请求通知权限（与日期候选一致）；Project 上忽略时刻。选中后关闭弹层。
- 已有规则的任务再输入重复说法：直接覆盖规则（规则只影响当前实例及其后代，与在编辑器里改规则同语义）。

**i18n**：`task.json`（en / zh）新增 `repeatQueryStartsOn` 等候选行文案（monthDays 相关文案在 01 中加入）；When 输入框 placeholder 在 `allowRepeat` 时改为「输入日期或重复，如「下周五」「每周一」」。

## Testing Decisions

- **engine 纯函数（价值最高）**：
  - `normalizeRepeatRule`：monthDays 的过滤、排序、去重、非 month 丢弃、空集合丢弃。
  - `canonicalRepeatRule`：现有若干规则的规范串逐字锁定（防 id 漂移）；带 monthDays 的键序。
  - `nextOccurrenceDate`：monthDays × interval（1 / 2 / 12）× 锚点在集合内 / 集合外 / 当月最后一个出现日之后；`[31]` 跨 2 月不漂移；`[29,30,31]` 在 2 月合并为一天；闰年；completion 锚点；until。
  - `skipOccurrenceDate`、`buildRepeatPreviews`、`planRepeatProjectInstance` 各补一条 monthDays 用例。
- **shared 解析器**：固定 today（含今天恰为周五 / 15 号 / 月末 / 2 月）逐条覆盖规则表；中英文；时刻前后置与非法时刻；前缀补全与排序；`allowRepeat: false` 时完全不出重复候选、原有 when-query 测试全部保持通过；与 engine 的交叉校验。
- **backend**：DTO 接受 / 拒绝 monthDays；REST 完成派生出正确日期；助手工具参数校验。
- **UI**：`RepeatRuleField` 日子网格的选择与切换单位清除；`WhenQueryInput` 选中重复候选写出的 patch（含 reminderTime / Project 忽略时刻）；`allowRepeat` 未开的入口不出重复候选；`formatRepeatSummary` 中英文。

## Out of Scope

- 截止日期按偏移量生成（讨论后决定不做：现有「按计划日期位移平移截止日期」已覆盖主要需求）。
- 「第 N 个周几 / 最后一个周五」（BYSETPOS）、COUNT、自然语言里的 `until`。
- 在任务标题里内联识别重复（QuickAdd / Magic Plus 的标题解析），QuickAdd 设置重复。
- 规则编辑器内单独的自然语言输入框。
- 旧客户端对 monthDays 的兼容。

## Glossary（实现时并入 CONTEXT.md）

- **Repeat Rule** 定义更新：「单位 × 间隔 × 周模式的星期几集合 **或月模式的日子集合**」；日子超过当月天数时落在月末。
- **Repeat Query（重复输入）**：计划日期选择器的自然语言输入中识别出的重复说法，选中后同时写入第一次的计划日期与 Repeat Rule。只在单个实体的计划日期入口可用。_Avoid_：重复解析、智能重复。

## Issues

- `issues/01-month-days.md`：规则新增 monthDays（engine、DTO、助手、规则编辑器）
- `issues/02-repeat-query.md`：When 输入框识别重复说法（Blocked by 01）
