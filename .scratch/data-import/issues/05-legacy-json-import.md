# 05: 旧 JSON 导出（format 0）导入

Status: implemented
Blocked by: 02

Spec：`../spec.md`（「导入流水线 → 旧 JSON」）。

## 范围

- 识别 `taskora-export-*.json`（顶层有 `version: '0.1.0'` 与 `tasks` 等数组）为 format 0。
- 迁移到 format 1：Prisma 行 → wire fields（`tags` / `subtasks` 关系拆为 `tagIds` 与独立 subtask 实体、日期 ISO、去掉 `userId` / `fieldClocks` / `fieldDigests` 等非 wire 列、按当前 `ENTITIES` 补缺省）。旧包无附件、无日历订阅。
- preview 接口接受 `.json` 上传。

## 验收

- 用当前 main 上旧导出端点生成的样例文件做 fixture，迁移后能完整导入。

## Comments

### 2026-10-16 — 实现

- `package-reader`：文件不以 zip 头开始时按 JSON 读，识别为旧版导出后合成 format 0 manifest，exportId = `legacy-<文件 sha256>`（重复导入同样有提示）。
- `package-format`：迁移 0 → 1 复用 `wireViewOfRow`（Prisma 行 JSON 化后日期已是 ISO，与 wire 一致；`tags` 关系 → `tagIds`、JSON 列解析、非 wire 列丢弃），Subtask 从 Task 里拆出；偏好取 `user.preferences`。
- 测试：e2e 用照搬旧实现的查询生成 fixture，导入后除附件外规范形一致，偏好可导入，重复导入有提示。
