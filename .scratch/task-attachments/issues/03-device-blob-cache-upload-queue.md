# 03: 设备 Blob 缓存与上传队列

Status: implemented
Blocked by: 01, 02

Spec：`../spec.md`（「设备侧」）。

## 范围

- Blob 缓存抽象：Tauri（desktop / mobile）app data 目录，Web OPFS；按需下载，上传未完成的不可淘汰。
- 持久化上传队列（与 Outbox 同存储、独立表）：串行、指数退避、重启恢复；不阻塞 Outbox。
- 「添加附件」流程：算 sha256 → 写缓存 → 写 Attachment 行 → 入队。
- 附件状态推导：上传中 / 等待上传（hub 404）/ 下载中 / 就绪。
- 打开：Tauri 写临时文件交系统默认程序；Web 触发下载。

## 验收

- 离线添加后联网自动上传；上传期间其他写入照常推送；重启后队列续传；另一设备在 Blob 到达前显示等待上传、到达后可打开。

## Comments

### 2026-10-07 — 实现

- `packages/api/src/attachments/`：`BlobCache`（`CacheStorageBlobCache` / `MemoryBlobCache`）、`BlobChannel`（add 算 sha256 → 写缓存 → 入队 → 后台串行上传，`HEAD` 已有则跳过；read 缓存优先、未命中下载并缓存；`BlobUnavailableError` 区分 not-uploaded / offline；失败退避 5s 起、最长 5 分钟；`online` 事件与登录时续传）、`httpBlobTransport`（沿用 apiClient 的服务器地址与鉴权）。
- 打开附件：`setAttachmentOpener` 注入点，Web 缺省触发下载；桌面端 Rust 命令 `attachment_open`（原始字节 IPC → 应用缓存目录 → `open` / `explorer` / `xdg-open`，文件名清洗）。
- hooks：`useAddAttachmentFiles`、`useBlobActivity`、`useAttachmentPreviewUrl`。宿主启动调用 `initBlobUploads()`。
- **与 spec 的偏差**：缓存与上传队列三端统一放在 webview 的 Cache Storage（键 `<userId>/<hash>`），没有按 spec 在 Tauri 端用 app data 目录。理由：一份跨平台实现、不需要新的 Rust 存储与 IPC。代价：webview 存储在极端情况下可能被系统清理——此时未上传的文件丢失（队列项随之撤掉）。Cache Storage 不可用（非安全上下文）时退回进程内缓存，离线添加的文件不能跨重启续传。
- 已知限制：sha256 一次读入整个文件（`blob.arrayBuffer()`），超大文件吃内存。
