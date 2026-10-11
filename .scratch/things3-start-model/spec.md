# Feature: 底层对齐 Things 3 —— Start + 计划日期取代 Bucket + ScheduledType

Status: implemented — UI 待目视验收

## Problem Statement

Things 3 的数据库里，每个 to-do 只有一个三态字段 `start`（Inbox / Anytime / Someday）加一个可选的开始日期，所有列表都是这两个字段的过滤。Taskora 存了两个互相重叠的字段：`bucket`（INBOX / ANYTIME / SCHEDULED）和 `scheduledType`（NONE / DATE / SOMEDAY）。结果是：

1. **Anytime 不含今天的任务**：Anytime 要求 `scheduledType = NONE`，计划日期为今天或已过的任务不出现；CONTEXT 却写着「Anytime 行上以黄色星星标记今天」，文档与实现矛盾。Things 的 Today 是 Anytime 的子集。
2. **SCHEDULED 不是 Things 的概念**：DATE 和 SOMEDAY 被并成一个 bucket，日期过了也一直留在 SCHEDULED，只能靠「日期已过按今天对待」打补丁。
3. **bucket 基本冗余**：它几乎完全由 `scheduledType` 和归属推导，唯一独立的信息是无归属任务在 Inbox 还是 Anytime；为保持一致还要 `repairEntity` 修。
4. **清除计划的去向不对**：无归属任务清除计划后回到 Inbox；Things 的 Clear 把任务放进 Anytime。

## 模型决策

见 ADR 0024。

- Task / Project：`start ∈ {INBOX, ANYTIME, SOMEDAY}` + `scheduledDate`（日历日，可空）。删除 `bucket`、`scheduledType` 和枚举 `TaskBucket`、`ProjectBucket`、`ScheduledType`；新增 `TaskStart`。
- 不变量：有日期 ⇒ `start = ANYTIME`；INBOX ⇒ 无项目、无区域、无日期；Project 不取 INBOX；提醒、重复规则只依附日期。
- 视图：Inbox = `start=INBOX`；Anytime = `start=ANYTIME` 且（无日期或日期 ≤ 今天），去掉稍后项目内的任务；Today 不变；Upcoming = 日期 > 今天；Someday = `start=SOMEDAY`。
- 写入：设日期 → ANYTIME；Someday → SOMEDAY 并清日期；Clear → ANYTIME 并清日期；移入 Inbox → INBOX 并清归属和计划（保留截止日期）；Inbox 任务获得归属 → ANYTIME。

## 「是否有计划」的写法

代码里旧的判断按下表改写：

| 旧                                              | 新                                            |
| ----------------------------------------------- | --------------------------------------------- |
| `scheduledType === DATE`                        | `scheduledDate != null`                       |
| `scheduledType === SOMEDAY`                     | `start === SOMEDAY`                           |
| `scheduledType === NONE`                        | `start !== SOMEDAY && scheduledDate == null`  |
| `bucket === INBOX`                              | `start === INBOX`                             |
| `bucket === ANYTIME`（NONE）                    | `start === ANYTIME && scheduledDate == null`  |
| DTO `{ scheduledType: DATE, scheduledDate: d }` | `{ start: ANYTIME, scheduledDate: d }`        |
| DTO `{ scheduledType: SOMEDAY }`                | `{ start: SOMEDAY }`（domain 清除日期）       |
| DTO `{ scheduledType: NONE }`（清除）           | `{ start: ANYTIME, scheduledDate: null }`     |
| DTO `{ bucket: INBOX }`（移入 Inbox）           | `{ start: INBOX }`（domain 负责清归属和计划） |

## 同步与迁移

- 协议 7，hub 最低协议升到 7。
- hub Prisma 迁移与副本迁移规则逐字相同：SOMEDAY → SOMEDAY；DATE → ANYTIME；NONE → 无归属且 bucket 为 INBOX 时 INBOX，否则 ANYTIME；项目除 SOMEDAY 外都是 ANYTIME。`start` 的时钟取旧 `bucket` / `scheduledType` 时钟中较大者。DATE 但无日期的行 → ANYTIME 无日期。
- Outbox 逐条改写；副本记下「需要一次 bootstrap」，连上协议 7 的 hub 后重取一次。

## Out of Scope

- This Evening。
- Anytime 视图里的项目行（仍不显示项目行，按项目分组的组头不变）。
