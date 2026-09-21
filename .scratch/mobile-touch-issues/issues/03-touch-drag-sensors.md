# 03 — Drag reorder not touch-adapted

Status: done

## Problem

- `TaskList` / `FeedListView` / `AreaDetail` / `ProjectTaskLayout` 只挂 `PointerSensor({ activationConstraint: { distance: 5 } })`。触屏 pointer 事件同样命中该 sensor，垂直滑动 5px 即激活拖拽，与列表滚动直接冲突。
- `ProjectHeadingRow` 拖拽手柄 `opacity-0 group-hover:opacity-100`，触屏无 hover，Heading 永远无法拖动。

## Fix

- 四处 sensors 改为 `MouseSensor({ distance: 5 }) + TouchSensor({ delay: 300, tolerance: 8 })`（`ProjectTaskLayout` 保留 KeyboardSensor）。触摸需按住 300ms 再移动才进入拖拽，滚动期间移动超过容差即取消。
- 拖拽手柄加 `max-md:opacity-100`。
