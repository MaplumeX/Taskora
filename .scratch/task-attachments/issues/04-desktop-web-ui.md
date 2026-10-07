# 04: 桌面 / Web 附件 UI

Status: implemented — awaiting manual acceptance
Blocked by: 03

Spec：`../spec.md`（「UI」）。

## 范围

- `TaskRowExpanded` 工具栏回形针 `FieldIconButton`（文件选择）。
- 附件列表组件（`TaskSubtaskList` 下方）：类型图标、文件名、大小、状态；重命名、移除（右键菜单）、拖动排序（ADR 0018 app 级 DndContext 注册）。
- 原生文件拖入展开卡片（HTML5 drop，不与 Sidebar Drop 冲突）。
- 图片白名单 lightbox 预览。
- `TaskAttachmentsBadge`：收起行徽标，与 `TaskNotesBadge` 同风格。
- i18n（zh / en `task` 命名空间）。

## 验收

- spec User Stories 1、2、4–10 在桌面与 Web 手动通过；组件测试覆盖添加、重命名、排序、移除、徽标。

## Comments

### 2026-10-07 — 实现

- `TaskAttachmentList`：类型图标 + 文件名 + 大小（传输中显示上传中 / 等待上传 / 下载中）；点击打开，位图（png / jpeg / gif / webp）在 lightbox 预览；右键 / 长按菜单改名、删除；把手排序（与 `TaskSubtaskList` 同样用列表自己的 DndContext，没有注册进 app 级 DndContext——附件只在卡片内排序，不需要拖到侧边栏）。
- `TaskRowExpanded`：底栏回形针（始终显示，可多次添加）+ 隐藏的 `<input type=file multiple>`；原生文件拖入卡片（只认 `dataTransfer.types` 含 `Files` 的拖拽，带高亮与提示）。
- `TaskAttachmentsBadge` 与备注 / 子任务徽标同排。
- 「转换为项目」：任务有附件时先弹确认（`useConvertGuard`，右键菜单与多选工具栏两个入口）。
- 打不开时的提示区分「还没上传完成」与「离线且本机没有」。
- 未做手动验收：没有在真实桌面应用 / 浏览器里跑过。
