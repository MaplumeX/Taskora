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
