# 04: 导入界面（桌面 / Web / 移动端）

Status: implemented — awaiting manual acceptance（桌面 / Android 文件选择与保存需真机验证）
Blocked by: 03

Spec：`../spec.md`（「UI」）。

## 范围

- api：`useImportPreview` / `useImport` hooks（multipart 上传带进度）。
- `SettingsData.tsx`：导入区与流程——选文件 → 上传 + 预览（时间、来源版本、条数、是否含附件、已导入过警告、「同时导入偏好设置」开关、「追加不覆盖」说明）→ 确认 → 进度 → 结果摘要。
- 移动端：SettingsGroup / SettingsRow 同构；Android 文件选择、导出保存真机验证。
- i18n：en / zh-CN 文案。

## 验收

- 三端都能完成一次导出 → 导入往返；失败有可读错误（格式过新、文件损坏、hash 不符）。

## Comments

### 2026-10-16 — 实现

- api：`previewImport(file, onProgress)` / `importData(...)` 与 `usePreviewImport` / `useImportData`；导入成功后失效全部查询，开了「导入偏好」时重新拉 `/auth/me` 并 `hydrateFromServer`。预览 / 结果类型（`DataImportPreview` / `DataImportStats`）放在 shared，前后端共用。
- ui：`DataImportDialog.tsx`（`useDataImportFlow` 管状态，上传由文件选择事件发起，对话框只负责展示）；`SettingsData` 桌面 / 移动端都加了导入区，文件选择器接受 `.taskora` 与旧版 `.json`。
- 错误文案：422 按错误码，404 → 上传过期，409 → 已有导入在进行。
- 测试：`SettingsData.test.tsx`（预览 → 带偏好开关导入 → 结果；已导入提示；错误码文案）。
- 未验证：桌面（Tauri）与 Android 上 `<input type="file">` 选择 `.taskora`、`<a download>` 保存导出文件的实际行为。
