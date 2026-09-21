# Mobile touch adaptation — high-priority fixes

Spec: 修复移动端「管理」链路的三个高优先级缺口（行上下文菜单、/agent 布局遮挡、触摸拖拽）。

Scope:

1. 行上下文菜单（Task / Project / Subtask 的 `onContextMenu`）只有鼠标右键入口，触屏完全无法访问 → 引入长按（long-press）触发，与右键共用同一 virtual anchor 菜单。
2. `/agent` 为 full-bleed 路由，`MobileTabBar` 无条件 fixed 渲染，composer 被遮挡 → full-bleed / canvas 容器在移动端补底部安全距离（`/calendar` 存在同类遮挡，一并修复）。
3. 拖拽排序只挂了 `PointerSensor({ distance: 5 })`，触屏上滑动 5px 即触发拖拽，与列表滚动冲突；Project Heading 的拖拽手柄 `opacity-0 group-hover:opacity-100`，触屏无 hover 不可见 → 改为 `MouseSensor + TouchSensor(delay)`，手柄 `max-md:opacity-100`。

设计取舍（长按菜单 vs 触摸拖拽）：

- 菜单长按延迟 500ms > TouchSensor 激活延迟 300ms。想拖拽的用户会在 ~300ms 后开始移动手指，移动超过容差会取消菜单计时器，两类手势天然分离；想开菜单的用户按住不动，行短暂进入 dragging 态（Project 内 placeholder 观感），抬手后恢复，菜单保持打开。
- `useLongPress` 只响应 `pointerType: 'touch' | 'pen'`，鼠标长按不触发（桌面右键已覆盖）；触发后抑制同一点击序列的 click，避免误触发行展开。
