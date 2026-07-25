# 标签 Tags 功能

## Goal

为 Taskora 增加用户级、带颜色、可分组的标签系统，任务可贴多标签，前端提供按标签筛选能力。

## Background

- 现有 Task 模型已有 bucket / status / dueDate / parentId / projectId / areaId
- 现有 Sidebar 已有 Projects / Areas 折叠区，Tags 入口需新增
- 父任务：`07-25-gtd-enhance`
- 依赖：`test-infra`（测试基建先行，本任务需书写测试验证）

## Requirements

### 数据模型

- 新增 `TagGroup` model：用户级，标题 + sortOrder
  - id, title, userId, sortOrder, createdAt, updatedAt
- 新增 `Tag` model：用户级，标题 + 颜色 + 可选分组
  - id, title, color (string, hex 如 `#3B82F6`), userId, tagGroupId? (nullable), sortOrder, createdAt, updatedAt
  - 一个 Tag 可无分组（`tagGroupId = null`，归入"未分组"）
- 新增 `TaskTag` 关联表：Task ↔ Tag 多对多
  - id, taskId, tagId, createdAt
  - @@unique([taskId, tagId]) 防重复

### API（Tags Module）

- `POST /tags` 创建标签（title, color, tagGroupId?）
- `GET /tags` 列出当前用户所有标签（含 tagGroupId，未分组为 null）
- `PATCH /tags/:id` 更新标签（title?, color?, tagGroupId?）
- `DELETE /tags/:id` 删除标签（级联删除 TaskTag 关联）
- `POST /tag-groups` 创建分组
- `GET /tag-groups` 列出分组（含其下标签）
- `PATCH /tag-groups/:id` 更新分组
- `DELETE /tag-groups/:id` 删除分组（标签的 tagGroupId 置 null，不删标签本身）

### Task 贴标签

- `PATCH /tasks/:id` 的 `UpdateTaskDto` 增加 `tagIds?: string[]` 字段
- 更新时全量覆盖该任务的标签关联（set 语义）
- `GET /tasks` 返回的 task 数据包含 `tags: TagResponseDto[]`
- `TaskResponseDto` 增加 `tags` 字段

### 前端

- **侧栏**：Sidebar 新增 Tags 折叠区（图标 Tag），显示标签列表，点击进入该标签的筛选视图
- **标签管理页** `/tags`：标签 CRUD（创建/重命名/改色/删除），分组管理
- **TaskDetail**：新增"标签"选择行（多选，从当前用户标签中选）
- **TaskItem**：显示标签徽章（小色块）
- **按标签筛选**：`/tags/:tagId` 路由，展示该标签下所有任务（复用 TaskListView）

### 技术约束

- 沿用 NestJS module/controller/service 三层结构
- 沿用 Prisma migration
- shared 包新增 `tag.dto.ts`，前后端共享类型
- 前端沿用 TanStack Query + apiClient 模式
- 视觉风格接近 Things3（标签徽章为小色块，不喧宾夺主）

## Acceptance Criteria

- [ ] Prisma migration 可执行，Tag / TagGroup / TaskTag 表创建成功
- [ ] `POST /tags` / `GET /tags` / `PATCH /tags/:id` / `DELETE /tags/:id` 正常工作
- [ ] `POST /tag-groups` / `GET /tag-groups` / `PATCH /tag-groups/:id` / `DELETE /tag-groups/:id` 正常工作
- [ ] 删除 TagGroup 后，其下 Tag 的 tagGroupId 变为 null（需测试验证）
- [ ] `PATCH /tasks/:id` 传 `tagIds` 可全量更新任务标签
- [ ] `GET /tasks` 返回的每个 task 含 `tags` 数组
- [ ] 侧栏显示 Tags 区，点击标签进入筛选视图
- [ ] `/tags` 页面可创建/编辑/删除标签与分组
- [ ] TaskDetail 可多选标签
- [ ] TaskItem 显示标签徽章
- [ ] `/tags/:tagId` 展示该标签下任务
- [ ] 至少为 TagsService 写单测（≥5 用例），为 Task 贴标签逻辑写单测（≥3 用例）

## Out of Scope

- 标签拖拽排序
- 标签颜色选择器 UI 组件（MVP 用预设颜色列表 + 自定义 hex 输入即可）
- 跨用户的共享标签
- 标签合并

## Dependencies

- `test-infra`（需 vitest 配置就绪以书写测试）