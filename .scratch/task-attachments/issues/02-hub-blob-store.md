# 02: Hub Blob 通道与 GC

Status: implemented
Blocked by: 01

Spec：`../spec.md`（「Blob 通道（hub）」）。

## 范围

- `BlobStore` 接口 + 文件系统实现，根目录 `BLOB_STORAGE_DIR`；`docker-compose.yml` 加 volume，README 补备份说明。
- `PUT /api/v1/blobs/:sha256`：流式写入、hash 校验、幂等；绕开 JSON body parser。
- `GET /api/v1/blobs/:sha256`：鉴权、按用户隔离、`Range`、安全响应头；不存在 404。
- GC 定时任务：无引用且超过 24 小时宽限期的 Blob 删除。

## 验收

- 错误 hash 400、重复上传 200、跨用户 404、Range 正确、GC 宽限期边界测试。

## Comments

### 2026-10-07 — 实现

- `src/blobs/`：`BlobStore` 抽象 + `FsBlobStore`（`<root>/<userId>/<hash 前两位>/<hash>`，先写 `.tmp/` 再 rename；边写边算 sha256）；`BlobsController`（`HEAD` / `PUT` / `GET /api/v1/blobs/:sha256`）；`BlobGcService`（每小时，宽限期 24 小时，重复上传刷新写入时刻）。
- `GET` 一律回 `application/octet-stream` + `Content-Disposition: attachment` + `nosniff` + 不可变缓存头；内容类型由客户端按 Attachment 元数据决定。
- 补了 spec 没写到的：`HEAD` 让客户端先查是否已上传（同用户去重）；nginx 给 `/api/v1/blobs/` 单独放开大小限制、关闭请求 / 响应缓冲（`/api/` 原来限 4m）；`.gitignore` 忽略本地缺省目录。
- `GET` 不按 Attachment 引用授权，只按用户命名空间：自己上传的 Blob 自己可读，跨用户读不到。
