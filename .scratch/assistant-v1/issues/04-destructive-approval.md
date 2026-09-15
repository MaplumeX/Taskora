# 04 — 破坏性操作拦截与批准流

Status: open

## 任务

- `beforeToolCall` 拦截器：命中 `destructive` 标记的工具调用时 block，生成 pending approval 记录（Conversation、toolCallId、工具名、参数快照），通过 SSE 推给前端。
- 批准端点：POST 批准/拒绝。批准后以相同参数续跑（pi-agent-core 的续跑机制或 `continue()` 组合）；拒绝时向 LLM 返回"用户拒绝"的 toolResult，让助手自然回应。
- 批准卡片 UI：工具名 + 参数摘要 + 批准/拒绝两键；不做参数修改。
- Pending approval 的失效策略（用户切走、超时、Conversation 删除）。

## 验收

- agent 说"帮我清空垃圾箱"时前端出卡片，拒绝后助手能道歉并继续对话，Trash 未被清空。
- 批准的调用与用户直接操作结果一致。

## Comments
