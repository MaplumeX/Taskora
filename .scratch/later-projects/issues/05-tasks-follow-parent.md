# 05: 稍后项目内的任务从汇总视图隐藏

Status: done
Blocked by: 01

## 内容

任务「有效活跃」= 自身满足视图条件，并且（无项目，或所属项目不是稍后项目）。只做推导，不改写任务字段。

- 生效视图：Anytime、Someday（项目本身仍以项目行出现在 Someday 视图）。
- Today / Upcoming 中有明确日期的任务照常显示，不受父项目休眠影响（已实测 Things 3 确认）。
- 改动点：
  - 后端 `packages/backend/src/tasks/views.ts`：anytime / someday 加父项目条件；「未来日期」谓词依赖账号时区，与 today / upcoming 一样由调用方补。
  - 本地引擎 `packages/api/src/engine/task-backend.engine.ts` `taskMatchesView`：能查到父项目行。
  - 事件匹配 `packages/api/src/events/task-query-match.ts`：项目的 `scheduledType` / `scheduledDate` / `status` 变化时，其下任务所在视图查询要失效或重新匹配。

## 验收标准

- [x] 后端 views 与本地引擎各有用例：稍后项目内任务被排除；项目转活跃后任务原样回来
- [x] 项目改为 Someday 后，已打开的 Anytime 视图实时移除其任务（事件路径测试）
- [x] 稍后项目内有日期的任务仍按日期进入 Today / Upcoming
- [x] 项目详情页任务显示不受影响

## Comments

- 2026-09-28：完成。后端 `views.ts` 新增 `laterProjectIds`（单独查候选项目、按账号时区判定），feed / tasks 两条路径过滤；本地引擎 `getFeed` / `getTasks` 同语义；事件路径：项目事件使带 anytime / someday 视图的任务列表失效，任务 upsert 时查 projects 缓存判定父项目。视图 feed 原本就在项目变更时失效，无需改动。
- 2026-09-28：网页版实测：随时 只显示活跃项目任务（学吉他 / 年度旅行 / 新产品调研 内的任务不出现）；将来 只显示两个 Someday 项目行；今天 仍显示 Someday 项目内有日期的任务（归在「学吉他」组头下）。
