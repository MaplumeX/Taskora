# Feature: Quick Find 隐藏列表与 Heading 搜索

Status: implemented — awaiting desktop / Android acceptance

对齐 Things 3 的 Quick Find（3.11 起）：补上只能从 Quick Find 进入的隐藏列表，并让 Project Heading 可以被搜到、直接跳过去。

## 依据

Things 官方说明（[Quick Find 支持文档](https://culturedcode.com/things/support/articles/2803584/)、[The Quick Find Update](https://culturedcode.com/things/blog/2019/12/the-quick-find-update/)）：

- 隐藏列表共五个，只能在 Quick Find 里输入名称进入，不能固定到侧边栏：
  - Tomorrow：排在明天的所有条目；
  - Deadlines：所有带截止日期的条目（Taskora 已实现，见 `.scratch/deadlines-things3`）；
  - Repeating：所有重复模板，行尾显示重复日期；
  - All Projects：所有未了结项目，按区域分开；
  - Logged Projects：Logbook 里所有已完成的项目，按移入日期分组。
- Heading 出现在 Quick Find 结果里，选中即跳到它所在的位置。

## 用户故事

1. 作为用户，我在 Quick Find 输入「明天」或 `tomorrow`，回车就看到明天要做的所有任务和项目。
2. 作为用户，我输入「重复」或 `repeating`，能在一个列表里看到所有重复任务和重复项目，按下次日期排列。
3. 作为用户，我输入「所有项目」或 `all projects`，能按区域看到所有未了结项目，包括稍后项目。
4. 作为用户，我输入「已完成项目」或 `logged projects`，能按完成日期看到 Logbook 里的项目。
5. 作为用户，我输入某个 Project Heading 的名字，回车后跳到它所在的项目，Heading 被选中并滚到可见位置。

## 规则

### 共同

- 四个列表与 Deadlines 一样是 Hidden List：不在侧边栏、没有计数，只出现在 Quick Find 的「列表」组（以及 ⇧⌘O 前往面板，与 Deadlines 相同，两者共用列表目标），按当前语言名称 + 英文名匹配。手机首页也不加入口。
- 列表页都有标签过滤栏（与其他列表一致）、键盘 Selection。
- Archived Logbook（只在 Sync Hub 上）不在任何隐藏列表里。

### Tomorrow（明天）

- 路由 `/tomorrow`。内容：Upcoming 中计划日期为账号时区明天的 Task 与 Project（与 Upcoming「明天」一节同一批条目，含尚未移入 Logbook 的已了结条目）。截止日期在明天但计划不在明天的不算（Things：scheduled for the next day）。
- 客户端从 Upcoming feed 中按日期筛出，不新增 ListView。
- 展示同 Today：按「在时间视图中按项目/区域分组」偏好分组或平铺，可拖拽排序；行上不显示计划日期 chip（视图已表达日期）。
- 不显示 Repeat Preview。
- 名称：明天 / Tomorrow。

### Repeating（重复）

- 路由 `/repeating`，新增 ListView `repeating`（engine、设备后端、hub 同步跟上）。
- 内容：带 Repeat Rule、未了结、未进 Trash 的 Task 与 Project，含 Later Project 及其内任务、项目内任务。已完成但尚未移入 Logbook 的不算（链的当前一环是它派生出的实例）。
- 排序：计划日期升序（即下一次出现），同一天按 Position / Feed Position。平铺不分组，不可拖拽排序。
- 行上照常显示计划日期（今天黄星 / 未来灰色 chip）与重复图标。
- 名称：重复 / Repeating。

### All Projects（所有项目）

- 路由 `/all-projects`，客户端从项目列表推导。
- 内容：未了结、未进 Trash 的 Project，含 Later Project。
- 分节：无区域的项目在最前（无节标题），之后每个 Area 一节，节标题为 Area 名称（点击进入区域页），节顺序与区域内项目顺序都跟随侧边栏。没有项目的 Area 不出现。
- 行用项目行（进度环、计划日期 chip、截止日期），点击进入项目页。不可拖拽排序。
- 名称：所有项目 / All Projects。

### Logged Projects（已完成项目）

- 路由 `/logged-projects`。内容：Logbook 中的 Project（Logbook feed 中的项目行），按了结时间分组，分组规则同 Logbook（今天 / 昨天 / 更早按月）。
- 行显示了结日期，点击进入项目页。
- 名称：已完成项目 / Logged Projects。

### Heading 搜索

- Quick Find 新增「分组标题」组，位于「区域与项目」与「标签」之间。
- 候选：未归档（`ACTIVE`）的 Project Heading，所属项目出现在面板的「区域与项目」候选中（未了结、未进 Trash，或已完成未移入 Logbook）。
- 匹配与排序同其他导航目标：名称子串匹配，前缀命中先于包含命中，同档按项目的侧边栏顺序、再按 Heading 位次。
- 行：Heading 图标 + 标题（关键词高亮）+ 所属项目名（灰色小字）。
- 有 `#tag` chip 时不出现该组（Heading 没有 Tag）。搜索页（继续搜索）不含 Heading。
- 打开：关闭面板，导航到 `/projects/:id`；该 Heading 行成为 Selection 并滚到视野中央（一次性，复用 `revealId`）。
- 数据：Project Heading 后端新增 `getActiveHeadings()`，返回所有项目中未归档的 Heading；REST 为 `GET /project-headings/active`。

## 不做

- 最近访问的列表（Things 在空输入时显示）。
- Settings / Preferences 作为 Quick Find 目标。
- 隐藏列表固定到侧边栏。
- All Projects 行拖到侧边栏。
- 在 Heading 内搜索（`#tag` 风格的范围限定）。

## 测试

- engine：`repeating` 的收录范围与排序（契约夹具三方共跑）。
- ui：`quickFindResults` 的 Heading 组（匹配、排序、chip 时隐藏）；面板输入 Heading 名回车导航并设置 reveal；四个列表名可被搜到；Tomorrow 只收明天；All Projects 分节；Logged Projects 只有项目；Heading 行消费 reveal。
- api：设备端 `getActiveHeadings` 只返回未归档的 Heading。
