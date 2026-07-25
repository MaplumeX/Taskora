# 支持拖拽排序（任务/项目/区域）

## Goal

为 Taskora 的任务、项目、区域三类列表加入拖拽排序能力，并将顺序持久化到后端。用户可通过鼠标拖拽行来调整顺序，松手后自动保存到数据库，刷新后顺序保持。

## Scope

### 范围内
- **任务列表**：Inbox、Today、Anytime、Someday、Project 详情、Area 详情、Tag 详情（凡使用 `TaskListView` 的页面，仅顶层任务可拖拽）
- **项目列表**：`Projects` 列表页
- **区域列表**：`Areas` 列表页
- **Area 详情内的项目子列表**：也支持拖拽
- 拖拽后顺序持久化到后端（Prisma + reorder API + react-query 乐观更新）

### 范围外
- **Upcoming 页**：按 `scheduledDate` 日期分组渲染，日期是排序主键，拖拽语义不明确 → **不支持拖拽**
- **Trash / Logbook**：固定排序，不支持拖拽
- **SearchModal** 搜索结果：按相关性，不支持拖拽
- **子任务**（`parentId != null`）：仅在父任务展开区显示，不支持拖拽排序
- **标签 / 标签组**：本次不做（已有 sortOrder 字段但本次不补 reorder UI）

## Requirements

### R1 后端数据模型
- R1.1 `Project` 模型新增 `sortOrder Int @default(0)` 字段
- R1.2 `Area` 模型新增 `sortOrder Int @default(0)` 字段
- R1.3 `Task` 模型已有 `sortOrder`，本次不改 schema
- R1.4 生成 Prisma 迁移并更新 seed（为现有记录设置连续 sortOrder）

### R2 后端 Service
- R2.1 `ProjectsService.findAll` / `AreasService.findAll` 改为 `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]`
- R2.2 `ProjectsService.create` / `AreasService.create`：新建时 `sortOrder` 设为当前用户该类型记录的 `max(sortOrder) + 1`（或 0，无记录时）
- R2.3 三个 service（Tasks/Projects/Areas）各新增 `reorder(userId, orderedIds: string[])` 方法：
  - 校验所有 `orderedIds` 均属于该 userId（用 `findFirst({ where: { id, userId } })` 符合 database-guidelines 的越权隔离规范）
  - 事务内按 `orderedIds` 顺序把每个记录的 `sortOrder` 更新为对应索引值（0,1,2,...）
  - 返回 void（或更新后的列表，前端用乐观更新不依赖返回值）

### R3 后端 API
- R3.1 新增 `POST /tasks/reorder`，body `{ orderedIds: string[] }`
- R3.2 新增 `POST /projects/reorder`，body `{ orderedIds: string[] }`
- R3.3 新增 `POST /areas/reorder`，body `{ orderedIds: string[] }`
- R3.4 新增 `ReorderDto`（class-validator 校验 `orderedIds: string[]` 非空字符串数组）

### R4 共享 DTO（`@taskora/shared`）
- R4.1 `ProjectResponseDto` 新增 `sortOrder: number`
- R4.2 `AreaResponseDto` 新增 `sortOrder: number`
- R4.3 `TaskResponseDto` 已有 `sortOrder`，不改
- R4.4 新增 `ReorderDto` 接口 `{ orderedIds: string[] }`

### R5 前端 DnD 基础
- R5.1 引入 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` 依赖（不用 react-beautiful-dnd，它已停止维护且与 React 18 严格模式有冲突）
- R5.2 新增 `reorderTasks`、`reorderProjects`、`reorderAreas` API 函数（`tasks.api.ts` / `projects.api.ts` / `areas.api.ts`）
- R5.3 新增 `useReorderTasks` / `useReorderProjects` / `useReorderAreas` mutation hooks：
  - **乐观更新**：`onMutate` 时取消进行中的 list query，`setQueryData` 按新顺序写回缓存（copy 出深拷贝数组避免 mutate cache）
  - `onError`：回滚（用 `setQueryData` 写回 `onMutate` 保存的旧快照）
  - `onSettled`：invalidate 对应 list query 拉取最新
  - query key 必须用各自 keys 工厂对象（`taskKeys.all` / `projectKeys.all` / `areaKeys.all`），遵循 hook-guidelines

### R6 前端列表改造
- R6.1 `TaskList` 组件改造为可拖拽：外层 `DndContext` + `SortableContext`（垂直拖拽，`rectSortingStrategy`），`TaskItem` 包一层 `useSortable`
  - 拖拽 handle：整行可拖动（不引入额外 drag handle 图标，符合 Things3 交互）
  - 拖拽时禁止 `onRowClick` 误触发（用拖拽传感器区分点击与拖拽）
  - `onDragEnd` 调用 `useReorderTasks`，传入 `arrayMove` 后的 ids
- R6.2 `Projects` 页面改造：`DndContext` + `SortableContext`，`ProjectItem` 包 `useSortable`，`onDragEnd` 调 `useReorderProjects`
- R6.3 `Areas` 页面改造：同上
- R6.4 `AreaDetail` 内的「项目」子列表：同 Projects 页，支持拖拽
- R6.5 拖拽视觉反馈：拖拽中的行提升 z-index、轻微 elevation、半透明遮罩其他行（用 dnd-kit 的 `DndContext` + `DragOverlay`）
- R6.6 空列表、加载、错误状态保持原有占位文案不变

### R7 排序语义约束
- R7.1 `POST /xxx/reorder` 的 `orderedIds` 必须是当前展示列表的**全部顶层 ids**（按新顺序）。后端只更新这批，其他记录的 sortOrder 不变。
- R7.2 局限说明：Task 的 `sortOrder` 是全局的，不同视图（如 inbox 与 today）返回的任务子集不同；拖拽重排会在全局层面改变这批任务的相对顺序。这是可接受的有意行为（与 Things3 一致）；在 design.md 中明确记录该局限。
- R7.3 `Upcoming` 视图因按 `scheduledDate` 日期分组渲染，不接入 `TaskListView` 的拖拽路径（它的任务列表是 `Upcoming.tsx` 自己渲染的，不走 `SortableContext`），保持日期分组的稳定排序。

## Acceptance Criteria

- [ ] AC1 数据库：`Project` / `Area` 模型有 `sortOrder` 字段；迁移已创建并在 dev 环境可执行；seed 设置连续 sortOrder
- [ ] AC2 后端 API：`POST /tasks/reorder`、`POST /projects/reorder`、`POST /areas/reorder` 三个接口可用，body 为 `{ orderedIds: string[] }`；调用后对应记录的 sortOrder 按传入顺序更新；越权 id 返回 404
- [ ] AC3 后端查询：`GET /projects` 返回 `sortOrder` 字段并按 `sortOrder asc, createdAt desc` 排序；`GET /areas` 同上；`GET /tasks`（已有 sortOrder）行为不变
- [ ] AC4 shared DTO：`ProjectResponseDto` / `AreaResponseDto` 含 `sortOrder: number`；新增 `ReorderDto`
- [ ] AC5 前端任务拖拽：在 Inbox / Today / Anytime / Someday / ProjectDetail / AreaDetail / TagDetail 任一页拖动顶层任务，可改变顺序；松手后顺序立即在 UI 生效（乐观更新），且后端持久化，刷新后保持
- [ ] AC6 前端项目拖拽：Projects 列表与 AreaDetail 内项目子列表均支持拖拽重排并持久化
- [ ] AC7 前端区域拖拽：Areas 列表支持拖拽重排并持久化
- [ ] AC8 拖拽与点击互不干扰：拖动行时不会误触发 `onRowClick`（行展开 / 选中状态机不变）
- [ ] AC9 Upcoming / Trash / Logbook / SearchModal 列表不出现拖拽行为
- [ ] AC10 错误回滚：reorder API 失败时，列表顺序回到拖拽前的状态
- [ ] AC11 新建 Project / Area：自动获得最大 sortOrder+1，出现在列表末尾
- [ ] AC12 测试通过：后端 reorder 逻辑单测 + 既有测试不破坏；前端 typecheck + lint 通过

## Constraints & Non-Goals

- 不做跨视图拖拽（如把任务从 inbox 拖到 today）——那是进阶功能，本次不做
- 不做拖到分组内（如 Upcoming 把任务拖到另一天）——不在范围
- 不引入自动重排间隔（spaced sortOrder，如在两个任务中间插入时用大跨度值避免频繁 reorder）——本次用最简方案，全部 ids 顺序写回
- 不支持触屏拖拽保留策略调整（dnd-kit 默认支持 PointerSensor，移动设备体验非重点）

## Verification Contract

完成时需提供：
- `prisma migrate dev` 输出截图 / 日志（迁移成功）
- 后端三个 reorder 接口的 curl 或 e2e 验证
- 前端拖拽操作的录屏或截图（至少任务、项目、区域各一组）
- `pnpm typecheck` + `pnpm lint` + `pnpm test` 的输出