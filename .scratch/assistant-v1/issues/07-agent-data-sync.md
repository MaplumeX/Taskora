# 07 — Agent 数据变更的实时缓存同步

Status: done

## 问题

Agent 工具直接经后端 service 写数据库，绕过了前端所有 REST mutation hook。
前端域数据（Projects / Tasks / Areas / Tags / …）全走 TanStack Query 缓存，而
SSE 事件处理（`useAgentStream` 的 `agent_end` 分支）只 invalidate 了助手自己的
queries（messages / conversations），域数据缓存从未失效。

复现：让 Assistant 创建一个新 Project，聊天里工具已执行成功，但侧边栏要等
手动刷新页面才显示新项目。

## 方案

- `@taskora/shared`：`AgentSseEvent` 新增 `{ type: 'data_changed'; toolName: string }`。
- `backend`：`agent-tools.ts` 导出 `isReadOnlyToolName()`（只读工具按
  `list_*` / `get_*` / `search_*` 命名约定识别）；runtime 在
  `tool_execution_end` 且非只读工具成功执行后额外 emit `data_changed`。
- `@taskora/api`：`useAgent.ts` 新增 `invalidateDomainData(queryClient)`，
  失效全部域 query family（列表 + detail 前缀）。
- `@taskora/ui`：`useAgentStream` 收到 `data_changed` 时调用上述 helper，
  侧边栏 / bucket 视图 / detail 页在工具执行成功的瞬间即刷新。

## 已知限制

- `data_changed` 只在 `/agent` 页面挂着 SSE 订阅时会被消费：若用户在 agent
  运行中途离开该页面，变更只能等 staleTime（30s）过期或手动刷新后可见。
  彻底解决需要全局订阅（AppShell 级）或后端广播通道，留待后续。
- 采取的是「全量域失效」而非按工具精细映射：个人规模数据集下代价可忽略，
  且新增工具自动被覆盖。

## 验收

- `packages/api/src/hooks/useAgent.test.ts`：domain keys 全部 invalidated，
  agent / users keys 不受影响。
- `packages/ui/src/components/agent/useAgentStream.test.tsx`：`data_changed`
  触发 `invalidateDomainData`；只读工具事件不触发。
- shared / backend / api / ui / frontend typecheck + lint + test 全绿。

## Comments
