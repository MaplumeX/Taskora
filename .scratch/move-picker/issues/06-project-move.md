# 06 项目移动：复用任务条目的设计

Status: implemented — awaiting visual acceptance

## Requirement

项目也需要移动功能，设计与任务条目的移动选择器一致。

## Implementation

- 项目右键菜单与详情页「更多」菜单添加「移动」。
- 抽出 `MovePickerList`，任务与项目共用搜索框、列表、当前位置标记和键盘交互。
- 项目可移到任一区域或「无区域」；目标按侧边栏区域顺序展示，搜索按前缀优先。
- 仅改 `areaId`；选中后关闭，选当前位置不写入。
- 修正「更多」菜单切换选择器时的焦点归还，避免刚打开的选择器立即关闭。
- 中英文补充搜索占位、无区域和无结果文案。

## Validation

- 项目菜单测试覆盖两个入口、当前位置、搜索排序、键盘移动、无区域、无结果与 Esc。
- 回归任务 MovePicker、目标推导、TaskContextMenu 与 MultiSelect；共 5 个测试文件、48 项测试通过。
- UI 类型检查、修改文件 ESLint 与 `git diff --check` 均通过。
- 尚未在真实 App 中目视验收。
