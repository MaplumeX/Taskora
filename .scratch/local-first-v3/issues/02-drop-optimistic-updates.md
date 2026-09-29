# 02 Engine 模式去掉乐观更新

Status: ready-for-agent

## Problem

`packages/api/src/hooks` 里有 32 处 `onMutate` 乐观更新，是为远程 API 设计的：请求要几百毫秒，所以先改缓存。Engine 模式下写入本地副本只要几毫秒，乐观更新反而带来一整类缓存一致性缺陷：只改了 `['tasks']` 没改 `['feed']`、多步操作中间态、失败回滚要同时照顾两类缓存等（审查中的 #8 / #11）。

## Design

- `packages/api` 暴露「当前后端是否为 Engine」的判断（backend 注入点已存在）。
- 各 mutation hook 在 Engine 模式下跳过 `onMutate` / `onError` 回滚，只依赖 Engine 的变更通知（已合并失效，`createEngineInvalidator`）。REST 模式（web）保持现状。
- 保留交互上确实需要瞬时反馈的两处：拖动排序（松手到重查之间的一帧）、勾选完成（动画期间）。对这两处，改为组件内的临时视觉状态，而不是改写查询缓存。

## Steps

1. 统计并分类 32 处 `onMutate`：纯缓存补丁 / 有交互反馈需求。
2. 引入 `isEngineBackend()`，在 hook 层分支。
3. 拖动与勾选改成组件内临时状态。
4. 在 Engine 模式下跑现有 UI 测试；补测「写入后一次失效内完成刷新、无中间态」。

## Acceptance

- Engine 模式下写入后 UI 在一次合并失效内更新到最终状态，无弹回、无中间态。
- web（REST）行为不变。
- `useTasks.ts` 等 hook 在 Engine 模式下不再触碰缓存。

## Comments
