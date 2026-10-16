# 03: hub 导入端点

Status: implemented
Blocked by: 02

Spec：`../spec.md`（「导入流水线」「API」）。

## 范围

- `POST /users/me/import/preview`：流式上传到临时文件（不经 JSON body parser），读 manifest 与条数，返回 `uploadId`、摘要、`alreadyImportedAt`。临时文件 1 小时过期清理。
- `POST /users/me/import`：读 `uploadId`，迁移 → 读目标账号状态 → `buildImportPlan` → 逐个 `BlobStore.put` → 单次 `writeAsHub` 写入全部 writes（放宽事务超时）→ 日历订阅新建 → 可选覆盖 preferences → 写导入记录 → 返回 stats。
- Prisma：新表 `DataImport(userId, exportId, importedAt, counts Json)` + 迁移。
- 并发：同一用户同时只允许一个导入（拿用户级锁或简单拒绝）。

## 验收

- 集成测试：往返测试（A 导出 → 空账号 B 导入 → 去 id 比较，含 blob 字节）；导入非空账号现有数据不变；中途失败无新行；导入后 `pull` 能拿到全部新实体。
- 重复导入同一包时 preview 返回 `alreadyImportedAt`。

## Comments

### 2026-10-16 — 实现

- `DataImportService`：预览把上传落盘（`ImportUploads`，系统临时目录按用户分目录，1 小时过期，每次上传时清扫）；导入先 `BlobStore.put` 包内 blob（hash 不符 → `blob-mismatch`），再在一个 `writeAsHub` 里读目标现状、`buildImportPlan`、逐行 `batch.write`、建日历订阅、可选覆盖偏好、写 `DataImport`。事务沿用 `HUB_WRITE_TX_OPTIONS`（60s 超时）。
- 同一用户并发导入：进程内锁，第二个请求 409。
- 错误：`DataPackageError` → 422，message 为错误码（同日历订阅惯例）；uploadId 不存在 / 过期 / 属于别人 → 404。
- `edgePositions` 增加 `Area`。feed 末尾取项目 Feed Position 与项目 Position 的最大值，再与任务末尾比较。
- Prisma `DataImport` + 迁移 `20261016120000_data_import`。
- 测试：`test/data-package.import.e2e-spec.ts`（往返规范形一致含 blob 字节、pull 到导入的任务、非空账号现有数据不变 + Tag 合并 + 追加末尾 + 重复导入提示、覆盖偏好、blob 损坏原子回滚、错误码、跨用户 uploadId）。
