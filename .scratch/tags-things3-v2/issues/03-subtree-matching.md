# 03 过滤语义：按子树命中

Status: implemented
Blocked by: 01

## Problem

按「工作」过滤时，应该也能看到只打了「会议」（「工作」的子 Tag）的条目。

## Design

见 spec「过滤语义」和 Implementation Decisions「树的纯函数」。

- engine：`tagHit`；`TagParents` 增加 Tag 树；`taskMatchesQuery` 的 `tagId` 判定改为子树命中。没有传入树就抛错。
- backend：`tagId` 粗筛先展开成子树 id 列表，四路 `OR` 改为 `IN`。
- api：`task-query-match`（事件流缓存）和 `useEffectiveTags` 跟上；`useTasksQuery({ tagId })` 增加 `tag` 依赖；REST 模式下 Tag 事件让 `tagId` 列表失效。
- 契约夹具 `VIEW_CONTRACT` 增加两层、三层嵌套和悬空父的用例。
- ADR 0016 和 `CONTEXT.md` 的 Effective Tags 词条补上「子树命中」。

## Acceptance

- 三方契约测试覆盖子树命中，并且全部通过。
- 在一台设备上把「会议」移出「工作」，另一台设备上 `/tags/<工作>` 列表实时更新。

## Comments

### 2026-10-06 — 实现

- engine：`TagParents.subtreeOf`，`tagParentsFrom` 增加必传的 `tags` 参数；`tagHit`；`taskMatchesQuery` 改为子树命中。
- backend：`tagId` 查询先读 Tag 树，四路 `OR` 的条件改为 `tagId IN 子树`；e2e 覆盖三层嵌套与经 Project 继承。
- api：Engine 后端读副本里的 Tag；事件流缓存匹配从缓存的 Tag 列表建树；Tag 事件本来就使全部 `tasks` 缓存失效，覆盖了改父的情况。Engine 模式的 live query 已依赖 `tag`。
- 契约夹具增加父 Tag `tag-0`（`tag-1`、`tag-2` 的父），三方契约测试都跑过。
