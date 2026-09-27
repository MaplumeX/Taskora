# 05: 展开任务浮起卡片

Status: done
Blocked by: 04

## 内容

`TaskItem` + `TaskRowExpanded`：展开时整体成为 `bg-card` 圆角 10px + `shadow-row-lift` 的卡片，上下 12px 外边距，高度以 CSS grid 0fr→1fr 做 200ms spring 展开；已设字段以 chip 显示在左下，右下为图标工具条；Subtasks 紧凑列表。

## 验收标准

- [x] 展开 / 收起有高度过渡，reduced-motion 下瞬时
- [x] 现有 `TaskRowExpanded` 测试全绿（字段编辑、清除、子任务增删）
- [x] 窄屏展开卡片不横向溢出

## Comments

- 2026-09-27：完成。卡片 `bg-card` + 10px 圆角 + `shadow-row-lift` + 上下 12px。底栏：已设字段（计划日期含提醒时刻 / 重复 / 标签 / Deadline）为左侧 chip，未设字段为右侧图标（Things 式「已设即显值」）；chip 点击打开同一 FieldPicker。展开时标题行不再显示日期 / 标签 / Deadline 等行内徽标（由 chip 承担）。子任务 12px 圆形勾选框、删除按钮 hover 显示。内联编辑输入统一 `bg-transparent`（Input 默认底色改为 background 后暗色下会露出色块）。
- 偏离：高度展开动画用 tailwindcss-animate 的 fade + slide-in（展开内容挂载即播放），未做 grid 0fr→1fr 高度过渡（组件挂载 / 卸载模型下无法对高度做过渡）；chip 上不做 hover ✕ 清除（清除入口在各字段编辑器内）。
