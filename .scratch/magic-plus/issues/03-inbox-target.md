# 03 拖到左下角 Inbox 目标

Status: implemented — awaiting device acceptance
Blocked by: 02

## Problem

想记一条与当前列表无关的任务，要先回首页进 Inbox。

## Design

见 spec「Inbox 目标」。

- 除 Inbox 页与首页外，拖动开始后左下角浮现 Inbox 目标，悬停高亮。
- 在其上松手：不在列表里建行，弹出 `QuickAddCard`（Inbox 上下文），留在当前页。

## Acceptance

- 在 Today 拖到 Inbox 目标松手 → 弹出卡片，添加后任务在 Inbox、当前页不变。
- Inbox 页、首页拖动时不出现目标。

## Comments

### 2026-10-10 — 实现

- `MagicPlusInbox`（挂在 `AppShell`）：拖动 Magic Plus 时左下角浮现圆形 Inbox 目标（虚线框，悬停时实心高亮），Inbox 页与首页不出现。
- `appDnd`：Magic Plus 的碰撞先看指针是否在 Inbox 目标上（同侧边栏的处理，列表收回空位）；在其上松手时列表 `onDragCancel`，目标经 droppable data 的 `onDrop` 打开卡片。provider 新增 `magicPlusDragging`，`useMagicPlusInboxTarget`。
- 卡片：`QuickAddCard` 放在 Dialog 里（靠上，免被键盘挡），触屏按钮行「取消 / 添加」。提交走共用的 `createFromQuickAddDraft`，deps 换成 `useCreateTask` / `useUpdateTask` 的 mutation，列表缓存照常更新；成功后提示「已添加到「收件箱」」（改了归属则为对应名称）。
- api 导出 `QuickAddDeps` 类型。
- 测试：`appDnd.test`（目标只对 Magic Plus 生效、松手交给目标并复位列表）、`MagicPlusInbox.test`（只在拖动时出现、Inbox / 首页不出现、松手开卡片并走共用落库）。
