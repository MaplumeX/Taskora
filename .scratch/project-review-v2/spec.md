# Feature: Review v2（回顾设置完善）

Status: ready-for-agent

在 `.scratch/project-review/spec.md`（v1）的基础上完善回顾设置与回顾模式。v1 尚未合入 main，没有线上存量数据，本次直接修改 v1 的设计，不做数据迁移。术语见 `CONTEXT.md` 中的 **Review Interval**、**Default Review Interval**、**Next Review Date**、**Last Reviewed Date**、**Mark Reviewed**、**Postpone Review**、**Review Mode**。

## Problem Statement

v1 的回顾设置有以下几个问题：

- **所有对象共用一个默认间隔（每周）。** 区域也要每周回顾一次，回顾队列会被不需要常看的对象占满。
- **不知道上次是什么时候回顾的。** 系统没有记录这个信息，回顾时看不出一个对象已经多久没人看了。
- **标记已回顾从今天起算。** v1 里下次回顾日是「今天 + 间隔」，手动定好的节奏（比如每月 15 号）会因为晚几天回顾而漂移。
- **只有「跳过」，没有「延后」。** 跳过之后对象仍然待回顾。想表达「一个月后再看」时，只能自己打开日历挑一个日期。
- **回顾模式的导航不顺手。** 「跳过」到最后一个就结束本轮；翻到最后一个先处理它，前面没处理的也会被一起结束掉。
- **「…」菜单里的回顾设置不合理。**
  - 它是一个对话框，里面放芯片，点芯片再弹出一层，前后共四层，与同一菜单里的「重复」「截止日期」点一下就弹出选择器不一致。
  - 对话框把设置（间隔）、排期状态（下次回顾日）和回顾动作（标记已回顾）混在一起。
  - 「标记已回顾」占着对话框主按钮的位置，看起来像「保存」，实际上会把下次回顾日推后。
  - 不打开对话框，就看不到当前的回顾设置。
- **间隔编辑器既有档位列表又有「数字 × 单位」，** 同一个值有两种选法，两边会同时高亮。

## Solution

**A. 默认间隔分项目、区域两档，只用于新建。**
- 账号偏好里的默认回顾间隔分两档：项目每周（含稍后项目），区域每月。
- 新建项目或区域时写入对应一档的值，之后间隔属于对象自己。修改默认值不影响已有对象。
- 没有「跟随默认」这种状态。

**B. 记录上次回顾日。**
- 标记已回顾时记下当天的日期。
- 回顾列表和回顾设置里显示「上次回顾：3 周前」，从未回顾过的显示「从未回顾」。
- 上次回顾日只用来显示，不参与排期。

**下次回顾日是锚点，间隔是每次标记已回顾时加上的量。**
- 标记已回顾：下次回顾日 = 原下次回顾日 + 间隔。例如下次回顾日为 11.1、每月回顾，标记后变为 12.1；如果之前手动改成 11.15，标记后变为 12.15。
- 加一次后仍不晚于今天（拖了很久才回顾），就继续加，直到晚于今天。例如 11.1 每月、12.3 才回顾，结果为 1.1。
- 修改间隔不改下次回顾日，新间隔从下一次标记已回顾起生效。

**C. 增加「延后」。**
- 回顾栏增加「延后」，可选明天、1 周后、1 个月后，或自己选日期。
- 延后只改下次回顾日，不算已回顾，然后自动去下一个未处理的对象。

**回顾模式的导航。**
- 上一个 / 下一个只在本轮快照里前后移动，不标记、不改日期；到头时上一个禁用，到尾时下一个禁用，不结束本轮。
- 标记已回顾、延后，或当前对象被了结 / 删除，都算「处理」。处理后去本轮下一个未处理的对象：先往后找，后面都处理过就从头找。本轮全部处理完才结束并回到列表。
- 进度只显示「3 / 12」。

**「…」菜单与回顾栏的回顾设置。**
- 去掉回顾设置对话框，改成菜单行「回顾」，右侧显示摘要，例如「每周 · 10月15日」。
- 点击后弹出回顾选择器，与「重复」「截止日期」的交互一致：
  - 回顾间隔：「每 [− N +] [天|周|月|年]」，与重复规则的间隔编辑同一套样式。
  - 下次回顾日：快捷选项（明天 / 1 周后 / 1 个月后）+ 日历。
  - 上次回顾日（只读）。
- 选择器里**不提供**「标记已回顾」。标记已回顾只在 Review 里进行（回顾栏，以及回顾列表行尾的快捷按钮）。
- 回顾栏上只有一个「回顾设置」按钮，点开就是这个选择器。

## User Stories

1. As a user, I want separate default review intervals for projects (weekly) and areas (monthly), so that areas don't flood my weekly review.
2. As a user, I want the defaults to only apply when a project or area is created, so that changing a default never silently changes existing ones.
3. As a user, I want Later Projects to use the project default, so that there is one less setting to think about.
4. As a user, I want the two defaults in Settings → General.
5. As a user, I want Mark Reviewed to record the last reviewed date, so that I can see how long it has been since I last looked.
6. As a user, I want to see "Last reviewed 3 weeks ago" / "Never reviewed" in the review list and the review picker, so that neglected objects stand out.
7. As a user, I want Mark Reviewed to add the interval to the current next review date (not to today), so that a date I picked by hand (e.g. the 15th) keeps its rhythm: 11.15 monthly → 12.15.
8. As a user who reviews very late, I want the interval added repeatedly until the date is after today, so that a just-reviewed object is never immediately due again.
9. As a user, I want changing the interval to leave the next review date alone, so that it only affects the next Mark Reviewed.
10. As a user, I want to Postpone the current object in review mode to tomorrow / in 1 week / in 1 month / a picked date, so that "look again later" is one action, not a calendar hunt.
11. As a user, I want Postpone not to count as reviewed, so that the last reviewed date stays honest.
12. As a desktop user, I want a customizable shortcut that opens the Postpone menu in review mode.
13. As a user, I want Previous / Next to just move through this round's list, disabled at either end, so that browsing never ends the round.
14. As a user, I want handling an object (mark reviewed, postpone, settle, delete) to take me to the next unhandled object, wrapping to the start, and the round to end only when everything is handled.
15. As a user, I want the round's queue to show only whether each object is done or not, with the current one highlighted.
16. As a user, I want the "…" menu to have a "Review" row showing the current interval and next review date, opening a picker like Repeat and Deadline do.
17. As a user, I want the review bar to have a single "Review Settings" button opening the same picker.
18. As a user, I want Mark Reviewed only inside Review, never in the review picker, so that a settings picker never pushes my schedule by accident.
19. As a user, I want a new Repeat Project Instance to inherit the source's interval and start as never reviewed.
20. As a user with several devices, I want the last reviewed date and the defaults to sync.

## Implementation Decisions

### 数据模型

- Project 和 Area 新增同步字段 `lastReviewedOn`：日历日，表示方式与 `nextReviewDate` 相同，参与字段级 LWW。
  - 同步改动 Engine 实体注册表（副本迁移 13 → 14）、Prisma schema（新迁移）、shared DTO（只在 response 中出现，客户端不能直接写入），由契约测试保证两端一致。
- `reviewInterval` 在新建时总写入明确值。为空只出现在存量或 hub 剔除的不合法数据上：读时按该对象类型的默认值计算，标记已回顾时补写。
- 账号偏好：`defaultReviewInterval` 换成 `defaultReviewIntervals: { project, area }`，初始为每周 / 每月；逐档规范化，不合法的档回退初始值。v1 未上线，旧键不做兼容。

### 领域规则（`packages/engine/src/domain/review.ts`，纯函数）

- **新建**（`planReviewSchedule(context, kind, input)`）：间隔取传入值，否则取 `defaults[kind]`；下次回顾日取传入值，否则为今天加间隔；`lastReviewedOn` 为空。
- **标记已回顾**（`planMarkReviewed`）：
  - 以当前下次回顾日为锚点（空则今天）加间隔；结果仍不晚于今天时继续加，直到晚于今天。
  - 加月或加年时逐次从锚点算第 k 个间隔（锚点 + k × 间隔），避免月末溢出后日期越来越小（1-31 → 2-28 → 3-28）。
  - `lastReviewedOn` 为今天；间隔为空时补写默认值。
- **修改间隔**：只改间隔，不动下次回顾日。
- **延后**：没有专门的领域函数，就是修改下次回顾日。
- **Repeat Project Instance 派生**：复制来源的间隔；`nextReviewDate` 为派生日加间隔；`lastReviewedOn` 为空。
- **Put Back 和了结**：不改动任何回顾字段。

### UI

- **回顾选择器** `ReviewPicker`：在 `ProjectContextMenu`（项目页「…」菜单）和 `AreaMoreMenu` 中作为选择器弹层使用；回顾栏的「回顾设置」按钮也打开它。
- **间隔编辑器** `ReviewIntervalEditor`：「每 [− N +] [天|周|月|年]」，改动即时生效；设置页的两档默认值也用它。
- **回顾栏**：进度「3 / 12」、回顾设置、上一个、下一个、延后 ▾、标记已回顾、退出。手机端底部工具栏为「上一个 / 下一个 / 延后 / 标记已回顾」。
- **本轮队列**（点进度展开）：只区分已处理（✓）和未处理（○），当前对象整行高亮；已了结或删除的对象不可点。
- **回顾列表**：每行显示上次回顾日；下一次回顾日只在列表为空时显示。
- **快捷键**：新增「延后」（打开延后菜单），默认 ⌥⌘L / Ctrl+Alt+L / Alt+Shift+L；「跳过」改名为「下一个」，键位 id 仍为 `reviewSkip`，用户自定义的键位不受影响。
- **设置 → 通用**：默认回顾间隔两行：项目、区域。

## Testing Decisions

主接缝与 v1 相同：api 层基于 Engine 的 project / area backend，使用 node-sqlite 内存 Engine、偏好 store 和假时钟。覆盖：

- 新建时按类型写入默认间隔（Someday 项目同项目），显式传入以传入为准。
- 改默认值只影响之后新建的对象。
- 标记已回顾：按原下次回顾日加间隔（11.1 → 12.1；手动改成 11.15 → 12.15）；拖延很久时反复加到晚于今天；月末锚点不漂移；存量数据以今天为锚点并补写间隔；记下上次回顾日。
- 修改间隔不改下次回顾日。
- Repeat Project Instance 派生后沿用间隔、从未回顾。
- 两台设备并发标记已回顾，同步后收敛。
- 偏好：`defaultReviewIntervals` 逐档规范化。
- hub：新建写入默认间隔、标记已回顾的锚点规则与上次回顾日、`lastReviewedOn` 经同步下发、不合法的 `reviewInterval` 被剔除。
- UI：回顾会话的导航（上一个 / 下一个到头到尾禁用、处理后去下一个未处理的、全部处理完才结束、队列状态）；回顾选择器（编辑间隔、快捷日期、不提供标记已回顾）；回顾栏的延后与回顾设置按钮。

## Out of Scope

- 继承式的间隔（跟随默认、项目跟随所属区域）
- 回顾历史：只保留最近一次回顾日
- 批量修改多个对象的回顾设置
- 在项目页或区域页常驻显示回顾信息
- 在 Review 之外（如「…」菜单）标记已回顾

## Further Notes

- 「延后」和「下一个」的区别：下一个不改任何数据，对象下次进入回顾时还会出现；延后会改写下次回顾日。
- 这里改变了 v1 的规则：v1 是「今天 + 间隔，错过多久都从今天重新计」，v2 改为以下次回顾日为锚点，保住用户定下的日期节奏。
- 延后和手动改日期都会移动锚点，之后的标记已回顾从新日期起加。
