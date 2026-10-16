# 01: 数据包导出（.taskora）

Status: implemented

Spec：`../spec.md`（「数据包格式」「API」）。是 02–05 的前置。

## 范围

- 定义 format 1：`manifest.json` / `data.json` / `blobs/<sha256>` 的 TS 类型与常量（放在 shared 或 engine，导入侧共用）。
- hub：`GET /users/me/export?blobs=1|0` 流式输出 zip，替换现有 JSON 端点；实体经 `loadAllRows` + `serializeRow` 取 wire fields（含 Trash 与归档任务），加 preferences、日历订阅；`exportId` 为新 UUID。
- 引入流式 zip 库（yazl / yauzl 候选）。
- api：`useExportData` 改为下载二进制；UI 导出区加「包含附件」开关（桌面 / Web / 移动端），文件名 `taskora-<date>.taskora`。
- 删除 `ExportDataResponse` 与旧 `usersService.exportData`。

## 验收

- 导出包能被 zip 工具打开，manifest counts 与 data.json 一致；`blobs=0` 时无 blobs 目录且 `includesBlobs: false`。
- 不含任何排除项（API key、token、device、email 等）。
- 大附件导出时 hub 内存不随文件大小增长。

## Comments

### 2026-10-16 — 实现

- shared：`data-package.ts`（format 1 常量与 manifest / data 类型）。
- hub：新 `DataPackageModule`（`GET /users/me/export?blobs=0|1`），实体经 `loadAllRows` + `wireViewOfRow`；附件按 hash 去重，hub 上缺失的 blob 不打包；blob 条目用 `addReadStreamLazy` 且不压缩。`HUB_VERSION` 抽到 `common/hub-version.ts` 与 health 共用。依赖 yazl / yauzl。
- 移除 `UsersService.exportData` 与其单测；新增 `test/data-package.export.e2e-spec.ts`。
- 前端：`exportData(includeBlobs)` 返回 Blob；设置「数据」页加「包含附件」开关（桌面 / 移动端），文件名 `taskora-<date>.taskora`。
- 下载仍用 `<a download>`，与旧实现一致；桌面 / Android 的保存行为留到 04 真机验证。
