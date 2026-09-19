# Taskora

Things 风格的任务管理器（Web + 桌面端），围绕 Areas / Projects / Tasks 的层级与 Buckets 视图组织个人工作。

## Language

### 任务组织

**Area**:
用户生活/工作的顶级领域，Projects 与 Tasks 可归属其下。
_Avoid_: 领域、分类、category

**Project**:
属于某个 Area（或无归属）的任务容器，内部可用 Headings 分组。
_Avoid_: 清单、list

**Task**:
一条可完成的待办事项，可含 Subtasks、Tags，可设日期并落入 Bucket。
_Avoid_: Todo、item

**Subtask**:
Task 内的子步骤，仅存在于父 Task 内。
_Avoid_: Checklist item

**Project Heading**:
Project 内的静态分组标题，用于组织 Project 内的 Tasks。
_Avoid_: Section

**Tag / Tag Group**:
可带颜色与排序、可附加在 Task/Project/Area 上的标签；Tag Group 是 Tag 的分组容器。

**Bucket**:
按状态/时间过滤出的任务视图：Inbox、Anytime、Scheduled、Someday、Today、Upcoming、Logbook、Trash。不是存储位置。
_Avoid_: 列表、filter

**Logbook Entry**:
已了结（完成或取消）任务的档案记录，按了结日期（今天/昨天/更早）分组展示。Logbook 即所有 Logbook Entry 的聚合视图。
_Avoid_: 已完成列表（Logbook 不只含完成任务）

**Cancelled**:
任务被主动放弃的终态：留痕、可逆，记录于 Logbook。与 Completed（做完的了结）、Trashed（软删除暂存）三者互斥。取消已完成的任务会直接改写终态（不必先重开）。取消父 Task 不改动其 Subtasks。
_Avoid_: 取消 = 删除、abandoned、丢弃

**Settled / Settled At**:
任务进入终态（Completed 或 Cancelled）这一事实的统称；了结时间记录何时发生，不区分是哪种了结（由 status 表达）。Logbook Entry 按了结时间分组。
_Avoid_: completedAt 泛指取消任务的时间、完成时间（取消任务并未"完成"）

**Task Terminal State**:
任务的两种了结状态：Completed（做完）与 Cancelled（放弃）。皆留痕、可逆，记录于 Logbook；与 Trash（软删除）正交。取消父 Task 不改动其 Subtasks。
_Avoid_: 把 Cancelled 当作 COMPLETED 的子集、把终态与删除混淆

**Trash**:
软删除的暂存处，可恢复；清空后不可恢复。

### 界面交互

**Selection**:
键盘导航下当前被高亮、并作为键盘动作（完成、删除、新建于下方等）作用对象的 Task / Project / Project Heading；区别于 focus（DOM 焦点）与完成态。
_Avoid_: 高亮、hover、焦点

### 同步

**Change Event**:
后端在数据变更时主动下发的通知，携带实体类型与动作；除删除外携带完整实体。
_Avoid_: 消息、推送、payload

**Event Stream**:
每用户一条的常驻推送通道，按单调递增的序号分发 Change Event。
_Avoid_: WebSocket、订阅、频道

### 助手（Agent）

**Assistant**:
用户可见的对话式助手功能名（文案中称「助手 / Assistant」）。工程上由 Agent 模块实现。
_Avoid_: Copilot、聊天机器人

**Conversation**:
用户与 Assistant 的一段持久化对话，含完整消息历史；用户可创建多个并切换。多会话列表中的每一条就是一个 Conversation。
_Avoid_: Session（与 pi-agent-core 的 `sessionId`——仅作 provider 缓存用途——冲突）、Chat

**Destructive Operation**:
不可逆或影响全局结构的工具操作（删除、清空 Trash、改动 Area/Project 结构），执行前必须经用户批准卡片放行。
_Avoid_: 危险操作
