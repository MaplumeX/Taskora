# 06 — 聊天视图与 web/desktop 接入

Status: done

## 任务

- `packages/ui` 新增聊天视图（路由 `/agent`）：左侧 Conversation 列表（新建/切换/删除/重命名），右侧消息流 + 输入框。
- 消息渲染：用户/助手气泡、流式打字、工具调用卡片（进行中/完成/失败状态）、批准卡片（04）。
- `packages/api` 新增 agent 客户端：SSE 订阅封装（对接 TanStack Query 体系之外的流式状态管理）、会话 CRUD、发送消息、批准端点。
- web（`packages/frontend`）与 desktop（`packages/desktop`）路由接入，两端口径一致。
- i18n：用户可见文案全部走「助手 / Assistant」词条（en + zh-CN）。

## 验收

- web 与 desktop 均可完成：新建会话 → 流式对话 → 触发工具 → 批准破坏性操作 → 切换会话。
- 中英文界面文案完整。

## Comments
