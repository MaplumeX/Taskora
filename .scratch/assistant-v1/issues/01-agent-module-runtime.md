# 01 — agent 模块与 pi-agent-core 运行时接入

Status: done

## 任务

在 `packages/backend` 新增 NestJS `agent` 模块：

- 安装 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`，注册到 workspace 依赖。
- 建立按用户 + Conversation 维度管理 `Agent` 实例的运行时服务（内存实例池 + 从 DB 恢复 `messages` 重建状态）。
- 系统提示词：助手身份、回复语言跟随用户消息语言。
- 以自定义 `Model<'openai-completions'>`（`baseUrl` 来自用户 BYOK 配置）接入 [OI] 兼容端点；V1 可先用 env 配置的开发端点跑通冒烟。
- 事件订阅桥接：`agent.subscribe(...)` → 后续 SSE 端点（本票只留接口，05 落地）。

## 验收

- 冒烟脚本可对某测试用户完成一次 prompt → 流式回复 → `agent_end`。
- Agent 状态可从持久化消息重建（重启后 continue）。

## Comments
