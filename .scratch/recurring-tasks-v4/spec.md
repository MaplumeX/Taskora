# Feature: Repeating Tasks v4（重复任务 v4：改期选择、Repeating 分组）

Status: implemented (01–04) — awaiting manual verification

前作：`.scratch/recurring-tasks/spec.md`（v1）、`.scratch/recurring-tasks-v2/spec.md`（v2）、`.scratch/recurring-tasks-v3/spec.md`（v3）、`.scratch/recurring-projects/spec.md`、ADR-0012。参考：[Things 3.23「Repeating To-Dos, Refined」](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/)。

## Problem Statement

1. **改期重复任务的结果不可预期。** 计划日期就是锚点：规则带星期几 / 日子时（「每周一」），挪到周二后下一次仍是周一，等于「仅此一次」；规则不带（「每 1 周」「每 3 天」「每年」）时，挪到周二后就变成每周二，等于「更新规则」。用户选不了，同样「挪一天」两种规则写法结果不同。
2. **Repeating 列表只能平铺。** 其他列表能按 Project / Area 分组，Repeating 不行（Things 3.23 的 Repeating 列表按 Area 分组）。

## Solution

- **出现日（Occurrence Date）**：Task / Project 新增可空字段 `occurrenceDate`，记录这一环在链上原定的日期；为空即等于计划日期。按计划日期推算的规则从出现日推算下一次，改期不再改变节奏。
- **改期即例外（Repeat Exception）**：按计划日期推算的重复项改计划日期时，默认保留原出现日（只挪这一次）。所有改期入口（拖拽、多选、快捷键、Snooze、助手、REST）都是这个口径。
- **更新规则（Update Rule）**：单个 Task / Project 的计划日期选择器里改期时，先询问「仅此一次」还是「更新规则」。更新规则即把规则对齐到新日期，从新日期起按新规则重复。
- **Repeating 分组**：Repeating 列表按全局偏好「在时间视图中按项目/区域分组」分组或平铺，组头、组序同其他分组视图；仍不可拖拽排序。

## User Stories

1. 作为用户，我把「每周一」的任务挪到这周二，下周仍在周一出现。
2. 作为用户，我把「每 1 周」（未选星期几）的周一任务挪到周二，下周仍在周一出现（以前会变成每周二）。
3. 作为用户，我把「每 3 天」的任务推迟一天，下一次仍按原节奏出现。
4. 作为用户，在任务的计划日期选择器里改期时，可以选「更新规则」，此后每周二重复。
5. 作为用户，「每周一三五」的周一挪到周二并选「更新规则」，规则变成「每周二三五」。
6. 作为用户，「每月 1 号和 15 号」的 1 号挪到 3 号并选「更新规则」，规则变成「每月 3 号和 15 号」。
7. 作为用户，「完成后每 3 天」的任务改期不询问，直接移动。
8. 作为用户，把挪过的任务再挪回原定那天，它恢复为普通的一环。
9. 作为用户，重复项目也一样：日期选择器里询问，其他入口只挪这一次。
10. 作为用户，挪过的任务的下次预告、跳过本次、完成后的下一次、截止日期提前量都按原定日期算。
11. 作为用户，在 Repeating 列表里，开启分组偏好时按项目 / 区域看到分组。

## Implementation Decisions

### 1. 出现日（`occurrenceDate`）

**字段**：Task 与 Project 上的日历日（同 `scheduledDate` 的形态与存储：wire 为 `YYYY-MM-DD`，Postgres 为 UTC 零点 `DateTime?`，副本 TEXT）。为空即「出现日 = 计划日期」。只在与计划日期不同时非空。

**成立条件**（不变式，设备写入与 hub 合并纠正同一规则）：有计划日期、有 Repeat Rule 且 `anchor=scheduled`；否则为空。

**写入口径**（`planTaskUpdate` / `planProjectUpdate`，设备与 REST 共用）：

| 编辑 | occurrenceDate |
|---|---|
| 改计划日期（非空），同次编辑未给 `repeatRule`，现有规则 anchor=scheduled | `existing.occurrenceDate ?? existing.scheduledDate`；等于新计划日期时为空 |
| 同次编辑给了 `repeatRule`（含 null、含与原规则相同）| 空（规则重新起算于新的计划日期） |
| 计划日期清除 / Someday | 空（规则随之清除） |
| 其他编辑 | 不动 |

即：只要不显式改规则，改期就是例外；「更新规则」= 同时提交新规则。

**派生与复制**：Repeat Instance / Repeat Project Instance 的 `occurrenceDate` 为空（新实例的出现日就是它的计划日期）；项目内复制的任务若自身有出现日，随日期一起平移。Duplicate 照抄（同其他字段）。重复项目跳过本次时，项目内未了结任务的出现日也随之平移。

### 2. 推算口径

`nextOccurrenceDate(rule, input)` 新增 `input.occurrenceDate`。anchor=scheduled 时：

- 锚点为 `occurrenceDate ?? scheduledDate`；
- 结果须晚于计划日期：沿链推进，直到严格晚于锚点**且**严格晚于计划日期（例外挪到下一次之后时，跳过被它越过的出现日，不派生出比它更早的实例）。

anchor=completion 不变（出现日恒为空）。

`skipOccurrenceDate` 同样从出现日推进（取第一个晚于出现日与计划日期、且不早于今天的出现日）；跳过后计划日期即新出现日，`occurrenceDate` 清空。

**截止日期 / 项目内任务的平移量**：以出现日为基准（`目标出现日 − 出现日`），保持截止日期相对原定日的提前量：周一出现、周三截止的任务挪到周二，下一次仍是下周一出现、下周三截止。

**确定性 id**（ADR-0012）：输入仍是 `(sourceId, rule, 下一次出现日)`，不变；出现日只影响算出的日期。

调用方都传入出现日：`repeatInstanceId`、`planRepeatInstance`、`planRepeatSkip`、`repeatProjectInstanceId`、`planRepeatProjectInstance`、`planProjectRepeatSkip`、`buildRepeatPreviews`、`RepeatRuleField` 的「下次」预览、`useSkipOccurrence` / `useSkipProjectOccurrence`。

### 3. 更新规则：规则对齐到新日期

纯函数 `retargetRepeatRule(rule, from, to)`（`packages/engine/src/repeat.ts`），`from` 为出现日（`occurrenceDate ?? scheduledDate`），`to` 为新计划日期：

- `unit=week` 且有 `weekdays`：去掉 `from` 的星期几（不在集合中则不去），加入 `to` 的星期几，升序去重。
- `unit=month` 且有 `monthDays`：找出在 `from` 所在月钳制后等于 `from` 日子的那个值（`[31]` 在二月即 28/29 那天）并去掉，加入 `to` 的日子，升序去重。
- 其他（day、year、无星期几的 week、无日子的 month）：规则不变，新计划日期成为新锚点。
- `anchor`、`interval`、`until` 不变。

UI 提交 `{ scheduledDate: to, repeatRule: retargetRepeatRule(...) }`；engine 因为给了 `repeatRule` 清空出现日。

### 4. 日期选择器的询问

只在单个 Task / Project 的计划日期选择器（`ScheduledDateField` 的 `allowRepeat` 入口：展开任务、项目页、右键菜单单选、键盘字段选择器单选、手机滑动 When）询问。

- 触发：当前有 anchor=scheduled 的规则，且选择的结果是一个新的计划日期（日历、今天、明天、输入框里的日期候选），新日期 ≠ 当前计划日期，且 ≠ 出现日（挪回原定日直接写，出现日清空）。
- 不触发：anchor=completion、Someday、清除、输入框的重复候选（它本来就覆盖规则）、开启提醒时把已过日期落到今天。
- 形态：选择器面板原地切换为询问面板（不另开 Dialog，避免与 Popover / Drawer 的焦点和关闭冲突）：标题「修改重复日期」，说明随规则变化，三个按钮「仅此一次」「更新规则」「取消」。「取消」回到日期面板，不写入。
- 选择后按原入口的关闭口径（无提醒区的上下文关闭，有提醒区的留在日期面板）。

其他入口（Upcoming / Calendar 拖拽、拖到侧边栏、多选、快捷键、Snooze、助手、REST、应用外写入）不询问，按例外处理（第 1 节写入口径自然得到）。

### 5. Repeating 分组

`Repeating` 页面改用 `GroupedFeedListView`，`grouping` 取全局偏好 `bucketGrouping`（同 Today / Anytime / Someday / Tomorrow），并：

- 新增 `reorderable` 属性（默认 true）。为 false 时行不可拖起（`dragDisabled`），不注册 ⌘↑/⌘↓ 重排，不接收 Magic Plus。
- 组内顺序沿用 feed 顺序（计划日期升序，同一天按 Position / Feed Position），组序同其他分组视图（侧边栏全局视觉顺序），未分组任务与独立项目行在前。
- 行上照常显示计划日期（`showScheduledBadge` 缺省）。

`FlatFeedPage` 只剩 Deadlines 使用，`view` 类型收窄。

### 6. 存储与同步

- Prisma：`Task.occurrenceDate DateTime?`、`Project.occurrenceDate DateTime?`，迁移加列。
- Sync codec：同 `scheduledDate` 的日历日编码。
- 副本：`ENTITIES` 加字段，副本迁移加列（存量为空）。
- DTO：`TaskResponseDto` / `ProjectResponseDto` / feed 项带 `occurrenceDate`；REST 写入 DTO 不接收（由 engine 推导）。
- 不变式：`invariants.ts` 的 task / project 分支：无计划日期、无规则或 anchor=completion 时清空出现日。
- 数据包导出 / 导入带上字段。

### 7. 提前生成下一份（Next Copy）

对齐 Things 3.23 的 Create Next Copy：

- **语义**：现在就派生来源完成时会派生的那个实例（`planRepeatInstance` / `planRepeatProjectInstance`，同一确定性 id，ADR-0012），`now` 视作完成时刻（anchor=completion 从今天推算）。来源不变。
- **之后**：来源完成时 `repeatDerivationTarget` 因已有派生实例跳过；Skip Occurrence 报 `next-exists`；Repeat Preview 因下一次已派生不投影。下一份是普通的 Repeat Instance，可以再提前生成它的下一份。
- **不可用**（`nextCopyBlock` / `projectNextCopyBlock`，原因复用 `RepeatSkipBlock`）：not-repeating、not-active、next-exists、no-next（链在下一次之前终结）。UI 在 no-next 时不显示入口；next-exists 由数据层拒绝后提示。
- **项目**：下一轮内容取当前这一轮（同完成时派生的复制口径）。
- **入口**：任务右键菜单、展开任务的「更多」、触控多选单选时的工具栏、项目右键菜单。成功后提示下一份的日期。
- **REST**：`POST /tasks/:id/next-copy`、`POST /projects/:id/next-copy`，409 的 message 为原因。
- **Repeating 列表**：下一份与来源都是未了结的重复条目，一起出现。

## Out of Scope

- 批量暂停 / 恢复 / 停止重复。
- 多选改期的询问。
- 「更新规则」对 day / year 规则的间隔重算以外的变化。

## Testing

- engine：`nextOccurrenceDate` / `skipOccurrenceDate` 带出现日（向前挪、向后挪、越过下一次、等于计划日期）；`retargetRepeatRule` 矩阵（单星期几、多星期几、不在集合中、月日子含钳制、无集合规则不变）；`planTaskUpdate` / `planProjectUpdate` 写入口径表逐行；派生 / 跳过 / 预告使用出现日、截止日期平移；不变式；副本迁移。
- backend：codec 往返、REST 改期写出现日、REST 完成按出现日派生、hub 纠正。
- UI：Repeating 分组 / 平铺随偏好、不可拖拽；日期选择器询问的触发与不触发、两个选项的写入。
