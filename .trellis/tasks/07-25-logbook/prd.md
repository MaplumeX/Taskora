# Logbook 日志视图

## Goal

为 Taskora 增加 Logbook 视图，展示已完成任务，支持按完成日期分组浏览与取消归档（取消完成）回到原视图。

## Background

- 现有 `POST /tasks/:id/complete` 已将 status 设为 COMPLETED、completedAt 设为 now
- 现有 `POST /tasks/:id/uncomplete` 已将 status 还原为 ACTIVE、completedAt 置 null
- Logbook 基于 complete / uncomplete 已有能力构建，无需新数据模型
- 父任务：`07-25-gtd-enhance`
- 依赖：`test-infra`（测试基建先行）

## Requirements

### 后端

- `TasksService.findAll` 的 `view` 参数增加 `logbook`：
  - where: `status = COMPLETED`
  - orderBy: `completedAt desc`
  - 返回的 task 含 `completedAt`（现有字段已返回）
- `TaskQueryDto.view` enum 增加 `'logbook'`
- 复用现有 `uncomplete` 端点作为取消归档操作，无需新增端点

### 前端

- 新增 `/logbook` 路由 + `Logbook.tsx` 页面
- 页面结构：
  - 标题 "Logbook"
  - 按完成日期分组（今天 / 昨天 / 本周 / 更早，或按日期 key 分组）
  - 每组下展示已完成任务（TaskItem 复用，但显示完成时间）
  - 点击任务打开 TaskDetail
  - TaskDetail 中"标记完成"按钮在已完成状态下显示为"取消完成"（现有逻辑已支持）
- Sidebar 新增 Logbook 入口（图标 Notebook / CheckCircle）

### 技术约束

- 不新增 Prisma model，完全复用现有 Task + completedAt
- 复用 TaskListView / TaskItem / TaskDetail 组件
- 前端复用 `useTasksQuery({ view: 'logbook' })`

## Acceptance Criteria

- [ ] `GET /tasks?view=logbook` 返回所有已完成任务，按 completedAt 倒序
- [ ] `TaskQueryDto.view` 接受 `'logbook'` 值
- [ ] `/logbook` 页面渲染已完成任务列表
- [ ] 任务按完成日期分组展示（至少今天/昨天/更早三级）
- [ ] 侧栏有 Logbook 入口，点击进入 `/logbook`
- [ ] 在 Logbook 中点击任务打开 TaskDetail
- [ ] TaskDetail 中"取消完成"按钮可调用 uncomplete，任务从 Logbook 消失
- [ ] 至少为 `findAll({ view: 'logbook' })` 写单测（≥2 用例：返回已完成任务、不含活跃任务）

## Out of Scope

- Logbook 内的搜索/筛选（留后续）
- 批量取消归档
- Logbook 内按标签/项目/区域筛选
- 已彻底删除任务的恢复视图（Trash 已覆盖）

## Dependencies

- `test-infra`（需测试基建就绪）