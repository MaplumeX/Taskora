# 04 领域规则共享包

Status: implemented

## Problem

客户端 Engine 后端（`packages/api/src/engine/*.ts`）与服务端 REST 服务各实现一份领域规则：bucket 推导、视图过滤（today / upcoming / anytime …）、删除与恢复的级联、分组转项目、重复任务派生（ADR-0012 列出三处实现）。Engine 后端里有 17 处注释写着「与 REST 同语义」，漂移只能靠测试发现。

## Design

- 在 `packages/engine`（或新包 `packages/domain`）放纯函数：`resolveTaskBucket`、`resolveProjectBucket`、`taskMatchesView`、`projectMatchesView`、级联计划（给定实体与操作，返回要写的字段补丁集合）、重复实例派生（已在 engine，REST 侧改为调用）。
- Engine 后端与 REST 服务都只做「读 → 调纯函数 → 写」。01 的 `repairEntity` 复用同一组推导函数。
- 共享规则的测试写一份，两端各跑一组「同输入同输出」的契约测试。

## Steps

1. 先迁 bucket 推导与视图过滤（01 已引入 `resolveTaskBucket`）。
2. 再迁级联操作（删除 / 恢复项目、分组转项目、完成重复任务）。
3. 删除两端重复实现，契约测试兜底。

## Acceptance

- 「与 REST 同语义」注释清零；两端规则来自同一份代码。

## Comments

**2026-09-29 实现记录**

共享规则放在 `packages/engine/src/domain/`（没有新建包：backend 与 api 都已依赖 engine），经 `@taskora/engine` 导出：

- `bucket.ts`：`resolveTaskBucket` / `resolveProjectBucket`（从 invariants 移出，`repairEntity` 复用）。
- `calendar.ts`：日期键归一、「今天」、时刻比较——两端存储形态不同（副本存日期键，Postgres 存 UTC 零点 DateTime），规则一律先归一。
- `views.ts`：`taskMatchesView` / `projectMatchesView` / `taskMatchesQuery` / `feedIncludesProjects` / `countProjectTasks` / `sortForView` / `sortFeedItems`。
- `order.ts`：有效 Position 与排序（backend 的 `common/position-order` 改为转出）。
- `tasks.ts` / `projects.ts` / `headings.ts`：新建 / 编辑 / 生命周期补丁、转项目、项目 Trash 级联与恢复、清空 Trash、分组删除 / 归档 / 转项目 / 布局校验与目标状态、分组顺序。
- `repeat-instance.ts`：`planRepeatInstance` / `repeatInstanceId`。

两端都改为「读 → 调规则 → 写」：Engine 后端（task / project / project-heading）与 REST 服务（Tasks / Subtasks / Projects / Feed / ProjectHeadings）。REST 侧新增 `common/domain-storage.ts` 把 wire 形态换成 Prisma 形态。SQL / 副本 where 只作粗筛，最终过滤一律走 domain。旧的 `matchesCalendarView`、两端各自的 `resolveBucket`、`assertExactIdSet` 已删除。Engine 后端里「与 REST 同语义」一类的注释清零（剩下的只描述各自的存储写法）。

统一时顺带修掉的漂移（行为变化）：
- 设备端搜索 + completed 只返回已了结，改为与 REST 一致：未了结 + 已了结（ADR 0006）。
- 设备端 `getTasks({ view: 'logbook' })` 按位次排，改为按了结时间倒序；设备端 feed 先任务后项目，改为与 REST 一样按 Position 混排。平局按 id，两端稳定。
- REST 完成一个已完成的任务会刷新了结时间，改为与设备一致：不做任何事。
- 项目 / 分组进 Trash 会改写已在 Trash 里任务的时间戳，导致恢复项目时把之前单独删掉的任务一起捡回；现在已在 Trash 的任务不动。级联进 Trash 的任务同时清除提醒（与单个任务进 Trash 同一规则）；分组归档完成的任务同样清除提醒（不派生重复实例：新实例不应落进已归档分组）。
- 任务转项目直接复制任务的 bucket，Inbox 任务会得到 INBOX 项目（违反不变量）；现在按计划类型推导。
- REST 新建任务 / 项目改为写出全部领域字段（显式 null / ACTIVE），不再依赖数据库默认值。

契约测试：`@taskora/engine/testing` 导出一份夹具（上海时区、UTC 仍是「昨天」的时刻；各视图、进度计数、9 个列表查询的期望，带顺序）。三方各跑一遍：engine `test/domain.test.ts`（纯函数，另含各写入 / 级联规则的单测）、api `domain-contract.engine.test.ts`（真实 Engine + node:sqlite 副本）、backend `domain-contract.spec.ts`（REST 服务，Prisma mock 忽略 where）。

测试：engine 144、api 316、ui 314、desktop 51、mobile 68 通过；backend 在临时 Postgres 库（跑完已删除）上 363 个全部通过，含 e2e。

未纳入：Tag / TagGroup / Area 的新建排序与 sortOrder / Position 的分配方式（属于存储，两端各自实现）；SQL 粗筛「只能比规则宽」目前靠 e2e 与契约之外的人工约束，没有自动校验。

