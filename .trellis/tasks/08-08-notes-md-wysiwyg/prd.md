# Task notes markdown WYSIWYG editor

## Goal

让 Taskora 的备注（Task notes 与 Project notes）支持 Markdown 所见即所得编辑：用户在备注里输入 Markdown 语法时实时渲染为富文本样式，失焦后仍以 Markdown 字符串保存。

## Background

- 备注（`notes`）字段当前是纯文本 `Textarea`，出现在两处：
  - `packages/frontend/src/components/task/TaskRowExpanded.tsx`（任务备注）
  - `packages/frontend/src/pages/ProjectDetail.tsx`（项目备注）
- `notes` 在后端为 `String?`（可空字符串），Task / Project / Area 三模型都有此字段。
- Area 模型有 `notes` 字段但当前 UI 无编辑入口，本次不涉及。

## Requirements

### 功能需求
- R1 备注编辑时为所见即所得：输入 Markdown 语法（`#`/`##` 标题、`**bold**`/`*italic*`/`~~strike~~`、`- `/`1. ` 列表、`> ` 引用、`` `code` `` 与 ``` ``` 代码块、`---` 分隔线、`[text](url)` 链接）实时渲染为富文本。
- R2 编辑器失去焦点时，内容以 Markdown 字符串提交保存（保留现有 `commitNotes` 失焦提交语义）。
- R3 空内容时显示 placeholder，文案沿用现有 i18n key（`task:notePlaceholder` / `project:notePlaceholder`）。
- R4 抽出可复用组件 `<MarkdownNotesEditor>`，在 Task 备注与 Project 备注两处复用。
- R5 暗色模式下样式正确（沿用项目 CSS 变量主题体系）。
- R6 兼容已有数据：旧的纯文本 notes 打开时按纯文本正常显示（不报错、不丢失内容）。

### 非功能需求 / 约束
- N1 后端 `notes` 字段类型与存储格式不变，仍是 Markdown 字符串。后端零改动。
- N2 不引入付费依赖。编辑器选型用 Tiptap v3（MIT）+ `@tiptap/markdown`（MIT，官方 Markdown 双向转换扩展）。
- N3 复用现有 Tailwind + shadcn 设计体系；富文本排版样式通过 `@tailwindcss/typography` 插件 + CSS 变量覆盖，与项目主题一致。
- N4 不破坏现有 `TaskRowExpanded.test.tsx` 测试（该测试不直接测 notes textarea，但 mock 了 `useUpdateTask`）。
- N5 编辑器在行内展开区域（TaskRowExpanded）需控制最小高度，避免布局跳动。

## Out of Scope
- Area 备注 UI（当前无编辑入口，本次不新增）。
- 工具栏 / 斜杠命令菜单（`/` 命令）。首版靠 Tiptap 输入规则（input rules）即可满足 WYSIWYG；工具栏作为后续增强。
- 协作编辑、图片上传。
- 后端字段格式变更或迁移。

## Acceptance Criteria
- [ ] AC1 任务备注输入 `# 标题`、`**粗体**`、`- 列表项` 等 Markdown 语法，编辑时实时看到渲染后的富文本样式。
- [ ] AC2 编辑器失焦后内容保存成功；刷新页面后备注仍按 Markdown 正确渲染。
- [ ] AC3 项目备注（ProjectDetail 页）具备与任务备注完全一致的 Markdown WYSIWYG 能力。
- [ ] AC4 暗色模式下，编辑器内容、placeholder、边框等样式与项目整体一致，无对比度问题。
- [ ] AC5 旧的纯文本备注打开后正常显示，不报错、内容不丢失。
- [ ] AC6 `pnpm typecheck` / `pnpm lint` / `pnpm test`（frontend）全部通过。
- [ ] AC7 TaskRowExpanded 既有测试仍通过，未因编辑器替换而回归。