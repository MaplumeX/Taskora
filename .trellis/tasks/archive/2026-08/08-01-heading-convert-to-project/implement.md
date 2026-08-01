# Heading 转换为项目 — 执行计划

## 1. 后端

- [ ] 1.1 `packages/backend/src/project-headings/project-headings.service.ts`：新增 `convertToProject(userId, id)`（见 design.md §2.2）
- [ ] 1.2 `packages/backend/src/project-headings/project-headings.controller.ts`：新增 `POST :id/convert-to-project` 路由
- [ ] 1.3 `packages/backend/test/project-headings.service.convert-to-project.spec.ts`：单测（见 design.md §4）

**验证**：`pnpm --filter backend test` 全绿；`pnpm --filter backend lint` 通过。

## 2. 前端

- [ ] 2.1 `packages/frontend/src/lib/api/project-headings.api.ts`：`convertProjectHeadingToProject(id)`
- [ ] 2.2 `packages/frontend/src/lib/hooks/useProjectHeadings.ts`：`useConvertProjectHeadingToProject(projectId)`
- [ ] 2.3 `packages/frontend/src/components/project/ProjectHeadingRow.tsx`：菜单新增"转换为项目"项（FolderInput 图标，位于删除之前，pending 时 disabled）
- [ ] 2.4 `packages/frontend/src/i18n/locales/{zh,en}/project.json`：`convertToProject` / `convertSuccess` / `convertFailed`
- [ ] 2.5 `packages/frontend/src/components/project/ProjectHeadingRow.test.tsx`：菜单项断言

**验证**：`pnpm --filter frontend test` 全绿；`pnpm --filter frontend lint` 通过。

## 3. 收尾

- [ ] 3.1 根级验证：`pnpm lint && pnpm typecheck && pnpm test`（或仓库根级等价命令）
- [ ] 3.2 手动冒烟（可选）：本地起前后端，验证转换后侧边栏新项目出现、原项目 Heading 消失、Subtask 层级保留
- [ ] 3.3 更新 spec（`.trellis/spec/`：frontend/backend 相关章节，含 Heading 转换语义与 Out of Scope 变更）
- [ ] 3.4 git commit（英文 message，`feat: ...` 前缀）
- [ ] 3.5 归档任务 + 记录 journal + `trellis-finish-work`

## 校验门

- 后端单测覆盖：404（Heading 不存在 / 项目不存在）、正常转换（title/areaId/sortOrder/updateMany/deleteMany）、count≠1 → BadRequest、空 Heading 转换、`tags: []`
- 前端测试：菜单项渲染 + 点击调用
- lint / typecheck / test 全部通过后进入收尾
