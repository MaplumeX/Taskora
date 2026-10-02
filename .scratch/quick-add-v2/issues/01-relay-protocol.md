# 01：中继协议（快照、完整草稿提交、结果回执）

Status: implemented — awaiting desktop verification
Blocked by: quick-add-android/01（共用草稿落库函数）

## Problem

Quick Add 窗口不装配 Engine，现在只能把 `{ title }` 发给主窗口。卡片要显示归属、Tag 等选择器，就需要 Projects / Areas / Tags 数据；提交时也要带上完整字段。

## Design

见 spec 第 3 节。

- `quick-add-relay.ts`：
  - 新增事件 `quick-add://snapshot-request` 和 `quick-add://snapshot`。主窗口通过 `currentTaskBackend` 同层的读接口，从本地副本取 Projects、Areas、Tags、Tag Groups 和偏好，回发给 `quick-add` 窗口。
  - `quick-add://submit` 的 payload 改为 `{ draft: QuickAddDraft }`，同时兼容旧格式 `{ title }`。
  - 落库调用共用的 `createFromQuickAddDraft`（`.scratch/quick-add-android/issues/01`），不在中继里自己写转换规则。
  - 新增 `quick-add://result` 回执；失败时发系统通知（Tauri notification 插件），保留现有的 toast。
- Quick Add 侧：新增 `requestSnapshot()`，带 1 秒超时。收到快照后 `setQueryData` 到对应的查询键，并设 `staleTime: Infinity`。偏好写入对应的 store。
- `main.tsx` 的 quick-add 分支要包一层 `QueryClientProvider`。目前它只创建了 `QueryClient` 给 Event Stream 用，没有挂到 React 上。
- 实现时要先确认：quick-add 窗口里 `useReplicaQuery` 走的是 React Query 分支；带快照数据时不会触发 REST 请求。

## Acceptance

- 主窗口在线或离线时，打开 Quick Add 都能拿到与主窗口一致的项目和 Tag 列表。
- 提交带日期、截止日期、Tag、归属、Reminder 的草稿后，主窗口中的任务字段完全一致，并且经过 Outbox。
- 旧格式 `{ title }` 仍能创建任务。
- 创建失败时出现系统通知。
- 测试：扩展 `quick-add-relay.test.ts`，覆盖快照应答、新旧 payload、Reminder 二次写、失败回执。

## Comments

### 2026-10-02：实现

- 事件名和载荷类型拆到 `quick-add-protocol.ts`，主窗口侧（`quick-add-relay.ts`）和浮窗侧（新文件 `quick-add-client.ts`）共用，浮窗不必为了几个常量引入主窗口那一侧的依赖。
- 主窗口：
  - `snapshot-request` → 读 `getProjects` / `getAreas` / `getTags` / `getTagGroups`（主窗口装配了 Engine 时即本地副本）→ `emitTo('quick-add', snapshot)`。读取失败时不应答，由浮窗自行超时。
  - `submit` 载荷先经新导出的 `toQuickAddDraft` 规整（IPC 载荷同样不可信），再交给 `createFromQuickAddDraft`。新载荷 `{ draft, requestId }` 和旧载荷 `{ title }` 都接受。
  - 回执 `result`：成功带 `taskId` / `placedIn`；失败时弹 toast，再通过 `plugin:notification|notify` 发系统通知，并发失败回执。
- 浮窗：
  - `main.tsx` 的 quick-add 分支挂上 `QueryClientProvider`，查询默认 `staleTime: Infinity`、`retry: false`。
  - 每次打开（以及挂载时已登录）调用 `refreshQuickAddData`：重新读取偏好 store（周起始日、账号时区都在同源 localStorage 里，不必放进快照），再请求快照写入缓存。
  - 提交改用 `submitQuickAddDraft({ title })`。卡片字段是 issue 03 的事，回执的消费放到 issue 04。
- 测试：`quick-add-relay.test.ts`（7 条）、`quick-add-client.test.ts`（4 条：只认自己的 requestId、超时、写缓存、提交）。
- 已知边界：
  - 快照超时时，字段组件的 React Query 会退回调 REST 的 `queryFn`。在线时能拿到服务端数据，离线时为空，与 spec「只能进 Inbox」的效果一致。
  - 浮窗自己的 Event Stream 若使这些查询失效，会从 REST 重新拉取，覆盖快照。结果是服务端数据，只少了本地 Outbox 里尚未同步的新建项。下次打开浮窗会重新拿快照，可以接受。
- **未验证**：没有在桌面应用里实际运行。需要验证：打开浮窗后主窗口收到请求并回发快照；离线时提交仍进 Outbox；失败通知能弹出。
