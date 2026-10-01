# Feature: Quick Find

Status: implemented — awaiting desktop / Android acceptance

对照 Things 3 的 Quick Find，把现有的任务搜索弹窗（`SearchModal`）升级为「搜索 + 导航」的统一入口：一个输入框既能搜任务，也能跳到任意列表、Project、Area、Tag。

## Problem Statement

现有搜索只能做一件事：按标题 / 备注子串找未了结（可勾选含已了结）的 Task，结果在弹窗里原地展开。与 Things 3 相比缺了：

1. **不能导航**：搜不到 Project、Area、Tag 和内置列表，想去某个项目只能在侧边栏里找。
2. **不能定位**：点结果不会跳到任务所在的位置，看不到它的上下文（在哪个项目、前后是什么）。
3. **不能全程键盘操作**：没有 `↑`/`↓` 选结果、`Enter` 打开。
4. **搜不到 Subtask**：只记得某个子步骤的名字时找不到它的父 Task。
5. **已了结 / Trash 的范围**靠预先勾选复选框，且 Trash 完全搜不到。
6. **排序无相关度**：按 Position 排，标题开头就命中的任务可能排在备注里顺带命中的任务后面。
7. **唤起不够顺手**：桌面端不能直接打字唤起，移动端不能下拉唤起。

## Solution

- **统一结果面板**：输入后按组显示——列表 → 区域与项目 → 标签 → 任务。选中导航目标即跳转；选中任务即 Reveal（关闭面板、跳到其所在视图、展开并滚入视野）。
- **Subtask 命中**：Subtask 标题命中时展示其父 Task，并在父 Task 行下方列出命中的 Subtask 标题（对齐 Things 3 checklist 命中的展示）。
- **键盘**：`↑`/`↓` 在全部结果间移动高亮（跨组），`Enter` 打开，`Esc` 关闭。
- **继续搜索**：默认只搜未了结、未进 Trash 的条目；结果末尾的「继续搜索」把范围扩大到已了结（Logbook）和 Trash。取代现有「包含已完成」复选框。
- **相关度排序**：组内按「标题前缀命中 > 标题包含 > 仅 Subtask / 备注命中」排序，同档按视觉顺序。
- **唤起**：桌面端在列表视图中直接打字唤起（首字符带入输入框）；移动端在列表顶部下拉唤起。

## User Stories

1. 作为用户，我按 `⌘F` 输入「工作」，就能看到名为「工作」的 Area 并回车直接进入。
2. 作为用户，我输入「今天」或「today」，回车即跳到 Today。
3. 作为用户，我输入一个标签名，回车进入该标签页，看到所有带它的条目。
4. 作为用户，我搜到一个任务后回车，面板关闭，页面跳到任务所在的项目 / 视图，任务展开并滚到可见处。
5. 作为用户，我只记得「买电池」是某个任务的子步骤，搜「电池」能找到父任务，并在它下面看到命中的「买电池」。
6. 作为用户，我全程不离开键盘：打开、输入、上下选、回车。
7. 作为用户，默认结果里没找到时，我点「继续搜索」就能在已完成、已取消和 Trash 里找。
8. 作为用户，在继续搜索中打开一个已完成的任务，会跳到 Logbook 并定位它；打开一个 Trash 中的任务，会跳到 Trash 并定位它。
9. 作为用户，标题以关键词开头的任务排在只在备注里提到关键词的任务前面。
10. 作为桌面用户，我在 Today 里没有编辑任何东西时直接敲「报告」，Quick Find 就打开，输入框里已经是「报」并继续接收后续输入。
11. 作为移动端用户，我在列表顶部下拉就能打开 Quick Find。

## Implementation Decisions

### 1. 结果模型

结果分四组，组内按相关度排序，组的顺序固定：

| 组 | 候选 | 匹配文本 | 打开时 |
|---|---|---|---|
| 列表 | Inbox、Today、Upcoming、Calendar、Anytime、Someday、Later Projects、Logbook、Trash、Tags | 当前语言名称 + 英文名（别名） | 导航到对应路由 |
| 区域与项目 | 未进 Trash 的 Area；未了结、未进 Trash 的 Project（含 Later Project） | 名称 | `/areas/:id`、`/projects/:id` |
| 标签 | 所有 Tag | 名称 | `/tags/:tagId` |
| 任务 | 见第 2 节 | 标题、备注、Subtask 标题 | Reveal（第 4 节） |

- 匹配：不区分大小写的子串匹配。拼音 / 模糊匹配不在本期。
- 空输入不显示结果，只显示提示文案。
- 导航目标由客户端从已有的本地查询（侧边栏用的 projects / areas / tags）计算，不新增后端接口。
- 继续搜索后，「区域与项目」组额外纳入已了结的 Project 与 Trash 中的 Project，都打开 `/projects/:id`（与 Trash 页点击项目行的行为一致）。Area 没有 Trash 态（删除即物理删除），不参与。

### 2. 任务搜索（engine domain + 两个后端）

- 新增后端方法 `searchTasks(q, { extended })`，与 `getTasks` 分开（`getTasks` 的 `q` 保留给助手工具等既有调用方，行为不变）：
  - 返回 `TaskSearchHit[]`：`{ task: TaskResponseDto; matchedSubtasks: { id: string; title: string }[]; rank: SearchRank }`。
  - 默认范围：ACTIVE 且未进 Trash。`extended: true`：再加已了结（`WITH_SETTLED_TASK_STATUSES`）与 Trash 中的任务。
  - 命中条件：标题包含 / 备注包含 / 任一 Subtask 标题包含。Subtask 自身的状态不影响命中（已勾选的子步骤也能搜到）。Subtask 所属的父 Task 仍需满足范围条件。
  - 不排除 Later Project 中的任务（与现有 `q` 行为一致）。
- 纯函数放在 `@taskora/engine` 的 `domain/search.ts`：`taskSearchRank(fields, subtaskTitles, needle)` 返回档位 `'titlePrefix' | 'title' | 'other' | null`，以及结果排序函数（档位 → 未了结先于已了结先于 Trash → 有效 Position → id）。设备端 `task-backend.engine.ts` 与 REST 端 `TasksService` 共用。
- REST：新增 `GET /tasks/search?q=&extended=`，web 的 REST 回退路径需要。
- 本地副本上不再需要 300ms debounce，降到约 50ms（仍合并连续击键）；REST 回退路径保留 300ms。
- Archived Logbook（只在 Sync Hub）不在搜索范围内。

### 3. 面板 UI

- 用 `QuickFind` 组件替换 `SearchModal`，保留现有挂载点（`ContentBottomBar`、`MobileTopBar`、`Home`）与 `uiInteraction.store` 的 `searchOpen`。
- 形态：顶部输入框，下方分组结果；不再有标题栏与复选框。移动端全宽。
- 任务行是专用的轻量行：复选框状态图标（只读）+ 标题 + 所属 Project / Area 的灰色小字；Subtask 命中时在其下方逐行显示命中的 Subtask 标题（小号、缩进、带子任务图标，关键词高亮）。已了结的任务标题弱化，Trash 中的任务带 Trash 标记。不复用 `TaskListView`：结果行不可展开、不可拖动、不参与多选。
- 标题与 Subtask 标题中的命中片段高亮。
- 继续搜索：当默认范围已有输入时，结果末尾常驻「继续搜索」行（也可被键盘选中，`Enter` 触发）。触发后本次打开期间保持扩展范围；关闭面板或清空输入后恢复默认。
- 键盘：高亮索引在面板内部维护，跨组连续；输入变化时高亮回到第一项。`↑`/`↓` 移动，`Enter` 打开高亮项，`Esc` 关闭。面板打开期间列表的 Selection 快捷键不生效（弹窗本身已隔离焦点，需确认 ADR-0004 的 keymap 不在输入框聚焦时派发 `moveUp`/`moveDown`）。
- 鼠标 / 触控：hover 移动高亮，点击打开。

### 4. 打开任务（Reveal）

- 复用 `useRevealTask`。`revealRouteFor` 对 Trash 返回 `null` 是提醒通知场景的约定，保持不变；新增参数 `{ allowTrash: true }`（或独立函数），Quick Find 调用时 Trash 中的任务返回 `/trash`。
- 已了结任务按现有规则落 `/logbook`。
- Trash 页不用 `TaskItem` 渲染，`revealId` 在那里不生效：需在 Trash 页消费 `revealId`，把该行设为 Selection 并滚入视野（Trash 行无展开态）。

### 5. 桌面端打字唤起

- 条件：非触控平台；焦点不在任何输入框 / 可编辑元素内；没有打开的弹窗或浮层；当前没有 Selection（有 Selection 时单键属于列表操作）。
- 触发键：单个可打印字符，无 `⌘`/`Ctrl`/`Alt` 修饰（允许 Shift）；排除空格（`newTaskBelow`）以及 keymap 已占用的其他单键。
- 行为：打开 Quick Find，输入框初始值为该字符，光标在末尾。IME 组合输入：焦点不在可编辑元素上时浏览器不把按键交给输入法，首键会以英文字母到达。所以可以打字唤起时，空闲焦点由一个视觉隐藏的输入框持有，IME 从首键起在其中组字，上屏（`compositionend`）后以上屏文字为 seed 打开面板；有 Selection、助手页、触控设备时不持焦。
- 在 `keymap.ts` 中作为一个新动作注册，遵循 ADR-0004。

### 6. 移动端下拉唤起

- 在列表页滚动容器位于顶部时，继续下拉超过阈值（约 64px）松手打开 Quick Find；下拉过程中顶部露出搜索图标提示。
- 只在列表类页面生效（手机首页、Bucket 视图、Project、Area、Tag 页），不在日历、设置、助手页生效。
- 不得干扰原生滚动与回弹；实现有风险时可降级为只保留顶栏按钮。

## Testing Decisions

- engine：`taskSearchRank` 与排序函数的单元测试（前缀 / 包含 / 仅备注 / 仅 Subtask / 不命中；已了结与 Trash 的排序）。
- api：设备端 `searchTasks` 的范围（默认 / extended）、Subtask 命中返回父任务且带 `matchedSubtasks`、父任务在 Trash 时默认不返回。
- backend：`GET /tasks/search` 与设备端行为一致（沿用 `tasks.service.search.spec.ts` 的组织方式）。
- ui：`QuickFind` 分组渲染、键盘移动跨组、`Enter` 导航 / Reveal、继续搜索、Subtask 命中展示；`revealRouteFor` 的 `allowTrash`；打字唤起的条件判定（`keymap.test.ts`）。

## Out of Scope

- Deadlines / Repeating 等只能从 Quick Find 进入的隐藏智能列表（需要先新增视图，另立 feature）。
- Archived Logbook（需向 Sync Hub 分页请求）。
- 拼音、模糊匹配、搜索历史、最近打开。
- 按 Tag / 日期等结构化语法过滤（如 `#tag`）。
