# 03 — 工具层：现有 service 封装为 AgentTool

Status: done

## 任务

- 将现有 service 能力封装为 `AgentTool`（typebox 参数 schema），全部以请求用户 `userId` 过滤，禁止跨用户数据：
  - 只读：列出/查询 areas、projects、tasks（含 Today / Upcoming / Inbox 等 Bucket 视图）、tags、feed、搜索。
  - 写：创建 task/subtask、完成、改日期/截止、移动 project/area、打标签。
  - 破坏性：删除（软删入 Trash）、清空 Trash、创建/改名/删除 area 与 project、project heading 结构变更 —— 工具定义上标记 `destructive`（供 04 的拦截器识别）。
- 工具命名与参数描述面向 LLM 可用性（含英文 description），返回精简结构化文本。
- 错误处理遵循 pi-agent-core 约定：失败时 throw，不返回错误文本。

## 验收

- 覆盖全部现有模块的代表性读写操作。
- 任意工具调用均无法触达其他用户数据（含构造恶意参数）。

## Comments
