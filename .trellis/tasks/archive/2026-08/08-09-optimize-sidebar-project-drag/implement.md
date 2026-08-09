# Implement: 侧边栏项目条目所见即所得拖拽

## 执行清单

### 1. 建立纯布局模型

- [ ] 新增 sidebar project DnD helper，定义 normalized containers、placement、clone/equality、target resolution、immutable move 和全局 ID serialization。
- [ ] 为 before/after、同容器方向修正、独立/区域互移、区域标题首位、空容器、no-op 和不可变性添加聚焦测试。
- [ ] 回滚点：helper 与测试可独立删除，不影响现有组件。

### 2. 接入项目拖拽会话

- [ ] 在 `SidebarProjectSection` 区分 server layout、rendered preview、drag-start snapshot、pending props、active project 和最后有效 target。
- [ ] 增加项目专用 collision priority；区域 active 继续使用 area-only `closestCenter`。
- [ ] 实现 start / over / end / cancel；outside drop 提交最后有效 changed preview，cancel 恢复。
- [ ] 保留 PointerSensor `distance: 5`，启用 `MeasuringStrategy.Always`。
- [ ] 回滚点：事件状态机可整体恢复为旧 `onDragEnd`。

### 3. 渲染浮层、占位与容器

- [ ] `SortableProjectItem` 支持 active placeholder，并在显式项目预览期间关闭重复 transform。
- [ ] 增加紧凑、不可交互的 `DragOverlay`。
- [ ] 独立项目区和展开区域提供显式 droppable 容器；空列表在拖动期间可命中。
- [ ] `SidebarAreaRow` / `SortableAreaRow` 支持折叠区域标题下的首位占位，但不自动展开其它项目。
- [ ] 不添加区域背景 tint/ring，不改变正常侧边栏间距和项目行设计。

### 4. 接入持久化与恢复

- [ ] 同归属 changed drop 只调用一次 reorder；no-op 零调用。
- [ ] 跨归属 changed drop 只调用一次 update，成功后只调用一次 reorder；update 失败不得继续。
- [ ] update/reorder 失败显示 `common:saveFailed`，恢复冻结的服务端基线并等待 query 失效后的服务端事实。
- [ ] 拖动期间 props 更新延迟到结束/取消，不覆盖预览。

### 5. 组件回归测试

- [ ] 新增 `SidebarProjectSection` DnD harness，覆盖 overlay/placeholder、before/after、空独立区、空/折叠区域首位、同/跨归属、sticky outside、re-enter、cancel、no-op、失败和 pending props。
- [ ] 覆盖 area-only collision / reorder，确认项目 target 不干扰区域排序。
- [ ] 检查导航、chevron、右键菜单所依赖的 DOM/listeners 结构未被破坏。

### 6. 质量门

按顺序运行：

```bash
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend test -- SidebarProjectSection
pnpm --filter @taskora/frontend test
git diff --check
```

浏览器手工检查：

- 同列表上下拖动的 before/after；
- 独立区为空时从区域拖出；
- 展开/空/折叠区域标题首位；
- 区域间双向拖动与 sticky outside release；
- 边缘自动滚动、导航、右键菜单和 chevron；
- 控制台无新增 dnd-kit/React warning。

## Review Gates

1. helper + 会话状态机完成后，核对 AC1–AC10 和 mutation 次数。
2. 全部测试完成后派发 `trellis-check` 做独立规格/质量复核。
3. check 若发现问题，回到实现修正并重跑完整质量门。

## 规格更新

实现验证后更新 `.trellis/spec/frontend/component-guidelines.md` 的侧边栏拖拽章节，记录：

- 显式项目 layout preview 和 placeholder；
- area heading 插入首位；
- 空独立/区域容器；
- sticky outside release 与 cancel 区别；
- 同归属一次 reorder、跨归属 update-success-then-reorder；
- area-only collision 隔离。
