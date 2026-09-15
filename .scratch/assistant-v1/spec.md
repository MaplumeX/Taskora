# Assistant V1 Spec

Taskora 对话式助手 V1。架构决策见 `docs/adr/0003-backend-agent-with-pi-agent-core-byok.md`；术语见根 `CONTEXT.md`。

## 范围

- **运行时**：`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`，Agent 实例跑在 NestJS 新增 `agent` 模块内。
- **工具权限**：全量读写用户数据，工具直接调用现有 service（areas / projects / tasks / subtasks / tags / tag-groups / project-headings / feed），以请求用户 `userId` 隔离。
- **破坏性操作确认**：删除、清空 Trash、Area/Project 结构变更类工具调用经 `beforeToolCall` 拦截，前端展示批准卡片（工具名 + 参数 + 批准/拒绝），批准后放行续跑。
- **BYOK**：设置页配置 [OI] 兼容端点三件套（Base URL + API Key + Model ID），附 provider 预设（[OI] / DeepSeek / OpenRouter / Ollama / 自定义）填充默认值。API Key 以 AES-256-GCM 加密存 Postgres，主密钥来自环境变量 `AGENT_ENCRYPTION_KEY`。
- **会话**：多 Conversation（ChatGPT 式列表 + 切换），消息历史持久化，服务重启可恢复上下文；标题由 LLM 自动生成，失败降级为首条用户消息截断。
- **流式传输**：SSE 推送 pi-agent-core 事件（`message_update` 文本增量、`tool_execution_*`）；用户输入走普通 POST。
- **UI**：`packages/ui` 新增独立聊天视图（路由 `/agent`），web 与 desktop 同时接入；系统提示词要求回复语言跟随用户消息语言。
- **命名**：工程模块与代码用 `agent` / `Conversation`；用户可见文案用「助手 / Assistant」。

## 明确不做（V1）

- 图片/文件附件输入
- 对话内搜索、跨 Conversation 记忆
- 批准卡片上修改参数（只有批准/拒绝）
- Agent 主动提醒/推送（等后端有提醒能力）
- 移动端
- 服务端统一 key / 计费

## Issues

- `issues/01-agent-module-runtime.md` — `agent` NestJS 模块与 pi-agent-core 运行时接入
- `issues/02-byok-settings.md` — BYOK 配置存储（AES-GCM）+ 设置页 + provider 预设
- `issues/03-agent-tools.md` — 工具层：封装现有 service 为 AgentTool
- `issues/04-destructive-approval.md` — 破坏性操作拦截与批准流
- `issues/05-conversations.md` — Conversation 持久化、SSE 流式端点、自动标题
- `issues/06-agent-ui.md` — `packages/ui` 聊天视图 + web/desktop 接入
