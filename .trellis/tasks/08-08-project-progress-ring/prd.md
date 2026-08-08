# PRD: Project Progress Ring Checkbox

## 背景

项目条目目前以文件夹图标（`Folder` lucide icon）作为视觉前缀，无法反映项目内任务的完成情况。用户希望用一个"能力更强的复选框"替代文件夹图标，既能展示项目整体进度，又能点击完成/恢复整个项目。

## 目标

用一个**环形进度复选框**替换项目条目前的文件夹图标，该复选框：
1. 以环形填充可视化展示项目内任务的完成比例（completed / total）
2. 点击后完成整个项目（已完成则恢复为进行中）
3. 已完成项目显示满环 + 勾，进行中项目显示部分填充

## 需求

### 统计口径
- 计入：项目下直属任务 + 各 heading 内的任务（即所有 `projectId = X` 且 `trashedAt = null` 的 task）
- **不计入**：子任务（Subtask 是独立模型，不参与统计）
- 完成数 = 上述范围中 `status = COMPLETED` 的 task 数量
- 总数 = 上述范围中所有 task 数量

### 后端
- `ProjectResponseDto` 新增 `taskTotalCount: number` 与 `taskCompletedCount: number`
- `ProjectFeedItem` 新增同样两个字段
- `ProjectsService.findAll` / `findOne` 返回值携带统计
- `FeedService.findAll` 中 project 项携带统计
- 统计需避免 N+1：用批量 `groupBy` 查询

### 前端
- 新建 `ProjectProgressRing` 组件（SVG 环形进度 + 可点击）
- 替换 `ProjectItem.tsx` 中的 `Folder` 图标为 `ProjectProgressRing`
- 替换 `ProjectFeedRow.tsx` 中的 `Folder` 图标为 `ProjectProgressRing`
- 点击环形 = 完成/恢复项目（复用 `useCompleteProject` / `useUncompleteProject`）
- 点击条目其他区域 = 仍导航到项目详情（行为不变）
- 已完成项目的视觉态：满环 + 勾，文字置灰 + 删除线（`ProjectFeedRow` 已有，`ProjectItem` 需补充）

### 视觉形态
- 环形：外径 18px（与 `TaskCheckbox` 的 18px 保持一致），环宽 2px
- 未完成且无任务：空环（细描边，muted 色）
- 进行中：环按完成比例填充 primary 色，中心无勾
- 全部完成或项目已标记完成：满环 + 中心勾（primary 实心 + primary-foreground 勾）
- 鼠标 hover：环边框加深（与 TaskCheckbox hover 行为一致）
- active 缩放动画 `active:scale-90`（与 TaskCheckbox 一致）

## 验收标准

1. 后端 `GET /projects`、`GET /projects/:id`、`GET /feed?view=...` 返回的 project 对象包含 `taskTotalCount` 和 `taskCompletedCount`，数值符合统计口径
2. 前端项目列表（侧边栏、Area 详情、Feed 视图）中项目条目前缀为环形进度复选框，不再显示文件夹图标
3. 环形按完成比例填充；无任务时为空环
4. 点击环形：项目在 COMPLETED / ACTIVE 间切换，UI 即时更新
5. 点击条目其他区域：仍导航到项目详情页
6. 已完成项目：满环 + 勾 + 文字置灰删除线
7. 子任务不计入统计
8. 废纸篓中的项目不参与统计（trashed task 已被 view where 排除）

## 非目标

- 不修改 `ProjectDetail` 页面顶部的 `TaskCheckbox`（它已是完成切换控件，本任务只改列表条目前缀）
- 不为 `ProjectResponseDto` 添加其他聚合字段
- 不引入新的 API 端点（统计内联在现有返回值中）
- 不做环形内的数字文字显示（保持简洁，仅用填充比例表达）