# 03：JS 侧按队列状态取条目，快速添加使用条目 id 作为任务 id

Status: implemented
Blocked by: 01

Spec：`../spec.md`「JS（主 WebView）」。

## 范围

- Engine：`createTask` 支持调用方传入 id；该 id 已在副本中存在时不重复创建，返回已有任务。
  先确认与 `Replica.generateId`、Outbox、hub 端 create 校验（sync-hub-create-validation）的关系。
- `QuickAddDraft` 落库路径接收条目 `id`，作为任务 id 传给 `createTask`；Subtask id 用 `deriveSubtaskId(id, 序号)`，与 hub 的 `TasksService.createFromQuickAdd` 一致。
- `takePendingActions` / `takePendingQuickAdds` 的 Rust / Kotlin 命令只返回 `pending` 和租约过期的 `sending` 条目
  （与 issue 04 同一改动，JS 侧适配新条目结构）。

## 验收

- 单测：同一 id 落库两次只有一个任务。
- 单测：hub 已建好任务、副本 pull 之后再处理同一条快速添加，不出现重复任务。
- 协调器 / 状态栏控制器测试适配新条目结构。

## Comments

### 2026-10-17 — 实现

- **条目 id 的传递方式**：原生仍然交给 JS 一串草稿 JSON（与现有 `openInApp` 一样），入队时在 JSON 里加 `"id": "<uuid>"`。
  JS 用新函数 `quickAddEntryId(input)` 取出，它是提交属性，不进 `QuickAddDraft`。这样原生到 JS 的命令和事件格式都不用改，
  旧条目（没有 id）照旧处理。原生侧写入 id 由 issue 04 负责。
- `CreateTaskDto` 新增可选 `id`（shared 与 backend 的 class-validator DTO，`@IsUUID`），与 `CreateSubtaskDto.id` 同一做法：
  - Engine 后端：id 已在副本里 → 直接返回现有任务，不写 Outbox；否则用该 id 创建（`Replica.create` 本来就支持传入 id）。
  - hub REST `TasksService.create`：同用户同 id 返回现有任务，他人的 id → 409。
- `createFromQuickAddDraft(draft, deps, { id })`：
  - 给了 id 且任务已存在 → 不创建、不补写 Reminder、不建 Subtask，直接返回（避免用旧草稿覆盖用户在别处的后续编辑）；
  - 否则任务用该 id，Subtask id 用 `deriveSubtaskId(id, 序号)`，与 hub 的 `createFromQuickAdd` 产出同一组行。
  - `QuickAddDeps.getTask` 设为可选：只有给了 id 才用到，UI 的 MagicPlusInbox 不受影响。
- 状态栏控制器 `createDraft(draft, id?)`，mobile 装配侧把 id 透传给 `createFromQuickAddDraft`。
- 确认过与 sync-hub-create-validation 的关系：hub 按行是否存在决定 create / update，设备推送同 id 的「创建」会按字段合并，不会被拒。
- 验证：新增测试——`quickAddEntryId` 解析、按 id 落库与派生 Subtask id、已存在时不写入、控制器透传 id、Engine 后端同 id 幂等、
  hub REST 同 id 幂等与跨用户冲突。全量：api 795、engine 328、mobile 108、desktop 79、ui 1173、frontend 28、backend 440 全部通过；
  `pnpm -r run typecheck`、eslint 通过。

**更正（同日，issue 04 实现时）**：不再需要「只取 pending / 租约过期」的过滤。改为 Worker 送达后只打标记、不出队，JS 照旧取走全部条目
再应用一次（结果与 hub 相同），取队列的命令完全不用改。见 issue 04 的 Comments。
