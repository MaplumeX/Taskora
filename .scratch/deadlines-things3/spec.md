# 截止日期对齐 Things 3：进 Today、Deadlines 列表、重复带截止日

当前 Deadline 只影响行上展示（红旗 + 倒计时），不影响条目出现在哪。Things 3 里 Today 是全局过滤器：计划日期或截止日期落在今天（或已过）的条目都会出现（见 `.scratch/things3-when-display/research.md` 第 5、6、16 条）。本 feature 让截止日期参与路由，并补上 Deadlines 隐藏列表与重复任务的截止日继承。

## 用户故事

1. 作为用户，只设了截止日期（没有计划日期、或计划在 Someday / 未来）的任务，到截止日当天自动出现在 Today，逾期后一直留着，直到我处理它。
2. 作为用户，侧边栏 Today 入口用红色数字告诉我有几条到期 / 逾期的，灰色数字是其余条目。
3. 作为用户，截止日到来进入 Today 的条目和计划日期到来的一样带「新到」黄点。
4. 作为用户，在 Quick Find 里搜「截止日期 / Deadlines」能打开一个按截止日期排列所有待办的列表。
5. 作为用户，带截止日期的重复任务完成后，下一轮任务按同样的提前量带上截止日期。

## 规则

### Today 收录截止日期

- Today 收录未了结、未进 Trash、且满足以下任一条件的 Task / Project：
  - 计划日期 ≤ 今天（现状）；
  - 截止日期 ≤ 今天（新增），与计划类型、Bucket 无关：Inbox、Anytime、Someday、未来计划日期的条目都会出现。
- Later Project 内的任务同样收录（Today 现在就不隐藏稍后项目内任务，口径一致）。
- 截止日期带入的条目和其余条目一样按 Position / Feed Position 排序、按父级分组，没有单独分区，可拖拽排序。
- 改计划不会把它移出 Today：只要截止日期 ≤ 今天就一直在 Today。要移出只能改或清除截止日期，或者完成 / 取消 / 删除。
- 条目仍出现在它原来所在的视图（Inbox / Anytime / Someday / Upcoming 按计划日期），不受影响。
- 行上展示：截止日期徽标沿用现状（红旗 + 「今天」/「逾期 x 天」）。计划日期在今天之后的，在 Today 里也显示灰色短日期 chip（其余 Today 条目按语境不显示计划日期），让用户知道它原本计划在哪天。
- Calendar 视图不变，仍按计划日期归格。

### 侧边栏 / 手机首页 Today 计数

- 红色数字：Today 中截止日期 ≤ 今天的条目数（Task 与独立项目行）。
- 灰色数字：Today 中其余条目数。两数之和 = Today 总条数。
- 某一个为 0 就不显示那一个，各自封顶 `99+`。
- 新到黄点照旧，三者可同时出现。

### New in Today

- 「随日期到来」新增截止日期这条路径：截止日期晚于已确认日期（`todayReviewedOn`），且截止日期字段是在截止日之前写入的（取该字段的 HLC 墙钟，按账号时区比较）。当天才设成今天或已过日期的不算；写入时刻未知只按前一条判断。
- 计划日期、截止日期任一路径成立就算新到。
- 单条已读键沿用 `type:id@日期`，日期取**让它进入 Today 的那个日期**；两条路径都成立时取计划日期。所以日后改了截止日期、新的截止日到来时，会重新算新到。
- feed 条目新增 `dueSetAt`（对应现有的 `scheduledSetAt`），只在 Today 下发。

### Deadlines 列表

- 新增 ListView `deadlines`，路由 `/deadlines`；不在侧边栏显示，也没有计数，只能从 Quick Find 的 Lists 组进入（中英文名称：截止日期 / Deadlines / Deadline）。
- 内容：所有带截止日期、未了结、未进 Trash 的 Task 与 Project（含 Later Project 及其内任务）。
- 排序：截止日期升序（逾期的自然排在最前），同一天内按 Position / Feed Position。平铺不分组，不可拖拽排序。
- 行上显示截止日期倒计时徽标；计划日期按非语境视图规则显示（黄星 / 灰色 chip）。

### 重复任务继承截止日期

- Repeat Instance 派生时：来源任务有截止日期，就给实例截止日期 = 出现日 + (来源截止日期 − 来源计划日期)，偏移可以是负数；来源没有截止日期则保持 null。计划日期锚点、完成日期锚点都适用。
- 与 Skip Occurrence、Repeat Project Instance 现有的「截止日期按计划日期位移平移」口径一致；Repeat Rule 不新增字段，重复编辑器不改。
- 不影响 ADR 0012 的确定性实例 id（id 不依赖截止日期）。

## 不做

- Upcoming 在截止日当天显示条目（是否对齐 Things 还没核实）。
- Repeat Rule 里显式的「截止日偏移」设置。
- 截止日期提醒。
- Deadlines 列表进侧边栏。

## 文档

- `CONTEXT.md`：
  - Deadline 词条加上「截止日期 ≤ 今天的未了结条目出现在 Today」。
  - Repeat Instance 词条补上截止日期的平移规则。
  - New in Today 词条补上截止日期这条路径和已读键取哪个日期。
  - 新增 Deadlines（截止日期列表）词条。
