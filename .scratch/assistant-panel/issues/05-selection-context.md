# 05 — 选中项作为助手上下文（待评估）

Status: needs-triage
Blocked by: 02

## Problem

面板和列表并排后，「把这几个推到明天」这类说法很自然，但助手不知道用户选中了什么，也不知道当前在哪个视图。系统提示词目前只注入日期和时区（`agent-runtime.service.ts`）。

## 待定问题

- 上下文随每条消息发送（`SendConversationMessageDto` 加可选字段），还是只在用户显式附上时发送（输入框上方显示「已选 3 项」chip，可移除）？倾向后者，避免误操作。
- 只传 id 让助手自己 `get_task`，还是附带标题等摘要以省一轮工具调用？
- 上下文是否持久化进消息历史（影响全屏回看时能否理解当时的指代）？
- 来源：键盘 Selection（`selection.store` 的 `selectedIds`）；触控没有面板，暂不涉及 Multi-Select。

## Comments
