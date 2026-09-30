# 06 响应式查询

Status: implemented — awaiting desktop / mobile acceptance
Blocked by: 02

## Problem

UI 通过 React Query 缓存读 Engine：写入 → 变更通知 → 按实体失效 → 整条查询重跑（含 DTO 映射）。多了一层需要维持一致的缓存，且粒度粗（改一个标签会让所有带标签的列表重查）。

## Design

- Engine 提供 `watch(query, callback)`：查询声明依赖的实体（及可选的过滤键），Engine 在事务提交后只重跑受影响的查询，结果按结构比较后才推送。
- 提供 `useEngineQuery` hook 取代 Engine 模式下的 `useQuery`；REST 模式保留 React Query。
- 第一版不做增量计算，只做「精确失效 + 结果去重」，已能消除大部分无效渲染。

## Acceptance

- Engine 模式下列表视图不再依赖 React Query；写入到渲染只经过一次查询。

## Comments

**2026-09-30 实现记录**

Engine（`packages/engine`）

- `EngineChange.ids`：变更通知带上已知的变更行 id（按实体）。本地 create / update / delete、远端合并与 Compact 都带；级联删除、引用清理波及的实体行未知，缺省即按整个实体处理。
- `live-query.ts`：`watchQuery(source, { dependsOn, run }, observer)`，`Engine.watch` 即它。依赖为实体或 `{ entity, ids }`；`changeAffects` 判定是否重跑。同一 tick 的通知合并为一次重跑（微任务）；重跑期间又来了影响它的变更则作废该结果再跑（最多连续 3 次，防饿死）；结果经 `replaceEqualDeep` 结构共享，与上次相同不推送。`cancel()` 作废在飞 / 排队的结果并让下一个结果必定推送（乐观补丁之后用）；`refresh()` 不依赖数据变更的重跑。只依赖 `onChange`，web 非 leader 标签页的 `TabEngine.watch` 同一实现。

UI 数据层（`packages/api`）

- `engine/live-queries.ts`：Engine 模式的查询存储。`attachLiveQueries(engine)` / `detachLiveQueries()` 切换模式；条目按 React Query 同款键（`hashKey` / `partialMatchKey`）存放，无人订阅时停掉 watch、结果保留 5 分钟（回到视图先显示旧结果再重跑）。
- `hooks/useEngineQuery.ts`：`useEngineQuery`（`useSyncExternalStore` 订阅存储）与 `useReplicaQuery`（两个 hook 都调用、按模式启用其一，模式切换不改 hook 顺序）。任务列表 / 详情、feed、项目列表 / 详情、区域、标签、标签组、项目分组全部改用它，并声明依赖：任务行 `task + tag`；任务详情 `task[id] + subtask + tag`；feed `task + project + tag`；项目 `project + task + tag`（详情限定 `project[id]`）；区域 `area + tag`；标签组 `tag-group + tag`；分组 `project-heading + project[id]`。
- 乐观补丁保留（issue 02 的理由：IPC 下本地写要几帧）：mutation 的缓存操作改经 `useQueryCache()` 门面，每次调用按模式分派到响应式存储或 React Query，补丁代码两种模式共用。补丁会 `cancel` 被改写查询的在飞结果，写入的变更通知随后重跑、以副本为准；失败恢复快照后在 Engine 模式下再重跑一次（补丁作废过的在飞结果可能带着别的变更）。
- 跨日刷新（`useCalendarQueryRefresh`）经门面同样重跑响应式查询（「今天」不是副本数据，没有变更通知）。
- 三端装配：注入后端后 `attachLiveQueries`，不再按变更失效 React Query（`createEngineInvalidator` 只在退回 REST 时整体失效）；`resetBackends` 先 `detachLiveQueries`。

测试

- engine：`test/live-query.test.ts`（12 个：依赖判定、结构共享、行级精确失效含远端 pull 与级联删除、同 tick 合并、在飞结果作废、cancel / refresh、错误后继续、stop）。
- api：`hooks/useEngineQuery.test.tsx`（8 个，真实 Engine + 真实后端 + React 渲染：列表不进 React Query 缓存；一次写入 feed 与任务列表各只重跑一次；写无关实体不重跑；详情只在该任务变更时重跑；没变的行保持同一对象；乐观补丁在写入落库前可见；写入失败恢复；detach 后退回 React Query）。
- 装配测试改为断言装配后立即进入响应式查询模式（不等首次同步）。engine 159 / api 324 / ui 314 / desktop 51 / mobile 68 / frontend 16 全过；各包类型检查、backend 类型检查、lint 通过。
- 真机（Chromium + 独立测试库上的本地 backend + vite dev）：bootstrap 后 Inbox 显示 REST 建的任务；Add task 新建后标题输入框 77ms 内获得焦点；REST 改名经 SSE 提示收敛进视图；第二个标签页经 leader 读到；在一个标签页完成任务，两个标签页都移除该行；本地写推到 hub；断网新建在两个标签页都出现。

待验收

- 桌面端与移动端（Tauri IPC）：新建 / 改日期 / 完成 / 拖动排序无闪回；Today / Upcoming 改项目名、标签颜色即时生效。

未做 / 后续

- 查询仍整条重跑（第一版不做增量计算）。

**2026-09-30 清理**

- 删掉 ui 组件里 mutation `onSuccess` 中直接调用的 `queryClient.invalidateQueries`（TaskItem、TaskRowExpanded 含 SubtaskRow 的 `onMutated`、TaskContextMenu、ProjectContextMenu、ProjectMetaRow、AreaMoreMenu）。两种模式下都是重复刷新：REST 模式对应 hook 的 `onSettled` 已经经 `refreshAfterWrite` 刷新 detail / 列表 / feed（子任务按 taskId 刷新父任务详情），Engine 模式由响应式查询自动更新。组件里不再有对副本数据查询的直接失效。
