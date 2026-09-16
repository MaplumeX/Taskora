# 后端 Agent（pi-agent-core）+ BYOK 加密落库

Taskora 引入对话式助手，Agent 实例跑在后端 NestJS `agent` 模块内（基于 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`），工具直接复用现有 service 并以请求用户 `userId` 隔离。LLM 采用 BYOK：用户在设置页配置 OpenAI 兼容端点三件套（Base URL + API Key + Model ID，附 provider 预设），API Key 以 AES-256-GCM 加密存 Postgres，主密钥来自服务端环境变量。事件流走 SSE；破坏性操作经 `beforeToolCall` 拦截并由用户批准。

## Considered Options

- **前端直跑 Agent（streamProxy 代理 LLM 调用）**：交互延迟低、key 可留在前端钥匙串，但 web 端 key 只能落 localStorage，且 Tauri 端需另做一套；多端逻辑分裂。
- **用户 key 不落盘（每请求携带）**：流式期间需持续传 key，后端会话恢复（重启续聊）不可用。
- **明文存 key**：DB 泄露即全部用户 key 泄露。

## Consequences

- 换运行时（pi-agent-core → 其他框架）意味着跨 web/desktop 重写工具层与事件流协议，属高成本变更。
- 加密仅保护 at-rest：拥有 env 主密钥的服务端进程内存中仍会出现明文 key。
- pi-agent-core 版本演进较快（当前 0.x），升级需盯 changelog。
- pi-ai 以自定义 `Model<'openai-completions'>` + `baseUrl` 接 OpenAI 兼容端点，非官方 provider 目录内的模型需用户手填 Model ID。
