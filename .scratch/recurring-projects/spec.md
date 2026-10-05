# Feature: Repeating Projects（重复项目）

Status: implemented

前作：`.scratch/recurring-tasks/spec.md`（v1）、`.scratch/recurring-tasks-v2/spec.md`、ADR-0012。

## Problem Statement

很多周期性工作不是一个任务而是一整份清单：「每月结账」要对账、开发票、报税；「每周复盘」有固定的几步。重复任务只能重复单个 Task，用户只能每轮手动重建整个项目。v1 spec 把「Repeating Projects」列为 Out of Scope，CONTEXT.md 也写着「Project 不设 Repeat Rule」，这次把它补上。

## Solution

把重复任务的模型原样延伸到 Project：Project 上新增 `repeatRule` 字段（同一结构）与 `repeatSourceId`。完成带规则的项目时，完成的一端派生下一个 **Repeat Project Instance**——项目本身连同 Headings、任务、Subtask 整份复制，全部重置为未完成，日期按项目计划日期的位移平移（对齐 Things 3：重复项目是一份每轮重来的清单）。沿用 ADR-0012 的确定性 id 与 `repeatSourceId` 幂等，hub 合并逻辑零改动。

同时补上 Things 3 的「完成项目时处理剩余任务」：完成一个仍有未了结任务的项目时，询问把剩余任务标记为完成还是取消。

## User Stories

1. 作为用户，我想给一个有计划日期的项目设重复规则，每轮自动得到一份新的清单。
2. 作为用户，完成重复项目后，我希望下一轮项目立刻出现：同样的标题、备注、标签、区域、Headings 和全部任务（包括这一轮已经做完的），全部是未完成。
3. 作为用户，项目里任务各自的计划日期 / 截止日期在下一轮按同样的天数后移，保持相对节奏。
4. 作为用户，项目上的 ↻ 标记让我一眼认出重复项目。
5. 作为用户，我想对重复项目「跳过本次」：项目（及其中未了结任务的日期）挪到下一次，不产生新项目。
6. 作为用户，项目移入 Someday 或去掉计划日期时规则自动清除。
7. 作为用户，完成仍有未了结任务的项目时，我希望被问到把剩余任务标记为完成还是取消（Things 3 行为）。
8. 作为多设备用户，两台离线设备同时完成同一个重复项目，同步后只有一个下一轮项目，里面的任务也不会重复。

## Implementation Decisions

### 领域模型

- `Project.repeatRule`：与 Task 同一 `RepeatRule` 结构，写入时规范化；仅 ScheduledType=DATE 可设，离开 DATE 清除（写路径 planProjectUpdate + 合并后修复 repairEntity 同一规则）。
- `Project.repeatSourceId`：派生出本项目的来源项目 id；普通项目为 null。无外键。
- 改规则只影响本项目及其后代，链自然分叉；取消不存在（项目没有取消态），链在规则到达 until、离开 DATE 时终结。
- 已完成的项目保留规则（Logbook 溯源）；Trash 与规则正交。

### 派生（`planRepeatProjectInstance`，engine domain）

- 时机：项目被完成（ACTIVE → COMPLETED）时；已完成的再次完成不派生。
- 出现日：`nextOccurrenceDate`，与任务同一口径（anchor=scheduled 从计划日期推；anchor=completion 从完成时刻推）。
- 位移 `delta = 出现日 - 来源计划日`（天）。
- **项目**：标题、备注、标签、区域、规则复制；计划日期 = 出现日；截止日期 + delta；`repeatSourceId` = 来源项目；`feedPosition` 不继承；侧边栏位次紧跟来源项目之后。
- **Headings**：全部复制（含已归档的），重置为 ACTIVE，保留顺序位次。
- **任务**：来源项目内所有未进 Trash 的任务（不论完成、取消、未了结）——Things 3 的「模板」语义：这一轮里做完或放弃了，不代表下一轮不做；进 Trash 才表示从清单里删掉。
  - 排除「项目内重复链的后代」：`repeatSourceId` 指向同项目内另一任务的任务。否则一个每日重复的任务在一周的项目里留下的 7 个实例会全部被复制；只复制链的源头，下一轮重新起链。
  - 重置为 ACTIVE（了结时间清空）；`repeatSourceId` 清空（是项目副本，不是任务的重复实例）；标题、备注、标签、提醒时刻、规则、计划类型复制；计划日期、截止日期 + delta；分组映射到新分组；Bucket 按归属与计划类型重新推导；位次沿用。
- **Subtask**：随任务复制，全部重置为未完成。
- **确定性 id**：项目 id = `hash('repeat-project', 来源项目 id, 规范规则, 出现日)`；子实体 id = `hash('repeat-copy', 新项目 id, 实体种类, 来源实体 id)`。按来源 id 而非序号派生：两端数据有尚未同步的差异时，相同来源仍得到相同 id，不会错位。
- **落地决策**：沿用 `repeatDerivationTarget`（项目版：按 `repeatSourceId` 查已有实例、确定性 id 的现状）。fresh 时项目换新 id，子实体 id 由新项目 id 派生，自然全新。
- 两端（设备 Engine 后端与 REST `ProjectsService.complete`）共用同一纯函数，各自只读、写。

### 完成时处理剩余任务

- `completeProject(id, { settleRemaining?: 'completed' | 'cancelled' })`：给出时，项目内未了结、未进 Trash 的任务一并了结（同一了结时间、清除提醒）。**不触发任务自身的重复派生**——派生实例会落进一个已完成的项目（同 planHeadingArchive 的口径）。未给出时不动任务（助手与旧客户端的行为不变）。
- 派生基于「了结剩余任务之前」的来源状态；但由于任务复制不看状态，两种选择得到的下一轮相同。
- UI：项目仍有未了结任务时，所有「完成项目」入口先弹确认框：「完成剩余任务」/「取消剩余任务」/ 返回。没有剩余任务时直接完成。
- 重开项目（取消完成）只重开项目本身；已了结的任务与已派生的下一轮都不动（与任务重开同一原则）。

### 跳过本次（`planProjectRepeatSkip`）

- 项目按 `planRepeatSkip` 同一规则推进计划日期，截止日期同步平移；不可用条件相同（not-repeating / not-active / no-next / next-exists）。
- 项目内未了结、未进 Trash 的任务：计划日期（DATE）与截止日期按同一 delta 平移。已了结的任务不动（不复活，避免把这一轮的重复实例一起复活）。
- REST：`POST /projects/:id/skip`，不可跳过 → 409。
- 入口：项目右键菜单 / 更多菜单，紧邻「重复」。

### 存储与同步

- engine 副本迁移 9 → 10：`project.repeatRule TEXT`、`project.repeatSourceId TEXT`。Prisma 迁移同名列 + `repeatSourceId` 索引。sync codec 把 project 的 `repeatRule` 列入 JSON 字段；DTO / 事件 / feed 下发解析后的规则对象。
- 旧客户端忽略新字段（字段级 LWW，不会覆盖）。

### UI

- 项目菜单（右键 / 更多）：「重复」入口（仅 DATE 项目）复用 `RepeatRuleField`；「跳过本次」。
- ↻ 标记：项目 feed 行、侧边栏项目行、项目页标题旁。

## Out of Scope

- 项目的下次预告（Repeat Preview）。
- 助手设置项目重复规则 / 跳过。
- Things 3 的「模板」实体、按日程（不等完成）生成实例。
- 截止日期偏移规则（Things 的 Add deadlines / days earlier）。

## Glossary（已并入 CONTEXT.md）

- **Repeat Rule**：Task 或 Project 上的规则字段。
- **Repeat Project Instance（重复项目实例）**：完成重复项目时派生出的下一轮项目，带着 Headings、任务、Subtask 的整份副本，全部未完成。
