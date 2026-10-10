# 01 点按：项目页直接加任务，Upcoming 显示 FAB

Status: implemented

## Problem

项目页点 FAB 先弹菜单，加任务要两下；Upcoming 没有 FAB。

## Design

见 spec「点按」。

- `useContentBottomActions` / `MobileFab`：项目页 FAB 只有「添加任务」一个动作，点按直接新建（不弹菜单）。桌面 `ContentBottomBar` 的「添加标题」按钮保留。
- Upcoming 从 `HIDE_ADD_TASK_VIEWS` 移出（只对 FAB；桌面底栏是否显示同步决定，保持一致即可），点按新建计划日期 = 账号时区明天的任务。
- 本 issue 落地后手机项目页暂时没有新建 Heading 的入口，须与 04 同一版本发布（或 04 先行）。

## Acceptance

- 项目页点 FAB 直接新建任务并展开编辑，无菜单。
- Upcoming 显示 FAB，点按新建的任务出现在「明天」一节末尾。
- 首页、区域页菜单不变。

## Comments

### 2026-10-10 — 实现

- `MobileFab`：不再读 Heading 动作，项目页只剩「添加任务」→ 点按直接新建；首页、区域页菜单不变。`useContentBottomActions` 的 `showAddHeading` 保留给桌面底栏。
- `HIDE_ADD_TASK_VIEWS` 移出 `upcoming`：桌面底栏、⌘N、⌘V 粘贴在 Upcoming 同样可用（同一上下文）。
- `usePageTaskContext`：`/upcoming` 与 `/tomorrow` 新建任务计划为账号时区明天。`/tomorrow` 原先没有上下文，新任务会落进 Inbox，一并修正。
- 测试：`usePageTaskContext.test.tsx`（跨 UTC 日界的账号时区明天）、`MobileFab.test.tsx`（项目页直接加任务、无菜单）。api / ui / mobile / desktop / frontend 全量测试、typecheck、lint 通过。
