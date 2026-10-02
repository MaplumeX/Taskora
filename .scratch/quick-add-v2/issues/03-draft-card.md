# 03：草稿卡片与字段栏

Status: implemented — awaiting desktop verification
Blocked by: 01

## Problem

Quick Add 只能写标题。需要按展开任务的版式提供备注和字段栏，在创建前就能设好日期、Tag、归属。

## Design

见 spec 第 1、2 节。

- 新组件 `QuickAddCard`（放在 `packages/ui`，便于测试和以后复用），持有草稿状态，对外暴露 `onSubmit(draft, { keepOpen })`。
- 字段组件全部复用：`ScheduledDateField`（`showReminder`）、`DueDateField`、`TagsField`、`MovePicker`。草稿状态要同时满足 `ScheduledFieldCurrent`、`TagsFieldCurrent`、`MoveCurrent` 这几个结构；`onPatch` 改为合并到本地草稿，不写库。
- 把 `TaskRowExpanded` 里的 `FieldChip` 和「有值显示 chip、无值显示图标」的底栏抽出来共用，不要复制一份。
- 归属 chip：Inbox、区域、项目的图标和名称与侧边栏一致。
- `TagPicker` 新增 `allowCreate` 属性，默认 `true`。Quick Add 传 `false`，隐藏「新建 Tag」入口。
- 卡片输出 `QuickAddDraft`（`.scratch/quick-add-android/spec.md` 第 4 节）；转换成 `CreateTaskDto` 的规则只写在共用的 `createFromQuickAddDraft` 里，卡片不自己转换。
- i18n：新增卡片文案（zh / en），包括占位符、归属 chip、快捷键提示。

## Acceptance

- 草稿里设好的每个字段，创建后在主窗口中都对应正确。
- 计划日期从 DATE 切到 Someday 或清空时，Reminder 随之清空。
- Tag 选择器里没有新建入口。
- 测试：`QuickAddCard.test.tsx`，覆盖字段到 `QuickAddDraft` 的映射、chip 和图标的切换、空标题不能提交。

## Comments

### 2026-10-02：实现

- 新组件 `packages/ui/src/components/task/QuickAddCard.tsx`（`forwardRef`，对外暴露 `focusTitle()`）：
  - 草稿状态是 `QuickAddCardState`；`draftFromState` 是纯函数，负责转成 `QuickAddDraft`。
  - 字段补丁合并时，离开 DATE 就清空日期和 Reminder，与数据层同一口径。
  - 提交成功后清空草稿；「添加并继续」时保留归属；提交抛错时保留草稿。
- 从 `TaskRowExpanded` 抽出 `fields/FieldChip.tsx`（`FieldChip`、`FieldIconButton`、`scheduledChipOf`），两边共用，展开任务的行为不变。
- `TagPicker` / `TagsField` 新增 `allowCreate`（默认 true），Quick Add 传 false。
- 归属 chip 用 `MovePicker`，但只取 DTO 里的 `projectId` / `areaId`。原因是 MovePicker 的「移入 Inbox」会清空计划，那是给已有任务用的；草稿里计划和归属是两个独立字段。未选归属时传入 Inbox 口径的 current，让「收件箱」一项打勾。
- 键盘（issue 04 的一部分已经顺带做了）：
  - 标题框内按 ↵ 提交；
  - ⌘↵ / ⇧⌘↵ 在卡片根节点的**捕获阶段**处理。备注编辑器会截断 Enter 的冒泡，Tiptap 也把 Mod-Enter 当成换行，捕获阶段拦下后事件不会再到编辑器；
  - Esc 只处理卡片自身 DOM 内的按键。选择器在 Portal 里，React 事件仍会冒泡到卡片，所以要排除，选择器开着时 Esc 只关闭选择器；
  - 输入法组字中一律不处理。
- `QuickAddApp` 改为渲染卡片。quick-add 窗口高度临时从 120 调到 200，issue 02 再改成随内容变化；在那之前，弹出的选择器可能被窗口裁切。
- i18n：新增 `task:quickAddTitlePlaceholder`、`task:quickAddPlacement`。
- 测试：`QuickAddCard.test.tsx`（8 条：草稿映射、回车提交与空标题、输入法组字、归属与「添加并继续」、Tag 无新建入口、Esc 分层、失败时保留草稿），`TagPicker.test.tsx` 新增 `allowCreate=false` 一条。
