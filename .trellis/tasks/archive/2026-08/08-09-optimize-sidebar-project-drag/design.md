# Design: 侧边栏项目条目所见即所得拖拽

## 1. 范围与边界

本次为前端侧边栏局部改造。`SidebarProjectSection` 继续拥有一个 `DndContext`，但项目拖拽和区域拖拽采用不同状态机：

- 项目拖拽：本地 normalized layout、显式占位、浮层、drop 后持久化。
- 区域拖拽：保留现有 area-only sortable 排序与 `useReorderAreas`。

不改后端、shared DTO、AreaDetail、项目详情任务布局或 i18n。

主要文件：

- `packages/frontend/src/components/layout/SidebarProjectSection.tsx`
- `packages/frontend/src/components/layout/SidebarAreaRow.tsx`
- `packages/frontend/src/components/layout/SortableAreaRow.tsx`
- `packages/frontend/src/components/layout/SortableProjectItem.tsx`
- 新增纯布局 helper 与测试文件

## 2. 项目布局模型

新增可独立测试的 sidebar project layout：

```ts
type ProjectContainerId = 'standalone' | string;

interface SidebarProjectLayout {
  containers: Record<ProjectContainerId, string[]>;
}

interface ProjectPlacement {
  containerId: ProjectContainerId;
  index: number;
}
```

- `normalizeSidebarProjectLayout(projects, areas)` 按服务端项目顺序生成 `standalone` 和每个 area 容器，保留空区域。
- `moveProjectToPlacement(layout, activeId, placement)` 先移除 active，再做同容器向下移动索引修正；不修改输入；无变化返回 `null`。
- `serializeProjectOrder(layout, areas)` 按侧边栏视觉顺序输出全局 IDs：独立项目，然后按 area 顺序拼接各容器。
- `findProjectContainer`、`layoutsEqual` 等保持纯函数，供组件事件与 Vitest 共用。

区域顺序不进入项目 layout；area drag 仍使用 `areas` props。

## 3. DnD ID 与目标合同

沿用已有命名空间，并增加容器 ID：

```text
proj:<projectId>
area:<areaId>
project-container:standalone
project-container:<areaId>
```

项目 pointer collision：

1. 只保留 `proj:`、`project-container:`、`area:` 候选。
2. `pointerWithin` 命中后优先 `proj:`，其次容器，最后区域标题。
3. `proj:` 以矩形中线区分 before/after。
4. `area:<id>` 固定映射到该区域 index 0。
5. `project-container:*` 映射到容器末尾。
6. 未命中返回空，保留当前预览用于粘性外部释放。

区域 active 时，collision 只保留 `area:` 并使用 `closestCenter`，避免项目/容器抢走区域排序目标。

## 4. 拖拽会话状态

组件区分服务端布局和正在渲染的预览：

```text
serverLayout                 当前 props 归一化结果
layout                       当前渲染布局
layoutRef                    事件读取的最新 layout
dragStartLayoutRef           项目拖拽开始快照
pendingServerLayoutRef       拖动期间到达的最新 props
activeProject                overlay 与 placeholder 使用的 DTO
activeProjectIdRef           项目拖拽会话标识
lastProjectTargetRef         最后有效 overKey + edge
```

规则：

- 无项目拖拽时，props 同步到 `layout`。
- 项目拖拽时，props 更新只写 `pendingServerLayoutRef`，不覆盖预览。
- start 克隆当前布局、清理最后目标并显示 overlay。
- cancel 恢复 pending server layout，否则恢复 start snapshot。
- cleanup 清空 active、快照和 target ref。

## 5. 渲染与折叠区域

### 项目容器

抽出可 droppable 的项目容器渲染：

- 独立项目区在项目拖拽期间即使为空也渲染一个可测量的最小高度槽。
- 展开区域始终渲染容器；空区域在项目拖拽期间保留项目行高的可用槽。
- 使用 `MeasuringStrategy.Always`，确保拖拽开始后出现的空槽可被测量。

### 项目条目

`SortableProjectItem` 增加最小拖拽态 props：

- active project 在 `layout` 中移动到目标位置后渲染为项目行高占位和 primary 插入线。
- 项目拖拽期间不应用 sortable transform，避免显式 layout 预览与 dnd-kit transform 双重位移；区域拖拽期间保持现有行为。
- 正常条目继续渲染 `ProjectItem`，listeners、导航和右键菜单结构不变。

### 浮层

保持挂载 `DragOverlay`，active 时渲染普通 `ProjectItem` 的紧凑副本；wrapper 为 `pointer-events-none`、`aria-hidden` 和 inert，不允许浮层控件响应。

### 折叠区域

`SidebarAreaRow` 保留本地 open 状态。折叠时通常不渲染项目列表；若 active project 的当前预览容器是该区域，则仅在标题下渲染 active 占位，不展开其它项目。由于区域标题语义为插入首位，该占位与最终结果一致。

## 6. 事件流

```text
project drag start
  -> snapshot layout -> set active project -> show overlay

project drag over valid target
  -> resolve placement -> immutable local move -> render placeholder
  -> no network request

project drag end on valid target
  -> apply final placement once -> compare snapshot
  -> no-op: restore/cleanup, no request
  -> changed: cleanup, persist rendered final layout

project drag end outside
  -> changed preview: persist current rendered layout
  -> unchanged/no preview: restore, no request

project drag cancel
  -> restore pending server layout or start snapshot -> no request

area drag end
  -> existing area arrayMove -> one reorderAreas mutation
```

## 7. 持久化与失败

由 start snapshot 和 final layout 推导：

- source container === target container：只调用一次 `reorderProjects(finalGlobalIds)`。
- source container !== target container：调用一次 `updateProject({ areaId })`；仅在成功回调中调用一次 `reorderProjects(finalGlobalIds)`。
- update 失败时不启动 reorder。
- update 或 reorder 的调用级 `onError` 显示 `common:saveFailed`，并恢复当前服务端派生布局；hooks 自身继续负责 cache rollback/invalidation。

在发起 mutation 前冻结 `serverLayoutRef.current`，避免 optimistic props 把失败回滚基线污染为已提交布局。跨区域第二步失败时，服务端可能已接受 areaId；最终以 hooks 失效重取后的服务端事实为准，这是既有两接口约束下的兼容行为。

## 8. 测试策略

纯 helper 测试：

- before/after；同容器上下移动和 no-op；
- 独立↔区域、区域↔区域；
- 区域标题 index 0；空容器末尾；
- 全局 orderedIds 序列化与输入不可变。

组件事件 harness 测试：

- overlay + placeholder；hover 无 mutation；
- 同归属一次 reorder；跨归属 update 成功后一次 reorder；update 失败不 reorder；
- 空独立区、空/折叠区域首位；
- sticky outside drop、离开再进入、cancel、no-op；
- props 拖动期间延迟同步和失败恢复；
- area collision 隔离与区域排序回归；
- 无区域背景 tint。

## 9. 回滚

全部改动是前端组件、纯 helper、测试和规格。回滚对应提交即可；无数据迁移。若显式预览出现回归，可整体恢复旧的 drop-on-end 路径，不影响后端契约。
