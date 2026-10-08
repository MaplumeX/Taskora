# Feature: Review（回顾）

Status: ready-for-agent

参考 OmniFocus 的 Review，给 Project 和 Area 加上定期回顾。Things 3 没有这个功能，这里是有意的偏离。术语见 `CONTEXT.md` 中的 **Review**、**Review Interval**、**Next Review Date**、**Mark Reviewed**、**Review Mode**。

## Problem Statement

项目一多就会被遗忘，尤其是放到 Someday 或计划在未来的 Later Project：它们不在侧边栏显眼的位置，也不进汇总视图，时间一长就再也没人看。活跃项目也可能悄悄卡住：手上的任务做完了，下一步却一直没写下来，项目还挂在那里，但已经不再推进。现在没有任何机制提醒用户定期把每个项目和 Area 拿出来看一遍。

## Solution

每个 Project 和 Area 都有一个**回顾间隔**（比如每周）和一个**下次回顾日**。下次回顾日到了，对象就变成「待回顾」。侧边栏在 Logbook 前面新增一个 Review 入口，和 Logbook、Trash 同组，并显示待回顾的数量。点进去直接开始**回顾模式**：一次显示一个对象的完整、可编辑页面，顶部有一条回顾栏，可以「标记已回顾」（下次回顾日变为今天加间隔，并自动进入下一个）、「跳过」或「上一个」。过完所有对象后显示空状态和下一次回顾的日期。平时可以在项目页或 Area 页的「…」菜单里调整回顾设置。手机端有同样的入口和流程。

## User Stories

1. As a user, I want every Area and every unsettled, non-trashed Project to have a review schedule, so that nothing I'm responsible for silently falls off my radar.
2. As a user, I want Later Projects (scheduled in the future or Someday) to be reviewed too, so that dormant projects get periodically reconsidered for activation or cancellation.
3. As a user, I want settled and trashed projects excluded from review, so that the review only contains things that still matter.
4. As a user, I want to set a review interval per Project / Area as N × day / week / month / year, so that busy projects are reviewed weekly and slow ones monthly or yearly.
5. As a user, I want quick presets (weekly, every 2 weeks, monthly, quarterly, yearly) when setting the interval, so that the common case is one tap.
6. As a user, I want an account-level default review interval (initially 1 week), so that new projects and areas get a sensible schedule without me thinking about it.
7. As a user, I want a newly created Project / Area to be first due on its creation date plus its interval, so that I'm not asked to review something I just made.
8. As a user, I want Mark Reviewed to set the next review date to today plus the interval, so that the schedule measures "time since I last looked" even if I reviewed late.
9. As a user, I want to edit the next review date directly, so that I can say "look at this one again next month" regardless of the interval.
10. As a user, I want changing the interval not to rewrite the next review date, so that the new interval simply applies from my next Mark Reviewed.
11. As a user, I cannot turn review off for an object, so that the "forgotten project" problem can't creep back; I can set a long interval instead.
12. As a user upgrading to this version, I want all my existing projects and areas due today, so that my first review session catches everything that has been forgotten.
13. As a user with a repeating project, I want the next Repeat Project Instance to keep the source's review interval and start its schedule fresh from the derivation date, so that each round is reviewed on the same cadence.
14. As a desktop / web user, I want a Review entry in the sidebar right before Logbook, in the Logbook / Trash group, showing the number of due objects, so that I can see at a glance when a review is due.
15. As a user, I want the Review entry always visible but showing no count when nothing is due, so that it's discoverable without nagging.
16. As a mobile user, I want the same Review entry on the home screen, so that I can review during spare moments.
17. As a user, I want clicking Review to start the review immediately at the first due object, so that the review is one click away.
18. As a user, I want the queue ordered by next review date (earliest first), ties broken by sidebar order, so that the most overdue items come first and same-day items flow in a familiar order.
19. As a user, I want each review step to show the full, editable Project / Area page, so that I can add a next action, reschedule or settle right there.
20. As a user, I want a review bar on each step showing progress (e.g. 3 / 12), the interval and next review date (both editable), and Mark Reviewed / Skip / Previous / Exit, so that the review is driven from one place.
21. As a user, I want Mark Reviewed to advance to the next object automatically, so that I can move through the queue quickly.
22. As a user, I want Skip to move on without marking, leaving the object due, so that I can postpone a hard one to the next session.
23. As a user, I want completing, cancelling or trashing the current project (or deleting the current area) during review to advance to the next object automatically, without needing Mark Reviewed.
24. As a user, I want the queue to be a snapshot taken when I start, so that objects that become due mid-session don't shift the list under me.
25. As a user, I want refreshing or re-entering Review to rebuild the queue from what's currently due, so that marked objects are gone and skipped ones come back.
26. As a user, I want an empty state saying nothing is due, along with the next upcoming review date and how many are due then, both when there's nothing to review and after I finish the last one.
27. As a desktop user, I want keyboard shortcuts for Mark Reviewed & next, Skip and Previous, customizable in the keybinding settings, so that I can review without the mouse.
28. As a mobile user, I want progress and dates at the top and Previous / Skip / Mark Reviewed in a bottom toolbar, with the system back gesture exiting review, so that the flow works one-handed.
29. As a user, I want a "Review settings" entry in the Project / Area "…" menu (interval, next review date, Mark Reviewed), so that I can adjust or mark outside a review session.
30. As a user, I want no review information cluttering project and area pages outside review mode, so that day-to-day views stay clean.
31. As a user with several devices, I want review schedules and Mark Reviewed to sync, so that what I reviewed on my phone isn't due again on my desktop.
32. As a user, I want a project put back from Trash to keep its review schedule, so that putting back doesn't reset or lose it.

## Implementation Decisions

### 数据模型（Engine 和 hub）

- Project 和 Area 都新增两个同步字段，都是普通字段，参与字段级 LWW：
  - `reviewInterval`：JSON 文本 `{ unit: 'day' | 'week' | 'month' | 'year', count: number }`，`count` 为不小于 1 的整数。
  - `nextReviewDate`：日历日，表示方式与 `scheduledDate` 相同（ADR 0013，账号时区的日历日）。
- 两端同步改动：Engine 实体注册表、Prisma schema 和迁移、shared DTO（create / update / response），由契约测试保证两端一致。
- 存量数据的语义：
  - `nextReviewDate` 为空，视为「今天待回顾」。这样存量数据不需要在迁移时算日期（实现「上线当天全部待回顾」）。
  - `reviewInterval` 为空，按账号偏好的默认回顾间隔计算。
  - 新建的对象和标记已回顾过的对象，总是写入明确的值。
- hub 端校验：`reviewInterval` 的结构不合法（单位不在白名单内、`count` 不是不小于 1 的整数）时剔除，并以必胜时钟下发空值，按默认间隔处理；`nextReviewDate` 的处理方式同其他日期字段。
- 账号偏好新增 `defaultReviewInterval`，结构与 `reviewInterval` 相同，初始为 1 周，经账号偏好跨端同步。规范化方式同 `weekStartsOn`：不合法时回退默认值。

### 领域规则（engine domain，纯函数）

- **待回顾判定**：
  - Area：没有任何排除条件。
  - Project：未了结（status 为 ACTIVE）且未进 Trash。
  - 满足上述条件，并且 `nextReviewDate` 为空或不晚于账号时区的今天，即为待回顾。
- **回顾队列**：所有待回顾的 Project 和 Area 混在一起，先按 `nextReviewDate` 升序排（空值视为今天），同一天的按侧边栏的全局视觉顺序排（项目紧跟在所属 Area 之后）。复用 Move Picker 用的那份「与侧边栏同序的扁平父级顺序」推导（目前在 ui 包的 grouped feed 布局里，需要时下沉到共享层），不要另写一份排序。
- **待回顾数**：等于回顾队列的长度。
- **创建**：`planProjectCreate` 和 Area 的创建计划写入 `reviewInterval`（等于账号默认间隔）和 `nextReviewDate`（等于账号时区的今天加间隔），调用方显式传入时以传入值为准。
- **标记已回顾**：新增一个计划函数，生成 patch：`nextReviewDate` 为账号时区的今天加有效间隔（自身间隔，没有就用默认间隔）；间隔为空时同时写入默认间隔，固化下来。
  - 加月或加年时，如果遇到月末溢出，取目标月的最后一天，与 Repeat Rule 的月份推算保持一致。
- **改间隔**：只改 `reviewInterval`，不动 `nextReviewDate`。
- **Repeat Project Instance 派生**：复制 `reviewInterval`；`nextReviewDate` 为派生日（账号时区的今天）加间隔。
- **Put Back 和了结**：都不改动回顾字段。

### api 层

- project backend 和 area backend（Engine 版）对外提供：标记已回顾、更新回顾设置（复用现有的 update）、回顾队列和待回顾数的 live query。
- 回顾队列的 live query 返回一个有序列表，元素为 `{ kind: 'project' | 'area', id }`，并附带「下一次回顾日以及当天的数量」，供空状态显示。

### UI

- **路由**：Review 有自己的路由，当前对象由路由参数表示。
  - 队列快照保存在本次访问的内存里，不持久化，也不同步。
  - 刷新页面或重新进入 Review 时，按当时的待回顾集合重新生成快照，从第一个开始。
- **侧边栏**：Review 入口放在 Logbook 之前，和 Logbook、Trash 同组，显示待回顾数，为 0 时不显示数字。
- **手机首页**：在对应位置放一个 Review 入口。
- **回顾模式**：
  - 每一步复用现有的项目页和 Area 页，外面套一条回顾栏，包含进度、间隔和下次回顾日（可编辑）、标记已回顾、跳过、上一个、退出。
  - 当前对象被标记已回顾、了结、进 Trash 或删除之后，自动前进到快照里的下一个。
  - 「上一个」可以回到已经标记过的对象。
  - 走到快照末尾时，进入空状态页。
- **手机端布局**：顶部显示进度和日期，底部工具栏放「上一个 / 跳过 / 标记已回顾」，系统返回键退出回顾模式。
- **「…」菜单**：项目页和 Area 页的「…」菜单新增「回顾设置」对话框，内容为间隔（数字加单位，附常用档位）、下次回顾日（日期选择）、标记已回顾。
  - 平时页面上不显示任何回顾信息。
- **快捷键**：桌面端在快捷键注册表（ADR 0004 / 0017）里注册「标记已回顾并进入下一个」「跳过」「上一个」三个快捷键，只在回顾模式下生效，默认绑定挑选与现有绑定不冲突的键。
- **i18n**：中文和英文文案都要补齐。

## Testing Decisions

- 好的测试只验证外部行为：通过公开接口操作，再断言可观察的结果，比如待回顾数、队列顺序、字段的值；不断言内部的实现结构。
- **主接缝：api 层基于 Engine 的 project / area backend**。用 node-sqlite 内存 Engine，配合偏好 store（时区、默认回顾间隔）和假时钟。可以参考 `project-repeat.engine.test.ts` 和 `domain-backends.engine.test.ts`。覆盖以下内容：
  - 新建 Project 和 Area 时的回顾间隔和下次回顾日
  - 标记已回顾后下次回顾日为今天加间隔，晚了才回顾的情况也一样
  - 加月时的月末溢出
  - 修改间隔不改写下次回顾日
  - 待回顾判定：包含 Later Project，排除已了结和 Trash 里的项目，Area 始终参与
  - 存量数据（两个字段都为空）当作今天待回顾，且按默认间隔计算
  - 队列排序：按日期，同一天按侧边栏顺序
  - 待回顾数，以及空状态需要的「下一次回顾日和数量」
  - 派生 Repeat Project Instance 后的回顾字段
  - Put Back 之后回顾字段保持不变
  - 两台设备并发标记已回顾，同步后收敛
- **hub 端**：沿用现有的 backend e2e 方式（参考 rest-writes 系列），验证新字段能经 REST 和同步写入，并验证 `reviewInterval` 不合法时会被剔除。
- **偏好**：参照 `preferences.test.ts`，覆盖 `defaultReviewInterval` 的规范化。
- **回顾模式的 UI**：用组件测试覆盖快照生成、前进、跳过、上一个、当前对象了结或删除后自动前进，以及空状态。快照和导航逻辑写成可以单独测试的 hook 或纯函数。

## Out of Scope

- 项目「没有可立即开始的任务」这类卡住提示
- 待回顾的系统通知
- Assistant 读取或设置回顾相关字段、执行标记已回顾的工具
- 回顾总览页（进入 Review 就直接开始逐个回顾）
- Task 级别的回顾，以及 Inbox、Someday 等 Bucket 的 GTD 式回顾检查清单
- 关闭某个对象的回顾
- 持久化回顾会话，或在多台设备间同步回顾进度

## Further Notes

- `todayReviewedOn`（New in Today 用的「已看 Today 日期」）与本功能无关，命名和文案都要避开混淆。
- 下次回顾日没有逾期的语义，不使用红色警示色（红色专属于 Deadline）。
- 上线当天所有存量对象都会变成待回顾，这是有意的设计：借这次完整回顾把被遗忘的东西捞出来。
