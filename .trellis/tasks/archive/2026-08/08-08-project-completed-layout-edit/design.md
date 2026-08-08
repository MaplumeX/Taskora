# Design: 项目已完成区保留归档前分布与在位编辑

## 架构与边界

改动集中在前端 `packages/frontend`，分两个组件层：

1. **`ProjectCompletedTasks`**（已完成折叠区）——重构分布逻辑 + 接入完整编辑能力。
2. **`ProjectHeadingRow`**（分组行）——新增归档态 variant，支持"取消归档"替换"归档"菜单项、隐藏拖拽手柄。

后端无改动（已确认 `findAll` 非 logbook 视图按 `sortOrder` 返回，归档分组 sortOrder 保留）。

## 数据流与契约

### 输入数据（已有，不变）

- `useTasksQuery({ projectId, completed: true })` → 返回该项目下所有非 trashed 任务（ACTIVE + COMPLETED），按 `sortOrder asc, createdAt desc` 排序。组件内过滤出 `status === COMPLETED && trashedAt === null`。
- `useProjectHeadingsQuery(projectId, { includeArchived: true })` → 返回 ACTIVE + COMPLETED 全部分组，按 `sortOrder asc, createdAt asc`。

### 分布计算（新）

在 `ProjectCompletedTasks` 内复用 `ProjectTaskLayout` 已导出的 `normalizeLayout` 思路，但限定在已完成域：

```
archivedHeadings = allHeadings.filter(status === COMPLETED)   // 按 sortOrder
completedTasks   = mixedTasks.filter(status === COMPLETED && !trashedAt)
                                                   // 保留后端 sortOrder 顺序，不再按 completedAt 重排

布局:
  ungrouped = completedTasks.filter(headingId 为空 或 headingId 不在 archivedHeadings 集合)
  每个 archivedHeading H:
    H.tasks = completedTasks.filter(headingId === H.id)

渲染顺序: ungrouped 在上 → 各 archivedHeading 块按 sortOrder 依次
```

> 边界：一个已完成任务的 `headingId` 指向 ACTIVE 分组（未归档分组里有已完成任务），归为 ungrouped 展示在已完成区顶部。这符合"无分组的在上面"的语义——它不属于任何归档分组。

### 渲染

```
折叠区展开后:
  <div onClick={handleBlankClick}>   // 点空白收起展开态
    ungrouped tasks: <TaskItem onRowClick selectionState .../>
    archivedHeadings.map(H =>
      <section>
        <ProjectHeadingRow heading={H} />   // 归档态 variant
        H.tasks.map(task => <TaskItem onRowClick .../>)
      </section>
    )
  </div>
```

- **不包 `DndContext`**：拖拽自然不生效，满足 R4。
- **任务展开编辑**：在 `ProjectCompletedTasks` 内调用 `useTaskRowSelection()`，把 `handleRowClick`、`selectedId`、`expandedId` 传给 `TaskItem`。`expandedId` 来自全局 store，与活动区共用——但同一时刻只有一个任务展开，活动区与已完成区不会互相干扰（用户交互上只会展开当前可见区域内的行）。
- **归档分组编辑**：`ProjectHeadingRow` 读 `heading.status`，COMPLETED 时菜单项为"转项目 / 取消归档 / 删除"，隐藏拖拽手柄。该组件已内置 `useUpdateProjectHeading` / `useConvertProjectHeadingToProject` / `useDeleteProjectHeading` / `useArchiveProjectHeading`，只需加 `useUnarchiveProjectHeading` 并按 status 切换。

## 组件改动详图

### ProjectHeadingRow

当前硬编码菜单：转项目 / 归档 / 删除，并有拖拽手柄按钮。

改为按 `heading.status` 分两个 variant：

- **ACTIVE**（现有行为）：手柄显示；菜单 = 转项目 / 归档 / 删除。
- **COMPLETED**（新）：手柄隐藏；菜单 = 转项目 / 取消归档 / 删除。

实现方式：组件内 `const archived = heading.status === HeadingStatus.COMPLETED`，条件渲染手柄、条件选择 archive/unarchive 菜单项与对应 hook。`dragHandleProps` 在归档态不渲染按钮即可（调用方 `ProjectCompletedTasks` 也不会传）。

### ProjectCompletedTasks

- 移除 `completedTasks` 的 `completedAt desc` 排序 `useMemo`，改为直接用后端返回顺序（已按 sortOrder）。
- 移除内联简化归档分组标题块，改用 `ProjectHeadingRow`。
- 给 `TaskItem` 传入 `onRowClick={handleRowClick(task.id)}`、`selectionState`（由 `selectedId`/`expandedId` 派生）。
- 包一层 `onClick={handleBlankClick}` 的容器，支持点空白收起。
- `handleToggle`（取消完成）逻辑保留。
- 折叠区 header（"已完成 N" 按钮）保留不变。

## 兼容性

- `ProjectHeadingRow` 现有调用方仅 `ProjectTaskLayout`（传 ACTIVE heading + dragHandleProps），variant 改动对 ACTIVE 路径无行为变化。
- `ProjectCompletedTasks` 现有测试需更新（菜单文案、交互方式变化）。
- `normalizeLayout` / `applyLayoutDrag` / `serializeLayout` 导出不变，不 影响 `ProjectTaskLayout`。

## 权衡

- **复用 `ProjectHeadingRow` vs 新建归档分组行组件**：选复用，避免重复实现编辑/确认弹窗逻辑，代价是该组件需感知 status。variant 分支较小，可接受。
- **复用 `useTaskRowSelection` vs 已完成区独立 selection**：选复用，因为 `expandedId` 是全局单例且语义就是"当前展开的任务行"，已完成区与活动区共享同一展开槽符合直觉（用户不会同时编辑两处）。`selectedId` 是 local state，每次 hook 调用各自独立，无干扰。
- **不引入 DndContext**：比"引入但禁用 sensor"更简单，且避免误触。

## 回滚

改动集中在前端两个组件，回滚 = revert 相关 commit。无数据迁移、无后端契约变化。