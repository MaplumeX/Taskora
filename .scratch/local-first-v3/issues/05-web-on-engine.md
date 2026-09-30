# 05 web 接入 Engine，退役 REST 写旁路

Status: implemented — awaiting web acceptance
Blocked by: 04

## Problem

web 仍是 thin client，写入走 REST、绕过合并器。hub 因此维护：字段摘要检测（推断 REST 改了哪些字段）、虚拟设备 0 按 `updatedAt` 合成时钟、collector tap 把 REST 写转成变更事件、`sortOrder` 与 `position` 双排序键。已知后果：回声导致界面闪烁（已修）、REST 写与日志之间的崩溃窗口（ADR-0007 记录）、时钟口径（已由校准缓解）。

## Design

两步走：

1. **REST 写经合并器**（中间态，改动小）：REST 服务不再直接写 Prisma，而是构造字段级事件交给 `SyncHubService.submitVirtualWrite`（虚拟设备 0，hub 墙钟 HLC）。变更日志与数据同事务，崩溃窗口消失；摘要检测只剩兜底用途。
2. **web 跑 Engine**（ADR-0007 原计划）：`@sqlite.org/sqlite-wasm` + OPFS 作为 `SqlStorage` 实现，web 与桌面共用同一 Engine 与后端注入。OPFS 不可用时（隐私模式、旧浏览器）回退为 1 的 REST 路径。之后退役摘要检测、`sortOrder` 排序键与 collector tap 的同步分支。

## Risks

- OPFS 同源单写者：多标签页需要一个 leader（SharedWorker / Web Locks）持有数据库。
- 首次加载要 bootstrap 全量数据（与 08 的分页一起做）。

## Acceptance

- 第 1 步：REST 写入与日志同事务；删除摘要检测后回声测试仍通过。
- 第 2 步：web 断网全功能；多标签页一致。

## Comments

**2026-09-29 实现记录**

第 1 步：REST 写经合并器（backend）

- `SyncHubService.writeAsHub(userId, run)`：一次 REST 调用 = 一个 Postgres 事务。批内 `write(entity, id, fields)` 与设备推送走同一个行级合并（加锁 → LWW → 引用清洗 → 不变量修复 → 落库），`delete(entity, ids)` 与 Delete Request 同一路径（归属、`DELETE_CASCADES`、Compact 登记）。变更在提交前入日志，同一实体在批内多次写只记最后状态。
- 虚拟设备 0 盖章：时间戳高于该行现有的全部字段时钟（调用方看着这些值做的修改，因果在后；也压得过时钟超前的设备）；值未变的字段不写；有变化时补 `updatedAt`（hub 当前时间，不跟着超前时钟进未来）。
- 全部 REST 服务（Tasks / Subtasks / Projects / ProjectHeadings / Areas / Tags / TagGroups / Feed.emptyTrash）改为「读 → domain 规则 → writeAsHub」。Assistant 走这些服务，自然也经合并器。仓库里不再有对同步表的直接 Prisma 写。
- 退役：序列化的摘要检测（`serializeRow` 只认存下的时钟，缺时钟的字段取基线）、collector tap 的同步分支、`publishCompact` / `submitVirtualWrite`、`ChangeEventHub.tap`。collector 仍喂旧 SSE 流。启动时 `materializeLegacyClocks` 把仍带摘要的行按旧规则物化成时钟并清空 `fieldDigests`（不改 `updatedAt`、不入日志）；合并写也清空它。`fieldDigests` 列待确认没有旧 hub 在跑后删除。
- 行为变化：重排 / 更新不再重写值没变的行（不产生变更）；Area 新建标签去重（关系表主键）；转项目提升出的任务保留原 Subtask 的顺序；重开任务删除派生实例与改状态在同一事务。
- 测试：服务写路径改为真库测试（`test/rest-writes.*.e2e-spec.ts`，32 个：字段、日志与数据同事务、时钟语义、整批回滚、各级联），删除对应的 mock Prisma 单测（纯读路径的 mock 测试保留）；回声幂等 e2e 在没有摘要检测的情况下通过；新增摘要物化 e2e。CI 增加 Postgres service 与 `TEST_DATABASE_URL`，这些测试在 CI 里真正运行。

第 2 步：web 跑 Engine（frontend）

- `src/engine/sqlite.worker.ts`：`@sqlite.org/sqlite-wasm` + `opfs-sahpool` VFS，每账号一个池目录（`/taskora/<userId>`）；`worker-storage.ts` 是主线程的 SqlStorage 代理，`sqlite-protocol.ts` 为消息协议。
- `tab-engine.ts`：Web Locks 选 leader 独占副本、Engine、Outbox、HLC 与同步循环；每个标签页的 UI 读写 `TabEngine`（leader 本地执行，其余经 BroadcastChannel 转发）；leader 广播变更与同步状态。leader 关闭后下一个标签页接任，未完成的调用重发（create 由调用方定 id，写幂等）。为此 `Engine.isCompacted` 改为异步。
- `web-engine.ts`：登录后注入全部 Engine backends、停用 SSE 缓存手术（SSE 只作 pull 提示）、leader 跑周期 / 聚焦 / 写后防抖 / SSE 触发的同步与首次 bootstrap 退避；Engine 模式下 React Query 用 `networkMode: 'always'`（否则浏览器离线时查询与 mutation 全部暂停，离线写不上界面）。浏览器不支持 OPFS / Web Locks、副本打不开或来自更新版本时退回 REST（第 1 步路径），后者提示升级。登出释放锁与副本，OPFS 数据保留。
- 测试：worker 协议 + 真实 Engine（node:sqlite 代 wasm）、多标签页（真实 BroadcastChannel + 真实 Engine：代理读写、变更广播、换届重发不重复建行、自己接任、错误与状态传递）、装配（登录 / 登出 / 升级回退 / 不支持）。
- 真机验证（Chromium + 本地 backend + vite dev 与 vite build/preview 各一遍）：登录后 bootstrap、SyncIndicator 显示已同步、leader 锁与 OPFS 目录存在；REST 建的任务经 SSE 提示出现在副本；第二个标签页经 leader 读写、变更实时出现在第一个标签页、推到 hub；断网时两个标签页都能写和改、指示器显示「离线 · N 条待同步」且 follower 同步显示，恢复后推到 hub；关闭 leader 标签页后另一个接任并继续同步；刷新后数据仍在；REST 改名收敛进副本；通过真实 UI 断网新建任务，恢复后 hub 收到。

未做 / 后续：

- `sortOrder` 排序键：Area / Heading / TagGroup 仍以它为唯一排序字段，Task / Project / Tag 上它与 Position 冗余。退役需要把 legacy 行的 Position 物化、从实体注册表与协议里移除字段（协议版本升级），单独做。
- 断网冷启动（无网络时刷新页面）：需要 service worker 缓存应用外壳，并在本地保存身份快照（web 目前刷新时向 `/auth/me` 取用户）。已加载的页面断网全功能。
- 首次加载 bootstrap 全量（与 08 的分页一起做）。
- 桌面 / 移动端的 React Query 同样是默认 `networkMode`：WebView 报告离线时离线写可能不上界面，值得在两端各验证一次。

