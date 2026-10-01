# 05 列表顶部的 Tag 过滤栏

Status: implemented — awaiting visual acceptance
Blocked by: 01

## Problem

除了 Tag 详情页，没有任何地方能按 Tag 过滤，而过滤正是 Tag 的主要用途。

## Design

见 spec 第 4 节和 Implementation Decisions「过滤栏」。

- 纯函数 `packages/ui/src/components/tags/tagFilter.ts`：`collectFilterOptions`、`matchesTagFilter`。有效 Tag 使用 issue 01 的 engine 函数计算。
- Hook `useTagFilter(items)`：返回 `{ filtered, barProps }`，状态保存在组件内，路由变化时重置。
- 组件 `TagFilterBar`：第一行是 Group、无分组 Tag 和「无标签」；选中 Group 后出现第二行。胶囊样式与 `TaskTagCapsules` 一致，选中项高亮。
- 接入页面：Inbox、Today、Upcoming、Anytime、Someday、Logbook、ProjectDetail、AreaDetail。Grouped View 在交给 `groupedFeedLayout` 之前过滤；过滤后为空的分组和 Heading 不显示。
- 键盘 Selection 基于过滤后的行。

## Acceptance

- 列表中没有任何有效 Tag 时不显示过滤栏。
- Project 打了 `Work`：在 Anytime 里选 `Work`，该 Project 的行和它下面的任务都保留。
- 选中 Group 后显示该 Group 下的任一 Tag 命中的条目，第二行可以收窄到单个 Tag；再点一次取消。
- 「无标签」只显示没有有效 Tag 的条目。
- 切换到其他列表再回来，过滤已重置。
- 纯函数测试和组件测试。

## Comments

### 2026-10-01 — 实现

- 纯函数 `components/tags/tagFilter.ts`：`collectFilterOptions`、`matchesTagFilter`、`filterInOptions`（选中的 Tag 已不在列表里时过滤自动失效，例如把最后一条的 Tag 去掉后）。
- `useTagFilter(items, effectiveOf)` + `TagFilterBar`（`components/tags/TagFilterBar.tsx`）。状态按 pathname 记录，路由变化即清空（同一页面组件跨路由复用时也不恢复）。另加了「全部」胶囊，表示未过滤。
- 有效 Tag 的计算放在 api 的 `useEffectiveTags()`（`ofTask` / `ofProject` / `ofFeedItem`），复用 engine 的 `effectiveTaskTagIds` 等函数。
- 接入：Inbox / Today / Anytime / Someday（过滤后再交给 `GroupedFeedListView`，空分组自然消失）、Upcoming（过滤时不显示下次预告）、Logbook（含归档条目）、ProjectDetail、AreaDetail（项目与任务合并成一份过滤选项）。
- ProjectDetail：`ProjectTaskLayout` 新增 `visibleTaskIds`，过滤时只显示可见任务、隐藏没有可见任务的 Heading，并**停用拖拽**——heading 布局是整组写回的，过滤后的布局不能写回。下方的已完成任务区不参与过滤。
- 其它列表的拖拽照常可用：feed 重排走 `repositionMinimal`，只给移动的行分配新键，隐藏的行位次不变。
- 过滤后为空时显示 `tag:filterEmpty`。
- 测试：纯函数 8 个、组件 5 个、`filterLayout` 1 个；`AreaDetail.test.tsx` 补了 mock。
