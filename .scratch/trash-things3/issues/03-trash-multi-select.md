# 03 Trash 接入左滑多选

Status: resolved

Blocked by: 02

Spec: `../spec.md`（Decisions：触屏）

## What to build

- Trash 行与其他视图一样左滑进入 Multi-Select Mode（`useSwipeToSelect` 随 `TaskItem` 生效，确认 Trash 页未被 `MultiSelectEnabledContext` 关闭）。
- `MultiSelectToolbar` 在 Trash 页把「删除」换成「放回」（`putBack`，批量调用 restore）；计划 / 移动等其余动作照常（按 01 规则隐式放回）。
- `TaskContextMenu` 去掉 trash 变体的 `useLongPress`；Trash 行不可拖动排序（无排序），长按不开菜单。
- 更新 `CONTEXT.md` Multi-Select Mode 条目：删去「Trash 行不可拖动，仍以长按打开菜单」，改为 Trash 中工具栏「删除」替换为「放回」。
- `.scratch/touch-multi-select/spec.md` Out of Scope 中 Trash 行一条标注已被本 effort 取代。

## Acceptance criteria

- [x] 触屏在 Trash 左滑进入多选，工具栏显示「放回」，批量放回后退出多选。
- [x] Trash 中长按不弹菜单、不拖动。
- [x] 桌面右键菜单不受影响。
