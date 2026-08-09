# 侧边栏项目拖拽证据与历史方案

## 当前实现

- `SidebarProjectSection.tsx` 使用一个 `DndContext`，但独立项目、区域行、各区域项目分别处于不同 `SortableContext`。
- 项目排序和归属只在 `onDragEnd` 计算；没有拖拽会话快照、本地 `onDragOver` 布局或 `DragOverlay`。
- `computeReorderedGlobalIds` 对项目目标只执行“移除 active 后插到 over 之前”，未表达指针上/下半的 before/after。
- 独立项目为空时没有可测量的容器 droppable，区域项目无法可靠拖出为独立项目。
- 区域归属更新与全局排序是两个接口；当前用 `onSettled` 启动 reorder，即使 update 失败也可能继续第二步。

## 近期任务条目拖拽合同

来源：

- `.trellis/tasks/archive/2026-08/08-09-improve-cross-group-task-drag/`
- `.trellis/tasks/archive/2026-08/08-09-fix-outside-container-drop-preview/`
- `.trellis/spec/frontend/component-guidelines.md`
- commits `922cfb2`、`5ff727c`

已验证模式：

1. `DragOverlay` 展示紧凑浮层，active 原行变为行高占位。
2. pointer collision 优先嵌套 item，再 container，再 heading；项目/任务上、下半映射 before/after。
3. `onDragOver` 只更新本地 normalized layout；drop 才持久化。
4. 取消恢复快照；离开所有有效目标保留最后有效预览，容器外释放提交该预览。
5. 拖动期间延迟 props 同步，失败恢复冻结的服务端布局。
6. 纯布局 helper 与事件 harness 测试比仅手工验证更容易覆盖方向、no-op 和失败路径。

## 历史侧边栏尝试

通过 Git 不可达历史与 `trellis mem` 找到三类方案：

- `85d4b46`：修正向下插入方向，增加 overlay 和区域 ring。它能提示“拖到哪个区域”，但不能表达跨区域精确插入位置。
- `60d8f743...`：尝试跨区域 displacement preview。
- `257e8436`：把所有项目/区域铺进单一扁平 `SortableContext`，以 dnd-kit transform 获取跨区动画。该方案仍以最终 `onDragEnd` 计算为主，不能直接满足当前的显式占位、粘性外部释放、空独立区和失败恢复合同。

结论：本次不直接恢复历史提交。保留区域排序的现有 sortable 路径，对项目拖拽引入独立的 normalized layout + 显式占位状态机，范围更精准，也与近期任务条目实现一致。

## 已确认产品决策

- 用户选择：拖到区域标题时插入区域首位。
- 因此折叠区域无需自动展开全部项目；可直接在标题下显示首位占位，预览与最终语义一致。

## 约束与验证风险

- 跨区域保存受两个既有 API 限制，无法服务端原子化；只允许 update 成功后启动 reorder。
- 区域拖拽必须使用 area-only collision，不得进入项目状态机。
- jsdom 无法真实覆盖指针几何、自动滚动和 drop animation；自动化后仍需浏览器检查。
