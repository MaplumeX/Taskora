# Feature: Tags 对齐 Things 3（第二期）——嵌套 Tag 与 Quick Find `#tag`

Status: implemented — 04、05、07 待目视验收

第一期（`.scratch/tags-things3`）保留了 Tag Group 作为不可打标、只有一层的容器，只在过滤时把它当作父节点（ADR 0015「Tag Group stays a container」）。这一期改为和 Things 3 一致：**Tag 可以嵌套，父 Tag 本身也能打标**，Tag Group 退役。同时补上 Quick Find 的 `#tag` 语法。

## Problem Statement

1. **父节点不能打标**：Things 里「工作」既可以是一个 Tag，又可以有「会议」「出差」两个子 Tag。Taskora 的 Group 只是容器，想给任务打「工作」只能另建一个同名 Tag，过滤时 Group「工作」和 Tag「工作」是两回事。
2. **只有一层**：Group 下面不能再分组。
3. **两套概念**：用户要先想清楚某个名字该建成 Group 还是 Tag；建错了也没法转换。
4. **Quick Find 不能按 Tag 缩小搜索**：只能跳到 Tag 详情页，不能「在『工作』里搜『报告』」。

## 模型决策

### Tag 树取代 Tag Group

- `Tag` 增加 `parentId`（可空，指向另一个 Tag）。层数不限，同级之间按 `position` 排序。
- 父 Tag 和普通 Tag 完全一样：可以打标，有颜色，有详情页。
- `TagGroup` 实体、`Tag.tagGroupId`、`/tag-groups` 接口全部退役。
- **迁移**：每个 Tag Group 原样转成一个顶层 Tag，**沿用 Group 的 id**、标题和位次，颜色取 Tag 的默认色；原来的成员改为它的子 Tag（`parentId = tagGroupId`）。Group 和 Tag 的 id 都是 uuid，不会冲突。迁移之后用户什么都不用做，原来的分组关系原样保留，只是 Group 变成了可以打标的 Tag。

### 过滤语义：命中 = 有效 Tag 落在子树里

ADR 0015 的「有效 Tag」规则不变（Task 的有效 Tag = 自身 ∪ 所属 Project ∪ 所属 Area）。在此之上：

> 条目**命中** Tag T，当且仅当它的有效 Tag 中有 T 或 T 的任一后代。

- 适用于所有按 Tag 过滤的地方：`tagId` 查询、列表过滤栏、Tag 详情页、Quick Find 的 `#tag`。
- 不展开祖先：只打了「会议」的任务按「工作」能查到，只打了「工作」的任务按「会议」查不到。
- 显示仍然只用自身 Tag：行上胶囊只显示 Tag 名，不显示路径，也不显示祖先。

### 环

字段级 LWW 下两台设备可能并发写出环（A 的父改成 B，同时 B 的父改成 A）。

- **写入时拒绝**：UI 不允许把 Tag 拖进自己的后代，REST 返回 400。
- **hub 合并后修复**：沿用 ADR 0007 的「合并后修复跨字段不变量」。`repairEntity` 增加 Tag 规则，用一个祖先探针（参照 `HeadingProjectProbe`）沿 `parentId` 向上走。如果走回了自己（包括 `parentId` 指向自己），就把**本次合并的这一行**的 `parentId` 改为 null，以虚拟设备 0 的胜出时钟写入。
- **读取时容错**：`buildTagTree` 遇到环不能死循环，要把环上 id 最小的那个 Tag 当作顶层（忽略它的 `parentId`）。修复写传到各设备之前，各端也能显示一致的结果。

### 删除父 Tag

删除父 Tag 时，子 Tag **不跟着删除**，提升为顶层（`onDelete: SetNull`，副本里的 `COMPACT_NULL_REFS` 也按同一语义处理）。这和现在删除 Group 时的行为一致，也不会因为误删一个父 Tag 就连带删掉一整棵树。管理页继续用第一期的延迟删除加撤销。

## Solution

### 1. Tag Picker

```
┌───────────────────────────┐
│ 🔍 [搜索或新建…]            │
├───────────────────────────┤
│ ● 工作                  ✓  │  父 Tag 也可以勾选
│     ● 会议                 │  按层级缩进
│     ● 出差              ✓  │
│ ● 紧急                     │
└───────────────────────────┘
搜索时变为扁平结果，每行右侧用灰字显示父路径：「会议   工作」
```

- 没有搜索词时按树显示：先序遍历，同级按 `position` 排序，每层缩进一级。不再有分组小标题。
- 有搜索词时显示扁平结果，排序仍然复用 `lib/nameMatch.ts`。同名 Tag 用父路径区分。
- 即时新建的 Tag 放在顶层，不提供在这里直接建子 Tag 的入口（在管理页做）。
- 多选三态、键盘操作不变。

### 2. 列表过滤栏（多层）

```
[ 全部 ]  [ ● 工作 ]  [ ● 紧急 ]  [ 无标签 ]     ← 第一行：顶层
          ↳ [ ● 会议 ]  [ ● 出差 ]                  ← 选中「工作」后出现：它的子 Tag
             ↳ [ ● 周会 ]                           ← 再选中「会议」后出现下一层
```

- 某个 Tag 只要它自己或任一后代出现在当前列表条目的有效 Tag 里，就显示出来。
- 第一行列出顶层 Tag 和「无标签」。选中一个 Tag 后，如果它有出现在列表里的子 Tag，下面再出现一行；层数不限。
- 当前过滤 = 最深一层选中的 Tag，按子树命中。
- 再点一次已选中的 Tag 就退回上一层（父 Tag 成为当前过滤；如果是顶层则取消过滤）。
- 其余规则（出现的页面、纯客户端过滤、路由切换后重置、失效判定）沿用第一期。

### 3. Tag 详情页

- `/tags/:id` 按子树命中查询，所以「工作」页面也包含只打了「会议」的任务和 Project。
- 页头标题前显示父路径（`工作 › 会议`），每一段都可以点击。
- 标题下的过滤栏只列出**本 Tag 的子 Tag**：第一行是直接子 Tag，用来收窄到某个子 Tag。没有子 Tag 出现时不显示。

### 4. Tags 管理页（树形大纲）

- 每个 Tag 一行，按层级缩进；有子 Tag 的行带折叠三角。折叠状态只保存在本机（localStorage），不同步。
- 拖拽沿用 `lib/dnd.ts` 的让位约定（浮层跟手、原行留作空位、列表实时重排、邻居 FLIP 滑动、松手后本地占位），按大纲编辑器的方式决定层级：上下拖决定位置（指针越过某行中线即让位），左右拖决定层级（横向每满一档缩进加 / 减一层；最深是上一行的子 Tag，最浅不能浅过下一行），空位按当前层级缩进显示落点。被拖 Tag 的子树在拖起时收起、随它一起移动，所以不可能拖进自己的子树。写入的是 `parentId` 加 `position`（只给移动的那一行分配新位次，`repositionMinimal`）。
- 行上只保留折叠三角、色点（换色）、名称（改名）和进入详情的箭头。其余操作——「新建子 Tag」「移到…」「删除」——桌面端在右键菜单里（`MenuRow` 加虚拟锚点，与任务、项目的右键菜单同一形态），触控端左滑行后弹出底部动作面板（`ActionSheet`；左滑手势复用任务行的 `useSwipeToSelect`，与长按拖拽互斥）。「移到…」在菜单 / 面板里切换成 Tag 树（加「顶层」），触控和键盘不拖拽也能调层级。
- 页头「新建 Group」按钮去掉，只保留「新建 Tag」。
- 改名、色板、延迟删除加撤销沿用第一期。删除父 Tag 时，在撤销期内就把它的子 Tag 显示到顶层。

### 5. Quick Find `#tag`

```
┌──────────────────────────────────────────┐
│ 🔍 [#工作 ×] [#紧急 ×] 报告│               │  已确认的 Tag 显示为 chip
├──────────────────────────────────────────┤
│ 区域与项目                                 │  只列出命中全部 chip 的 Project / Area
│ 任务                                       │  只列出命中全部 chip、且匹配「报告」的任务
│ 继续搜索                                   │
└──────────────────────────────────────────┘
```

**输入**

- 在词首输入 `#` 进入 Tag 补全：结果面板临时只显示匹配 `#` 后文字的 Tag（扁平，带父路径；`#` 后为空时按树列出全部 Tag）。
- 补全状态下 `Enter` / `Tab` / 点击把高亮的 Tag 变成一个 chip，并删掉输入框里的 `#xxx`；`Esc` 退出补全，`#xxx` 留作普通文字，再按一次 `Esc` 才关闭面板。
- `#` 后文字正好等于一个 Tag 的名字（不区分大小写，且只有这一个同名 Tag）时，输入空格也会把它变成 chip，方便移动端操作。
- 光标在输入框开头时按 `Backspace` 删掉最后一个 chip。chip 自带 `×`。
- 输入法组字期间（`isComposing`）不触发补全和转换。
- 不带 `#` 的输入和现在完全一样：Tag 组照常出现，回车跳到 Tag 详情页。

**结果**

- 有 chip 时，各个 chip 之间是 AND 关系，每个 chip 按子树命中。
- 有 chip 时，「列表」组和「标签」组不显示。「区域与项目」组只保留命中全部 chip 的条目：Project 看它的有效 Tag，Area 看它自身的 Tag。「任务」组用带 Tag 条件的 `searchTasks`。
- 只有 chip、没有文字时，也列出命中的任务，按 Position 排序。
- 「继续搜索」带上 chip：`/search?q=报告&tag=<id>&tag=<id>`。搜索页在搜索框里显示同样的 chip，可以删除，改动按 replace 方式写回 URL。

## Implementation Decisions

### 树的纯函数放在 engine

```ts
// packages/engine/src/domain/tags.ts（扩展）
buildTagTree(tags: { id; parentId; position }[]): TagTree   // 容忍环与悬空 parentId
TagTree.descendantsOf(id): Set<string>                       // 含自身
TagTree.ancestorsOf(id): string[]                            // 由近到远，不含自身
tagHit(effectiveTagIds, tagId, tree): boolean                // 子树命中
```

- `taskMatchesQuery` 的 `tagId` 判定改为 `tagHit`。`TagParents` 增加 Tag 树；`tagId` 查询时没有传入就抛错，沿用第一期的做法，避免哪条读路径悄悄退回旧语义。
- 悬空的 `parentId`（父 Tag 已被 compact，但清理还没传到）按顶层处理。
- hub 的 SQL 粗筛先在内存里把 `tagId` 展开成子树 id 列表，再把第一期的四路 `OR` 从 `= tagId` 改成 `IN (...)`。最终判定仍然走 domain 函数。
- 契约夹具 `VIEW_CONTRACT` 增加嵌套 Tag 的用例，三方契约测试一起跟上。
- 缓存失效：Tag 的 `parentId` 变化要让所有 `tagId` 任务列表失效（Engine 模式的 live query 增加 `tag` 依赖；REST 模式的事件应用器在 Tag 事件上失效 `tagId` 列表）。

### 同步与迁移

这是一次不兼容的 wire 变化：实体 `tag-group` 消失，字段 `tagGroupId` 改名为 `parentId`。

| 位置 | 改法 |
|---|---|
| `entities.ts` | 删除 `tag-group` 实体；`tag` 的 `tagGroupId` 改为 `parentId`；`REFERENCE_FIELDS.tag.parentId → tag`；`COMPACT_NULL_REFS.tag` 增加 `{ entity: 'tag', field: 'parentId' }`；索引 `tag_group_member` 改为 `tag_parent` |
| `protocol.ts` | `SYNC_PROTOCOL_VERSION = 5`；hub 的 `minProtocolVersion` 同步升到 5。协议 4 的客户端还会写 `tag-group` 和 `tagGroupId`，这些写会被永久拒在 Outbox 里，所以要让它们直接收到 426 并提示升级 |
| hub Prisma migration | `Tag` 加 `parentId`（自关联，`onDelete: SetNull`）；`INSERT` 每个 TagGroup 为 Tag（同 id、标题、位次、默认色）；成员的 `parentId = tagGroupId`；`fieldClocks` 里的 `tagGroupId` 键改名为 `parentId`，Group 转出的 Tag 沿用 Group 的 `title` / `position` 时钟；删除 `tagGroupId` 列和 `TagGroup` 表。不写 `SyncChange` |
| 副本迁移（新增一步） | 和 hub 用**同一套规则**逐字转换：`tag_group` 行转成 `tag` 行，`tagGroupId` 列和时钟键改为 `parentId`，删除 `tag_group` 表。Outbox 里的 `tag-group` 写和删除请求改写成 `tag`，字段键 `tagGroupId` 改为 `parentId` |
| 一次性 bootstrap | 副本迁移时在 `_engine_meta` 记一个标记。第一次连上协议 ≥ 5 的 hub 时，带着 Outbox 走一次 bootstrap，然后清除标记。原因：设备如果先于 hub 升级，会跳过旧 hub 下发的 `tag-group` 事件，本地副本和 hub 会出现分歧 |

两端转换规则相同、时钟原样复制，所以 hub 先升级时（常见情况），设备迁移后的副本和 hub 本来就一致；一次性 bootstrap 只是兜住设备先升级的情况。

### 其他接触面

- REST：删除 `tag-groups` 模块；`CreateTagDto` / `UpdateTagDto` 增加 `parentId`（拒绝成环）；`GET /tags` 返回 `parentId`。`POST /tags/reorder` 不变：改层级走 `updateTag({ parentId })`，再用 reorder 写全部 Tag 的新先序（先序即全局 Position 顺序，同级顺序随之确定）。
- shared DTO：删除 `TagGroupResponseDto` 等；`TagResponseDto.tagGroupId` 改为 `parentId`；事件 DTO 去掉 tag-group。
- api：删除 `useTagGroups`、`tag-groups.api*`、`tag-group-backend*`；`users.api` 导出里去掉 `tagGroups`。
- 助手工具（`agent-tools.ts`）：列出 Tag 时带 `parentId`；创建 / 更新 Tag 接受 `parentId`；去掉 Group 相关参数。
- Quick Add：桌面的 relay 协议（`quick-add-protocol.ts`）和 Android 状态栏快照（`quick-add-snapshot.ts`）去掉 `tagGroups`，Tag 列表按树序排列并带上层级。relay 协议是否需要版本号，按它现有的兼容规则处理。
- UI：`tagPickerOptions.ts`、`tagFilter.ts`、`TagFilterBar.tsx`、`tagsLayout.ts`、`Tags.tsx`、`TagDetail.tsx` 改为基于 Tag 树。
- 文档：新增 ADR 0016「Nested tags replace tag groups」，取代 ADR 0015 的「Tag Group stays a container」一节（在 0015 里加 superseded 注记）；更新 `CONTEXT.md` 的 Tag / Tag Group 词条和 Effective Tags 词条（加上子树命中）。

### Quick Find 的 Tag 条件

- `searchTasks(q, { extended, tagIds })`：engine `domain/search.ts` 的 `planTaskSearch` 增加 Tag 条件，每个 tagId 用 `tagHit` 判断（基于有效 Tag），之间是 AND。
- `q` 为空且 `tagIds` 非空时也返回结果（`searchNeedle` 为空不再意味着没有结果）；此时排序是范围档位 → 有效 Position → id。
- REST：`GET /tasks/search?q=&extended=&tagIds=a,b`（逗号分隔；Tag id 是 uuid，不含逗号）。`q` 可省略。
- 面板的输入状态（`chips` + 文字 + 补全状态）放在纯函数 / reducer 里（`quickFindInput.ts`），方便测试键盘行为。

## Out of Scope

- 每个 Tag 绑定快捷键（第一期 issue 08，仍 deferred）。
- Quick Add 标题里的 `#tag` 语法（Things 的 Quick Entry 也没有）。
- 过滤栏多选。
- Tag 合并（把一个 Tag 并入另一个）。

## Testing

- engine：`buildTagTree`（多层、环、悬空父、自指）；`tagHit`；`taskMatchesQuery` 的子树命中；`repairEntity` 的 Tag 断环；副本迁移（Group 转 Tag、时钟改键、Outbox 改写、一次性 bootstrap 标记）；`planTaskSearch` 的 Tag 条件和空 `q`。
- backend：Prisma migration 的数据转换（参照 `migrations.e2e-spec.ts`，带一个 legacy fixture）；hub 合并后断环；`tagId` 子树查询；`/tasks/search` 的 `tagId`；协议 4 请求收到 426。
- 契约：hub 迁移和副本迁移对同一份输入产出逐字相同的行和时钟。
- UI 纯函数：树序 Picker 行、多层过滤选项和退层、管理页落点换算（前 / 后 / 成为子 Tag、禁止拖进后代）、Quick Find 输入 reducer（`#` 补全、空格转换、Backspace 删 chip、IME）。
- 组件：管理页拖拽嵌套、「移到…」、Quick Find chip 流程、搜索页 URL 往返。
