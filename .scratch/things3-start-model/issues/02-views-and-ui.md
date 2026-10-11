# 02 视图与 UI：Anytime 含今天的任务，Clear 落 Anytime

Status: implemented
Blocked by: 01

## Design

- api 层（hooks、engine backends、事件匹配、mappers）与 ui 层全部改用 `start` + `scheduledDate`。
- Anytime：今天和已过日期的任务出现，行上显示黄色星星（`TaskTodayBadge` 现有逻辑）。
- 计划卡片 Clear：`{ start: ANYTIME, scheduledDate: null }`；移入 Inbox：`{ start: INBOX }`。
- 侧栏拖放、键盘快捷键、Magic Plus、Quick Add、移动选择器同步改写。

## Acceptance

- 今天的任务同时出现在 Today 和 Anytime（带星）。
- 无归属任务清除计划后进入 Anytime，不回 Inbox。
- 全仓 typecheck、lint、测试通过。

## Comments

### 2026-10-11 — 实现

- api：mappers、Engine 后端、事件匹配（Anytime 含日期已到）、乐观行用 `resolveTaskStart`、Reveal / 页面新建上下文 / Quick Add。
- ui：计划卡片 Clear 写 `{ start: ANYTIME, scheduledDate: null }`；侧栏拖放、键盘 ⌘R/⌘O/⌘T、移动选择器（移入 Inbox 只写 `start: INBOX`）、Magic Plus 草稿、Quick Add 卡片。
- Anytime 页面今天的任务沿用 `TaskTodayBadge` 黄星。
- 全仓 typecheck / lint / 测试通过；**未在真实应用里目视验收**。
