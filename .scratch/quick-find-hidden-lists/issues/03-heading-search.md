# 03 Quick Find 搜 Project Heading

Status: implemented — awaiting visual acceptance

## Problem

搜不到 Project Heading，不能直接跳到项目里的某一节。

## Design

见 spec「Heading 搜索」。

- `ProjectHeadingBackend.getActiveHeadings()`：Engine 实现 + REST（`GET /project-headings/active`，hub service 新方法）。
- hook `useActiveHeadingsQuery()`。
- `quickFindResults.ts`：新组 `headings`，候选按面板可见项目过滤，排序同导航目标；有 chip 时不出现。
- `QuickFindRow`：Heading 行；`QuickFind` 打开 Heading：导航 + `revealId`。
- `ProjectHeadingRow`：`revealId` 命中时设为 Selection、滚到视野中央并清除。

## Acceptance

- 结果推导单测；面板测试：输入 Heading 名 → Enter → 导航到项目、reveal 设置；Heading 行消费 reveal。
- 设备端 `getActiveHeadings` 单测。
- 实机：桌面 + Android 从 Quick Find 跳到 Heading。

## Comments

### 2026-10-10 — 实现

- `ProjectHeadingBackend.getActiveHeadings()`：Engine 实现（列出 `status = ACTIVE` 的 Heading，按位次）、REST `GET /project-headings/active`（hub `ProjectHeadingsService.findActive`）；hook `useActiveHeadingsQuery`，REST 模式下 Heading 写入后刷新它。
- `quickFindResults.ts`：`headings` 输入与 `heading` 结果项，组顺序 列表 → 区域与项目 → 分组标题 → 标签 → 任务；候选只取所属项目在「区域与项目」常规候选里的 Heading，按项目侧边栏顺序稳定排序后按名称分档；有 chip 时不出现。
- `QuickFind.tsx`：面板打开时才查询 Heading；打开 Heading 时清掉展开态、设置 `revealId` 再导航。
- `ProjectHeadingRow`：`revealId` 命中时设为 Selection、下一帧滚到视野中央并清除。
- 测试：结果推导 3 条、面板 2 条、Heading 行 1 条、设备端 1 条。
- 未做：实机目视验收（桌面 + Android）。
