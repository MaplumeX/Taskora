# Feature: Move Picker

Status: implemented (01–03) — awaiting visual acceptance

对照 Things 3 的「Move」popover，把现有的「移动」面板（`MoveField`）重做为一个可搜索、有层级、能用键盘操作的归属选择器，并修正「移入 / 移出 Inbox」的语义。

## Problem Statement

现有 `MoveField`（右键菜单与触控多选工具栏共用）：

1. **形态**：「区域」「项目」两段平铺列表，没有层级、搜索和键盘操作；不能选 Inbox；已完成的项目也列在里面。
2. **区域与项目可同时设上**：两段各自写入，先选项目 X 再选区域 Y，任务会同时带 `projectId = X`、`areaId = Y`。Grouped View 跨组拖拽（`reassignmentDto`）已经是互斥写法，两边不一致。
3. **Inbox 任务移进项目后仍留在 Inbox**：`resolveTaskBucket` 在 NONE 下保留原有的 INBOX / ANYTIME，只写 `projectId` 时 bucket 仍为 INBOX，任务同时出现在 Inbox 和项目里。反过来，把归属都改成「无」也回不到 Inbox。
4. 右键菜单里选完不关闭。

## Solution

### Inbox 语义（对齐 Things 3）

Inbox 是「尚未整理」的状态（Things 里是 `start = 0`），不是项目，也不是存储位置：

- **离开 Inbox**：任何整理动作都会让任务离开 Inbox。获得归属（项目或区域）就转为 ANYTIME；获得计划（DATE / SOMEDAY）就转为 SCHEDULED（这一条现在已经成立）。
- **移入 Inbox**：清除归属，**同时清除计划**（计划类型回到 NONE，计划日期、提醒、重复规则随之清除）。已在 Things 3 实机上确认。截止日期保留（截止日期不属于「整理」状态，Things 的行为待确认，默认不动）。

### 选择器形态

```
┌─────────────────────────┐
│ 🔍 [搜索…]               │  桌面端自动聚焦；触控端不聚焦（免得弹出键盘）
├─────────────────────────┤
│ 📥 收件箱              ✓ │  当前所在位置打勾
│ ◔ 无区域项目 A           │
│ ▤ 工作                   │  区域行本身可选
│   ◔ 项目 C               │  项目缩进在所属区域下
│   ◑ 项目 D               │  稍后项目灰色弱化
└─────────────────────────┘
```

- 只列「放在哪」：Inbox、Area、Project。Today / Upcoming / Someday 归计划入口（When），不出现在这里。
- 顺序与缩进和侧边栏同源；图标沿用 Quick Find（区域 `Layers`，项目 `ProjectProgressPie`，Inbox 用侧边栏的图标）。
- 输入搜索词后变成扁平结果，按「前缀命中 > 包含命中」排序，同档保持视觉顺序；项目行尾用灰字标出所属区域。
- 键盘：`↑` / `↓` 移动高亮，`Enter` 选中，`Esc` 关闭；选中后立即关闭。

## Implementation Decisions

### 1. 数据层：Inbox 不能有归属（engine）

把规则放进 `resolveTaskBucket`：NONE 下只有**无归属**时才保留 INBOX；有归属时 INBOX 变为 ANYTIME。这样创建、编辑（`planTaskUpdate`，两个后端共用）和合并后的修复（`invariants.repairEntity`）口径一致，Move Picker、Grouped View 拖拽、Agent 等所有写入路径一起修正。

已有的「INBOX + 有归属」脏数据不做迁移：下次编辑或合并修复时自然归正。

### 2. 目标与写入（纯函数，`task/fields/moveTargets.ts`）

```ts
type MoveTarget =
  | { kind: 'inbox' }
  | { kind: 'area'; area: AreaResponseDto }
  | { kind: 'project'; project: ProjectResponseDto; nested: boolean };

buildMoveTargets({ projects, areas, query }): MoveTarget[]
moveTargetDto(target): UpdateTaskDto
currentMoveTargetId(task): string | null
```

- 候选：Inbox；所有 Area；未了结、未进 Trash 的 Project（含 Later Project，灰色弱化）。
- 顺序：Inbox 固定第一，其后复用 `flatParentOrder`。
- 搜索：把 `quickFindResults.ts` 里的 `nameRank` / `rankByName` 提到公共 lib，与 Quick Find 共用。Inbox 匹配当前语言名称和英文名。
- 写入：

  | 目标 | DTO |
  |---|---|
  | Inbox | `{ projectId: null, areaId: null, bucket: INBOX, scheduledType: NONE }` |
  | Area | `{ projectId: null, areaId }` |
  | Project | `{ projectId, areaId: null }` |

  Area / Project 不需要显式带 bucket，由第 1 节的规则推导；计划日期保持不变。换项目时 `headingId` 由数据层清除（已有行为）。

- 当前位置：有 `projectId` 取项目，否则有 `areaId` 取区域，否则 bucket 为 INBOX 且无计划时取 Inbox，否则不打勾。多选时不打勾。

### 3. 组件（`MovePicker` 替换 `MoveField`）

- 键盘与滚动照搬 Quick Find：`activeIndex`、`scrollIntoView({ block: 'nearest' })`、IME 组合输入期间忽略按键、`role="combobox"` + `aria-activedescendant`。
- 接口：`current` + `onSelect(dto)`，由调用方负责关闭。
- `TaskContextMenu`：选中后 patch 并关闭。
- `MultiSelectToolbar`：对勾选集合 `patchAll` 后 `closePicker`（退出多选模式）。

## Out of Scope（第二期）

- 移到 Project Heading：`UpdateTaskDto` 没有 `headingId`，需要走 heading layout reorder，见 issue 04。
- `⇧⌘M` 快捷键：keymap 目前没有 move 动作，popover 锚点需复用右键菜单的虚拟锚点，见 issue 05。
- Project 的移动（改所属区域）：不在本期。

## Testing

- engine：`resolveTaskBucket` / `planTaskUpdate` 覆盖「INBOX 获得项目 / 区域 → ANYTIME」「移入 Inbox 清计划」「DATE 任务换项目 bucket 仍为 SCHEDULED」。
- 纯函数：顺序与缩进、过滤（已完成 / Trash）、搜索排序、DTO、当前位置推导。
- 组件：键盘选择、Enter 写入、当前位置打勾、搜索无结果。
