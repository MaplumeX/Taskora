# Task Cancelled（任务取消态）Spec

Status: ready-for-agent

任务获得与 Completed 对称的第二种终态：Cancelled（主动放弃）。留痕、可逆、进 Logbook；与 Trash（软删除）正交。领域术语见 `CONTEXT.md`（Cancelled / Settled / Task Terminal State / Logbook Entry）。

## Problem Statement

Taskora 的任务只有两种结局：完成（Completed）或删除（Trash）。但真实生活中大量任务属于第三种结局——**主动放弃**："决定不学日语了"、"这个方案被否了"。当前用户只能把这类任务删进 Trash（丢失记录）或假装修完（污染完成记录）：

- 放弃的任务进了 Trash，30 天后彻底消失，"我当时为什么放弃"的决策历史无处可查
- 假装完成会让 Logbook 里的记录失真——它看起来像"做完了"，未来回顾时误导自己
- 取消的任务没有任何 UI 入口表达"这事我决定不做了"

## Solution

引入 Things 风格的取消态：

1. Task 与 Subtask 支持 `CANCELLED` 终态：与 `ACTIVE`/`COMPLETED` 同级，留痕、可逆
2. Logbook 从"已完成任务的档案"升格为"**已了结（Settled）任务的档案**"：完成的与取消的任务都进 Logbook，按了结日期（今天/昨天/更早）分组
3. 取消的任务在 Logbook 中以实心圆 + X 图标（与完成的实心圆 ✓ 同构，仅色调弱化）+ 标题删除线 + 弱化样式与完成任务区分
4. 全入口支持：键盘快捷键（⌥⌘K / Ctrl+Alt+K / Alt+Shift+K，预注册于 `docs/keyboard-shortcuts.md`）、右键菜单、Agent 工具
5. 多端实时同步：另一端正在看的 Today/Anytime 列表中，被取消的任务即时消失，Logbook 即时出现

## User Stories

### 终态操作

1. As a 用户, I want 把一条任务标记为取消, so that 表达"这件事我决定不做了"而不必删除它
2. As a 用户, I want 取消一条已完成的任务, so that 手滑点错完成时能直接改成取消而不必先重开
3. As a 用户, I want 完成一条已取消的任务, so that 改变主意"其实还是做完了"时能直接改写终态
4. As a 用户, I want 撤销取消（uncancel）让任务回到 ACTIVE, so that 放弃的决定可以反悔
5. As a 用户, I want 撤销取消后任务回到它原来所在的视图, so that 反悔的任务不会丢失位置

### 键盘

6. As a macOS 桌面用户, I want 选中任务后按 ⌥⌘K 取消它, so that 用 Things 的肌肉记忆完成取消
7. As a Windows 桌面用户, I want 选中任务后按 Ctrl+Alt+K 取消它, so that 享有与 macOS 用户相同的能力
8. As a Web 端用户, I want 选中任务后按 Alt+Shift+K 取消它, so that 浏览器占用 Ctrl+Alt 组合的情况下我仍有取消快捷键
9. As a 效率型用户, I want 键盘取消后 Selection 行为与完成（⌘K）一致, so that 两者的操作手感完全对称、无需重新学习
10. As a 效率型用户, I want 在 Logbook 中选中一条取消的任务按 ⌘K（重开）撤销取消, so that 撤销取消与撤销完成用同一个键

### Logbook 呈现

11. As a 用户, I want Logbook 中出现我取消的任务, so that 放弃的决定留有档案
12. As a 用户, I want 取消的任务在 Logbook 中显示 X 图标而完成显示 ✓, so that 扫一眼就能分清"做完的"和"放弃的"
13. As a 用户, I want 取消的任务标题带删除线并弱化显示, so that 视觉上与完成任务有明确的层次区分
14. As a 用户, I want 取消的任务与完成的任务一样按了结日期分到今天/昨天/更早组, so that 时间线保持连贯
15. As a 用户, I want 在 Logbook 中点击取消的任务行展开并撤销取消, so that 恢复入口与完成任务一致

### 视图语义

16. As a 用户, I want 取消的任务立即从 Today/Anytime/Someday/Inbox 等活跃视图中消失, so that 放弃的事不再骚扰我
17. As a 用户, I want 项目内取消的任务不再计入未完成计数, so that 项目进度不被放弃的任务扭曲
18. As a 用户, I want 搜索（⌘F）能搜到取消的任务（当搜索包含已了结项时）, so that 取消 ≠ 丢失
19. As a 用户, I want Trash 里的取消任务被恢复后回到 ACTIVE, so that "从垃圾桶捡回"语义始终是"未了结"

### Subtask

20. As a 用户, I want 取消一条 Subtask（右键菜单）, so that 子步骤也可以被放弃且同样留痕
21. As a 用户, I want 取消父 Task 不自动改动其 Subtasks, so that 父任务的结局与子步骤状态互不强制
22. As a 用户, I want Subtask 勾选框点击仍只管完成/重开, so that 取消不会因误触勾选框而发生

### Agent（助手）

23. As a 助手用户, I want 让助手"取消这条任务", so that 对话式操作覆盖全部终态
24. As a 助手用户, I want 助手取消任务不需要批准卡片, so that 取消（可逆、非 Destructive）比删除更顺畅
25. As a 助手用户, I want 助手能列出取消的任务（查询包含已了结项时）, so that "我上个月放弃了什么"可以问助手
26. As a 助手用户, I want 助手能撤销取消, so that 反悔也走对话

### 多端同步

27. As a 多设备用户, I want 在 A 端取消任务后 B 端的活跃视图立即移除它, so that 多端状态一致
28. As a 多设备用户, I want 在 A 端取消任务后 B 端的 Logbook 立即出现该任务, so that 不必手动刷新就能看到档案更新
29. As a 多设备用户, I want 撤销取消同样实时同步回所有端, so that 反悔也不产生多端分歧

## Implementation Decisions

### 领域模型

- `TaskStatus` 增加 `CANCELLED`（Task 与 Subtask 共用同一枚举）。终态语义：`ACTIVE`（进行中）、`COMPLETED`（做完的了结）、`CANCELLED`（放弃的了结）。
- **了结时间采用单一 `settledAt` 列**（替换现有 `completedAt` 列）：status 已表达"怎么了的结"，时间戳只需记录"何时了结"，不引入"两列至多一个非空"的不变量维护负担。该决策难逆转且是真实取舍，**须以 ADR 记录**（见 Testing Decisions 后的行动项）。
- 终态转换规则：三个状态间任意直接改写（complete↔cancel 直接切换，更新 `settledAt`），reopen（uncomplete/uncancel）统一回 `ACTIVE` 并清空 `settledAt`。不设"必须先重开"的中间态。
- 取消父 Task 不改动其 Subtasks 的状态（与现有 complete 行为一致）。
- Trash 与终态正交：Trash 恢复后任务回 `ACTIVE`（沿用现有恢复语义）。

### API 契约

- 新增对称端点：`POST /tasks/:id/cancel`、`POST /tasks/:id/uncancel`、`POST /subtasks/:id/cancel`、`POST /subtasks/:id/uncancel`，与现有 complete/uncomplete 完全同构（同一 controller/service 分层模式、同一 Change Event 拦截器自动发 update 事件）。
- Task/Subtask 响应 DTO 的 `completedAt` 字段语义变为"了结时间（settledAt）"，字段名暂不改（前端兼容优先），文档注明其承载 Settled At 语义。
- FeedItem 聚合时 `settledAt = completedAt ?? cancelledAt` 的统一口径由单一 `settledAt` 列天然满足；下发继续放在现有字段位。

### 查询口径（全库白名单化审计）

- 现有 `in: [ACTIVE, COMPLETED]` 的"包含已完成"查询扩为三值白名单 `in: [ACTIVE, COMPLETED, CANCELLED]`，涉及 Task 搜索、Agent `list_tasks` 等所有 `completed=true` 语义的查询路径。
- Logbook feed 查询从 `status = COMPLETED` 扩为 `in: [COMPLETED, CANCELLED]`，排序按了结时间。
- 项目任务统计（total/completed 计数）口径：completed 计数扩为"已了结"（完成+取消），或保持仅完成——按现有 feed 统计代码的最小改动语义对齐，实现时以"Logbook Entry 口径一致"为验收。
- 前端 `task-query-match` 纯函数与后端口径逐一对齐：活跃视图要求 `status === ACTIVE`；`completed=true`（含已了结）路径必须与后端返回的集合一致，杜绝"事件 upsert 进缓存、服务端刷新又不在"的口径漂移。
- 全库审计规则：status 比较只允许白名单式（`=== ACTIVE` / `in: [...]` 显式枚举），禁止黑名单式（`!= COMPLETED` / `not:`）。

### UI / 键盘

- 快捷键按 `docs/keyboard-shortcuts.md` 预注册执行：macOS 桌面 ⌥⌘K、Windows 桌面 Ctrl+Alt+K、Web Alt+Shift+K；通过现有 keymap registry（见 ADR 0004）注册，与 `complete` 动作同型派发到当前 Selection。
- 键盘取消后 Selection 的移动行为与 complete 完全一致。
- Logbook 行样式：取消态与完成态同构的实心圆勾选框，行首 X（对照完成的 ✓）、标题删除线、颜色弱化。
- 右键菜单（Task 与 Subtask）增加"取消 / 撤销取消"项，随当前终态切换文案。
- Subtask 的勾选框交互不变（仅完成/重开），取消只走右键菜单。
- 撤销取消入口与撤销完成一致（Logbook 点行展开重开 / ⌘K）。

### Agent 工具

- 不新增工具。`update_task` 增加取消参数（与现有 complete/uncomplete 参数并列同型），`complete_subtask` 同理扩展。
- Agent 工具的 `includeCompleted` 类参数**名称不变**，description 更新为明确包含 cancelled tasks（"include completed and cancelled tasks"），避免破坏 Agent 工具 schema 兼容。
- 取消不属于 Destructive Operation（可逆、不动结构），不进批准卡片流程。

### 事件同步

- 复用现有 Change Event 机制：cancel/uncancel 走既有 update 动作，实体完整下发，无需新增事件类型。
- 前端各活跃视图因 `status !== ACTIVE` 失配而移除该任务，Logbook 匹配出现——依赖现有 event-applier 缓存失效逻辑，无需新写。

## Testing Decisions

**什么是好测试**：只测外部可观察行为（service 对 Prisma 收到的 where/data、hook 对缓存的操作结果、纯函数的输入输出），不测实现细节、不 mock 被测对象内部的私有方法。

**测试缝（全部复用现有缝，零新增）**，按覆盖优先级：

1. **TasksService / SubtasksService 单元层**（mock PrismaService）——核心行为落点。先例：`tasks.service.logbook.spec.ts`（where 断言式）、`tasks.service.convert-to-project.spec.ts`、`subtasks.service.spec.ts`。覆盖：cancel/uncancel 的写入内容；COMPLETED↔CANCELLED 直接改写并刷新 settledAt；reopen 清空 settledAt；logbook/搜索查询的 where 含 CANCELLED（白名单三值）。
2. **FeedService 单元层**——先例：`feed.service.spec.ts`。覆盖：logbook view 返回完成+取消任务；了结时间字段下发；项目统计口径与 Logbook Entry 一致。
3. **前端 task-query-match 纯函数**——先例：`event-applier.test.ts`、`useTasks.test.ts`。覆盖：CANCELLED 在 inbox/today/anytime/someday 视图失配；logbook 视图匹配；`completed=true` 时与后端口径一致。
4. **Agent 工具**——先例：`agent-tools.spec.ts`（mock tasks service）。覆盖：update_task 取消参数路由到 cancel/uncancel；描述文案包含 cancelled。

**既有测试的口径回归**：`tasks.service.logbook.spec.ts`、`useTasks.test.ts` 等断言 `COMPLETED` 的既有用例需随白名单扩展同步更新——这是预期内的测试修订，不是回归。

## Out of Scope

- **Project 取消**：`ProjectStatus` 保持 ACTIVE/COMPLETED 不动（改动聚焦 Task/Subtask）。
- **取消原因 / 备注**：不引入"为什么放弃"的结构化字段（用现有 notes）。
- **`completedAt` 字段改名 `settledAt`**：DTO 字段名保持兼容，仅语义扩展；物理列迁移为 settledAt 但 API 形状不变。
- **Today 视图对取消任务的"次日清理"类自动化**：取消即时生效，无批量清理。
- **This Evening / 重复规则 / 复制任务**：`docs/keyboard-shortcuts.md` 暂缓清单中的其他项。
- **Trash 中取消任务的独立分组/筛选**：Trash 内不区分终态。
- **Logbook 内按终态筛选/统计**（"只看放弃的"）。
- **完成/取消任务的自动归档周期**（Things 有"当天完成后当天显示，次日归档"的细腻行为）：沿用现有 Logbook 即时呈现。

## Further Notes

- **行动项（spec 之外）**：为"单一 settledAt 列 + 三态 status + 终态可直接改写"写 ADR（满足难逆转 / 无上下文会费解 / 真实取舍三条件），落 `docs/adr/`。
- `CONTEXT.md` 已先行更新：Cancelled、Settled / Settled At、Task Terminal State、Logbook Entry 四个词条，本 spec 的术语与其严格对齐。
- `docs/keyboard-shortcuts.md` 的"暂缓"清单中"取消任务 | ⌥⌘K | TaskStatus 无 CANCELLED"一行，实现时移入正式键位表。
- 旧数据零迁移：现有行 `status ∈ {ACTIVE, COMPLETED}`、`completedAt` 有值——语义在 settle 口径下不变（COMPLETED 行的了结时间即原完成时间）。
