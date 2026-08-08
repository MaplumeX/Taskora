# Implement — Task notes markdown WYSIWYG editor

## 执行顺序

### 阶段 1：安装依赖与样式基础设施
- [ ] 1.1 `pnpm --filter @taskora/frontend add @tiptap/react @tiptap/starter-kit @tiptap/markdown`
- [ ] 1.2 `pnpm --filter @taskora/frontend add -D @tailwindcss/typography`
- [ ] 1.3 在 `packages/frontend/tailwind.config.js` 的 `plugins` 注册 `require('@tailwindcss/typography')`
- [ ] 1.4 在 `packages/frontend/src/index.css` 添加 `.notes-prose` 自定义样式（覆盖 prose 颜色到 CSS 变量）
- [ ] 1.5 验证 `pnpm --filter @taskora/frontend typecheck` 通过（无类型错误）

### 阶段 2：实现可复用编辑器组件
- [ ] 2.1 创建 `packages/frontend/src/components/common/MarkdownNotesEditor.tsx`
  - Props: `value`, `onChange`, `onBlurCommit`, `placeholder`
  - 用 `useEditor({ extensions: [StarterKit, Markdown], content: value, onUpdate, onBlur })` + `<EditorContent>`
  - 外部 value 变化时同步（ref 比对，避免循环更新）
  - `onBlur` → `onBlurCommit()`
  - 外层 `onKeyDownCapture` 阻止 Enter/Space 冒泡
  - 外层 class: `prose prose-sm dark:prose-invert notes-prose min-h-[60px]`
- [ ] 2.2 运行 `pnpm --filter @taskora/frontend typecheck` 确认组件类型正确

### 阶段 3：替换调用方
- [ ] 3.1 在 `TaskRowExpanded.tsx` 替换 `<Textarea>` 为 `<MarkdownNotesEditor>`，保持 `notes`/`setNotes`/`commitNotes` 逻辑
- [ ] 3.2 在 `ProjectDetail.tsx` 替换 `<Textarea>` 为 `<MarkdownNotesEditor>`，保持 `notes`/`setNotes`/`commitNotes` 逻辑
- [ ] 3.3 检查 `Textarea` 组件是否还被其他地方使用；若被弃用则保留（不删，不在本次范围）

### 阶段 4：验证
- [ ] 4.1 `pnpm --filter @taskora/frontend typecheck`
- [ ] 4.2 `pnpm --filter @taskora/frontend lint`
- [ ] 4.3 `pnpm --filter @taskora/frontend test`（确认 TaskRowExpanded 既有测试通过）
- [ ] 4.4 手动验证点（在 dev 环境确认，若可）：
  - 任务备注输入 `# 标题`/`**粗体**`/`- 列表` 实时渲染
  - 失焦保存后刷新，内容正确
  - 项目备注同样能力
  - 暗色模式样式正确
  - 旧纯文本备注正常显示

## 验证命令
```bash
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend test
```

## Review Gate
- 阶段 2 完成后自检组件：外部 value 同步逻辑、blur 提交、键盘冒泡处理是否正确。
- 阶段 4 全部通过后再进入 Finish 阶段。

## 回滚点
- 阶段 1 失败：移除依赖，不进入阶段 2。
- 阶段 2/3 失败：git 还原组件文件，依赖保留待定。
- 任何阶段发现 `@tiptap/markdown` 序列化严重缺陷：切回社区 `tiptap-markdown` 包评估。