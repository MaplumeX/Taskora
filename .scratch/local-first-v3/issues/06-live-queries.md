# 06 响应式查询

Status: ready-for-agent
Blocked by: 02

## Problem

UI 通过 React Query 缓存读 Engine：写入 → 变更通知 → 按实体失效 → 整条查询重跑（含 DTO 映射）。多了一层需要维持一致的缓存，且粒度粗（改一个标签会让所有带标签的列表重查）。

## Design

- Engine 提供 `watch(query, callback)`：查询声明依赖的实体（及可选的过滤键），Engine 在事务提交后只重跑受影响的查询，结果按结构比较后才推送。
- 提供 `useEngineQuery` hook 取代 Engine 模式下的 `useQuery`；REST 模式保留 React Query。
- 第一版不做增量计算，只做「精确失效 + 结果去重」，已能消除大部分无效渲染。

## Acceptance

- Engine 模式下列表视图不再依赖 React Query；写入到渲染只经过一次查询。

## Comments
