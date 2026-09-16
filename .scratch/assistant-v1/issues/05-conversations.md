# 05 — Conversation 持久化、SSE 流式端点、自动标题

Status: done

## 任务

- Prisma schema：`Conversation`（id、userId、title、createdAt、updatedAt）+ 消息表（存 pi-agent-core `AgentMessage` 序列化 JSON，保留原始 role/工具调用结构）。
- REST：会话 CRUD（列表带标题、新建、删除、重命名）。
- SSE 端点：按 Conversation 订阅事件流，转发 `message_update`（文本增量）、`tool_execution_*`、批准请求等；断线重连不丢终态（消息以持久化为准）。
- 发送消息：POST 触发 `agent.prompt()`，运行期间入队（steering/follow-up 策略：V1 简化为排队顺跑）。
- 标题生成：首轮 `agent_end` 后追加一次轻量 LLM 调用生成短标题；失败降级为首条用户消息截断。
- 服务重启后从消息表恢复 `agent.state.messages`。

## 验收

- 刷新/重开页面后历史完整、可继续对话。
- 多会话可创建、切换、删除；列表展示自动标题。
- 文本增量在前端逐字渲染。

## Comments
