# Feature: Task 附件（Attachment）

Status: implemented — awaiting manual acceptance（Android 需真机验证）

给 Task 加附件。术语见 `CONTEXT.md` 的 **Attachment** / **Blob**；架构见 ADR 0019。Things 3 没有附件，这是有意的偏离，范围保持克制：只做 Task，不内嵌于 notes。

## Problem Statement

任务常常依附于某个文件：要填的表格、要回复的截图、要核对的发票。现在只能在 notes 里贴一个外部链接，文件本身散落在别处；离线时打不开，换台设备也找不到。

## Solution

展开的 Task 卡片可以添加附件：工具栏回形针按钮选文件，桌面 / Web 也可把文件拖到卡片上。附件以紧凑行列表显示在 Subtasks 下方，可拖动排序、重命名、移除，点击即打开或预览。收起的任务行带回形针徽标表示有附件。附件随任务同步到所有设备：列表立即可见，文件内容在打开时才下载。离线添加照常可用，联网后在后台上传。

## User Stories

1. As a user, I want to attach a file to a task from the expanded card, so that the material lives with the work.
2. As a desktop / web user, I want to drop files from my file manager onto an expanded task card, so that attaching takes one gesture.
3. As an Android user, I want to pick a file or take a photo to attach, so that I can capture material on the go.
4. As a user, I want to see attachments listed under subtasks with name, type icon and size, so that I know what is there without opening it.
5. As a user, I want to open an attachment with the system's default app (desktop / Android) or download it (web), so that I can work with it.
6. As a user, I want images previewed inline in a lightbox, so that a screenshot is one click away.
7. As a user, I want to rename an attachment, so that `IMG_2041.jpg` can say what it is.
8. As a user, I want to reorder attachments by dragging, so that the important one is on top.
9. As a user, I want to remove an attachment, so that stale material goes away.
10. As a user, I want a paperclip badge on collapsed task rows that have attachments, so that I can spot them in lists.
11. As an offline user, I want to attach files and see them in the list immediately, so that offline stays full-functionality.
12. As a user with several devices, I want an attachment added on one device to show on the others, and to download when I open it there.
13. As a user on a device that synced the attachment before its file finished uploading, I want to see "waiting for upload" instead of an error.
14. As a user, I want a repeating task's next instance to keep its attachments, so that a monthly report template stays attached.
15. As a user, I want attachments to go to Trash and come back with their task, and to vanish when Trash is emptied.

## Implementation Decisions

### 数据模型（Engine + hub）

- 新同步实体 `attachment`：`taskId`、`name`、`mimeType`、`size`（INTEGER）、`blobHash`、`position`、`createdAt`、`updatedAt`。Prisma `Attachment` 外键 `taskId` onDelete Cascade。
- 字段规则：`taskId` 必须指向同一用户的 Task（经父 Task 认领，同 Subtask；父 Task 不存在时整事件丢弃）；`size` 为非负整数（hub 剔除非法值并以必胜时钟下发列默认值）；REST 创建校验 `blobHash` 为 64 位小写 hex、`name` 非空。`mimeType`、`size`、`blobHash` 创建后不可改——由写接口保证（只暴露改名），hub 的字段级 LWW 不知道旧值，不做拒绝。
- 「转换为项目」会物理删除原 Task，附件随之删除（Project 没有附件）；UI 在任务有附件时先确认。
- 生命周期同 Subtask：无 `trashedAt`，可见性跟父 Task；所有硬删 Task 的 hub 路径级联 Attachment 并登记 `CompactedEntity`；单独移除走 Delete Request。
- Archived Logbook 裁剪时连带裁剪其附件行；按页读取归档时附件行一起返回。

### Blob 通道（hub）

- `PUT /api/v1/blobs/:sha256`：流式写入临时文件，边写边算 hash，不符则 400；已存在则直接 200（幂等）。不经过 JSON body parser，不设大小上限。
- `GET /api/v1/blobs/:sha256`：仅当该用户有 Attachment 引用或在宽限期内上传过；`Content-Disposition: attachment`、`X-Content-Type-Options: nosniff`、支持 `Range`。不存在返回 404（设备据此显示「等待上传」）。
- `BlobStore` 接口 + 本地文件系统实现，路径 `<root>/<userId>/<sha256[0..2]>/<sha256>`；根目录由 `BLOB_STORAGE_DIR` 配置，`docker-compose.yml` 为 backend 加 volume。
- GC：定期扫描，删除无 Attachment 引用且上传超过宽限期（24 小时）的 Blob。

### 设备侧

- 添加附件：读文件 → 算 sha256 → 写入本机 Blob 缓存 → 写 Attachment 行（进 Outbox）→ 入上传队列。
- 上传队列：持久化（与 Outbox 同一存储，独立表），串行、指数退避、断点不续传（失败整文件重传）；与 Outbox 互不阻塞。
- 本机 Blob 缓存：三端统一用 webview 的 Cache Storage（偏离原计划的 Tauri app data 目录 / OPFS，理由见 issue 03）；按需下载；上传队列未清空的 Blob 不可淘汰。
- 打开：桌面 / Android 写到临时路径后交给系统默认程序；Web 触发下载。图片白名单（png / jpeg / gif / webp）在 lightbox 内联预览；HTML / SVG 永不内联渲染。
- Repeat 派生（task 与 project）：按 subtask 的方式复制附件行，id = `hash('attachment', parentInstanceId, ordinal)`，`blobHash` 相同。

### UI

- `TaskRowExpanded` 工具栏加回形针 `FieldIconButton`；附件列表组件放在 `TaskSubtaskList` 下方，排序用现有 dnd 惯例（ADR 0018 的 app 级 DndContext 内注册）。
- 文件拖入：原生 HTML5 文件拖放（OS 文件不是 dnd-kit draggable），只在展开卡片上接收，不与 Sidebar Drop 冲突。
- 收起行徽标 `TaskAttachmentsBadge`，与 `TaskNotesBadge` 同排同风格。
- 行内状态：上传中 / 等待上传 / 下载中。

## Testing Decisions

- Engine：merger / repair 对 attachment 的字段规则（不可变字段改写被丢弃、`taskId` 越权）；Repeat 派生复制附件且 id 确定；Archived Logbook 裁剪连带附件。
- Hub：Blob 上传 hash 校验、幂等、跨用户不可读；清空 Trash / Delete Request 级联登记 `CompactedEntity`；GC 宽限期边界。
- 设备：上传队列重试与重启恢复；Outbox 不被上传阻塞；行先于 Blob 到达时的「等待上传」。
- UI：工具栏添加、拖入、重命名、排序、移除；徽标显示。

## Out of Scope

- Project / Area 附件。
- notes 内嵌图片或附件引用。
- 大小上限与配额。
- 跨用户去重、S3 后端（接口留好，不实现）。
- 断点续传、缩略图生成、全文索引。
- Assistant 读取附件内容（只暴露元数据）。
- 快速添加（QuickAddCard）里直接附加文件。

## Further Notes

- 宽限期覆盖「Blob 已上传、引用它的 Attachment 行尚未推送」的窗口；设备侧先写行后上传，正常顺序下行先到，宽限期只兜底。
