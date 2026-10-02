# 01 — 当前对话与流式状态提升到全局

Status: implemented — awaiting visual acceptance

## Problem

`activeId` 是 `packages/ui/src/pages/Agent.tsx` 的局部 state，流式状态是 `useAgentStream` 的组件内 state。面板和全屏是两个独立挂载的组件，直接复用会各自持有一份：切换模式时会丢掉当前对话，运行中的打字效果也会中断。

## Design

见 spec 第 2 节。

- `@taskora/api` 新增全局 store（或扩展 `uiInteraction.store`）：`activeConversationId`、`setActiveConversation`。回落规则（无选中 / 已删除 → 最近更新的 Conversation）从 `Agent.tsx` 的 effect 移到一个共用 hook。
- 流式状态按 conversationId 存在组件外（zustand store 或模块级 Map），`useAgentStream` 只负责订阅和写入；挂载点切换时读到的是同一份状态。`AgentChatView` 把 `streamingThinking` / `streamingText` / `runningToolCallIds` / `agentActive` 喂给 `buildTurns`（#144），接口保持不变即可。
- `ProcessBlock` / `ThinkingStep` 的展开状态是组件内 state，切换模式后会复位为折叠——可接受，不提升。
- 同一 conversationId 同时只保持一条 SSE 订阅（引用计数或单例订阅管理）。
- `Agent.tsx` 改用新 store，行为不变。

## Acceptance

- `/agent` 现有行为不变：默认选中最近的会话、新建后切到新会话、删除当前会话后回落。
- 单测：两个消费者挂载同一 conversationId 时只建立一条订阅；先卸载一个、再挂载另一个，流式状态保留。
- typecheck + lint + test 全绿。

## Comments

### 2026-10-02 — 实现

- 当前对话：`@taskora/api` 新增 `useAssistantUiStore`（`stores/assistantUi.store.ts`，本机持久化），`useActiveConversation()`（`hooks/useAgent.ts`）按「存储的选择仍在列表里 → 用它，否则最近一条」**推导**，不再用 effect 回写；`Agent.tsx` 改用它。
- 流式状态：`useAgentStream` 改为模块级注册表（每个 conversationId 一条 SSE 订阅 + 一份状态），`useSyncExternalStore` 读取。最后一个使用者卸载后保留 `STREAM_RELEASE_DELAY_MS`（2s）再断开——面板与全屏切换时 React 先卸后挂，宽限期内直接复用，打字效果与运行中的工具不中断（SSE 端点不回放增量，重连会丢）。
- 测试：`useActiveConversation.test.tsx`（回落、共享）；`useAgentStream.test.tsx` 新增共享订阅、宽限期内复用、超时后断开。
