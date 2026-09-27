# 03: 基础组件重做

Status: done
Blocked by: 02

## 内容

按 spec「基础组件」逐个调整 `packages/ui/src/components/ui`：Button（去 `active:scale`、尺寸、ghost 优先）、Input / Textarea（新增 `boxed` 变体，任务内编辑为无边框）、Popover / DropdownMenu / Tooltip（毛玻璃、`shadow-popover`、macOS 式菜单高亮）、Dialog / Drawer（圆角、遮罩、spring 出现）、Switch（绿）、Separator（0.5px）。

## 验收标准

- [x] Settings、TaskContextMenu、SearchModal、Sidebar 用户菜单截图符合 spec
- [x] 手机端触控目标仍 ≥ 44px
- [x] 键盘聚焦在所有交互元素上可见

## Comments

- 2026-09-27：完成。偏离 spec 的两处已回写 spec：Button 默认仍为实心蓝、Input 默认仍为带框表单样式（任务内编辑本就在调用点覆盖为无边框）。菜单项 / `MenuRow` 统一 28px 行高、蓝色高亮（破坏性项红底白字），图标间距改由 `gap-2` 提供（去掉各处 `mr-2`）。新增 `hairline-x/y`（2x 屏 0.5px 分割线）与全局 reduced-motion 降级。
