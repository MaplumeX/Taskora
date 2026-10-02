# 01 读取点统一按 Position 排序（Task / Project / Tag）

Status: implemented
Blocked by: —

## Problem

Engine 的重排只写 `position`，但下列读取点仍按 `sortOrder` 排 Task / Project / Tag，在桌面 / web / Android（Engine 模式）下与真实顺序脱节：

- `packages/ui/src/components/layout/sidebarProjectLayout.ts` `mergeVisibleProjectOrder`：全量底序按 `sortOrder` 排，拖动后隐藏项目（稍后 / 已完成）会被挪位。
- `packages/ui/src/components/project/laterProjectLayout.ts` `groupLaterProjects`：「计划」同日、「Someday」按 `sortOrder`。
- `packages/api/src/status-bar/content.ts` `sortStatusBarTasks`（`packages/mobile/src/status-bar/index.ts` 传入 `sortOrder`）：同日任务按 `sortOrder`。

## Design

- 三处改用 engine 的 `effectivePosition` / `sortByEffectivePosition` 口径（本 issue 阶段 legacy 行仍需合成兜底，03 之后再简化）。
- `StatusBarTaskInput` 把 `sortOrder` 换成 `position`。
- 顺带清理注释里「REST：sortOrder 同为 0」「sortOrder/position 双权威」之类已过时的说法（`useTasks.ts`、`desktop-engine.ts`、`event-stream-client.ts`、`ProjectCompletedTasks.tsx`、`AreaDetail.tsx`）。

## Acceptance

- 单测：Position 与 sortOrder 顺序相反的数据下，三处都按 Position 排。
- 桌面上拖动侧边栏项目后，隐藏的稍后项目在恢复显示时仍在原位。

## Comments

**2026-10-02 实现记录**

- `@taskora/api` 转出 engine 的 `sortByEffectivePosition`；`mergeVisibleProjectOrder` 以它为全量底序，`groupLaterProjects` 先按 Position 排再分节（「计划」同日靠稳定排序保持 Position 顺序）。
- `StatusBarTaskInput.sortOrder` → `position`，同日按 Position 字节序比较；Android 状态栏传 `task.position`。
- 单测：Position 与 sortOrder 顺序相反时侧边栏回填按 Position；稍后项目、状态栏夹具改用 Position。
- 注释清理：`AreaDetail.tsx`、`ProjectCompletedTasks.tsx`、`useTasks.ts`。`desktop-engine.ts` / `event-stream-client.ts` 里「双权威」的说法是关闭缓存手术的历史理由，保留。
