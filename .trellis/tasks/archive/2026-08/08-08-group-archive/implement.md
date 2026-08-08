# Implement — 为分组提供归档功能

## 实现顺序

### 阶段 1：数据模型 + shared 包

1. **Prisma schema**：`ProjectHeading` 新增 `status HeadingStatus @default(ACTIVE)` + `completedAt DateTime?`；新增 `enum HeadingStatus { ACTIVE, COMPLETED }`
2. **生成迁移**：`npx prisma migrate dev --name add_heading_status`
3. **shared 包**：新增 `HeadingStatus` enum；`ProjectHeadingResponseDto` 加 `status` + `completedAt` 字段
4. **构建 shared 包**：`pnpm --filter @taskora/shared build`

### 阶段 2：后端

5. **ProjectHeadingsService.findAll**：改为 `where: { userId, projectId, status: 'ACTIVE' }`（过滤归档 heading）
6. **ProjectHeadingsService.findAllArchived**（新增）：返回 `status=COMPLETED` 的 heading（给已完成面板用）。或给 `findAll` 加 `includeArchived?: boolean` 参数
7. **ProjectHeadingsService.archive**（新增）：事务内级联完成 ACTIVE task + 标记 heading COMPLETED
8. **ProjectHeadingsService.unarchive**（新增）：标记 heading ACTIVE，不动 task
9. **ProjectHeadingsService.reorder**：heading 校验集合改为 `status=ACTIVE`（与 findAll 对齐）
10. **ProjectHeadingsController**：新增 `POST :id/archive` + `POST :id/unarchive`；`findAll` 支持 `includeArchived` query 参数
11. **后端测试**：archive/unarchive/级联完成/findAll 过滤/reorder 兼容

### 阶段 3：前端

12. **API 层**：`project-headings.api.ts` 新增 `archiveProjectHeading` / `unarchiveProjectHeading`；`getProjectHeadings` 新增可选 `includeArchived` 参数
13. **hooks**：`useProjectHeadings.ts` 新增 `useArchiveProjectHeading` / `useUnarchiveProjectHeading`；`useProjectHeadingsQuery` 支持可选 `includeArchived` 选项供已完成面板使用；成功后 invalidate headings + tasks + feed
14. **ProjectCompletedTasks 改造**：
    - 查询归档 headings
    - 将 COMPLETED task 按 headingId 分组：归档 heading 的 task 归入对应分组，其余扁平
    - 归档 heading 分组标题行：精简 row + 下拉菜单（"取消归档"）
    - 保留分组-任务关联展示
15. **ProjectHeadingRow**：活跃区 heading 下拉菜单新增"归档"菜单项
16. **i18n**：补充 `archive`/`unarchive`/`archiveHeading`/`unarchiveHeading` 等文案（en + zh）
17. **前端测试**：ProjectCompletedTasks 分组展示、取消归档交互、归档菜单项

## 验证命令

```bash
# shared 构建
pnpm --filter @taskora/shared build

# 后端测试
pnpm --filter @taskora/backend test

# 前端测试
pnpm --filter @taskora/frontend test

# lint
pnpm lint

# Prisma 迁移
cd packages/backend && npx prisma migrate dev --name add_heading_status
```

## 风险点与回滚

- **reorder 校验变更**：改 `reorder` 的 heading 集合为 `status=ACTIVE` 后，前端如果有缓存的归档 heading id 会导致校验失败。确保 `findAll` 先返回过滤后的集合，前端 `useProjectHeadingsQuery` 同步更新。
- **ProjectCompletedTasks 查询**：需要同时拿归档 headings + COMPLETED tasks，注意两者加载时序。归档 headings 查询失败时不应阻塞扁平 task 展示。
- **迁移**：新增 enum + 字段，现有数据 default ACTIVE，安全。回滚 = drop column。

## 审查检查点

- [ ] 阶段 1 完成后：确认 shared 包构建通过，Prisma 迁移成功
- [ ] 阶段 2 完成后：后端测试全绿，手动验证 archive/unarchive API
- [ ] 阶段 3 完成后：前端测试全绿，手动验证 UI 流程