# Local-First V2 Spec（桌面端完全体：全实体离线）

Status: ready-for-agent

Taskora local-first V1（`.scratch/local-first-v1/spec.md`）交付了 Engine 包与桌面端切片一（Inbox/Today 的 Task CRUD）。本 spec 是后续切片：把桌面端剩余的回落 REST 写路径全部收编进 Engine，使**桌面端断网时全功能可用**。架构基底不变（ADR-0007）；唯一协议级变更是删除原语（新立 ADR-0008，见 Implementation Decisions）。领域术语沿用根 `CONTEXT.md`「引擎与同步（local-first）」小节，新增 **Delete Request** 一条（见 Further Notes）。

## Problem Statement

V1 之后，桌面端在断网时仍有一批操作直接失败或退化，与「离线是全功能、不是只读模式」的承诺相悖：

- 我在飞机上想给任务加一条 Subtask、或把一条任务转成 Project——界面报错，因为这些操作回落 REST。
- 我断网时想清空 Trash——失败，因为物理删除只能由 hub 发起。
- 我用全局快捷键唤起 quick-add 想记一条任务——失败，因为 quick-add 是独立 webview，直接调 REST。
- 断网时 Project / Area / Tag / Tag Group / Project Heading 的管理全部不可用（TanStack Query + REST）。
- 整个过程没有任何全局提示：我不知道自己处于离线状态，也不知道有多少条写操作还在 Outbox 里排队等同步。

从用户视角：V1 让我「离线能收件箱里干活」，但只要碰到 Subtask、转 Project、清 Trash、quick-add、或整理项目结构，我就被弹回「必须有网」的旧世界；而且系统对离线状态保持沉默。

## Solution

桌面端所有实体（Task、Subtask、Project、Project Heading、Area、Tag、Tag Group）的读写全部直接作用于 Local Replica：断网时全功能可用，写操作进 Outbox，恢复联网后自动收敛到 Sync Hub。同步协议扩展一个设备发起的删除原语（Delete Request），使 convert-to-project 与清空 Trash 也能完全离线执行。quick-add 窗口经事件中继复用主窗口的单一 Engine 实例。AppShell 增加轻量全局同步指示器，由同步调用的成败驱动。REST 端点一个不删（web 仍是 thin-client），只是桌面端不再调用。

## User Stories

### 删除原语（协议层）

1. As a 桌面用户，我希望在断网时把一条任务转换为 Project 并让原任务干净地消失，所以 convert 不在 Trash 里留尸体、也不需要联网。
2. As a 桌面用户，我希望断网时能清空 Trash，所以「物理删除」不因离线被禁用。
3. As a 多设备用户，我希望一台设备删除的实体在另一台设备上同步消失，所以删除全局生效。
4. As a 多设备用户，我希望「删除」与「另一台设备同时在编辑该实体」竞争时删除永久获胜，所以不会出现「删了又复活」或结果抖动。
5. As a 维护者，我希望迟到的字段变更到达已被 compact 的实体时被静默丢弃（副本与 hub 同规则），所以不需要墓碑机制也能收敛。
6. As a 维护者，我希望 hub 收到 Delete Request 时校验实体归属，越权请求被拒绝，所以删除原语不成为越权通道。
7. As a 维护者，我希望 hub compact 一条 Task 时级联 compact 其 Subtask，所以孤儿 Subtask 不会残留在任何副本里。
8. As a 维护者，我希望设备推送的 Subtask create 在父 Task 已被 compact 时被丢弃（复用现有越权拒绝路径），所以孤儿写入有既定归宿。

### Subtask 与 convert

9. As a 桌面用户，我希望断网时能创建、编辑、完成、取消、重开、删除 Subtask 并拖拽重排，所以子步骤管理不离线降级。
10. As a 桌面用户，我希望断网时把 Task 转成 Project 后，其 Subtasks 提升为该 Project 下的完整 Tasks，所以 convert 语义离线在线一致。
11. As a 桌面用户，我希望 convert 后新 Project 继承原 Task 的标题、备注、日期、状态、归属与标签，所以转换不丢信息。

### 全实体离线

12. As a 桌面用户，我希望断网时能创建、编辑、归档、完成、删除、恢复 Project 并重排，所以项目结构整理不离线降级。
13. As a 桌面用户，我希望断网时能增删改 Area 并重排，所以领域整理不离线降级。
14. As a 桌面用户，我希望断网时能增删改 Tag、Tag Group（含颜色与排序），所以标签体系整理不离线降级。
15. As a 桌面用户，我希望断网时能增删改 Project Heading，所以 Project 内的分组标题管理不离线降级。
16. As a 桌面用户，我希望上述所有操作的本地写入立即在界面上可见，所以批量整理无逐条等待感。

### quick-add 离线

17. As a 桌面用户，我希望全局快捷键唤起的 quick-add 在断网时也能记录任务，所以碎片化捕获不依赖网络。
18. As a 桌面用户，我希望 quick-add 记下的任务与主窗口看到的是同一份数据，所以不存在「quick-add 建了但主窗口看不到」的分叉。

### 离线可见性

19. As a 桌面用户，我希望界面角落常驻同步状态指示（已同步 / 同步中 / 离线·N 条待同步），所以我对未同步的写操作有全局感知。
20. As a 桌面用户，我希望离线期间正常使用一切功能、不被任何阻塞式 UI 打断，所以指示器只呈现状态、不拦截操作。
21. As a 桌面用户，我希望恢复联网后待同步的写自动收敛、指示器回到已同步，所以我不需要手动触发任何「重新连接」动作。

### 机制（面向维护者）

22. As a 维护者，我希望桌面端只剩单一 Engine 实例（主窗口持有），quick-add 经事件中继复用它，所以 HLC 计数器、Outbox、Sync Cursor 各只有一份。
23. As a 维护者，我希望同步指示器由 sync 调用成败驱动而非 `navigator.onLine`，所以「服务器不可达」不会被假在线掩盖。
24. As a 维护者，我希望每域 backend（Project / Area / Tag / TagGroup / Heading）沿用 TaskBackend 已验证的注入模式，所以迁移是复制既定模式而非新发明。
25. As a 维护者，我希望 REST 端点本片一个不删、web 行为零变化，所以退役推迟到 web 迁移片而无回归风险。
26. As a 维护者，我希望设备发起删除的协议变更记录在独立 ADR（0008）并在 0007 加指针，所以「hub-only delete」立场的推翻有据可查。
27. As a 维护者，我希望多实体断网 CRUD、convert 竞争、delete-request 竞争、孤儿 Subtask 都有端到端收敛测试，所以正确性靠护栏不靠运气。

## Implementation Decisions

与 ADR-0007 一致的部分不重述；以下为本片的增量决策（三轮 grilling Q1–Q12 全部落定）。

**删除原语（ADR-0008 的核心）**

- Change Event 新增设备→hub 方向的 **Delete Request** 类型：携带实体类型与一批 id。hub 校验归属后物理删除，并按现有机制广播 Compact Event（每用户单调 seq）。
- 竞争语义定案：**Compact 永久获胜**——某 id 被 compact 后，迟到的字段变更（设备推送或 hub 合并）一律丢弃；副本与 hub 适用同一条规则。复活只能靠新 id 的新建（天然如此，无需额外机制）。
- emptyTrash 复用同一原语：设备收集 Trash 内的 Task / Project id，批量发 Delete Request。Subtask 级联 compact 沿用现有惯例（hub 侧，emptyTrash 已有先例）。
- 不引入墓碑：Compact Event 仍是线上唯一的非字段级变更类型的下行形态；Delete Request 是其设备侧发起对偶。

**Engine 与协议层改造**

- `packages/engine` 的 Outbox / flush / pull 支持 Delete Request 的排队、推送与幂等重放（回声场景下重复删除为 no-op）。
- `convertTaskToProject` 的 Engine 侧语义分解：新 Project 的创建、Subtask 到 Task 的提升（逐条 create，继承标题/状态/了结时间，落位 INBOX）全部是普通字段写（走 LWW）；原 Task 的消失是一个 Delete Request。语义与 hub 侧 REST 实现对齐（终态映射、areaId 回退、标签继承、排序位次）。
- Subtask CRUD 全部收编进 EngineTaskBackend（不再回落 REST）。

**每域 backend 注入层**

- Project / Area / Tag / Tag Group / Project Heading 各自按 TaskBackend 模式建立注入层：interface + REST 默认实现 + Engine 实现 + setter；对应 TanStack Query hooks 零改动切换数据源。
- 桌面端登录装配时全部切换到 Engine 实现；登出回退 REST（与 V1 行为一致）。
- 各域读路径的视图口径（过滤、排序、bucket 解析）与后端 REST 语义对齐，以 hub 实现为基准。
- 不做统一 backend registry——迁移完成后再说，现在抽象是抢跑。

**quick-add 事件中继**

- quick-add webview 通过 Tauri event 把任务标题发给主窗口；主窗口的 Engine 执行 create（进 Outbox）。单一 Engine 实例、单一 Outbox、单一 HLC。
- 失败回退路径不变：token 失效时唤起主窗口登录。
- 不采用 quick-add 自开 Engine 实例的方案：双实例共享一份 SQLite 会在存储层重新发明锁。

**同步指示器**

- 三态：已同步 / 同步中 / 离线·N 条待同步。由 syncNow（flush + pull）的成败驱动；失败即离线，N 取 `engine.pendingCount()`。
- 不用 `navigator.onLine`。仅桌面端显示（web 无 Engine，无可指示的状态）。无阻塞式 UI、无逐任务标注。

**REST 端点与 Event Stream**

- 本片不退役任何 REST 端点：web 仍是 thin-client。桌面端停止调用被迁移的面。
- REST 写继续经 collector tap 进同步推流，web 的写照常回流桌面端。
- Event Stream（SSE）继续作为「变更到达提示」通道（触发 engine pull），角色不变。

**交付顺序（片内提交次序）**

1. 删除原语：协议类型 + hub 处理 + Engine Outbox 支持 + harness 测试。
2. convert-to-project + emptyTrash + Subtask CRUD。
3. 其余实体 backends（Project → Area → Tag → TagGroup → Heading）。
4. quick-add 事件中继 + 同步指示器。

**ADR 与术语**

- 新立 ADR-0008「设备发起删除（Delete Request）」：记录对 0007「Physical deletion is hub-side GC only」的推翻理由（convert 全离线 + emptyTrash 离线）与 Compact-wins 竞争语义；0007 加指针注记。
- `CONTEXT.md` 新增术语 **Delete Request**：设备发给 Sync Hub 的物理删除请求，hub 校验后删除并以 Compact Event 广播；与设备端软删除（普通字段变更）相对。

## Testing Decisions

好测试只断言外部行为（公共 API 上的输入输出与收敛结果），不断言内部表结构或实现细节。接缝沿用 V1 已对齐的布局：

- **主接缝：Engine 公共 API 端到端 harness（`packages/engine/test/convergence.test.ts`）扩展多实体场景**——Project / Area / Tag / TagGroup / Heading 的断网 CRUD 与收敛；convert 全离线组合（字段写 + 删除）后双端收敛；Delete Request 与字段编辑的竞争（compact 永久获胜）；迟到的 subtask create 对已 compact 父 Task 的丢弃；emptyTrash 的跨设备生效；delete-request 重放幂等。
- **每域 backend seam 级测试**：仿照 `task-backend.engine.test.ts` 先例，断言 Engine 实现与 REST 实现的语义对齐（bucket 解析、视图过滤、终态/恢复语义、排序）。
- **UI 组件测试**：沿用现有组件测试接缝，仅换数据源为 Engine，不新开接缝。quick-add 中继与同步指示器按现有桌面端测试先例（boot / ServerSetup 测试风格）测行为。
- 不为 Delete Request 的传输细节新开低层接缝；它作为 harness 上的行为场景出现。

## Out of Scope

- **REST 端点退役与 Event Stream 退役**：推迟到 web 迁移片（web 仍是 thin-client）。
- **Web 端 local-first（WASM + OPFS）**：Engine 存储抽象已预留，验证与接入属后续阶段。
- **Assistant 写入路径直切 `submitVirtualWrite`**：collector tap 桥接已等价，直切属 Assistant 专题。
- **统一 backend registry**：迁移完成后的重构，本片不做。
- **冲突 UI / 合并对话框**：LWW 静默收敛语义不变。
- **Project 的 CANCELLED 终态**：convert 语义映射沿用现状（仅 COMPLETED 映射），不在本片扩域。

## Further Notes

- 本 spec 是三轮 grilling 的共识结晶（Q1–Q12 全部落定），决策依据收录于 ADR-0008 与 `CONTEXT.md` 新增术语 Delete Request。
- 与 V1 spec 的关系：机制（Engine / Outbox / LWW / HLC / Position / bootstrap）全部继承，本片只加删除原语与覆盖面收尾；V1 spec 尾部的「已知偏差」清单中 Subtask、convert、quick-add 三项由本片关闭。
- 实施时遇到与术语冲突的命名，以 `CONTEXT.md` 为准并当场修订。
- Web 端迁移片开工前应另立 spec。
