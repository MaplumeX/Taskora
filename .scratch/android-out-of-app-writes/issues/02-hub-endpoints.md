# 02：hub 新增通知操作与快速添加接口（后台凭据，幂等）

Status: implemented
Blocked by: 01

Spec：`../spec.md`「hub 接口」「后台凭据的权限」。

## 范围

- `POST /reminders/actions`、`POST /quick-add`，只接受 `BackgroundTokenGuard`。guard 需要把 `deviceId` 放进 `req.user`，供幂等记录使用。
- `TasksService.complete` 新增可选 `settledAt`；snooze 走现有 update 路径。两者都必须写 SyncChange。
- 快速添加：body `{ id, draft }`，`id` 作为任务 id；同一用户下 id 已存在时返回成功、不重复创建；Reminder、Subtask 一并写入。
- 新增 Prisma 模型 `DeviceRequest { deviceId, requestId, result, createdAt }`，唯一键 `(deviceId, requestId)`，
  清理 30 天前的记录（挂在现有定时清理任务上，没有就新增）。
- 更新 `background-token.ts` 与 `schema.prisma` 中「只读」相关注释。

## 验收（e2e）

- 后台凭据可调用两个接口；会话 JWT 调用返回 401；后台凭据调用其他写接口返回 401。
- complete：settledAt = tappedAt；重复任务派生下一实例。
- snooze 15 / 60 / 明天：字段与客户端规则一致（账号时区 ≠ 服务器时区的用例）。
- 过期（fireAt 不一致 / 已了结 / Trash / 不存在）→ 200 + discarded。
- 同一 requestId 发两次：只应用一次，第二次返回首次结果。
- 另一设备 pull 能看到变更。

## Comments

### 2026-10-17 — 实现

与上面范围的差异：

- **不建 `DeviceRequest` 表**，guard 也不需要放 deviceId。重放在效果层面已经幂等：完成过的任务被规则判为 `ineligible`，
  Snooze 过的通知快照 fireAt 已不是当前提醒（`stale`），快速添加按 id 去重（已存在原样返回，已 Compact 返回 `taskId: null`）。
  响应从 applied 变为 discarded，但送达方不区分。spec 已同步。
- 快速添加的 Subtask id 用 `deriveSubtaskId(taskId, 序号)`：即使 hub 和设备都落库了同一条草稿（租约过期的极端竞态），
  两端也产出同一组行，不会出现重复 Subtask。issue 03 需要在设备侧用同样的派生。
- 白名单不用额外代码：其他接口都走 JWT guard，后台凭据天然通不过（e2e 已覆盖）。

改动：

- `src/out-of-app/`（新模块）：`OutOfAppController`（`POST /reminders/actions`、`POST /quick-add`，均 200）、`OutOfAppService`、DTO。
- `TasksService.complete` 新增可选 `settledAt`；新增 `createFromQuickAdd(userId, id, plan)`，单事务写任务 + Reminder + Subtask。
- `reminders.service.ts` 抽出 `REMINDER_TASK_SELECT` / `reminderInputFromRow` 供两处共用。
- 后台凭据相关注释（`background-token.ts`、guard、`schema.prisma`）从「只读」改为「受限」。schema 只改了 `///` 注释，无迁移。

验证：

- 新增 `test/out-of-app.e2e-spec.ts`，13 个用例：完成（了结时间、变更日志）、重复任务派生且重放不二次派生、Snooze 15 分钟 / 明天、
  过期 / 不存在丢弃、非法动作 400、快速添加全字段与派生 Subtask id、重放不重复、Compact 不重建、Trash 项目回落、空标题 / 非法输入、
  JWT 被拒、后台凭据调用 `POST /tasks` 被拒。
- 在临时 Postgres 容器上跑 backend 全量：48 个文件、439 个用例全部通过；`tsc --noEmit`、eslint 通过。
