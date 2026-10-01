# 04 移到 Project Heading（第二期）

Status: deferred
Blocked by: 03

## Problem

Things 3 的 Move 可以直接选到项目里的某个 Heading。`UpdateTaskDto` 没有 `headingId`，分组归属目前只能通过 heading layout reorder（`useProjectHeadings`）写入。

## Open questions

- 是给 `UpdateTaskDto` 加 `headingId`（数据层校验它属于目标项目，参见 invariants R4），还是在客户端组合「换项目 + reorder layout」。
- 选择器里 Heading 的展示：常驻显示在项目下，还是只在搜索时出现。

## Comments
