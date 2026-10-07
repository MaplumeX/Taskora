# 桌面 / Web：鼠标与键盘多选、多项拖拽

Status: implemented — awaiting manual acceptance

对齐 Things 3 Mac：键盘 Selection 除 ⌘A 全选外，支持 ⌘/Ctrl+点击、⇧+点击、⇧↑/↓ 多选，拖动多选中的一行时整组一起拖动。触控端的 Multi-Select Mode（`.scratch/touch-multi-select`）不变，两套状态仍互不相通。

## Solution

- **Selection store**：新增 `anchorId`（范围选择的固定端）；`selectedIds` 末项仍是光标。`toggleRowSelection(id)`（⌘/Ctrl+点击，以该行为新锚点）与 `extendSelectionTo(id)`（⇧+点击 / ⇧↑↓，锚点到 id 的连续任务行）。多选只含任务行。
- **点击**：`TaskItem` 行点击带 ⇧ → 范围，带 ⌘（Apple 系）/ Ctrl（其他）→ 切换，均不展开、收起展开行；⇧ 按下时阻止浏览器框选文字。多选时普通点击其中一行 = 只选中它（不再直接展开）。
- **键位**：`extendUp` / `extendDown`，默认 ⇧↑ / ⇧↓，可在设置中改绑。
- **多项拖拽**（`lib/dnd.ts` 的 `dragGroupOf` / `expandDragGroup`）：被拖任务在多选中且本列表内选中 ≥ 2 项时，拖拽开始那次提交之后的 effect 里收起其余选中行（`useCollapseAfterDragStart`）：DragOverlay 以拖拽开始那次提交中测得的被拖行位置为基准，若收起与拖拽开始同一次提交，被拖行上方的选中行先消失、基准随之上移，浮层就偏离指针（requestAnimationFrame 也不可靠：拖拽在原生 mousemove 里启动，React 不同步提交）；这样浮层始终贴着手，空位之后照常跟随预览；保留多选、不清空，只预览被拖行；松手后其余行从原位置取走、整组按原显示顺序替换被拖行的位置；取消则复原。浮层右侧 `DragCountBadge` 显示件数。
  - 分组视图（`GroupedFeedListView`）：组内各任务与落点所在组比较，跨组的各自改归属；原组在拖拽中保留。
  - 项目页（`ProjectTaskLayout`）：整组进入落点 Heading，整份布局一次写回。
  - Upcoming：跨组的任务改为被拖任务落定的日期（原本就在落点组的保留自己的日期），日期都写完再写顺序。
  - 区域详情 / 搜索（`TaskList`）：只重排。

- **右键菜单作用于整组**（`contextMenuTargets`）：右键的行在多选（≥ 2 个任务行）之中 → 菜单顶部显示件数，动作作用于整组（打开菜单时取快照）；右键多选之外的行 → 多选改为只选中该行，菜单只作用于它；单选时右键其它行不改动选中。整组菜单：完成 / 取消（全部已了结时为撤销，否则跳过已了结项，同触控工具栏）、计划、截止日期、标签（三态，各任务在原有标签上增减）、移动、删除 / 放回（之后清空选择）；字段卡片不预选值、不提供提醒；重复、跳过本次、转换为项目只在单行菜单出现。

## Out of Scope

- 拖到侧边栏项目 / 区域。
- 项目行、Heading 的多选与多项拖拽。
