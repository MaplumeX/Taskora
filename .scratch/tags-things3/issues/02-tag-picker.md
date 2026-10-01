# 02 Tag Picker：搜索、即时新建、键盘操作（替换 TagsField）

Status: implemented — awaiting visual acceptance

## Problem

`TagsField` 只是一列勾选按钮：不能搜索，不能新建，没有键盘操作，Tag 也不按 Group 分组显示。

## Design

见 spec 第 1 节。

- 新组件 `packages/ui/src/components/task/fields/TagPicker.tsx` 替换 `TagsField`。现有入口全部换掉：`TaskRowExpanded`、`TaskContextMenu`、`ProjectContextMenu`、`ProjectMetaRow`、`AreaMoreMenu`。顺便去掉 `AreaMoreMenu` 里的 `as unknown as` 类型断言。
- 无搜索词时按 Group 分小节（顺序与 Tags 页一致），无分组的 Tag 放在最后；有搜索词时变为扁平结果，排序复用 `lib/nameMatch.ts`。
- 键盘和 ARIA 照搬 `MovePicker`。不同之处：`Enter` 只切换，不关闭。
- 即时新建：查询词去掉首尾空白后非空，并且不与已有 Tag 重名（不区分大小写）时，末尾显示「新建『xxx』」。选中后先 `createTag`，再把新 id 加进当前对象的 `tagIds`。
- i18n：搜索框占位、「新建『{{name}}』」、无结果文案（zh / en）。

## Acceptance

- 在任务的展开行、右键菜单，以及 Project 菜单、Area 菜单里都能搜索并切换 Tag。
- 输入一个新名字回车，Tag 被创建并打上，Tags 页能看到它。
- 输入与已有 Tag 同名（大小写不同）时，不出现新建项。
- 组件测试：搜索、键盘切换、即时新建、分组显示。

## Comments

### 2026-10-01 — 实现

- 核心组件 `TagPicker`（`stateOf` + `onToggle`），行的推导放在纯函数 `tagPickerOptions.ts`（`buildTagPickerRows`）。`TagsField` 保留名字，改为单对象适配器，所以五个入口不用改调用方式；顺带去掉了 `AreaMoreMenu` 的两处 `as unknown as`。
- 即时新建走 `useCreateTag().mutate`，成功后清空输入并把新 id 打上。新建的 Tag 不进 Group，颜色为默认值。
- `task:noTagsHint` 已无引用，删除；新增 `tag:pickerPlaceholder` / `tag:pickerEmpty` / `tag:createNamed`（zh / en）。
- 测试：纯函数 7 个、组件 3 个；`ProjectMetaRow.test.tsx` 按新的 option 角色更新。
- 未做：没有在真实 App 里目视验收。
