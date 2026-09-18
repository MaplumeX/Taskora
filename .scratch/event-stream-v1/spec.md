# Event Stream V1 Spec（第一档推送同步）

Status: done

为 Taskora 增加 Change Event 推送通道（第一档同步：推送通知 + 序号缺口检测，不含增量同步引擎与离线能力）。决策记录见 `docs/adr/0005-event-stream-push-sync.md`；术语见根 `CONTEXT.md`「同步」小节。

## Problem Statement

桌面端离开前台一段时间再回来时，界面会「闪一下」。根因是客户端没有域数据的推送通道，只能靠 `refetchOnWindowFocus` 在窗口重新聚焦时全量重取（`staleTime: 30s` 过期即触发），重取期间组件退回 loading 态导致可见的闪烁。

更深一层的问题：数据可能被以下路径改动而前端缓存毫不知情——

1. 同一账号在 web 端登录并在那里编辑；
2. 主窗口与 Quick Add 窗口各自持有独立的 React Query 缓存；
3. Assistant 通过后端 API 修改任务。

在没有推送通道的前提下，「聚焦时重取」是唯一的对账手段，这正是闪烁的来源，也是它的正确性上限（离开期间断网、漏拉都无兜底）。

## Solution

后端为每个在线用户维持一条常驻 Event Stream（SSE，`/events`），所有经 Prisma 的写操作自动产生 Change Event 并推送到该流。客户端（desktop 与 frontend 两个包）在登录后建立连接，收到事件后直接对 React Query 缓存做内存手术（upsert / 移除），不经网络、不进 loading 态。连接中断重连时凭单调序号检测缺口：无缺口续流，有缺口（含服务器重启导致的序号跳变）触发一次全量 refetch。`refetchOnWindowFocus` 在两个包中关闭——重连 + 缺口检测成为唯一兜底。

## User Stories

1. As a 桌面用户，我希望把窗口切走几分钟再切回来时界面不闪烁，所以我不必忍受每次回归前台的视觉打断。
2. As a 桌面用户，我希望切回来时看到的数据是最新的，所以我不会基于过期状态操作（例如以为任务未完成又点一次）。
3. As a 多端用户（web + 桌面同时登录），我在 web 端创建的任务希望在桌面端不打扰地出现，所以我不必手动刷新。
4. As a 多端用户，我在 web 端完成的任务希望在桌面端的 Today 视图中立即消失，所以视图始终可信。
5. As a 多端用户，我在 web 端把任务移入 Trash 后，希望桌面端对应列表同步移除，所以两端不会出现幽灵任务。
6. As a 桌面用户，我希望在 Quick Add 小窗创建的任务立即出现在主窗口，所以两个窗口的缓存不再各自为政。
7. As a Assistant 用户，当助手替我修改任务（改日期、完成、移动 Bucket）时，我希望主界面即时反映变化，所以助手的工作成果不需要我手动刷新才能看到。
8. As a Assistant 用户，当助手批量修改多个任务时，我希望界面只安静地更新最终结果，所以批量操作不会引起列表连环抖动。
9. As a 桌面用户，我希望网络短暂断开后恢复时数据自动补齐，所以我不需要知道断线期间错过了什么。
10. As a 桌面用户，我希望服务器重启后客户端自动做一次全量对账，所以重启不会留下静默的数据漂移。
11. As a 桌面用户，我希望未登录时不建立任何连接，所以不产生无意义的鉴权失败请求。
12. As a 桌面用户，我希望登出时立即断开连接，所以旧的 token 不再被使用。
13. As a web 用户，我希望与桌面用户享受同样的实时性，所以推送通道在两个客户端都生效。
14. As a 开发者，我希望未来新增实体模块时事件自动覆盖，所以我不必记住「要在新 service 里手动 emit」这条纪律。
15. As a 用户，我希望打标签、移除标签这类关系变更也被推送，所以标签过滤视图与其他端保持一致。
16. As a 用户，我希望重排序（一次写 N 个 task 的 sortOrder）不会产生 N 次可见的缓存抖动，所以批量写被合并为最终态。
17. As a 用户，我希望清空 Trash（硬删除一批）后其他端立刻移除这些任务，所以不会出现点击已删除任务的错误。
18. As a 维护者，我希望事件载荷与现有列表 DTO 形状一致，所以客户端缓存可以直接写入而不需要形状转换层。
19. As a 维护者，我希望事件动作只有三种（created/updated/deleted），所以事件层不需要随领域语义膨胀。

## Implementation Decisions

以下决策与 ADR-0005 一致，此处按模块归属重述：

**后端 — 事件产生（Prisma 扩展）**

- 用 Prisma `$extends` 拦截 create/update/delete 产生事件，而非在各 service 显式 emit；覆盖所有写路径（含 Assistant 经 API 的写）。
- 事务内收集、commit 成功后统一 flush；同一实体的多次写合并为最终动作（既 created 又 updated 合并为 created）。
- 关系表（TaskTag）的写入映射为父实体（Task）的 `updated` 事件，事件发出前重取该实体的列表 DTO 形状。
- 动作枚举仅三种：`created` / `updated` / `deleted`。移入 Trash、恢复、完成、移动 Bucket 均为 `updated`（软删语义留在 `trashedAt` 字段）；仅硬删除（清空 Trash、级联）发 `deleted`。
- 载荷为「混合」：created/updated 携带完整实体（与该实体列表接口的 DTO 形状一致，如 Task 含内嵌 tags、不含 subtasks）；deleted 只带 id。
- Subtask、Tag 作为独立实体发各自的事件，不内嵌进 Task 事件。
- 覆盖实体：tasks、subtasks、projects、project-headings、areas、tags、tag-groups。feed（派生视图）与 users 不发事件。

**后端 — Event Stream 端点**

- 一条全局每用户流 `GET /events`（SSE），独立于 agent 对话 SSE 端点；两者共用「进程内 pub/sub hub」的实现模式但不共享实例。
- 鉴权与现有 SSE 一致：fetch 流式读取 + Bearer header（EventSource 无法带鉴权头）。
- 每用户一个单调递增序号；连接建立时先发 `hello` 事件携带当前序号；客户端重连带上最后收到的序号，服务端从内存 ring buffer（约 500 条）补发缺口，缺口超出缓冲则指示全量 refetch。
- 序号以 `Date.now()` 播种：服务器重启后序号跳变，客户端检测到巨大缺口即全量 refetch。不持久化事件与序号。
- 单实例假设：hub 为进程内实现，不引入消息总线。

**前端 — 连接管理**

- 由 app 层单例维护（desktop 与 frontend 各自的入口处）：登录成功后建立、登出时断开；不挂任何组件生命周期。
- Quick Add 窗口是独立 webview，独立建立自己的连接。
- 连接解析复用现有 agent SSE 的 fetch + ReadableStream 手工解析模式。

**前端 — 缓存手术（事件应用器）**

- 事件应用器为纯逻辑模块：输入 Change Event（合帧后的批次）与 QueryClient，输出缓存变更；不碰网络、不碰连接。
- 主体路径用 `setQueryData` 直接写：created/updated 对各实体列表缓存 upsert（按实体现有 view 过滤逻辑决定归属）、对详情缓存覆盖；deleted 从所有列表移除并清除详情。
- 无法精准定位的缓存退化为 `invalidateQueries` 兜底。
- 事件以约 50ms 的微任务窗口合帧后再应用，防止成串事件引发连环渲染。
- `refetchOnWindowFocus` 在 `packages/desktop` 与 `packages/frontend` 两处一并关闭；`staleTime` 维持现状（重取的触发责任已转移给事件流）。

**共享类型**

- Change Event 与 Event Stream 的帧类型定义加入 `@taskora/shared`，供后端与两个客户端共用。

## Testing Decisions

好的测试只断言外部行为：写操作发生后流上出现什么事件、缓存发生什么可见变化；不断言拦截器内部状态、hub 的内部结构或组件渲染细节。

三个接缝：

1. **Prisma 扩展 + hub 集成接缝**（后端，新）：经真实 service（如 TasksService）对测试库执行写操作，断言 hub 产生的事件序列——动作、载荷形状、序号单调、事务合并、TaskTag→父实体映射、软删/硬删的动作归类。先例：`packages/backend/test` 下的 service 级 spec（如 `tasks.service.trash-cascade.spec.ts`）使用真实测试库。
2. **`/events` 端点 e2e**（后端）：复用 supertest + 真实 AppModule 的 e2e 模式（先例：`areas.controller.e2e-spec.ts`），覆盖鉴权拒绝、hello 事件、重连补发、缺口超限指示 refetch。SSE 用响应流读取断言。
3. **事件应用器单测**（前端，新）：真实 QueryClient + 预置缓存 + 喂入事件批次，断言缓存可见状态（先例：`packages/api/src/hooks/useTasks.test.ts` 已大量使用 `queryClient.setQueryData` 布置与断言）。覆盖 upsert、跨列表移除、详情覆盖、合帧、兜底 invalidate。

连接管理（fetch 流解析）不新开接缝，复用 agent SSE 已验证的模式。

## Out of Scope

- 增量同步（cursor/变更日志）与本地优先同步引擎（ADR-0005 的 tier-2/3）。
- 离线编辑、离线操作队列。
- 跨实例事件分发（消息总线、Redis pub/sub 等）。
- 事件持久化落库。
- feed、users 实体的事件覆盖。
- loading 态/骨架屏的独立打磨（事件直写缓存后大部分场景已无 loading；残余问题另行处理）。
- Assistant 对话流 SSE 的任何变更。

## Further Notes

- 正确性完全押在 Prisma 拦截器覆盖面上：未来任何绕过 Prisma 的写路径（raw SQL 等）会造成静默漂移，这是 `refetchOnWindowFocus` 关闭后已知的接受风险（见 ADR-0005 Consequences）。
- 前端各实体已有 query key 工厂（如 `taskKeys`），事件应用器按 key 工厂遍历缓存做手术；新增实体时应同步扩展应用器的映射。
- 实现顺序建议：shared 类型 → Prisma 扩展 + hub → `/events` 端点 → 事件应用器 → 两端接线与关闭 focus refetch。每层可独立验收。
