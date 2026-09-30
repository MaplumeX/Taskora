# Feature: Repeating Tasks v2（重复任务 v2）

Status: implemented

前作：`.scratch/recurring-tasks/spec.md`（v1）、ADR-0012。

## Problem Statement

v1 让重复任务跑了起来，但用了一段时间后暴露出四个缺口：

1. **没法跳过一次。** 「这周不浇花了」只能完成（假装做了）或取消（整条链就此终结），两者都不对。
2. **撤销完成的副作用难以预料。** v1 在撤销完成时删除派生实例：用户在下一次上加的备注会被一并删掉；完成 → 取消 → 重开、撤销后再完成、锚点为完成日期等路径各有漏删或重复派生的边角（见 v1 spec Comments）。根源是「撤销完成要撤回派生」这一语义，以及实例与其来源之间没有显式关联。
3. **助手不会设重复。** 「每两周三提醒我交周报」只能建出一次性任务。
4. **看不到下一次。** 当前实例完成前，Upcoming / Calendar 里完全看不出这个任务之后还会再来。

## Solution

- **跳过本次（Skip Occurrence）**：原地改期——把当前任务的计划日期推到链上的下一个出现日，不新建任务、不进 Logbook。纯字段改写，走普通 LWW。
- **撤销完成不再删除派生实例**：派生实例一旦创建就是独立的普通 Task，撤销完成只把来源任务重开，不碰实例。新增 `repeatSourceId` 字段记录实例的来源，派生幂等改为「该来源已有存活实例 → 跳过」，从而消除重复派生。
- **助手支持重复规则**：`create_task` / `update_task` 接受 `repeatRule`，`update_task` 支持跳过本次，读工具返回规则。
- **下次预告（Repeat Preview）**：Upcoming 与 Calendar 为每条链投影**下一次**出现，只读、纯渲染层推导，不落库。

## User Stories

1. 作为用户，我想在重复任务的右键 / 长按菜单里选「跳过本次」，让它直接挪到下一次的日期，而不必假装完成或终结整条链。
2. 作为用户，跳过一个已逾期多轮的重复任务时，我希望它落到「今天或之后」的第一次，而不是另一个已过去的日期。
3. 作为用户，跳过后我希望 subtask 全部重置为未完成，就像新的一轮。
4. 作为用户，当规则已到 `until`、没有下一次时，「跳过本次」不可用并说明原因。
5. 作为用户，误勾完成后撤销，我希望已经出现的下一次原样保留——我在上面做的编辑不会丢。
6. 作为用户，撤销后再次完成同一个任务，不会再多出一个下一次。
7. 作为用户，锚点为「从完成日期算」的任务，隔天撤销再完成，也不会多出一个下一次。
8. 作为用户，我想对助手说「每两周三提醒我交周报」，它就建出带正确规则的任务。
9. 作为用户，我想让助手修改或清除某个任务的重复规则，或跳过本次。
10. 作为用户，我想在 Upcoming 与 Calendar 里看到每个重复任务的下一次，以灰色只读行呈现，一眼知道它会再来。
11. 作为用户，已经派生出来的下一次不会在视图里再以预告的形式重复出现。

## Implementation Decisions

### 1. 跳过本次

- **语义**：对 ACTIVE、ScheduledType=DATE、带规则的 Task 做一次字段改写：`scheduledDate` → 目标日期；已有 `dueDate` 按相同天数平移；其全部 subtask 置回 ACTIVE（`settledAt` 清空）。`reminderTime` 保持（它是时刻，随新日期触发）。不新建实体、不产生 Logbook Entry、链不分叉。
- **目标日期**：
  - anchor=scheduled：按规则从 `scheduledDate` 反复推进，取第一个**晚于原计划日且不早于今天**（账号时区）的出现日。计划日在今天或未来 → 严格下一次；已逾期 → 跳过所有错过的，落在今天或之后。
  - anchor=completion：以今天为锚推进一次（等同「今天完成」时的下一次）。
  - 超过 `until` → 无目标，操作不可用（菜单项禁用，提示「已是最后一次」）。
- **不可用的情况**：已了结 / 在 Trash / 无规则 / 该任务已有存活派生实例（撤销完成后留下的；此时下一次已经存在，跳过会在同一天叠出两条）。
- **共享规划器**：`planRepeatSkip(task, subtasks, today, zones)` 放在 `@taskora/engine` 的 `domain`，与 `planRepeatInstance` 并列；设备 engine 后端与 REST `TasksService` 各自只负责读与写。REST 新增 `POST /tasks/:id/skip`（web 的 REST 回退路径与助手都需要）。
- **并发**：A 设备跳过、B 设备同时完成 → 合并后来源任务为已完成（日期取 LWW 胜者），派生实例一条，无重复。两台设备都跳过 → 同一个目标日期，LWW 收敛。
- **入口**：任务右键 / 长按菜单，紧邻「重复」；不放在展开行中（与 v1 重复规则入口原则一致）。

### 2. 撤销完成不删除派生实例 + `repeatSourceId`

- **新字段** `Task.repeatSourceId: string | null`：派生时写入来源任务 id；普通任务与存量实例为 null。纳入字段级 LWW（实际上只在创建时写一次）。不做外键：来源可能被清空回收站而物理删除，此时字段悬空无害。
- **撤销完成 / 撤销取消**（`uncompleteTask` / `uncancelTask`，设备端与 REST 两处）：只写 `taskReopenPatch`，**不再删除**派生实例。删除 `deleteDerivedInstance` 与 REST 的 Compact 登记路径。
- **派生幂等**（`deriveRepeatInstance`，两处）：派生前先查「`repeatSourceId` = 本任务、且不在 Trash 的 Task」，存在即跳过；再保留原有的确定性 id 查重作为存量数据（无 `repeatSourceId`）与并发派生的兜底。Trash 中的实例不算存在：用户主动丢弃了它，再次完成应重新派生（确定性 id 被占用或已 compact 时换新 id，沿用现有路径）。
- **确定性 id 不变**：并发去重仍依赖 ADR-0012 的 id 派生；`repeatSourceId` 只负责「顺序上的」幂等（撤销后再完成、anchor=completion 换日再完成）。
- **v1 遗留边角的去向**：
  - 撤销完成删掉用户已编辑的实例 → 不再删除。
  - 撤销后再完成在 Outbox 未冲刷窗口内的竞态 / 已 compact 的 id 换新 id 后再撤销找不到 → 不再删除，问题不存在。
  - 完成 → 取消 → 重开、anchor=completion 时漏删 → 不再删除，行为统一。
  - anchor=completion 撤销后隔天再完成派生出第二个实例 → 由 `repeatSourceId` 幂等解决。
- **与既有决定的冲突**：_与 ADR-0012 的 Consequences「Un-complete cancels the derivation side effect」相反_，也推翻了 v1 spec 的 User Story 16。重新决定的理由：删除会丢失用户数据，还牵出 Compact / 复活等一整串边角；保留实例的代价只是误勾撤销后，Upcoming 里提前出现了下一次，用户可以自行删除。实现时须同步修订 ADR-0012 与 ADR-0008 中相关段落。
- **存储**：engine 迁移新增一步（`task.repeatSourceId TEXT`），Prisma 迁移，sync codec 与 DTO 透传。旧客户端会忽略这个字段，这是协议 v3 已接受的降级行为；由于采用字段级 LWW，旧客户端写入时不会覆盖它。

### 3. 助手支持重复规则

- `create_task` / `update_task` 增加 `repeatRule` 参数（结构化对象：`unit` / `interval` / `weekdays?` / `anchor?` / `until?`；`update_task` 传 null 表示清除）。经 `normalizeRepeatRule` 校验，非法时返回可读错误，由模型自行更正。工具描述写明前提：只适用于 ScheduledType=DATE，weekdays 取 0=周日…6=周六。
- `update_task` 增加 `skipOccurrence: boolean`，走 REST 的跳过路径；不可跳过时返回原因。
- `list_tasks` / `get_task` / `list_feed` 的返回中带上 `repeatRule`，让助手能看出、说清楚哪些任务是重复的。
- 助手写入沿用现有的审批机制，本期不新增审批 UI。

### 4. 下次预告（Repeat Preview）

- **定义**：对每个满足下列条件的任务，在视图中它的下一个出现日上画一条只读的预告行：ACTIVE、未进 Trash、ScheduledType=DATE、带规则、anchor=scheduled、没有存活的派生实例（按 `repeatSourceId` 判断）。每条链**只投影一次**，即下一次。
- **日期**：`nextOccurrenceDate(rule, { scheduledDate })`。结果不晚于今天就不投影，因为逾期来源任务的下一次可能还在过去，而过去的格子里出现预告会让人误解；链终结（until）时也不投影。
- **anchor=completion 不投影**：它的下一次取决于实际完成日，无法预告。
- **纯渲染层推导**：写成纯函数 `buildRepeatPreviews(tasks, today, zones)`，放在 engine 的 `domain` 或 api 的 utils 中。不落库、不进同步，web 的 engine 路径与 REST 回退路径都适用。
- **Upcoming**：预告行并入对应日期（本周各天 / 月份小节），视觉上为灰色标题加 ↻ 图标，无复选框、不可拖拽、不进入 Selection（键盘导航跳过），悬停显示「重复任务的下一次」。
- **Calendar**：预告以同样的弱化样式并入日格与日详情面板，不计入日格内的任务数。
- **交互**：本期只做展示，点击没有反应。

## Testing Decisions

- **纯函数（价值最高）**：
  - `planRepeatSkip`：覆盖 anchor × 计划日（未来 / 今天 / 逾期一轮 / 逾期多轮）× until × weekdays 模式，以及 dueDate 平移、subtask 重置、各种不可用条件。
  - `buildRepeatPreviews`：覆盖已派生实例去重、completion 锚点、逾期来源、until、Trash 与已了结任务。
- **engine 层**：
  - 完成 → 撤销 → 再完成，实例始终只有一个且未被删除；
  - anchor=completion 隔天再完成不产生第二个实例；
  - 实例在 Trash 时再完成会重新派生；
  - 两个副本离线并发完成时仍收敛为一个实例（回归 ADR-0012）；
  - 跳过与完成并发时的合并结果。
- **REST**：`skip` 端点；`uncomplete` 不再登记 Compact。
- **助手**：工具参数校验（非法规则返回错误），create / update / skip 映射到 service。
- **UI**：「跳过本次」菜单项的显隐与禁用条件；Upcoming / Calendar 中预告行的渲染，以及它不进入 Selection。

## Out of Scope

- 多次投影（每条链超过下一次）、anchor=completion 的预告。
- 预告行的交互（点击定位、跳过某个未来的具体日期）。
- 「停止重复」专用入口、规则可读摘要、截止日偏移规则、BYSETPOS / COUNT（见前一轮讨论的其它方向）。
- 撤销完成时提示「下一次已保留」的 toast（可在实现后视体验再加）。

## Glossary（实现时并入 CONTEXT.md）

- **Skip Occurrence（跳过本次）**：把一个重复任务的计划日期原地推进到链的下一个出现日的动作；不新建实例、不进 Logbook、链不分叉。_Avoid_：推迟、延期（那是普通改期）。
- **Repeat Preview（下次预告）**：Upcoming / Calendar 中对一条链下一次出现的只读投影；不是 Task、不存储、不同步。_Avoid_：幽灵任务、虚拟实例。
- **Repeat Instance** 定义补充：派生后即独立，撤销来源任务的完成不会删除它；`repeatSourceId` 记录来源。

## Issues

- `issues/01-repeat-source-link.md`：新增 `repeatSourceId`，撤销完成不再删除派生实例
- `issues/02-skip-occurrence.md`：跳过本次（Blocked by 01）
- `issues/03-repeat-preview.md`：Upcoming / Calendar 下次预告（Blocked by 01）
- `issues/04-assistant-repeat.md`：助手支持重复规则与跳过（Blocked by 02）
