# 02 Trash 行复用 FeedItemRow + 「放回」菜单

Status: resolved

Blocked by: 01

Spec: `../spec.md`（Solution）

## What to build

- `packages/ui/src/pages/Trash.tsx` 改用 `FeedItemRow` 渲染任务与项目行（参照 `Logbook.tsx`：`useTaskRowSelection` + `selectionStateOf`、`projectTitle` / `areaTitle`、`toggleComplete`），删除 `TrashTaskRow` / `TrashProjectRow`。
- 去掉删除线与整行灰化；复选框按真实状态显示并可勾选（勾选不放回，见 01）；任务行可展开详情编辑。
- `FeedItemRow` → `TaskItem` → `TaskContextMenu`、`FeedItemRow` → `ProjectFeedRow` → `ProjectContextMenu` 透传 `variant="trash"`。trash 变体：末项「放回」（新增 i18n 键 `putBack`，中英文），隐藏「转为项目」。`ProjectDetail` 的 trash 变体同样改用 `putBack`。
- 项目行去掉行内「恢复」按钮；点击进入项目详情不变。
- 保留 Reveal Task（Quick Find 定位到 Trash 行）、⌫ = 放回、「清空废纸篓」。

## Acceptance criteria

- [x] Trash 中任务 / 项目行与其他视图样式一致（状态、截止日期、标签、所属项目 / 区域、项目进度饼图）。
- [x] 右键菜单显示「放回」且可用；无「转为项目」。
- [x] Quick Find「继续搜索」定位 Trash 中的任务：与其他视图一样展开并滚动到行（`useRevealTask` 不再对 Trash 特判）。
- [x] `Trash.test.tsx` 更新通过。

## Comments

- 待决：Trash 中勾选完成一个重复任务时，沿用现有完成逻辑派生下一实例（实例不在 Trash）。旧 Trash 右键菜单的「完成」已有同样行为，本票未改动。
