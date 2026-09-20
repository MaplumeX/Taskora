# Local-First Engine V1 Spec（第三档同步）

Status: implemented (V1)

Taskora 从 thin-client 架构转向 local-first：引入跨端共享的 Engine 包与本地副本，服务器转型为 Sync Hub，按字段级 LWW + HLC 合并多设备变更。架构决策见 `docs/adr/0007-local-first-engine.md`（含对 ADR-0005 的取代关系）；领域术语见根 `CONTEXT.md`「引擎与同步（local-first）」小节（Engine、Local Replica、Field-level LWW、HLC、Position、Outbox、Sync Cursor、Compact Event、Event Stream、Sync Hub）。

## Problem Statement

Taskora 的每一次读写都要经 API 往返 Postgres：断网时应用完全不可用（飞机上、地铁里、服务器维护时都是死屏）；每一次点击保存都要等一次网络往返，任务管理这种「快速连续录入」的场景被延迟拖垮；多设备共享数据依赖服务器常驻可用 + Event Stream 推送，但推送只覆盖在线窗口，离线期间的变更无从谈起。

从用户视角：我在飞机上想整理我的任务清单，打开 Taskora，什么都做不了；我在录入一串任务时每条都要等「保存完成」；我在两台设备上来回切换时，必须保证两台都在线才能看到彼此的变更。

## Solution

每台设备持有该用户的完整 Local Replica（SQLite），UI 的所有读写直接作用于本地副本，通过 Engine 的响应式查询即时刷新——读写零网络往返，断网时全功能可用。服务器转型为 Sync Hub：设备把本地变更（Outbox 中的 Change Event，字段级 + HLC 时间戳）推给 hub,hub 按字段级 LWW 合并入服务端 Postgres 副本并分配全局单调序号；设备凭 Sync Cursor 增量拉取其他设备（以及作为第 0 号虚拟设备的 Assistant）的变更。并发冲突按字段各自裁决、静默收敛，不弹冲突 UI。新设备登录后从全量快照 bootstrap。迁移按垂直切片推进：桌面端先行，第一条切片是 Inbox/Today 中的 Task CRUD。

## User Stories

### 离线可用

1. As a 桌面用户，我希望在完全断网时也能查看我的所有任务、项目、区域和标签，所以我在飞机上也能规划工作。
2. As a 桌面用户，我希望断网时能创建、编辑、完成、取消、移动任务到任意 Bucket，所以离线不是只读模式而是全功能。
3. As a 桌面用户，我希望断网时能拖拽重排任务、打标签、清理 Trash，所以离线期间的操作不被神秘地禁用。
4. As a 桌面用户，我希望断网期间的所有写操作在恢复联网后自动同步到 Sync Hub，所以我不需要知道「哪些操作还没同步」。
5. As a 桌面用户，我希望应用启动时无需联网即可渲染界面，所以弱网环境的启动体验不再卡在加载态。
6. As a 桌面用户，我希望本地写入立即在界面上可见（不等同步），所以录入一串任务时没有逐条等待感。

### 多设备收敛

7. As a 多设备用户，我希望在设备 A 创建的任务自动出现在设备 B，所以我不需要手动导出导入。
8. As a 多设备用户，我希望在设备 A 完成的任务在设备 B 的 Today 视图里消失，所以两端视图始终一致。
9. As a 多设备用户，我希望两台设备同时在线时变更在秒级到达对端，所以实时协作感不比现在的 Event Stream 差。
10. As a 多设备用户，我希望设备 A 改标题、设备 B 同时改截止日期时两个改动都保留，所以字段级合并不误伤不相干的编辑。
11. As a 多设备用户，我希望两台设备同时改同一个字段时结果确定（后写的赢），所以不会出现「每次同步结果都不同」的抖动。
12. As a 多设备用户，我希望一台设备离线期间做的变更不阻塞其他设备的同步，所以一台设备关机不影响另一台继续工作。
13. As a 新设备用户，我希望在新电脑上登录后自动获得全量数据快照，所以换机的数据迁移是零操作。
14. As a 用户，我希望「清空 Trash」在一台设备上执行后，其他设备的副本里这些任务也消失，所以物理删除全局生效。
15. As a 用户，我希望某台设备的本地数据损坏时能用「重置副本 + 快照重建」恢复，所以单设备故障不会永久丢数据。

### Assistant 协同

16. As a Assistant 用户，我希望助手在服务端替我改任务时，变更像另一台设备的写一样到达我的桌面端，所以助手的工作成果即时可见。
17. As a Assistant 用户，我希望助手与我本人同时编辑时遵循同一套字段级合并规则，所以助手不会凭特权覆盖我本地的改动。
18. As a Assistant 用户，我希望助手执行的 Destructive Operation 仍走用户批准卡片，所以 local-first 转向不削弱安全边界。

### 交互与延迟

19. As a 桌面用户，我希望任务列表的每次增删改都瞬时反映（本地写、本地读），所以批量整理几十条任务不再有等待感。
20. As a 桌面用户，我希望 Engine 的响应式查询在数据一变时自动刷新视图，所以不存在「改了但界面没更新」的缓存失效问题。
21. As a 桌面用户，我希望拖拽排序立即生效，所以排序操作不依赖服务器确认。
22. As a 用户，我希望本机数据可以导出为 SQLite 文件，所以我的数据主权有物理载体（数据导出是副产品收益）。

### 同步机制（面向维护者）

23. As a 维护者，我希望同步协议是推拉式（推本地 batch → hub 合并 → 按 cursor 拉全局增量），所以语义清晰、可独立测试。
24. As a 维护者，我希望 Sync Cursor 复用现有 Event Stream 的每用户单调序号机制，所以已验证的缺口检测思路不推倒重来。
25. As a 维护者，我希望 hub 的合并器是纯函数（两份 fieldClocks + 实体 → 胜者），所以冲突逻辑可以穷举测试。
26. As a 维护者，我希望软删除在同步线上就是普通字段变更，所以现有 Trash/终态模型零改动地天然同步友好。
27. As a 维护者，我希望物理删除只发生在 hub 的 GC，并以 Compact Event 下发，所以设备端永远不需要墓碑机制。
28. As a 维护者，我希望 HLC 时间戳 + 设备 ID 是唯一的决胜依据，所以合并结果在任意设备上重放都一致（收敛性可测试）。
29. As a 维护者，我希望 Position 用 fractional indexing，所以并发拖拽不需要重排其他行、不需要为排序单开 CRDT。
30. As a 维护者，我希望 Engine 的 SQL schema 与 hub 的 Prisma schema 由契约测试对齐，所以两端格式漂移在 CI 就被抓住。
31. As a 维护者，我希望服务器是「第 0 号虚拟设备」、没有特权写入路径，所以合并器只需实现一种语义。
32. As a 维护者，我希望断网写、乱序到达、同字段并发、快照重建这些场景都有端到端收敛测试，所以同步引擎的正确性有护栏而不是靠运气。
33. As a 维护者，我希望设备身份由登录时的持久 device id 表达（存于 Local Replica 与服务端 Device 表），所以决胜与审计有稳定主体。

## Implementation Decisions

以下决策与 ADR-0007 一致，按模块归属重述。

**新增 Engine 包（跨端共享）**

- 新建 workspace 包 `packages/engine`，承载 Local Replica 存取、响应式查询、Outbox、HLC 时钟、同步客户端。不绑定具体存储实现（存储接口抽象），但 V1 只交付 SQLite 一条路径。
- 数据格式统一为 SQLite：桌面端直连文件（Tauri 侧），Web 端规划为 WASM + OPFS（本 spec 范围外，见 Out of Scope）。SQLite 文件即用户数据的可导出格式。
- Engine 拥有自己的 SQL schema 与迁移；不从 Prisma 生成。与 hub 侧 schema 靠契约测试对齐。
- 响应式查询是 Engine 的公共查询面：查询返回可订阅的结果集，写入后自动失效重算；取代 `packages/api` 中对应领域的 TanStack Query hooks。auth 与 Assistant 等真远程调用保留 TanStack Query，界限分明。
- Position（Task/Project/Tag 的排序位次）为 fractional indexing 字符串，是实体的普通字段，纳入字段级 LWW；后台偶尔 re-balance 防字符串膨胀。
- 每条本地写操作落库同时进入 Outbox（携带字段级 HLC + device id）；Outbox flush 成功后才推进本地「已同步」水位。HLC 由 Engine 在每次写时推进（墙上时钟 + 逻辑计数）。

**同步协议（Engine ↔ Sync Hub）**

- 推拉式三段：设备把 Outbox 中的 Change Event batch 推给 hub → hub 按字段级 LWW 合并入 Postgres 副本、为每个被接受（或被覆盖）的字段写回合并后的 fieldClocks、按每用户单调 seq 记录变更 → 设备凭 Sync Cursor 拉取自上次以来的全局增量（含其他设备与虚拟设备 0 的写）。
- 同一字段真并发时按 HLC 新者胜，再按 device id 决胜；败方编辑静默丢弃，不弹冲突 UI（接受的语义）。
- 现有 Event Stream 的 SSE 通道与单调 seq 机制演化为本协议的传输层与序号来源；旧「服务端单向推送 + 全量 refetch 兜底」模式对已迁移切片退役，未迁移切片暂按 ADR-0005 原样工作。
- Compact Event：hub 的 GC 物理删除（清空 Trash / 级联清理）后下发「从副本移除这批 id」的压缩变更；这是线上唯一的非字段级变更类型。设备端软删除（Trash、终态）就是普通字段变更，走 LWW。

**Sync Hub（后端改造）**

- Prisma 实体表新增 `fieldClocks Json` 列（`{field: "hlc:deviceId"}`）；现有业务字段语义与表结构不动。
- 合并器为纯函数：输入两份 fieldClocks + 实体字段值，输出各字段胜者与合并后的 clocks。可穷举单测。
- 现有 NestJS CRUD 模块（areas/projects/tasks/subtasks/tags/tag-groups/project-headings）降级为合并器与 sync 端点的内部实现；对外公共面收敛为 sync 端点（push batch / pull since cursor / bootstrap snapshot）。REST CRUD 端点在对应切片迁移完成前保留，迁移后退役。
- Bootstrap：新设备（或重置副本的设备）登录并注册 device id 后，hub 打包当前合并态为全量快照（含各字段 fieldClocks 与当前全局 seq），设备落库后记录 Sync Cursor，之后走增量。
- 设备身份：Device 表（user、device id、元数据），登录时分配、持久保存于 Local Replica；登出保留本地数据，重新登录分配新 device id。无游客/匿名模式。
- Assistant（agent 模块）作为第 0 号虚拟设备写数据：不再直调 Prisma service，改向合并器提交 Change Event（进程内调用）；Destructive Operation 批准卡片流程不变，批准后释放相应 Change Events。

**迁移策略（垂直切片，桌面先行）**

- 切片一：桌面端 Inbox/Today 中 Task 的 CRUD（创建、编辑字段、完成/取消/重开、Trash、恢复、拖拽排序、标签增删）走 Engine；其余视图与其余端暂维持现状。
- 后续切片逐步扩大（其余 Bucket 视图 → Project/Area/Tag 实体 → web 端 OPFS），每片迁移对应退役一片旧 REST 端点与 React Query hooks。
- `packages/api` 中被 Engine 取代的 hooks 随切片退役；Event Stream 的 push 职责随切片收编进同步协议。

## Testing Decisions

好测试只断言外部行为（公共 API 上的输入输出与收敛结果），不断言内部表结构、SQL 形状或实现细节。接缝与用户已对齐：

- **主接缝（唯一新接缝，最高层）：Engine 公共 API 的端到端 harness。** 两台「设备」各跑一个 Engine 实例 + 一个进程内 Sync Hub（真走协议），测试只通过公共 API（query / mutate / flush / pull / 拔线插线）驱动，断言收敛性（两端对同一 query 返回相同结果）与离线语义（断网期间的写在 flush 后不丢）。LWW 裁决、HLC 推进、Position 并发拖拽、Outbox 重放、Compact Event、快照重建、Assistant 虚拟设备写，全部在此接缝上作为行为测试。
- **合并器纯函数单测**：两份 fieldClocks + 实体进、胜者出。先例：`packages/backend/test/*.service.*.spec.ts` 的 service 级 spec 风格（如 `tasks.service.cancel.spec.ts`）。
- **Engine SQL schema ↔ Prisma schema 契约测试**：实体字段集合与类型对齐，防两端漂移（ADR-0007 明确要求）。
- **切片一的 UI 视图测试**：沿用 `packages/ui` 现有组件测试接缝，仅换数据源为 Engine，不新开 UI 接缝。
- 不为 SQLite 内部结构、传输层重连细节新开低层接缝；重连作为主接缝上的行为场景（拔线→写→插线→断言收敛）。

## Out of Scope

- **Web 端 local-first**（WASM + OPFS 路径）：Engine 的存储抽象为其预留，但 OPFS 验证与 web 客户端接入属后续阶段。Web 在过渡期仍是 thin-client。
- **游客/匿名本地模式与注册后合并**：明确砍掉（ADR-0007 已记录理由）。
- **P2P 同步（设备直连）**：同步拓扑只有「设备 ↔ Sync Hub」。
- **冲突 UI / 合并对话框**：字段级 LWW 静默收敛是定案语义，不做弹窗。
- **切片一之后的实体迁移**（Project/Area/Tag/Tag Group/Project Heading 的 Engine 化）与旧 REST 端点全面退役：属后续切片，本 spec 只定机制与切片一的交付。
- **Assistant 功能变更**：Assistant 的能力面不变，只是写入路径改经合并器（虚拟设备 0）。
- **多实例 hub 水平扩展**：沿用单实例假设（与 ADR-0005 相同的边界条件）。

## Further Notes

- 本 spec 是三轮 grilling 的共识结晶（Q1–Q18 全部落定），决策依据全部收录在 ADR-0007 与 `CONTEXT.md` 的「引擎与同步（local-first）」术语节。实施时遇到与术语冲突的命名，以 CONTEXT.md 为准并当场修订。
- 术语演变提醒：Change Event 已从「服务端推送通知」重定义为「同步协议中的变更单元」；Event Stream 已从「单向推送通道」重定义为「双向同步的传输层」。ADR-0005 已加 superseded 注记。写作与评审时不要沿用旧义。
- 后续切片建议在各自开工前另立 spec（沿用本目录或新目录），本 spec 不假装覆盖到 web 端。

## Comments

### 2026-09-20 · V1 实现记录（切片一交付）

按本 spec 完成 V1：

- `packages/engine`：HLC / Position（fractional indexing）/ 字段级 LWW 合并器（纯函数，设备与 hub 共用）/ 实体注册表与自有 SQLite schema / Local Replica + Outbox（异步存储接口，Tauri IPC 可实现）/ 同步客户端（flush / pull / bootstrap / resync）/ 进程内 Sync Hub 测试替身。
- 主接缝端到端 harness（`packages/engine/test/convergence.test.ts`）：断网写、字段级并发合并、同字段 HLC+设备 ID 决胜、Position 并发拖拽、回声幂等、Compact Event、快照重建（含未同步 Outbox 保留）、虚拟设备 0 写、hub 重启 resync。
- 后端 Sync Hub：`fieldClocks`/`fieldDigests`/`position` 列 + `Device` 表（两笔迁移）；`POST /sync/devices`、`POST /sync/push`、`GET /sync/pull`、`GET /sync/bootstrap`；合并器复用 engine 纯函数；REST 写经 collector tap 以虚拟设备 0 基线进入同一推流（fieldDigests 保证只重置真正被改字段的时钟）；物理删除 → Compact Event；空 Trash 显式下发 Subtask 级联 compact。
- 契约测试：Engine 注册表 ↔ Prisma DMMF 字段集合与类型对齐。
- 桌面端切片一：Rust 侧 rusqlite（WAL，appData/taskora.db）+ 三个 IPC 命令；`packages/api` 的 TaskBackend 注入层（Task/Feed 全部 hooks 零改动切换数据源）；Inbox/Today 的 Task CRUD（创建/编辑/完成/取消/重开/Trash/恢复/拖拽/标签）全部本地读写，写后防抖 flush + 30s 周期 + 聚焦同步。

code-review 补救（双轴审查后修复）：

- P1 已修：SSE Event Stream 现作为同步传输层——live change 帧到达即触发 engine pull（`onRemoteChangeEvent`），远端变更秒级到达（Story 9）；30s 周期同步降级为兜底。
- P2 已修：重新登录分配新 device id（登出丢弃存储的 id，本地数据保留）；device id 同时写入 Local Replica meta。
- P2 已修：Position re-balance 接入 Engine.sync()（出现超长键时整组摊平，作为普通字段写走 LWW，有端到端测试）。
- P2 已修：设备推送 Subtask create 不再因 userId 列缺失崩溃——经父 Task 认领归属，越权拒绝（有测试）。
- P2 已修：契约测试补反向检查（Prisma 新增标量列未注册/未豁免即失败）。
- Standards 判断项清理：后端复用 engine 的 SYNC_ENTITIES 与 hlcWallMs；EntityChange/SnapshotEntry 复用 EntityMergeState；删除未使用的 version getter 与 REAL 列型；getFeed 不再重复 list('task')。
- 未处理的判断项（接受现状）：ring-buffer 三处形态重复（spec 明确背书复用 ADR-0005 语义）；(entity, id) 数据团（重构级别）；行→DTO 映射器的时间戳兜底默认。

与 spec 的已知偏差（后续切片跟进）：

- Assistant 写入路径：spec 原文为「改向合并器提交 Change Event（进程内调用）」。V1 经 collector tap 桥接实现等价效果（无特权写入、同一合并语义、走同一推流）；`SyncHubService.submitVirtualWrite` 已就绪，agent 模块的直接切换留待后续切片。
- Subtask CRUD 与 convert-to-project：Engine 后端回落 REST（变更经同步推流回流设备），不在切片一的 Task CRUD 集内。
- quick-add 窗口：独立 webview，维持 REST；其变更经 hub 同步回流主窗口。
- Event Stream（SSE）：保留为「变更到达提示」通道（触发 engine pull），未迁移切片仍按 ADR-0005 原样工作，按片退役。
- Web 端（WASM + OPFS）：Out of Scope，未动。

### 2026-09-20 · 后续切片指针

Subtask CRUD、convert-to-project、quick-add 三项偏差与桌面端其余实体的 Engine 化由 `.scratch/local-first-v2/spec.md`（桌面端完全体）收编；删除原语另立 ADR-0008。
