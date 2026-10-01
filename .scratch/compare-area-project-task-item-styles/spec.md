# 区域界面 vs 项目界面：任务条目样式对比

Status: implemented — 区域页归属小字已移除（`packages/ui`）

对比 `AreaDetail`（区域页）与 `ProjectDetail`（项目页）两处任务行的渲染差异，并据此修正区域页重复展示归属的问题。相关规则见 `.scratch/things3-ownership-display/research.md` 与 `.scratch/things3-visual-language/spec.md`。

## Problem Statement

两处任务行都由同一个 `TaskItem`（`packages/ui/src/components/task/TaskItem.tsx`）渲染，但传入的上下文和列表容器不同，导致同一张任务行在两类页面上表现不一致：

- 区域页的 `TaskListView` 无条件把 `projectMap/areaMap` 注入 `TaskList`，而区域页查询（`{ areaId: id }`）返回的任务 `areaId` 恒等于当前区域、`projectId` 通常为 null，于是每行标题下都多出一行灰色小字重复页头已经表达的区域名。
- 项目页的 `ProjectTaskLayout` 反过来完全不传 `projectTitle/areaTitle`，行上没有任何归属小字——但这不是有意设计，只是没传参。

按 `.scratch/things3-ownership-display/research.md` 归纳的 Things 规则：**归属要么在分组标题 / 页头，要么在行内小字，二者互斥、绝不重复**。区域页的做法与规则相悖。

## 对比

### 相同

任务行本体完全一致（同一个 `TaskItem`）：复选框、标题、备注 / 子任务徽标、标签胶囊、提醒 / 截止徽标、日期 chip / 今天黄星、展开成卡片（`TaskRowExpanded`）、完成节奏动画。

### 差异

| 维度 | 区域页 | 项目页 |
|---|---|---|
| 容器 | `TaskListView` → `TaskList`（扁平单列表） | `ProjectTaskLayout`（未分组区 + 各 Heading 小节） |
| 归属副标题 | 由页头表达，**行上不再显示**（`hideOwnership`） | 行上不显示（未传归属标题） |
| 分组 | 无 Heading；项目在任务列表上方单独渲染 | 支持 Project Heading 分组 |
| 拖拽 | 仅同列表重排 | 跨 Heading 移动 + 排序、插入占位线、`DragOverlay` 浮起克隆、键盘拖拽、pointer 上下半区判定 |
| 拖拽语义 | 只改全局 Position（`useReorderTasks`） | 跨组 = 改 `headingId`（`useReorderProjectHeadingLayout`） |
| 键盘 Selection | 项目行 rank 0、任务列表 `selectionRank={1}` | heading 行 + 任务共用一个 scope（默认 rank） |
| 空状态 | `hideEmptyState` | 显示 `project:noTasks` |
| 周边内容 | 页头 `Layers` + 可编辑标题 + `AreaMoreMenu` | 页头进度环 + `ProjectMetaRow` + 备注编辑器 + `ProjectCompletedTasks` |

## Solution

给任务列表加一个显式开关，让「页头已表达归属」的页面抑制行内归属小字；跨容器语境（TagDetail / CalendarDaySheet / Logbook 等）保持原样。

- `TaskList`：新增 `hideOwnership?: boolean`（默认 `false`）。为 true 时不再解析 `projectTitle/areaTitle`。
- `TaskListView`：新增同名 prop 并透传给 `TaskList`。
- `AreaDetail`：任务列表传 `hideOwnership`。

## 验收标准

- [x] 区域页任务行不再显示重复的区域名
- [x] 项目页行为不变（本就不显示归属小字）
- [x] TagDetail / CalendarDaySheet 等跨容器页面的归属小字不受影响
- [x] 单元测试覆盖默认透传与 `hideOwnership` 抑制

## Comments

- 2026-10-01：完成。`TaskList` 新增 `hideOwnership`，`TaskListView` 透传，`AreaDetail` 传入；测试 `TaskList.test.tsx`（新增 ownership 组）与 `AreaDetail.test.tsx`（断言 `hideOwnership: true`）。`@taskora/ui` 全量 406 测试通过，typecheck / eslint 干净。
