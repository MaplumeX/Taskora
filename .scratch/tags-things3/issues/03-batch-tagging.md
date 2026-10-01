# 03 多选批量打标（三态）

Status: implemented — awaiting visual acceptance
Blocked by: 02

## Problem

`MultiSelectToolbar` 只在选中 1 条时才渲染 Tag 选择器，因为 `patchAll({ tagIds })` 会把同一份数组写给所有任务，覆盖它们各自原有的 Tag。

## Design

见 spec 第 2 节。

- 纯函数（放在 `TagPicker` 旁边）：
  - `tagSelectionState(items, tagId)` → `'all' | 'some' | 'none'`
  - `toggleTagAcross(items, tagId)` → `{ id, tagIds }[]`：状态为 `all` 时从每条任务中移除这个 Tag，否则给每条任务加上。
- `TagPicker` 接受多个 `current`，用 `✓` 表示 all，用 `–` 表示 some。
- `MultiSelectToolbar`：去掉 `single &&` 限制，把逐条写入交给调用方。即时新建的 Tag 加到所有选中项上。
- 键盘 Selection 为多条时（issue 04）复用同样的逻辑。

## Acceptance

- 选中 3 条 Tag 各不相同的任务，加上 `紧急`：3 条都有 `紧急`，各自原有的 Tag 保留。
- 再点一次 `紧急`（此时为 all）：3 条都去掉 `紧急`。
- 纯函数和组件测试。

## Comments

### 2026-10-01 — 实现

- `SelectionRow` 增加 `tagIds`（仅 task 行），七处登记行的列表都已带上，和 `completed` / `cancelled` 同源；多选工具栏和后续的键盘批量动作都从这里读各任务的自身 Tag。
- `MultiTagsField`（在 `TagsField.tsx`）：三态显示，点击后只对实际变化的任务逐条写入 `{ tagIds }`。
- 多选工具栏的「标签」不再限于单选；改过标签后关闭卡片即退出多选模式（和其它字段一致）。
- 测试：工具栏三态用例 1 个；纯函数用例在 02 的 `tagPickerOptions.test.ts` 里。
