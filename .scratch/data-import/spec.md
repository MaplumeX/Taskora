# Feature: 数据导入（Data Import）

Status: implemented — awaiting manual acceptance（桌面 / Android 需真机验证）

现在只有导出（`GET /users/me/export`，直接导出 Prisma 行、`version` 写死 `0.1.0`），没有导入。本 feature 把导出改成有格式契约的**数据包**，并新增**导入为副本**。

## Problem Statement

用户能把数据导出，却无法导回：备份不能恢复，也不能从一个账号 / 一台自建 hub 迁移到另一个。现有导出也不完整（没有附件、日历订阅），格式绑死 Prisma 列，schema 一变旧文件就对不上。

## Solution

设置「数据」页导出一个 `.taskora` 数据包（zip），含全部同步实体、偏好、日历订阅与附件文件。同一页可选择一个数据包导入：先预览内容，确认后在 hub 上一次性写入，作为**新数据追加**到当前账号，不覆盖、不删除任何现有内容；同名 Tag 合并到现有 Tag。各设备经事件流自动收到导入的数据。

## User Stories

1. As a user, I want to export all my data, including attachments, into one file, so that I have a complete backup.
2. As a user, I want to choose to export without attachments, so that the file stays small when I only need tasks.
3. As a user, I want to import a data package into my account, so that I can restore a backup or move from another account / hub.
4. As a user, I want to see what a package contains (export time, counts, whether it has attachments) before importing, so that I know what will happen.
5. As a user, I want import to never overwrite or delete my existing data, so that importing is safe.
6. As a user, I want tags with the same name and path to merge into my existing tags, so that I don't end up with duplicate "Work" tags.
7. As a user, I want imported areas / projects / tasks to keep their structure, order, schedule, repeat rules, tags and attachments.
8. As a user, I want imported items to appear after my existing ones, so that my current ordering is undisturbed.
9. As a user, I want to be warned when importing a package I already imported, so that I don't duplicate everything by accident.
10. As a user, I want import to be all-or-nothing, so that a failure never leaves half my data behind.
11. As a user, I want a result summary (created, merged, skipped and why), so that I can trust the outcome.
12. As a user with several devices, I want imported data to show up on all of them without manual refresh.
13. As a user with an old `taskora-export-*.json`, I want to import it too, so that my earlier backups are not useless.

## Implementation Decisions

### 术语

- **数据包（Data Package）**：`.taskora` 文件，导出 / 导入的唯一格式。
- **导入为副本**：v1 唯一的导入模式——全部换新 id、追加，不覆盖。整体覆盖恢复不做（需清空账号 + Compact + 全设备重新 bootstrap，风险高、需求低）。
- 实现时把这两个词补进 `CONTEXT.md`。

### 数据包格式

zip，内容：

```
manifest.json   { format: 1, exportId, exportedAt, hubVersion, includesBlobs, counts }
data.json       { entities: { <SyncEntity>: [{ id, fields }] }, preferences, calendarSubscriptions }
blobs/<sha256>  附件文件（includesBlobs 时）
```

- 实体用**同步 wire 格式**（`entity-codec` 的 `serializeRow(...).fields`，不含时钟），schema 唯一来源是 `ENTITIES`。不再导出 Prisma 原始行。
- `format` 为整数。导入时按版本逐级迁移到当前 format；高于当前 format 拒绝（「请升级 hub」）。`ENTITIES` 增删字段时：新增字段缺省为列默认值；删除字段在迁移里丢弃。
- 导出：全部同步实体（含 Trash、Logbook 归档任务）、`preferences`、日历订阅（`name` / `url` / `color` / `enabled`）。
- 不导出：Device、RefreshToken、AgentConfig（含 API key）、助手会话 / 审批、SyncChange / SyncCounter / CompactedEntity、日历订阅的拉取状态、user 的 email / 密码。
- 导出在 hub 流式生成 zip（附件可能很大，不在内存拼）。需引入一个流式 zip 库（候选 yazl / yauzl，实现时定）。
- 导出选项「包含附件」默认开。

### 导入流水线（hub 端执行）

在 hub 而不是设备上执行：低频、本就需联网；hub 端能在一个事务里原子写入，不会撑爆设备 Outbox，blob 也不必走设备上传队列。

```
上传数据包 → 解析 / 校验 → format 迁移 → 生成导入计划（纯函数）→ 写 blob → writeAsHub 单事务写入 → 返回结果
```

- **纯函数导入计划**（`packages/engine` 或 backend 内独立模块，可单测）：输入数据包内容 + 目标账号现有 Tag 树与各容器末尾位置，输出要写的 `(entity, id, fields)` 列表与结果统计。
- **id 重映射**：每条记录生成新 UUID；按 `REFERENCE_FIELDS` 通用改写引用字段，另补 `repeatSourceId` 与 `project-heading.projectId`（不在 `REFERENCE_FIELDS`）。引用指向包内不存在的记录：标量置 null、数组剔除，Task 子实体（Subtask / Attachment）整条丢弃——与 compact 语义一致。已有 Repeat Instance 只是普通行，一致换 id 不破坏 ADR 0012；以后的派生基于新 id。
- **Tag 合并**：按「从顶层到自身的标题路径」匹配目标账号现有 Tag（标题比较去首尾空白、大小写敏感）；命中则映射到现有 id、不写该 Tag（颜色等字段保持目标账号的值）；未命中的新建，父 Tag 若已合并则挂到现有父下。
- **Area / Project 不合并**，原样追加。
- **位置**：导入集中处于某个容器顶层的条目（Area 列表、无区域项目、某 Area 下、Inbox 等，以及合并后 Tag 下的新子 Tag），按原相对顺序用 `positionsBetween(容器现有最大位置, null, n)` 重新生成；项目内部、Heading 内部等全新容器保留原位置。Project 的 `feedPosition` 同理。
- **附件**：先把包内 blob 经 `BlobStore.put` 写入（内容寻址自动去重，hash 不符整次导入失败）；包内没有对应 blob 且目标账号也没有的 Attachment 行不导入，计入「跳过」。事务失败时已写入的 blob 由现有 GC（24 小时宽限）回收，不另做清理。
- **写入**：整份计划在一次 `SyncHubService.writeAsHub` 里写（虚拟设备 0，经合并、引用清洗、`repairEntity`，产生 SyncChange 并经事件流推送）。事务超时按数据量放宽；单事务承载不了的规模（实测后定阈值）再考虑分批，v1 不做。
- **偏好**：默认不导入（目标账号可能已有自己的时区等设置）；预览里提供「同时导入偏好设置」选项，开启时整体覆盖 preferences。
- **日历订阅**：按 `url` 去重，已有的跳过；新建的由 hub 正常拉取。
- **重复导入提示**：新表记录 `(userId, exportId, importedAt, counts)`；预览接口返回「已于 X 导入过」，UI 提示但允许继续。
- **旧 JSON（format 0）**：`taskora-export-*.json` 识别为 format 0，迁移为 format 1（Prisma 行 → wire 字段：`tags` 关系 → `tagIds`、日期转 ISO、去掉 `userId` / `fieldClocks` 等列；旧包无附件）。

### API

- `GET /users/me/export?blobs=1|0` → `application/zip` 流（替换现有 JSON 端点）。
- `POST /users/me/import/preview`（流式上传，存临时文件，返回 `uploadId` + manifest 摘要 + 是否导入过）。
- `POST /users/me/import`（`{ uploadId, importPreferences }`，执行，返回结果统计）。临时文件导入后或超时（1 小时）删除。
- 上传不经 JSON body parser，不受 4 MB 上限（同 blobs controller 的做法）。

### UI

- 设置 →「数据」：导出区加「包含附件」开关；新增导入区「选择文件…」。
- 导入流程：选文件 → 上传 + 预览（导出时间、来源 hub 版本、各实体条数、是否含附件、是否导入过；「同时导入偏好设置」开关；说明「将作为新数据追加，不会覆盖现有内容」）→ 确认 → 进度 → 结果（新建 / 合并 Tag / 跳过及原因）。
- 移动端用 SettingsGroup / SettingsRow 同构实现；Android 文件选择与保存需真机验证。

## Testing Decisions

- 纯函数导入计划：id 重映射完整性（无残留旧 id）、悬挂引用处理、Tag 路径合并（含嵌套、部分命中）、位置追加与相对顺序、`repeatSourceId` / heading 归属、缺 blob 的附件跳过。
- format 迁移：format 0 样例文件 → format 1；未来 format 被拒绝。
- **往返测试**（核心）：账号 A 导出 → 导入空账号 B，去掉 id 后实体、引用关系、排序、重复规则、嵌套 Tag、附件（含 blob 字节）一致。
- 导入到非空账号：现有数据完全不变；同名 Tag 合并；导入项排在末尾。
- 原子性：中途失败（如 blob hash 不符、事务内错误）账号无任何新行。
- 同步：导入后设备 pull 能拿到全部新实体。

## Out of Scope

- 整体覆盖恢复。
- 从 Things 3 / Todoist 等其他应用导入。
- 定时自动备份。
- 导入时的选择性导入（只导某个 Area 等）。
