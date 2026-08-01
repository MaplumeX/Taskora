# Heading 转换为项目

## Goal

项目详情页的 Heading（标题分组）提供"转换为项目"操作：以 Heading 标题创建新项目，Heading 下的顶层任务及其子任务全部迁入新项目（层级保留），随后删除原 Heading。语义对齐现有"任务转换为项目"（`convertToProject`）。

## Background

- `07-31-project-headings` 已实现 Heading 生命周期、列表布局、拖拽与删除；该 PRD 将"Heading 的归档、复制、转换为项目"列为 Out of Scope，本次补齐"转换为项目"。
- 现有任务转换 `TasksService.convertToProject`（`packages/backend/src/tasks/tasks.service.ts`）提供参考语义：新项目继承来源的 `areaId`、`sortOrder` 排到用户全部项目末尾、转换后前端 toast + 刷新。
- Heading 下的任务通过 `Task.headingId` 归属分组；子任务在独立 `Subtask` 表（`taskId` 指向父任务，仅一层）。任务迁入新项目时只需改 `projectId`/`headingId`，Subtask 关系天然保留。
- 前端入口参考 `ProjectHeadingRow` 的"⋯"菜单（现有仅"删除"项）与 `TaskContextMenu` 的"转换为项目"（无确认、成功/失败 toast、失效 `tasks`/`projects`/`feed` 缓存）。

## Requirements

### R1 — 入口

- 项目详情页 Heading 行的"⋯"菜单新增"转换为项目"项，位于"删除"之前。
- 点击后直接执行转换，不弹二次确认（对齐现有任务转换；任务不删除、仅迁移，风险低）。
- 转换中菜单项/按钮禁用，避免重复提交。

### R2 — 转换语义

- 新项目 `title` = Heading 标题；允许与现有项目重名。
- 新项目 `areaId` = 原项目的 `areaId`（原项目无 Area 则为 `null`）。
- 新项目 `sortOrder` = 当前用户全部项目中最大值 + 1（出现在侧边栏项目列表末尾）。
- 新项目 `tags` 为空（Heading 无标签来源；不复制原项目标签）；其余字段取默认值（`status=ACTIVE`、`bucket=INBOX`、`scheduledType=NONE`）。
- Heading 下的全部顶层任务迁入新项目：`projectId` → 新项目，`headingId` → `null`；任务的 `bucket`/`sortOrder`/`status`/`notes`/日期等字段保持不变；每个任务的 Subtask 关系原样保留。
- 迁移完成后删除原 Heading。

### R3 — 隔离与错误

- 仅允许当前用户操作自己的 Heading；Heading 不存在、不属于当前用户，或所属项目不存在/已删除（软删除）→ `404 Not Found`。
- 转换在单个数据库事务内完成；任一步失败则全部回滚，不产生部分迁移。
- 已软删除（废纸篓中）的任务若仍挂在 Heading 下，同样迁入新项目（转换语义为"整个分组变成项目"），在废纸篓中的归属随之更新。

### R4 — 前端反馈

- 转换成功：toast 提示"已转换为项目"；失效 Heading 列表、任务列表、项目列表（侧边栏）、feed 缓存。
- 转换失败：toast 错误提示，界面保持服务端确认的状态。
- 不自动跳转到新项目（对齐任务转换，仅 toast + 刷新）。

### R5 — 本地化

- 新增界面文案（"转换为项目"、成功/失败提示）同时提供简体中文和英文，两个语言文件的 key 保持一致。

## Acceptance Criteria

- [ ] AC1（R1）：Heading"⋯"菜单出现"转换为项目"；点击后无确认弹窗直接执行。
- [ ] AC2（R2）：新项目以 Heading 标题命名出现在侧边栏项目列表末尾；`areaId` 与原项目一致（或无 Area 时为 null）；允许与现有项目重名。
- [ ] AC3（R2）：Heading 下全部顶层任务出现在新项目任务列表中，Subtask 层级（父子关系、顺序）保持不变；任务字段（status/bucket/notes/sortOrder 等）不被改写。
- [ ] AC4（R2）：转换后原项目不再显示该 Heading 及迁出的任务；原 Heading 记录被删除。
- [ ] AC5（R2）：新项目 tags 为空，原项目 tags 不变。
- [ ] AC6（R3）：不存在的 Heading / 其他用户的 Heading → 404；所属项目软删除时转换被拒绝。
- [ ] AC7（R3）：转换过程任一环节失败时整体回滚，无部分迁移（单测覆盖）。
- [ ] AC8（R4）：成功 toast"已转换为项目"且侧边栏与当前项目页即时刷新；失败 toast 错误且无错误的乐观状态残留。
- [ ] AC9（R5）：中英文文案齐全，key 集合一致。
- [ ] AC10：根级 lint、typecheck 和 test 全部通过。

## Out of Scope

- 转换时选择新项目的 Area / 位置。
- 批量转换多个 Heading。
- 转换后自动跳转进入新项目。
- 转换时复制原项目标签到新项目。
- Heading 的归档、复制（除转换为项目外）。
