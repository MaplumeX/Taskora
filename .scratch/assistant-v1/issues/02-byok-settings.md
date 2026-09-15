# 02 — BYOK 配置存储与设置页

Status: open

## 任务

- Prisma schema：User（或独立表）新增 agent 配置字段：`baseUrl`、`apiKeyEncrypted`、`modelId`。
- AES-256-GCM 加密工具（`AGENT_ENCRYPTION_KEY` env 主密钥；`.env.example` 补条目）。
- 后端 REST 端点：读取（不回传完整 key，仅尾 4 位掩码）、写入/更新、连通性测试（列 models 或最小 chat 请求）。
- 设置页（`packages/ui`）：provider 预设下拉（[OI] / DeepSeek / OpenRouter / Ollama / 自定义）自动填充 baseUrl 与建议 Model ID，三件套可自由覆盖。

## 验收

- 配置保存后 key 在 DB 中为密文。
- 预设选择后无需手填 baseUrl 即可通过连通性测试。

## Comments
