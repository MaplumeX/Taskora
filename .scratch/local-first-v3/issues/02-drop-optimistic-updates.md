# 02 Engine 模式的缓存更新：单一刷新来源与完整补丁

Status: implemented — awaiting desktop acceptance

## Problem

`packages/api/src/hooks` 里有 32 处 `onMutate` 乐观更新，是为远程 API 设计的：请求要几百毫秒，所以先改缓存。Engine 模式下写入本地副本只要几毫秒，乐观更新反而带来一整类缓存一致性缺陷：只改了 `['tasks']` 没改 `['feed']`、多步操作中间态、失败回滚要同时照顾两类缓存等（审查中的 #8 / #11）。

## Design（2026-09-29 修订为方案 B）

原方案是在 Engine 模式下去掉乐观更新。动手前量了一下：桌面端和移动端的本地库经 Tauri IPC 访问，修改一个任务要 10 次存储往返，再经 16ms 通知合并窗口，然后每条活跃查询各自重查。估算桌面端晚约 2 帧，手机上晚 4–6 帧（60–100ms），会出现「选完日期先显示旧日期再跳」这类用户反馈过的闪回。因此改为：

1. **保留即时显示**：Engine 模式下仍立即改缓存，但所有补丁都经共享 helper，覆盖同一实体出现的每一类列表缓存。项目、区域、标签此前只改自己的列表，而 feed、任务列表里嵌着同一份数据（项目行、标签芯片），会滞后一拍，这次补齐。
2. **单一刷新来源**：Engine 模式下 mutation 不再在 `onSuccess` / `onSettled` 自己让缓存失效，由 Engine 的变更通知（`createEngineInvalidator`）负责。每次写入的重查从两轮降为一轮。
3. **失败回滚保留快照恢复**：它精确且与模式无关；Engine 模式下写入失败只可能是代码 bug，恢复快照后不再额外刷新。
4. 真正去掉这层缓存留给 06（响应式查询）。

## Steps

1. `isEngineMode()`：由当前注入的后端推导（各域后端总是一起注入）。
2. hook 里 `onSuccess` / `onSettled` 的失效改走 `refreshAfterWrite`，Engine 模式下为空操作；`onError` 里的恢复不变。
3. 项目 mutation 同时修补 feed 里的项目行；标签 mutation 同时修补任务、项目、feed 里嵌入的标签芯片。
4. 测试：Engine 模式下写入不触发 hook 自身的失效；feed 里的项目行、嵌入标签即时更新；REST 模式行为不变。

## Acceptance

- Engine 模式下每次写入只有一轮重查（Engine 通知驱动）。
- 在 Today / Upcoming 等 feed 视图里改项目名、改标签颜色即时生效。
- web（REST）行为不变。

## Comments

**2026-09-29 实现记录**

- `isEngineMode()`（`api/task-backend.ts`）+ `refreshAfterWrite`（`hooks/cache-patches.ts`）：tasks / projects / areas / tags / tag-groups / project-headings / feed 的 `onSuccess` / `onSettled` 失效全部改走它，Engine 模式下为空操作。`onError` 的快照恢复不变；没有快照可恢复的两处（重排项目、区域、heading 布局）失败时仍强制失效。
- 快照 / 取消 / 恢复统一为 `snapshotRoots` / `cancelRoots` / `restoreSnapshot`，去掉各 hook 里重复的 `restoreListSnapshot`。
- 项目的更新 / 恢复 / 完成 / 取消完成 / 删除同时修补 `['feed']` 的项目行。
- 标签的更新 / 删除经 `patchEmbeddedTag` 修补 tasks、task、feed、projects、project、areas、area、tag-groups、tag-group 里的标签芯片，快照覆盖全部这些根，失败时整体恢复。
- `INVALIDATION_BY_ENTITY.tag` 补上详情根（`task` / `project` / `area` / `tag-group`），与嵌入面一致。核对过：删 heading、删标签组的连带写入会由 replica 按实际写入的实体发通知（task / tag），无需在表里额外加边。
- 测试：`hooks/cache-patches.test.ts`（Engine 模式不自行失效、REST 模式失效面不变、feed 项目行与嵌入标签即时更新、失败恢复）。api 包 297 个测试全过；desktop / mobile / frontend 类型检查通过。
- 待验收：在桌面端 Today / Upcoming 里改项目名、改标签颜色，确认即时生效且没有闪回。

