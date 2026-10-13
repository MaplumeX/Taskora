# 侧边栏项目多选

Status: implemented — awaiting manual acceptance

对齐 Things 3 Mac：侧边栏的项目行可以多选，整组拖动、整组右键菜单。只含项目行，区域行不参与。键盘删除整组不在本次范围。

## Solution

- **Sidebar Selection store**（`api/src/stores/sidebarSelection.store.ts`）：`ids`（选中先后）、`anchorId`、`order`（侧边栏登记的项目行显示顺序）。`toggle(id, currentId)`：⌘/Ctrl+点击，首次多选时当前打开的项目一并选中；`extendTo(id, currentId)`：⇧+点击，锚点（缺省为当前项目）到该行的连续范围。`sidebarSelectionGroup()` 返回按显示顺序的整组（≥ 2 才算多选）。只在本窗口内存里，与键盘 Selection、Multi-Select Mode 互不相通。
- **点击**（`ProjectItem`）：带修饰键只改选中、不导航；⇧ 按下时阻止浏览器框选文字。普通点击清空多选并导航。多选中高亮跟随多选，否则跟随当前路由。`SidebarProjectSection` 在路由变化时清空。
- **整组拖拽**（`SidebarProjectSection`）：拖动多选中的项目时，拖拽开始那次提交之后收起其余组员（`useCollapseAfterDragStart`，理由同任务多项拖拽），浮层显示 `DragCountBadge`；松手后整组按显示顺序替换被拖项目的位置（`expandProjectGroup`），归属变了的各自写 `areaId`，全部写完再写一次顺序；任一失败回滚并只提示一次；取消则复原。拖动多选之外的项目只拖它自己。保留多选。
- **整组右键菜单**（`ProjectContextMenu` 的 `targetsOf`，侧边栏传 `sidebarContextMenuTargets`）：右键多选中的项目 → 顶部显示件数，动作作用于整组（打开菜单时取快照）；右键多选之外的项目 → 清空多选，只作用于它。整组菜单：完成 / 取消完成（全部已完成时为取消完成，否则只完成未完成的；有剩余任务的项目合并询问一次）、计划、截止日期、标签（三态）、移动（不标记当前位置）、删除（之后清空多选）。重复、跳过本次、复制、在新窗口中打开只在单项目菜单。

## Out of Scope

- 区域行多选。
- 键盘（⌫ / Delete）删除整组。
- 整组拖到侧边栏其他落点（Today、Trash 等）。
