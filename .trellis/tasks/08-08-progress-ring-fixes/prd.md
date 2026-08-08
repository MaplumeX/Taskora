# PRD: Progress Ring Fixes

## 背景

上个任务（project-progress-ring）实现了环形进度复选框，但存在 3 个问题需要修补。

## 问题与修复

### 1. 任务状态改变后环形不实时更新

**根因**：`useTasks.ts` 中的 `useCompleteTask` / `useUncompleteTask` 等 mutation 的 `onSettled` 只 invalidate 了 `['tasks']`、`['feed']`、`taskKeys.detail`，没有 invalidate `['projects']`。项目列表缓存中的 `taskTotalCount` / `taskCompletedCount` 不刷新，导致环形停留在旧值。

**修复**：在 `useTasks.ts` 所有会改变 task `status` 的 mutation 的 `onSettled` 中追加 `invalidateQueries({ queryKey: ['projects'] })`。涉及的 mutation（逐个确认）：
- `useCompleteTask`
- `useUncompleteTask`
- `useCreateTask`（新建任务改变 total）
- `useDeleteTask`（删除任务改变 total）
- `useUpdateTask`（可能改变 projectId 归属）

**口径**：只要 mutation 可能改变某个项目的 taskTotalCount 或 taskCompletedCount，就需 invalidate `['projects']`。保守做法：所有 task mutation 都追加。

### 2. 项目详情页仍用 TaskCheckbox

**现状**：`ProjectDetail.tsx:56` 用 `<TaskCheckbox>` 作为完成切换控件。

**修复**：替换为 `<ProjectProgressRing>`，props 传 `project.taskTotalCount` / `project.taskCompletedCount` / `project.status`，`onToggle` 复用现有的 complete/uncomplete 逻辑。

### 3. 全部任务完成时只显示满环，不显示勾

**现状**：`ProjectProgressRing` 的 `isDone = projectStatus === COMPLETED || (total > 0 && completed === total)`。当所有任务完成（但项目未标记完成）时，也显示实心+勾，与"项目已完成"视觉混淆。

**修复**：拆分两个概念：
- **满环（fullRing）**：`total > 0 && completed === total` → 进度弧画满一圈（`strokeDashoffset = 0`），但无实心填充、无勾
- **已完成（isChecked）**：`projectStatus === ProjectStatus.COMPLETED` → 实心 primary 圆 + 白色勾

视觉状态矩阵：
| 项目 status | 任务完成情况 | 显示 |
|---|---|---|
| ACTIVE | 0 完成 | 空环（muted 描边） |
| ACTIVE | 部分完成 | 进度弧填充 |
| ACTIVE | 全部完成 | 满环（进度弧满圈，无勾） |
| COMPLETED | 任意 | 实心圆 + 勾 |

## 验收标准

1. 在项目详情页勾选/取消一个任务后，侧边栏和 feed 中该项目的环形进度即时更新
2. 项目详情页标题左侧使用 `ProjectProgressRing` 替代 `TaskCheckbox`
3. 所有任务完成但项目未标记完成时，显示满环（进度弧满圈）但无勾
4. 项目标记完成时，显示实心圆 + 勾（与之前一致）
5. 现有测试通过，无回归

## 非目标

- 不改后端统计逻辑（已正确）
- 不改 DTO 结构
- 不改环形尺寸/颜色