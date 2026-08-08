# Design — Task notes markdown WYSIWYG editor

## 1. 边界与组件结构

```
<MarkdownNotesEditor
  value: string            // Markdown 字符串（来自 task.notes / project.notes）
  onChange: (md: string)   // 内容变化回调（用于本地 state 同步）
  onBlurCommit: () => void // 失焦提交回调（保留现有 commitNotes 语义）
  placeholder?: string
/>
```

- 新组件路径：`packages/frontend/src/components/common/MarkdownNotesEditor.tsx`
- 在 `TaskRowExpanded.tsx` 替换 `<Textarea>` → `<MarkdownNotesEditor>`
- 在 `ProjectDetail.tsx` 替换 `<Textarea>` → `<MarkdownNotesEditor>`
- 两处调用方保留现有 `notes` / `setNotes` / `commitNotes` 逻辑不变，仅替换编辑器控件。

## 2. 选型与依赖

| 依赖 | 作用 | License | 版本 |
|---|---|---|---|
| `@tiptap/react` | React 封装的编辑器 | MIT | ^3.29 |
| `@tiptap/starter-kit` | 基础节点集合（标题/列表/引用/代码块/分隔线等）| MIT | ^3.29 |
| `@tiptap/markdown` | 官方 Markdown 双向解析/序列化 | MIT | ^3.x |
| `@tailwindcss/typography` | `.prose` 排版样式插件 | MIT | ^0.5 |

`@tiptap/starter-kit` 已覆盖标题、加粗/斜体/删除线、有序/无序列表、引用、代码块、分隔线、链接，无需额外扩展即可满足 PRD R1 的语法集。

不选 Lexical 的原因：Tiptap 的 React API 更直观（`useEditor` + `EditorContent`），Markdown 双向转换有官方扩展，对"备注"这种轻量场景上手成本更低。

## 3. 数据流

```
Markdown 字符串 (props.value)
  → Tiptap Markdown.parseToMarkdown / setContent  [挂载/外部值变化时]
  → ProseMirror 内部文档 (所见即所得编辑)
  → onUpdate → Markdown.serialize → onChange(md)  [本地 state 同步]
  → onBlur → onBlurCommit() → patch({ notes: md })  [失焦保存]
```

关键点：
- **外部 value 变化同步**：当 `props.value` 与编辑器当前序列化结果不同时才 `setContent`，避免编辑中循环更新。用 `useEditor` 的 `onBeforeCreate`/`onUpdate` + 一个 ref 比对实现。
- **失焦提交**：监听编辑器 `blur` 事务，调用 `onBlurCommit`。保留现有 `commitNotes` 中"仅在内容变化时才 patch"的判断（该判断在调用方，组件只负责通知）。
- **空内容处理**：Tiptap 空文档序列化为空字符串，`onChange('')` → 与 `notes ?? ''` 一致。

## 4. 样式方案

- 安装 `@tailwindcss/typography`，在 `tailwind.config.js` 注册插件。
- 编辑器外层包裹 `<div class="prose prose-sm dark:prose-invert notes-prose">`：
  - `prose prose-sm` 提供 Markdown 排版基线
  - `dark:prose-invert` 适配暗色模式
  - `.notes-prose` 自定义类，用 CSS 变量覆盖 prose 颜色以匹配项目主题（`--foreground` / `--muted-foreground` / `--primary` / `--border`），而非 typography 默认的灰色系。
- 编辑器最小高度：沿用 `min-h-[60px]`（与原 Textarea 一致），`resize-none`。
- 去掉编辑器默认边框/阴影，沿用 `border-0 px-0 shadow-none focus-visible:ring-0` 与项目"无边框内嵌文本"风格一致。

## 5. 兼容性

- **旧纯文本数据**：`@tiptap/markdown` 的 parser 对纯文本（无 Markdown 语法）按段落渲染，不报错、不丢字。满足 AC5。
- **现有测试**：`TaskRowExpanded.test.tsx` 未直接测 notes textarea DOM，但 mock 了 `useUpdateTask`。组件替换不影响 mock 契约。需确认测试中不依赖 `Textarea` 元素（已确认：测试聚焦 subtask 输入与 DnD，不触碰 notes）。
- **i18n**：placeholder 文案沿用 `task:notePlaceholder` / `project:notePlaceholder`，不新增 key。

## 6. 键盘事件冒泡

现有 Textarea 有 `onKeyDown` 阻止 `Enter`/`Space` 冒泡到父行（防止触发 dnd-kit KeyboardSensor 的键盘拖拽 / 行折叠）。根据 frontend spec 的精确规则：

- `Enter` / `Space`：**必须** `stopPropagation`（否则 dnd-kit listeners 启动键盘拖拽，单元素 SortableContext 卡在 isDragging、行半透明不恢复，且 Space 被 preventDefault 吞掉空格字符）。
- `Escape`：**不** `stopPropagation`（让事件冒泡到 `TaskItem` 根 div 的 `onKeyDown` 触发行折叠）。

Tiptap `EditorContent` 不直接暴露 `onKeyDown`，需通过外层容器 `onKeyDownCapture` 捕获处理：仅对 `Enter`/`Space` 调用 `e.stopPropagation()`，对 `Escape` 放行。注意 ProjectDetail 页面不在 SortableContext 内，键盘冒泡规则不适用，但组件统一行为无副作用。

## 7. 风险与取舍

- **`@tiptap/markdown` 为早期发布**（官方文档标注 early release）。取舍：相比社区 `tiptap-markdown` 包，官方包长期维护更可信；若序列化有边缘 case，可后续补自定义 serializer。首版接受该风险。
- **ProseMirror 包体积**：Tiptap 核心 + StarterKit + Markdown 约 +150KB gzip。备注场景为低频展开内容，可接受；若后续需优化可做懒加载。
- **工具栏**：首版不做，靠输入规则。若用户反馈需要，作为后续增强任务。
- **行内高度跳动**：TaskRowExpanded 是展开区域，编辑器内容增长会导致行高变化。沿用原 Textarea 的 `min-h-[60px]` 并允许自然撑高，与原行为一致。

## 8. 回滚方案

- 依赖变更可回滚：`pnpm remove` 三个 Tiptap 包 + typography 插件，恢复 `Textarea` 即可。
- 后端无改动，数据格式不变，无需数据回滚。
- 组件替换为纯前端改动，git revert 即可完整回滚。