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

**Reminder**:
Task 上的一个时刻（HH:mm），依附于计划日期（Scheduled Date），到点由各客户端本地触发系统通知；仅 ScheduledType 为 DATE 的 Task 可设。Project 不设 Reminder。
_Avoid_: 闹钟、alarm、通知时间（Reminder 是数据，通知是其触发效果）

**Bucket**:
按状态/时间过滤出的任务视图：Inbox、Anytime、Scheduled、Someday、Today、Upcoming、Logbook、Trash。不是存储位置。
_Avoid_: 列表、filter、缓存

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
仅存在于键盘交互域：键盘导航下当前被高亮、并作为键盘动作（完成、删除、新建于下方等）作用对象的 Task / Project / Project Heading；区别于 focus（DOM 焦点）与完成态。触控交互没有 Selection：点击 = 打开详情，勾选用专用 checkbox，行内菜单用长按触发。
_Avoid_: 高亮、hover、焦点

### 引擎与同步（local-first）

**Engine（引擎）**:
本地数据副本与同步机制的统称：UI 的所有读写都直接作用于本地副本，由 Engine 负责与服务器收敛。工程上是一个跨端共享包，不绑定具体存储实现。
_Avoid_: 数据库、缓存、ORM、offline cache

**Local Replica（本地副本）**:
每台设备持有的该用户全量数据镜像，是 UI 读写的直接对象；不可视为可随时丢弃的缓存。
_Avoid_: cache、镜像只读副本

### 同步

**Change Event**:
同步协议中的变更单元，携带实体、字段与元信息，双向流动于设备与 sync hub 之间；不再仅指服务端推送。
_Avoid_: 消息、推送、payload

**Sync Hub**:
服务器在 local-first 架构中的角色：接收各设备推送的 Change Event、按字段级 LWW 合并、供设备拉取。不再是唯一的写入入口。
_Avoid_: API 服务器、权威数据库（ authoritative 只指合并后的服务端副本）

**Field-level LWW（字段级 Last-Writer-Wins）**:
冲突解决模型：每个实体的每个字段独立携带修改时间戳，并发冲突时新者胜；同一字段真并发时按设备 ID 决胜，败方编辑被丢弃（接受的语义，不弹冲突 UI）。
_Avoid_: 整实体覆盖、弹窗合并

**HLC（Hybrid Logical Clock，混合逻辑时钟）**:
字段时间戳的取值机制：墙上时钟 + 逻辑计数，兼顾可读性与因果序；每条变更另携设备 ID 作决胜。
_Avoid_: 服务器时间、纯墙上时钟

**Position**:
Task 在列表中的排序位次，用 fractional indexing 字符串表达，是 Task 的普通字段，纳入字段级 LWW；插队只需在两个邻居间生成新串，无需重排他人。需要后台偶尔 re-balance 防字符串膨胀。
_Avoid_: 整数序号、sortOrder、order index

**Outbox**:
断网或同步未完成时，本地写操作在设备上的排队区；联网后一次性 flush 到 Sync Hub。
_Avoid_: 消息队列（MQ 意义上的）

**Sync Cursor**:
设备记录的「已拉取到的全局单调序号」位置，增量拉取以此为起点；复用原 Event Stream 的单调 seq 机制。
_Avoid_: offset、分页游标

**Compact Event（压缩变更）**:
Hub 的 GC 物理删除实体后下发给设备的变更类型：指令设备从 Local Replica 中移除一批实体，区别于携带实体内容的 Change Event。仅在清空 Trash / 级联清理后产生。
_Avoid_: 硬删除广播、tombstone（我们用软删除，无墓碑）

**Delete Request（删除请求）**:
设备发给 Sync Hub 的物理删除请求（ADR-0008）：携带实体类型与一批 id，hub 校验归属后删除并以 Compact Event 广播；设备端在 Outbox 排队、断网可用。与设备端软删除（trashedAt 等普通字段变更）相对。
_Avoid_: 硬删除广播、墓碑（不携带值与时钟）

**Event Stream**:
设备与 Sync Hub 之间的常驻双向通道，按单调递增的序号传输 Change Event；从旧的服务端单向推送通道演化而来，现为同步协议的传输层。
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
