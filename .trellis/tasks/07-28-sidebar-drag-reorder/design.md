# Design: Sidebar project/area drag-and-drop reordering

## 概述

在 `SidebarProjectSection` 内引入 dnd-kit 拖拽，覆盖四种操作：
1. 独立项目（无区域）彼此排序
2. 区域内项目排序
3. 项目跨区域移动（改变 areaId，含拖出为 null）
4. 区域之间排序

后端现有 API 足够，不改后端。

## 关键代码现状

- `SidebarProjectSection`：渲染顶部独立项目 + 各区域行。
  - 独立项目：直接 `<ProjectItem>`
  - 区域行：`<SidebarAreaRow area projects />`，区域内部渲染 `<ProjectItem>` 列表（折叠按钮控制展开）
- `ProjectItem`：一个 `<button>`，点击 navigate 到 `/projects/:id`
- `SidebarAreaRow`：`<NavLink>` 导航 + chevron 折叠按钮
- 数据：`useProjectsQuery()` 返回全量项目（按 sortOrder 升序），`useAreasQuery()` 返回全量区域
- Hooks：`useReorderProjects(orderedIds)`、`useReorderAreas(orderedIds)`、`useUpdateProject({id, data})`

## 技术方案

### dnd-kit 结构（单一 DndContext，多 SortableContext）

用一个 **外层 `DndContext`** 包裹整个 `SidebarProjectSection`，内部三个 `SortableContext`：

```
<DndContext sensors collisionDetection=closestCenter onDragEnd onDragStart>
  <SortableContext items={standaloneIds} strategy=verticalListSortingStrategy>
    {standaloneProjects.map -> SortableProjectItem(draggable)}
  </SortableContext>

  <SortableContext items={areaIds} strategy=verticalListSortingStrategy>
    {areas.map -> SortableAreaRow}
  </SortableContext>
</DndContext>
```

在每个区域内部（展开时）再嵌套一个 `SortableContext`（项目列表），与外层 DndContext 共享：

```
<SortableContext items={areaProjectIds} strategy=verticalListSortingStrategy>
  {areaProjects.map -> SortableProjectItem}
</SortableContext>
```

> dnd-kit 支持多个 `SortableContext` 共享一个外层 `DndContext`。跨 context 的拖拽通过 `onDragEnd` 里的 `active` / `over` 自行处理。

### id 命名空间（避免冲突）

dnd-kit 的 sortable id 需全局唯一，且需要区分 active 是项目还是区域：

- 独立项目 sortable id：`proj:<projectId>`（或直接用 projectId，但需在 onDragEnd 中区分类型）
- 区域内项目 sortable id：`proj:<projectId>`
- 区域 sortable id：`area:<areaId>`

采用 **带前缀的 id**：项目统一 `proj:<id>`，区域 `area:<id>`。这样在一个外层 DndContext 里，项目拖到区域上时 over.id 形如 `area:<id>`，能清楚区分对象类型。

> 但同一项目出现在多个 SortableContext 中没问题，只要 id 一致（项目 id 全局唯一）。为了避免项目同时落入「独立项目」和「区域项目」两个 context 的 items 数组（dnd-kit 不允许同一 id 在同一时刻渲染于两个 SortableContext），我们确保每个项目只在一个 context 里渲染（它是独立或是某区域的，二选一）——这正是现状的自然结果。

### 可拖组件包装

- `SortableProjectItem`：包装 `ProjectItem`。**关键**：`ProjectItem` 当前是个 `<button>`，直接套 `useSortable` 的 listeners 会把整个 button 变成拖拽手柄，破坏点击导航。
  - 方案：给 `useSortable` 的 `listeners` 应用到外层包裹 div（不带点击行为），并在 `ProjectItem` 外层 wrapper 上设置 listeners。
  - 为保留点击导航不被拖拽误触，使用 `PointerSensor({ activationConstraint: { distance: 5 } })`。
- `SortableAreaRow`：包装 `SidebarAreaRow`。同样把 listeners 放在外层包装 div 上。

> 已有 `AreaDetail` 的 `SortableProjectItem` 把 listeners 直接 spread 到外层 div 上，导致点击导航被吃掉。`AreaDetail` 中项目列表行无导航跳转需求（在区域详情内），故没问题；侧边栏场景需保留导航，因此我们采用 **激活距离 + 透传点击** 策略：listeners 挂在外层 div，但 ProjectItem 内的按钮仍可接收 click（距离未达 5px 时 PointerSensor 不激活拖拽，click 事件正常触发）。

### onDragEnd 逻辑

```
function onDragEnd({ active, over }) {
  if (!over || active.id === over.id) return;

  const activeId = String(active.id);
  const overId = String(over.id);

  const isActiveArea = activeId.startsWith('area:');
  const isOverArea = overId.startsWith('area:');

  // 1) 区域间排序（active 是区域，over 是区域）
  if (isActiveArea && isOverArea) {
    const ids = areas.map(a => `area:${a.id}`);
    const reordered = arrayMove(ids, ids.indexOf(activeId), overId.indexOf(overId));
    reorderAreas.mutate(reordered.map(stripPrefix('area:')));
    return;
  }

  // 2) 项目相关操作（active 是项目）
  if (activeId.startsWith('proj:')) {
    const projectId = stripPrefix('proj:')(activeId);
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // 2a) 项目 -> 区域（标题或区域内）：改变 areaId，再 reorder
    if (isOverArea) {
      const targetAreaId = stripPrefix('area:')(overId);
      if (project.areaId === targetAreaId) {
        // 同区域，仅排序（视为区域内排序）
        handleProjectReorderWithinArea(projectId, targetAreaId, null /* over 是 area，末尾插入 */);
      } else {
        updateProject.mutate(
          { id: projectId, data: { areaId: targetAreaId } },
          { onSettled: () => reorderProjects.mutate(buildGlobalOrderedIds(...)) }
        );
      }
      return;
    }

    // 2b) 项目 -> 项目：同 context 内排序 或跨 context 移动
    if (overId.startsWith('proj:')) {
      const overProjectId = stripPrefix('proj:')(overId);
      const overProject = projects.find(p => p.id === overProjectId);
      if (!overProject) return;

      // 跨区域：更新 areaId 为 over 项目所在区域
      if (project.areaId !== overProject.areaId) {
        updateProject.mutate(
          { id: projectId, data: { areaId: overProject.areaId } },
          { onSettled: () => reorderProjects.mutate(...) }
        );
        return;
      }

      // 同区域（含独立）排序：arrayMove
      handleProjectReorder(...);
    }
  }
}
```

**排序持久化的 orderedIds 策略**：`useReorderProjects` 接收全局 orderedIds，后端按 index 写入 sortOrder（全局）。因此每次项目拖拽重排，都需计算 **全量项目** 的新顺序数组传给 `useReorderProjects`。简单的实现：

- 对当前 `projects`（服务端顺序）做一次 `arrayMove`（跨区域移动则先调整 areaId 礑设再移位置），得到全量新顺序 -> 调用 `reorderProjects.mutate(newOrderedIds)`。
- 区域变更单独通过 `updateProject` 持久化。

### 持久化顺序与乐观更新

- `useReorderProjects` / `useReorderAreas` 已内置 `onMutate` 乐观更新（按 orderedIds 重排 query cache）。
- `useUpdateProject` 目前在 onSuccess 内 invalidate `projects.all`，无乐观更新。为减少闪烁，可在拖拽 handler 里先本地乐观更新 areaId（像 `useReorderProjects` 那样做 onMutate）——但为了控制复杂度，**首版**采用：`updateProject` 成功后触发 `reorderProjects`（附带新顺序），由 react-query 自动重取。体感可接受。
- 失败：`updateProject` 失败时 `projects.all` 会被 invalidate 重取，回滚到服务端状态，toast 显示失败。

### 边界

- 折叠区域的 drop：dnd-kit 的 sortable over.id 可能指向折叠区域标题（`area:<id>`），2a 分支处理拖到区域标题即归属。
- 拖到区域下方的"非项目空位"：当目标区域无项目时，SortableContext items 为空，over 会落到区域标题上，2a 分支覆盖。
- 顶部独立项目列表拖入：独立项目本质是 `areaId === null`，over 是 `proj:<id>` 且 `over.areaId === null` 属于 2b 同区域排序。

## 兼容性

- 不动 `AreaDetail.tsx`（它独立有自己的 DndContext，不与侧边栏共用）。
- 不动后端。
- 仅改：`SidebarProjectSection.tsx`、`SidebarAreaRow.tsx`（可能内部加 SortableContext）、新增包装组件（`SortableProjectItem`、`SortableAreaRow`，可放在同文件或 `components/layout/` 下）、`ProjectItem` 可能需要支持拖拽视觉态（可选）。

## 风险

1. dnd-kit 多 SortableContext 跨 context 拖拽在折叠区域场景 over.id 的稳定性 → 用 closestCenter + onDragEnd 中判定"项目拖到区域标题"兜底。
2. `ProjectItem` 是 button，listeners 直接挂外层 div 可能影响 button 内部 PointerEvent → 用激活距离 + 把 listeners 挂在外层 div（而非 button 上）规避；必要时给 ProjectItem 加一个可选 drag handle 或 `isDragging` 样式。
3. 同一 id 不应同时存在于两个 SortableContext 的 items 里 → 项目 areaId 唯一决定它在一个 context 中，天然满足。

## 文件改动范围

- `packages/frontend/src/components/layout/SidebarProjectSection.tsx`（重写为 DndContext + 内含两个 SortableContext）
- `packages/frontend/src/components/layout/SidebarAreaRow.tsx`（内部项目列表加 SortableContext）
- 新增 `packages/frontend/src/components/layout/SortableProjectItem.tsx`（可拆分也可内联）
- 新增 `packages/frontend/src/components/layout/SortableAreaRow.tsx`（可拆分也可内联）
- `packages/frontend/src/components/project/ProjectItem.tsx`（如需加 `isDragging` prop / 视觉态）

不改：后端、shared dto、`AreaDetail.tsx`。
