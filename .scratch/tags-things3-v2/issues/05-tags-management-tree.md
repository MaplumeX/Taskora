# 05 Tags 管理页：树形大纲、拖拽嵌套、移到…

Status: implemented — awaiting visual acceptance
Blocked by: 02

## Problem

管理页是「Group 小节 + 未分组」两层结构，不能嵌套，也不能把 Tag 变成另一个 Tag 的子 Tag。

## Design

见 spec 第 4 节。

- `tagsLayout.ts`：用 `buildTagTree` 生成扁平可见行（考虑折叠）；`resolveTagsDrop` 改为三种落点：前、后、成为子 Tag。禁止落到自己的后代。
- `Tags.tsx`：折叠三角（localStorage）；行菜单加「新建子 Tag」「移到…」；去掉「新建 Group」。
- 删除父 Tag：在撤销期内就把它的子 Tag 显示到顶层；真正提交后由 hub 的 SetNull 落地。

## Acceptance

- 落点纯函数覆盖：同级重排、跨层移动、成为子 Tag、拖进后代被拒绝。
- 触控端用「移到…」可以完成所有层级调整。
- 目视验收。

## Comments

### 2026-10-06 — 实现

- `tagsLayout.ts`：`buildTagsRows(forest, collapsed)`、`dropZoneAt`、`resolveTagsDrop(forest, active, over, zone)`、`resolveTagsMove`、`canNestUnder`。结果统一为「改父 + 全部 Tag 的新先序」。
- 页面：拖拽从 sortable 换成 draggable + droppable，按拖动行中心落在目标行的位置判定前 / 后 / 成为子 Tag，拖拽中显示落点指示；不合法的落点（自己的子树）不显示也不响应。折叠状态存 localStorage（`taskora:tags-collapsed`）。行上：新建子 Tag、移到…（Popover 列出 Tag 树，自己的子树不可选）、删除、进入详情。
- 去掉 Group 相关的按钮和文案（含 `common:ungrouped`）。
- 键盘拖拽（原来的 KeyboardSensor）去掉了，键盘改层级走「移到…」。
- 未做：真实 App 里的目视验收（拖拽手感、触控长按、落点指示的样式）。

### 2026-10-06 — 拖拽改为让位模型

- 原来的「落在行的上 / 中 / 下段 = 前 / 子 / 后」不好用，按用户要求改为 `lib/dnd.ts` 的让位约定（与侧边栏项目区一致）：DragOverlay 跟手、原行留作空位、列表实时重排、`useFlipList` 滑动、松手后 `useHeldValue` 本地占位。
- 「成为子 Tag」与实时让位冲突（空位一直在动，「行中间」不稳定），改用大纲编辑器的做法：上下决定位置，左右决定层级（每档 20px），范围夹在 [下一行层级, 上一行层级 + 1]；空位按投影层级缩进，用浅色条标出落点。
- 纯函数：`dragRows`（拖起时收起子树）、`moveRow`、`depthRange` / `projectDepth`、`resolveTreeDrop`（空位位置 + 层级 → 新父 Tag 与同级位置，复用原来的 `applyMove`）；删除 `dropZoneAt`、`resolveTagsDrop`。
- 整行都是拖拽源（鼠标移动 5px、触控长按 300ms 才开始，和侧边栏一样），去掉了行首的拖拽把手与文案 `tag:dragHandle`；改名输入框里按下不会开始拖拽。挂到折叠着的父 Tag 下时自动展开它。
- 验证：纯函数 11 个；无头浏览器里真实鼠标拖了两次（D 拖到 A1 与 B 之间并右移一档 → 成为 A 的子 Tag；C 原地右移一档 → 成为 B 的子 Tag），hub 上的结果与截图一致，控制台无报错。
- 仍待人工验收：触控长按拖拽、自动滚动（Tag 很多时）。

### 2026-10-06 — 行操作移进右键菜单 / 左滑面板

- 行上的「新建子 Tag」「移到…」「删除」按钮去掉，行上只剩折叠、色点、名称、详情箭头。
- 新组件 `components/tags/TagRowActions.tsx`：`TagContextMenu`（桌面右键，`MenuRow` + 虚拟锚点；触屏长按派发的 contextmenu 不开菜单）、`TagActionSheet`（触控左滑后的底部动作面板，打开时不自动聚焦）、共用的「移到…」Tag 树列表。
- 左滑：复用 `useSwipeToSelect`（阈值 64px、最多 88px、按下 250ms 内开始才算左滑），露出「⋯」指示；行结构与 `TaskItem` 相同（外层拖拽源 / 落点，内层手势与位移）。
- 测试：页面测试改为经右键菜单操作，并加了「行上没有操作按钮」「触控左滑 → 面板 → 移到…」两条；UI 共 606 个通过。
- 网页版验证：桌面右键菜单与「移到…」树、拖拽往左一档回到顶层；手机尺寸下用 DevTools 真实触摸事件左滑，面板弹出，控制台无报错。

