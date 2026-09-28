# 02: Reveal Task —— 点击通知定位并展开任务

Status: implemented
Blocked by: 01

Spec：`../spec.md`「点击跳转（Reveal Task）」。

## 范围

- 新增 UI 动作 `revealTask(taskId)`：按「Today 可见 → Project → Area → Bucket」的顺序选择路由，`navigate` 之后设置 `uiInteraction.expandedId`，并滚动到可见位置。
- 任务不存在或已进 Trash 时不导航。
- 在 Desktop 与 Mobile 的 App 壳里各暴露一个入口（订阅平台事件后调用 revealTask），供 03/04 接线使用。
- 若 `expandedId` 在导航完成后才能生效（列表尚未渲染），需要确认时序，沿用 `pendingAutoEditId` 类似的待生效机制。

## 验收

- 组件测试：不同归属/Bucket 的任务跳到正确路由并展开；不存在的任务不导航。

## Comments

### 2026-09-28 — 实现

- `utils/revealRoute.ts`：`revealRouteFor(task)`，是纯函数。按「Today → Project → Area → Upcoming/Someday/Anytime/Inbox」的顺序选路由；已了结的任务落到 `/logbook`（spec 没写，补上以免跳进一个看不到它的视图）；已进 Trash 返回 null。「今天」按账号时区判断。
- `stores/taskReveal.store.ts`：`requestTaskReveal(taskId)`，供平台壳（03/04）在 React 树之外调用。请求以待处理状态保存，所以早于 AppShell 挂载的冷启动请求也不会丢。
- `hooks/useRevealTask.ts`：`useRevealTask` / `useTaskRevealListener`，后者挂在 `AppShell`。执行时会先关闭设置窗口和搜索（它们会挡住目标行），再设置 `expandedId` 和 `revealId`，然后导航。
- `uiInteraction.store` 新增 `revealId`。`TaskItem` 在展开状态下发现自己是 `revealId` 时，滚到视野中央并清除该字段。普通点击展开不会触发滚动。
- 不设置 Selection：路由一变，KeyboardShortcuts 会清空 Selection（story 25），只保留展开状态。
