# 02 Move 目标推导与写入 DTO（纯函数）

Status: implemented
Blocked by: 01

## Design

见 spec 第 2 节。

- 新文件 `packages/ui/src/components/task/fields/moveTargets.ts`：`buildMoveTargets`、`moveTargetDto`、`currentMoveTargetId`。
- 顺序复用 `groupedFeedLayout.flatParentOrder`，Inbox 固定第一。
- 候选：所有 Area；未了结、未进 Trash 的 Project（Later Project 标记为弱化，用 `useLaterProjectKind` 判断）。
- 把 `quickFindResults.ts` 的 `nameRank` / `rankByName` 提到 `packages/ui/src/lib/`，Quick Find 改为引用，行为不变。

## Acceptance

- 无搜索词时顺序和缩进与侧边栏一致。
- 有搜索词时结果扁平，前缀命中排在包含命中之前，同档保持视觉顺序；「收件箱」「inbox」都能命中 Inbox。
- DTO：区域与项目互斥写入；Inbox 带 `bucket: INBOX` 和 `scheduledType: NONE`。
- Quick Find 现有测试全部通过。

## Comments

### 2026-10-01 — 实现

- `nameRank` / `rankByName` / `needleOf` 提到 `packages/ui/src/lib/nameMatch.ts`；`isOpenProject` 从 `quickFindResults.ts` 导出复用。宿主应用的 tsconfig 只给 `@/lib/utils` 配了别名，所以用相对路径引用。
- `currentMoveTargetId` 接受 `MoveCurrent`（任务字段的 Partial），多选传 `{}` 时不打勾。
- 测试 8 个。
