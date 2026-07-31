# Project detail notes field

## Goal

在项目详情页 (`ProjectDetail.tsx`) 显示并编辑 `Project.notes` 字段，对齐 Task
`TaskRowExpanded` 中备注的交互（inline textarea，onBlur 提交）。

## Background

- 后端 `schema.prisma`、`projects.service.ts`（create 第 48 行、update 第 132 行）已支持 `notes`
- 共享 DTO `project.dto.ts` 已有 `notes?: string`（create/update）与 `notes: string | null`（response）
- 后端无需改动；前端 `useUpdateProject` hook 已存在，会 invalidate `project detail/all/feed` 查询
- Task 侧 `TaskRowExpanded.tsx` 已有可参照的 textarea + onBlur commit 实现
- 当前 `ProjectDetail.tsx` 未渲染 notes，仅进行 title 编辑和任务列表展示

## Requirements

- 在 `ProjectDetail.tsx` 标题行下方、`ProjectTaskLayout` 上方渲染一个 Textarea
- textarea 受控于本地 state，初值来自 `project.notes ?? ''`
- onBlur 时若内容相对 `current.notes` 有变化，调用 `useUpdateProject` 提交 `{ notes }`
- 提交失败 → `toast.error(t('common:saveFailed'))`，与同页 title 更新错误处理一致
- 只有 `project` 存在时渲染 textarea（与 title 行一致）
- placeholder 文案：新增 `project:notePlaceholder`，en `Note…` / zh `备注…`
  （对齐 `task:notePlaceholder` 文案风格，但放在 project 命名空间）
- 视觉风格对齐 `TaskRowExpanded` 的 Textarea：无边框、无阴影、无 focus ring，min-h，resize-none
- 不引入新依赖；使用既有 `@/components/ui/textarea`（或 Task 同款 Textarea）

## Out of Scope

- Area 详情页的备注 UI（用户已确认本次不做）
- 富文本/markdown 渲染（保持纯文本 textarea）
- 后端 / schema 变更

## Acceptance Criteria

- [ ] 项目详情页在标题下方渲染备注 textarea，内容为 `project.notes` 当前值
- [ ] 编辑后失焦 → 触发 `PATCH /projects/:id { notes }`，列表与详情即时刷新
- [ ] 未改动时失焦不触发请求
- [ ] 提交失败时显示 `common:saveFailed` toast
- [ ] en / zh locale 文件新增 `project:notePlaceholder`
- [ ] 不破坏现有 ProjectDetail 的标题编辑、完成切换、more menu、任务列表交互
- [ ] 视觉与 Task 备注一致（无边框/阴影，同 placeholder 风格）

## Notes

- 轻量任务，PRD-only；实现时直接在 `ProjectDetail.tsx` 内嵌入 Textarea + local state
  （参照 `TaskRowExpanded` 的 `useState` + `commitNotes` 模式）
- 复用既有 `useUpdateProject` hook，无需新增 hook
