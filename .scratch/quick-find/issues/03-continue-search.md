# 03 继续搜索：纳入 Logbook 与 Trash

Status: implemented — awaiting visual acceptance
Blocked by: 02

## Problem

已了结与 Trash 中的条目需要能被找到，但默认结果不应被它们淹没。

## Design

见 spec 第 1、3、4 节。要点：

- 结果末尾的「继续搜索」行（可键盘选中），触发后以 `extended: true` 重新查询，本次打开期间保持；关闭或清空输入后恢复默认。
- 「区域与项目」组在扩展范围下纳入已了结 Project（→ `/projects/:id`）与 Trash 中的 Project / Area（→ `/trash`）。
- `revealRouteFor` 新增 `{ allowTrash: true }`，Trash 中的任务返回 `/trash`；提醒通知路径不传，行为不变。
- Trash 页消费 `revealId`：把目标行设为 Selection 并滚入视野（该页不使用 `TaskItem`）。
- 已了结任务弱化显示，Trash 中的任务带 Trash 标记。

## Acceptance

- 默认结果不含已了结 / Trash；继续搜索后出现，且排在未了结结果之后。
- 打开已完成任务 → Logbook 中定位；打开 Trash 中的任务 → Trash 中定位并选中。
- 提醒通知的 Reveal 对 Trash 中的任务仍不导航（回归测试）。

## Comments

### 2026-09-30 — 实现

- 继续搜索：结果末尾的「继续搜索 · 在日志和废纸篓中查找」是一个可被键盘选中的 option（默认范围下始终在末尾，没有命中时它就是第一项）。触发后面板保持打开，以 `extended: true` 重新搜索，这一行随之消失。关闭面板或清空输入后恢复默认范围。
- 区域与项目：扩展范围下按「未了结 → 已了结 → Trash」的顺序追加项目，但仍先按命中档位排序（与任务组一致）。Trash 中的项目来自 `useFeedQuery('trash', { enabled })`（新增 `enabled` 选项，只在扩展范围下读取）。
  - 偏离 spec：Trash 中的项目打开 `/projects/:id`，而不是 `/trash`，与 Trash 页点击项目行的行为一致。Area 没有 Trash 态，不参与。spec 第 1 节已同步修改。
- Reveal：`revealRouteFor(task, { now, allowTrash })`，签名从位置参数 `now` 改为 options 对象（唯一的外部调用方是 `useRevealTask`）。`useRevealTask()` 返回的函数接受 `{ allowTrash }`；目标为 `/trash` 时不设置 `expandedId`，只设置 `revealId`。提醒通知路径不传 `allowTrash`，行为不变（原有测试保留）。
- Trash 页：`TrashTaskRow` 消费 `revealId`，晚一帧执行（排在换页清空 Selection 之后）：滚到视野中央、设为 Selection、清掉 `revealId`。
- 展示：已了结的任务和项目标题弱化；Trash 中的任务和项目在行尾显示废纸篓图标（`aria-label`「在废纸篓中」）。
- 文案：底栏、顶栏和首页的搜索按钮改用 `search:title`（「快速查找」），删除 `task:searchTasks`。
- 测试：
  - `revealRouteFor` 的 `allowTrash` 分支；`useRevealTask({ allowTrash })` 导航到 Trash 且不展开；
  - Trash 页定位（选中、滚动、一次性消费），以及无定位请求时不改动 Selection；
  - 纯函数：扩展范围下项目的排序与档位；
  - 组件：继续搜索的键盘触发与扩展结果、无结果时的继续搜索、打开 Trash 中的任务、清空输入后复位。
- 验证：全部包 typecheck 通过，eslint 通过。api 341、ui 373、desktop 51、mobile 72、frontend 16 个测试通过。本 issue 未改动 engine 与 backend。

### 2026-10-01 — 改为主内容区展示

- 对照 Things 3：「继续搜索」的扩展结果在主窗口列表中展示，而不是留在 Quick Find 弹窗里。原实现（弹窗内切换 `extended`）不符合。
- 面板：「继续搜索」关闭面板并导航到 `/search?q=<输入>`；面板自身不再有扩展范围（移除 `extended` 状态与 Trash feed 读取）。
- 新增搜索页 `pages/Search.tsx`（三端路由均注册 `/search`）：页头可编辑搜索框写回 `?q=`；分节「区域与项目 → 任务 → 日志 → 废纸篓」，任务 / 日志节用 `TaskListView`（可展开、勾选、键盘 Selection），废纸篓节只读、点击 Reveal 到 Trash。
- 结果行组件抽到 `components/search/QuickFindRow.tsx`，面板与搜索页共用。spec 第 1、3 节已同步。
- 测试：`QuickFind.test.tsx` 的继续搜索用例改为断言关闭面板并跳转；新增 `pages/Search.test.tsx`（扩展范围、分节、跳转与 Reveal、搜索框同步地址）。ui 453、api 346、mobile 72、desktop 51、frontend 24 个测试通过；typecheck、eslint 通过。
