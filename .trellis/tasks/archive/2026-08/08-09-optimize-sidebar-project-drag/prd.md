# 优化侧边栏项目条目拖拽

## Goal

让侧边栏项目条目的拖拽具备与最近两次项目任务条目优化一致的“所见即所得”反馈：拖动时显示紧凑浮层和精确占位，释放后的实际位置与最后可见预览一致，同时保留现有项目归属、项目排序与区域排序能力。

## Background

- 当前侧边栏由一个 `DndContext` 管理独立项目、区域行和区域内项目，但项目被拆在多个 `SortableContext` 中（`packages/frontend/src/components/layout/SidebarProjectSection.tsx:164`、`packages/frontend/src/components/layout/SidebarAreaRow.tsx:59`）。跨区域拖动不会产生可靠的目标列表占位反馈。
- 当前只在 `onDragEnd` 计算并提交项目顺序，没有 `onDragStart` / `onDragOver` 驱动的本地预览，也没有 `DragOverlay`（`packages/frontend/src/components/layout/SidebarProjectSection.tsx:86`、`:164`）。
- 当前项目条目在拖动时仅降低原位置透明度（`packages/frontend/src/components/layout/SortableProjectItem.tsx:21`），不能明确表达被拖项目和最终插入位置。
- 当前项目落到项目条目时总是插到目标之前，未表达目标条目上半/下半的 before/after 意图（`packages/frontend/src/components/layout/SidebarProjectSection.tsx:40`）。
- 当前跨区域提交必须使用既有两步契约：先更新项目 `areaId`，再提交全局项目 `orderedIds`；同区域仅提交一次 reorder（`packages/frontend/src/components/layout/SidebarProjectSection.tsx:129`）。后端没有“项目归属 + 顺序”原子接口。
- 最近两次任务条目拖拽优化已确立可复用交互合同：紧凑 `DragOverlay`、行高占位、上/下半 before/after、hover 仅改本地预览、变化后单次提交、取消恢复，以及离开有效容器后保留并提交最后有效预览（`.trellis/spec/frontend/component-guidelines.md` 的 Project heading layouts）。
- 历史侧边栏拖拽尝试曾验证单纯依赖多个 `SortableContext` 或仅增加浮层/区域高亮仍无法稳定表达跨区域精确落点；本次应以显式布局预览和占位为准，而不是恢复旧的仅高亮方案。

## Requirements

### R1 — 项目拖拽实时预览

- 开始拖动项目后，显示一个紧凑、不可交互的项目浮层跟随指针。
- 被拖项目在列表中改为项目行高的占位符；占位符必须进入目标列表文档流并推动后续项目，明确显示最终插入位置。
- 指针位于目标项目条目上半/下半时，分别预览插入到该项之前/之后。
- 占位符是唯一的目标强调；不使用整块区域背景染色或仅靠区域标题 ring 表达落点。

### R2 — 独立项目与区域目标

- 独立项目区必须是显式可放置容器，即使当前没有独立项目，也能把区域内项目拖出并将 `areaId` 变为 `null`。
- 展开的区域项目列表必须支持首位、中间、末尾和空列表放置。
- 拖到区域标题时插入该区域首位；展开区域在首项前显示占位，折叠区域在标题下直接显示同一首位占位，无需自动展开全部项目。
- 同区域排序、独立项目排序、独立项目与区域之间移动、不同区域之间移动均使用同一套布局预览规则。

### R3 — 粘性最后有效落点

- 指针离开所有有效项目/容器/区域目标后，保留最后一个有效占位预览，浮层继续跟随指针。
- 在有效目标外释放时，如果最后预览相对拖拽开始布局有变化，则提交该预览；没有形成新落点或最终预览无变化时不提交。
- 指针离开后重新进入另一有效目标，应更新到新预览；再次移出并释放时提交最后显示的新预览。
- Escape 或系统取消始终恢复拖拽开始布局，不提交任何 mutation；取消与容器外释放必须保持不同语义。

### R4 — 本地状态、持久化与失败处理

- `onDragOver` 只更新本地布局预览，不调用网络 mutation。
- 同归属变化后的有效 drop 只调用一次项目 reorder mutation；no-op 不调用。
- 跨归属变化后的有效 drop 按现有后端契约先更新 `areaId`，成功后再提交一次全局 `orderedIds`；归属更新失败时不得继续 reorder。
- 任一步保存失败均显示既有 `common:saveFailed`，并通过现有 query 回滚/失效机制恢复服务端事实。
- 拖动期间到达的新 props 不得覆盖正在显示的预览；取消时优先恢复最新服务端布局。

### R5 — 回归保护与范围

- 区域行拖拽排序继续走独立的 area-only 碰撞与 `useReorderAreas` 持久化路径，不进入项目预览状态机。
- 保留 PointerSensor `distance: 5`、项目/区域导航、项目右键菜单、区域 chevron 折叠、自动滚动和现有可见项目过滤。
- 变更仅限侧边栏项目条目拖拽；不改变 AreaDetail、项目详情任务拖拽、后端接口、DTO 或 i18n。
- 不额外引入键盘拖拽能力；当前侧边栏只有 PointerSensor，本次只保证现有交互不退化。

## Acceptance Criteria

- [ ] AC1 (R1): 拖动项目时显示紧凑项目浮层，目标位置出现项目行高占位并推动后续条目。
- [ ] AC2 (R1): 悬停项目上半/下半分别预览 before/after，释放后的实际顺序与占位一致。
- [ ] AC3 (R1): 项目拖拽期间不出现目标区域整块背景染色或仅靠标题高亮表示落点。
- [ ] AC4 (R2): 独立项目区在为空时仍可接收区域内项目，并将其归属更新为 `null`。
- [ ] AC5 (R2): 拖到区域标题会预览并插入该区域首位；展开区域支持首位、中间、末尾和空列表放置，折叠区域在标题下显示同一首位占位。
- [ ] AC6 (R2): 同区域、独立区、独立↔区域、区域↔区域的项目移动均与预览一致。
- [ ] AC7 (R3): 离开所有有效目标后最后有效预览保持；容器外释放按该预览提交，未形成变化则不提交。
- [ ] AC8 (R3): 离开后重新进入新目标会更新预览；Escape/取消始终恢复且不提交。
- [ ] AC9 (R4): hover 不触发 mutation；同归属 changed drop 只 reorder 一次；跨归属 changed drop 只执行一次 update，成功后只 reorder 一次；no-op 为零调用。
- [ ] AC10 (R4): update 或 reorder 失败时显示 `common:saveFailed`，界面最终恢复服务端事实。
- [ ] AC11 (R5): 区域排序、导航、右键菜单、chevron、5px 激活距离和自动滚动不回归。
- [ ] AC12: 纯布局 helper 和组件拖拽会话测试覆盖 before/after、空独立区、空/折叠区域、同/跨归属、粘性外部释放、取消、no-op、失败及区域排序隔离。
- [ ] AC13: 前端 lint、typecheck、聚焦测试、完整测试套件和 `git diff --check` 通过。

## Out of Scope

- 修改后端以提供项目归属与排序的原子事务接口。
- 修改 AreaDetail 或项目详情页任务分组拖拽。
- 新建专用拖拽手柄、调整侧边栏项目行视觉设计或新增用户文案。
- 新增侧边栏键盘拖拽能力。
- 自动持久化区域展开/折叠偏好。

## Risks and Deferred Items

- 跨区域放置仍受既有两步 API 限制，不能做到服务端原子提交；实现必须在第一步成功后才执行 reorder，并在任一步失败时回到服务端事实。
- 项目、容器和区域标题是嵌套 droppable，必须使用项目专用碰撞优先级，避免区域标题抢走项目条目的 before/after 目标。
- jsdom 不能真实覆盖指针几何、边缘自动滚动和 drop animation，完成自动化验证后仍需浏览器手工检查。
