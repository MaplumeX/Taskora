# 04: 任务行、Checkbox 与完成节奏

Status: done
Blocked by: 03

## 内容

1. `TaskItem`：行高、圆角、hover / 选中（`bg-selection`）/ 聚焦状态；行首日期 chip 与黄星；行尾 Tag 胶囊（最多 3 + `+N`）与 Deadline 颜色。
2. `TaskCheckbox`：14px 圆角方形、1.5px 描边、勾号 stroke 动画；取消态 ✕。`ProjectProgressRing` 描边粗细与之统一。
3. 完成节奏：勾选后停留 600ms（可撤销）→ 高度收起 + 淡出 200ms → `onToggleComplete`；reduced-motion 下不延迟收起动画。

## 验收标准

- [x] 测试：停留期内再次点击撤销，不调用 `onToggleComplete`；停留结束后调用一次
- [x] 测试：reduced-motion 下完成立即提交
- [x] Today / Anytime / Project / Logbook / Calendar 当天面板截图符合 spec

## Comments

- 2026-09-27：完成。完成节奏抽为 `useCompletionRhythm`（停留 600ms 可撤销 → 200ms 收起 → 提交；reduced-motion 立即提交；卸载不取消），行收起用外层 `grid-rows-[1fr]→[0fr]`。Checkbox 改 14px 圆角方框 + 1.5px 描边，勾号按笔画画出（仅在未勾→勾上时播放，Logbook 首次渲染不播）。选中态 `bg-selection`；Tag 改为灰描边胶囊（前缀用户色点，最多 3 + `+N`）；`ProjectProgressRing` 改为 Things 式蓝色细环 + 进度饼。键盘快捷键完成任务仍走原有路径（无停留）。
