# 02 拖动 Magic Plus 插入列表

Status: implemented — awaiting device acceptance
Blocked by: 01

## Problem

新任务只能落在末尾。

## Design

见 spec「拖动」「Implementation Decisions」。

- FAB 作为全局 DndContext 的拖拽源（固定 id），FAB 上的传感器 `distance: 8`、无 delay；未越过阈值松手仍走点按。
- `DndSurface` 增加可选的 Magic Plus 处理：拖动中在落点渲染占位行，松手时把落点翻译为「新建 DTO + 插入位置」。复用现有行拖拽的落点 / 跨组改归属 / Heading 规则。
- 新建后 reorder 插到落点（同 ⌘V 粘贴路径），展开并进入标题编辑。
- 覆盖：平铺列表（Inbox / Anytime / Someday / Today 平铺等）、分组视图（跨组改归属）、项目页（含 Heading 下）。不可排序的列表与非列表区域松手 = 取消。

## Acceptance

- 平铺列表：放在第 2、3 行之间，新任务出现在该处。
- 分组 Today：放进某项目组，新任务归属该项目、计划为今天。
- 项目页：放在某 Heading 下，新任务属于该 Heading。
- 点按（移动 < 8px）行为与 01 一致。
- 落点 → DTO 的翻译有纯函数单测。

## Comments

### 2026-10-10 — 实现

- `lib/magicPlus.ts`：`MAGIC_PLUS_ID`（按钮的拖拽源）、`MAGIC_PLUS_DRAFT_ID`（列表里撑空位的草稿任务）、草稿构造、`useMagicPlusCreate(context)`（新建 + 展开 + Selection，失败 toast）。
- `appDnd`：
  - 传感器：新增 `MagicPlusSensor`（PointerSensor，`distance: 8`，只认 `data.magicPlus`）；行用的 Mouse / Touch 传感器改为跳过 Magic Plus。dnd-kit 同一拖拽源上同名 activator 只保留最后一个，所以三者各占 `onPointerDown` / `onMouseDown` / `onTouchStart`。
  - `DndSurface.magicPlus`：Magic Plus 交给最后登记的接收方；不进侧边栏。
  - 浮层由 provider 渲染（圆形按钮，无落位动画）；松手点距原位 < 48px 视为拖回取消（`onDragCancel`）。
- `MobileFab`：无菜单时 `useDraggable`，按钮 `touch-none`、拖动中原位淡出。dnd-kit 激活后会吞掉随后的 click，拖完不会误触发点按。
- `GroupedFeedListView`（Inbox / Today / Anytime / Someday / Tomorrow / Tag）：草稿作为来源容器不存在的任务走 `moveFeedItemToTarget` 预览；松手按所在组给归属，新建后把草稿换成新任务，按显示顺序 `reorderFeed`。空列表拖动时渲染一块占位投放面。
- `ProjectTaskLayout`：新增 `placeTask`（不在布局里就插入；`moveTaskToPlacement` 语义不变）；松手后新建，替换草稿后整份写回布局（Heading 归属随布局写入）；新建期间暂存服务端布局，避免新任务先闪到末尾。空项目拖动时也有投放面。过滤视图不接收。
- 松手到新任务建好之间草稿行一直是空位（不可点、不可勾选）；新建失败时空位消失。
- 测试：`appDnd.test`（路由、不进侧边栏、拖回取消、无接收方）、`GroupedFeedListView.test`（插入位置 + 页面上下文、进项目组改归属、拖回取消、没进列表不建、失败无残留）、`ProjectTaskLayout.test`（Heading 下插入、空项目、拖回取消、失败无残留、`placeTask`）、`MobileFab.test`（有无菜单时是否可拖）。

### 未覆盖 / 已知

- 只在 jsdom 里验证了落点与写入；真实指针激活、浮层跟手、自动滚动未在真机上验证。
- 区域页有菜单，FAB 暂不可拖：Radix 菜单在 pointerdown 就打开，和拖动冲突。与首页一起在 06 处理。
- Upcoming 已显示 FAB，但拖动在 05 之前没有落点（松手无效果）。
