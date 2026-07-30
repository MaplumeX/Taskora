# 修复 Area 删除外键约束错误

## Goal

`AreasService.remove` 调用 `prisma.area.delete` 时，若 Area 下关联了 Task 或 Project，因 `Task.areaId`/`Project.areaId` 无 `onDelete` 策略（Prisma 默认 `NoAction`）导致 FK 约束错误，删除失败。需在 schema 层加 `onDelete: SetNull`，使删除 Area 时下属引用自动脱钩为 null。

## Requirements

- `packages/backend/prisma/schema.prisma`：
  - `Task.area` 关联加 `onDelete: SetNull`
  - `Project.area` 关联加 `onDelete: SetNull`
- 生成并应用 Prisma migration
- `AreasService.remove` 逻辑不变（仍 `prisma.area.delete`），由 DB 层自动清理引用

## Acceptance Criteria

- [ ] Area 下有 Task 时，`DELETE /areas/:id` 成功，Task 的 `areaId` 变为 null
- [ ] Area 下有 Project 时，`DELETE /areas/:id` 成功，Project 的 `areaId` 变为 null
- [ ] Area 下无关联时仍可正常删除
- [ ] Area 不属于当前用户时返回 404（userId 隔离不变）
- [ ] migration SQL 可在空库执行
