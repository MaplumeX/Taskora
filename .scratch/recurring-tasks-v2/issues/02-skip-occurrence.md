# 02 跳过本次（Skip Occurrence）

Status: implemented
Blocked by: 01

## Problem

用户想跳过重复任务的某一次，目前只能假装完成，或者取消（这会终结整条链）。

## Design

见 spec 第 1 节。要点：

- 纯函数 `planRepeatSkip(task, subtasks, today, zones)`，放在 `packages/engine/src/domain/repeat-instance.ts`（或同目录的新文件），返回 `{ taskPatch, subtaskPatches }`，不可跳过时返回带原因的 null。目标日期：
  - anchor=scheduled：第一个晚于原计划日、且不早于今天的出现日；
  - anchor=completion：以今天为锚推进一次；
  - 超过 until：不可跳过。
- 不可跳过的条件：非 ACTIVE、在 Trash、没有规则、非 DATE、已有存活的派生实例（依赖 01 的 `repeatSourceId`）。
- 已有 dueDate 时按相同天数平移；subtask 全部置回 ACTIVE；reminderTime 不变。
- engine 后端新增 `skipTask(id)`；REST 新增 `POST /tasks/:id/skip`；`packages/api` 的 hooks 与 web 的 REST 回退路径都要接上。
- UI：任务右键 / 长按菜单中，在「重复」旁边新增「跳过本次」；不可用时禁用并用 hint 说明原因。i18n 文案用「跳过本次」。
- CONTEXT.md 新增 Skip Occurrence 词条。

## Acceptance

- 纯函数测试矩阵：anchor × 计划日（未来 / 今天 / 逾期一轮 / 逾期多轮）× until × weekdays 模式，以及 dueDate 平移、subtask 重置、各种不可用条件。
- engine：跳过后只改写字段，不新建实体、不进 Logbook；与另一副本的并发完成合并后，存活实例只有一个。
- UI：菜单项只在符合条件的 Task 上出现，Project 上不出现；到达 until 时禁用。

## Comments

### 2026-09-30 — 实现

- 纯函数：`skipOccurrenceDate`（`packages/engine/src/repeat.ts`）负责算出目标日期；`planRepeatSkip` 与 `RepeatSkipBlockedError`（`domain/repeat-instance.ts`）负责判断能否跳过、生成 patch；`shiftDateKey` / `daysBetweenKeys`（`domain/calendar.ts`）用于截止日平移。
- 写路径：
  - 设备端 `skipTask`（engine 后端），先写任务 patch，再用 `updateMany` 把 Subtask 置回 ACTIVE；
  - REST 端 `TasksService.skip` 与 `POST /tasks/:id/skip`，不可跳过时返回 409，message 即原因；REST 客户端把 409 还原成 `RepeatSkipBlockedError`，两种模式抛同一种错误；
  - `TaskBackend.skipTask` 与 `useSkipTask`：不做乐观更新，因为目标日期取决于规则与账号时区。
- UI：`MenuRow` 新增 `disabled` / `title`（用 aria-disabled 而不是原生 disabled，原生 disabled 按钮不显示 title）。右键 / 长按菜单在「重复」下方新增「跳过本次」；成功后 toast 提示「已跳到 X」。
- 与 spec 的差异：「下一次已存在」只有查询数据才知道，菜单在打开时不查，而是由数据层拒绝后 toast「下一次已存在，无法跳过」。只有「已到最后一次」这种仅凭规则就能判断的情况，会在菜单里直接显示为禁用。
- CONTEXT.md 已新增 Skip Occurrence 词条。
- 测试：
  - engine：`skipOccurrenceDate` 覆盖未来 / 今天 / 逾期多轮 / 周模式对齐 / 月末钳制 / completion 锚点 / until / 账号时区；`planRepeatSkip` 覆盖平移与各不可用条件；
  - api：逾期多轮落到今天、截止日平移、Subtask 重置、不新建实体、各不可用条件、与另一设备完成并发时的合并结果；
  - backend e2e：skip 写入与日志、409 / 404；
  - ui：入口显隐、已到头时禁用。
- 验证：各包 typecheck 通过。engine 195、api 330、ui 332、backend 289（含真库 e2e）、desktop 51、mobile 71、frontend 16 个测试全部通过。尚未在真实应用里手动验证。
