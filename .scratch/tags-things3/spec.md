# Feature: Tags 对齐 Things 3

Status: spec — not started

对照 Things 3 的 Tag 体验，补齐 Taskora 在「打标」「过滤」「管理」三个环节的缺口。Tag 在 Things 里是正交于 Area / Project 的辅助维度（场景、人、精力、优先级），主要价值在**过滤**；Taskora 目前能打标，但几乎没有地方能用 Tag 过滤，打标本身也偏重。

## Problem Statement

1. **打标重**：`TagsField` 只是一列勾选按钮，没有搜索，不能新建；新 Tag 必须先去 Tags 页用对话框建，再回来打。
2. **不能批量打标**：多选工具栏只在选中 1 条时提供 Tag（`MultiSelectToolbar.tsx` 的 `picker === 'tags' && single`），因为 `patchAll({ tagIds })` 是整组替换，多条任务的 Tag 会被抹成同一份。
3. **没有快捷键**：keymap（ADR 0004）里没有任何 Tag 动作。
4. **不能在列表里按 Tag 过滤**：只有 `/tags/:tagId` 详情页一个入口。
5. **Project / Area 上的 Tag 没有效果**：`tagId` 查询只看 Task 自身的 `tagIds`（engine `views.ts`、backend `tasks.service.ts`、api `task-query-match.ts` 三处一致），给 Project 打 `Work` 后，按 `Work` 看不到它里面的任务。
6. **Tag 详情页单薄**：只平铺 Task，不列 Project，不按归属分组。
7. **管理页笨重**：对话框表单，`window.confirm` 删除，不能拖拽排序（schema 有 `position`，但 `UpdateTagDto` 和 UI 都没用上）。

## 模型决策

### Tag Group 保留为容器，在过滤语义上视作父节点

Things 3 没有独立的 Group 实体：Tag 可嵌套，父 Tag 也能直接打标，按父 Tag 过滤包含所有子 Tag。

Taskora **不改数据模型**，保留 Tag Group 作为不可打标的容器、只有一层。只在**过滤**时把 Group 当作父节点：按 Group 过滤 = 命中该 Group 下任一 Tag。这样能拿到 Things「按父 Tag 过滤」的主要好处，同时不需要迁移，也不用处理多层嵌套。

### 颜色保留

Things 3 的 Tag 没有颜色。Taskora 保留颜色，但行上维持现在克制的样式：灰描边胶囊加小色点（`TaskTagCapsules`）。颜色主要出现在选择器、管理页和过滤栏的色点上，不做大面积色块。

### 有效 Tag（Effective Tags）：过滤时继承，显示时不继承

对齐 Things 3：**Task 的有效 Tag = 自身 Tag ∪ 所属 Project 的 Tag ∪ 所属 Area 的 Tag**。其中所属 Area 指 Task 直接所在的 Area，或者所在 Project 所属的 Area。

- **过滤和查询**（`tagId` 查询、过滤栏、Tag 详情页）一律用有效 Tag。
- **显示**（行上的胶囊、展开行、右键菜单的打勾状态）只用自身 Tag。继承来的 Tag 不显示，也不能在 Task 上单独去掉。
- Project 同理：Project 的有效 Tag = 自身 Tag ∪ 所属 Area 的 Tag。
- Subtask 不参与，它不是独立的 Task 行。
- 纯推导，不写入任何字段，不同步，不影响 LWW。

这条规则要写进 `CONTEXT.md` 的 Tag 词条，并新增一份 ADR。它改变的是 `tagId` 查询这个已有接口的语义，而不只是 UI。

## Solution

### 1. Tag Picker（替换 `TagsField`）

```
┌─────────────────────────┐
│ 🔍 [搜索或新建…]          │  桌面端自动聚焦；触控端不聚焦
├─────────────────────────┤
│ 场景                     │  Tag Group 小标题（搜索时隐藏，变成扁平结果）
│   ● 办公室            ✓  │
│   ● 在家                 │
│ ● 紧急                ✓  │  无分组的 Tag
├─────────────────────────┤
│ ＋ 新建「出差」           │  只在没有同名 Tag 时出现
└─────────────────────────┘
```

- 交互和键盘照搬 Move Picker：`↑` / `↓` 移动高亮，`Enter` 切换高亮项（**不关闭**，方便连续打多个），`Esc` 关闭。
- 搜索排序复用 `lib/nameMatch.ts`（前缀命中 > 包含命中）。
- 输入的名字和已有 Tag 不重名（去掉首尾空白、不区分大小写比较）时，列表末尾出现「新建『xxx』」；回车或点击即创建，并打到当前对象上。新建的 Tag 不进任何 Group，颜色用默认值。
- Task、Project、Area 共用同一个组件，入口和现在的 `TagsField` 一样。

### 2. 批量打标（三态）

多选时 Picker 中每个 Tag 显示三种状态：全部有（✓）、部分有（–）、全都没有（空）。

- 点击「全部有」：从所有选中项上去掉这个 Tag。
- 点击「部分有」或「全都没有」：给所有选中项加上这个 Tag。
- 每条任务分别计算新的 `tagIds`（在它自己的原值上加或减），不再把同一份数组写给所有任务。

### 3. 快捷键

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 打开 Tag Picker（作用于 Selection） | ⇧⌘T | Ctrl+Shift+T | Alt+Shift+T |

Web 端的 Ctrl+Shift+T 是浏览器的「重新打开标签页」，拦截不了，所以按惯例降级到 Alt 系。Selection 为多条时打开三态 Picker。

### 4. 列表过滤栏

```
[ 全部 ]  [ 场景 ]  [ ● 紧急 ]  [ 无标签 ]        ← 第一行：Group + 无分组 Tag
          ↳ [ ● 办公室 ]  [ ● 在家 ]                ← 选中 Group 后出现第二行，用来收窄
```

- 出现在 Inbox / Today / Upcoming / Anytime / Someday / Logbook、Project 详情、Area 详情页的标题下方。
- 只列出**当前列表里实际出现的有效 Tag**；一个都没有时不显示过滤栏。
- 第一行是 Group（只要它有任一 Tag 出现）和无分组的 Tag，外加「无标签」（列表里存在没有有效 Tag 的条目时才出现）。选中 Group 后，第二行列出该 Group 在本列表中出现的 Tag，用来进一步收窄。
- 单选；再点一次已选中的项就取消过滤。
- 过滤对象包括 Task 行和 Project 行（Anytime / Someday 等视图里的 Project 行按 Project 的有效 Tag 判断）。Heading 和分组标题跟随其下内容：过滤后为空的分组整组隐藏。
- 状态只属于当前页面，切换路由后重置，不持久化。
- 纯客户端过滤，作用于页面已经拿到的数据，不新增查询参数。
- 键盘 Selection 只在过滤后可见的行之间移动。

### 5. Tag 详情页

- 用有效 Tag 查询：在第 1 节的规则下，`tagId` 查询的语义变为按有效 Tag 匹配。
- 同时列出带这个 Tag 的 Project（未了结、未进 Trash）。
- 按归属分组展示：复用 Grouped View（`GroupedFeedListView`），按 Area / Project 分组，无归属的放在最前面。

### 6. Tags 管理页

- 改成一个大纲：Group 是可折叠小节，Tag 是小节里的行。
- 拖拽排序：同一 Group 内调整顺序，跨 Group 拖动等于改 `tagGroupId`，Group 本身也能拖动排序。写 `position`（fractional indexing），做法参照 Project / Area 的排序。
- 双击（触控端长按）直接改名；颜色点击色点弹出色板。
- 删除改为 toast 加撤销，去掉 `window.confirm`。删除 Group 时其下的 Tag 变为无分组（schema 已是 `onDelete: SetNull`），也允许删除非空 Group。

## Implementation Decisions

### 有效 Tag 放在 engine 纯函数里

```ts
// packages/engine/src/domain/tags.ts
effectiveTaskTagIds(task, projectsById, areasById): string[]
effectiveProjectTagIds(project, areasById): string[]
```

三处 `tagId` 判定统一改为用有效 Tag：

| 位置 | 改法 |
|---|---|
| engine `views.ts` `taskMatchesQuery` | `TaskQueryFields` 增加 `effectiveTagIds`，由调用方（`task-backend.engine.ts`）用副本里的 Project / Area 行算好再传入 |
| backend `tasks.service.ts` | `where` 改为 `OR`：自身 Tag、`project.tags`、`area.tags`、`project.area.tags` 任一命中 |
| api `task-query-match.ts`（事件流缓存匹配） | 用缓存里的 projects / areas 计算有效 Tag |

Project 或 Area 的 Tag 发生变化时，`tagId` 查询的缓存要失效（事件流里 Project / Area 的 Tag 更新也要使 `['tasks', { tagId }]` 失效）。

### 过滤栏是一个通用组件加一个纯函数

```ts
// packages/ui/src/components/tags/tagFilter.ts
collectFilterOptions(items, groups): FilterOptions   // 从当前列表的条目收集 Group / Tag / 无标签
matchesTagFilter(effectiveTagIds, filter, groups): boolean
```

页面把已经拿到的 Task / Project 列表交给 `useTagFilter(items)`，得到过滤后的列表和过滤栏的 props。Grouped View 和普通列表都在交给布局之前过滤。

### Tag Picker 的写入接口

`current`（单个对象或多个对象）加 `onPatch`。单选时和现在一样写 `{ tagIds }`；多选时由调用方按第 2 节逐条计算后分别写入。

## Out of Scope

- Tag 多层嵌套、父 Tag 可打标（模型决策见上）。
- 每个 Tag 绑定自定义快捷键：`docs/keyboard-shortcuts.md` 目前约定「键位硬编码，不做用户配置」，还需要给 Tag 加同步字段。见 issue 08。
- Group 详情页（`/tags/group/:id`）。
- 过滤栏多选（AND / OR 组合）。
- Quick Find 的 `#tag` 语法。

## Testing

- engine：`effectiveTaskTagIds` / `effectiveProjectTagIds`；`taskMatchesQuery` 的 `tagId` 命中 Project / Area 继承。
- backend：`tasks.service` 按 `tagId` 查询时能查到 Project / Area 继承的任务（依赖 Postgres 的用例）。
- 纯函数：过滤选项收集（Group 出现规则、无标签）、Group 匹配、三态计算和逐条 `tagIds` 计算。
- 组件：Tag Picker 的搜索、即时新建、键盘切换；过滤栏的选择、取消选择、第二行出现；多选三态。
