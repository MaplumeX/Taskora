# 05: Quick Find / Move 选择器的稍后项开关

Status: done
Blocked by: 01, 02, 03

## 内容

- Quick Find 结果末尾放 `LaterItemsToggle`，状态存 `hideLaterItemsInQuickFind`；隐藏时去掉稍后项目、稍后任务、稍后项目内的任务。
- Move 选择器同理，状态存 `hideLaterItemsInMovePicker`；隐藏时去掉稍后项目（显示时保持现有弱化样式）。
- 从 Quick Find 打开的目标在其项目 / 区域里被隐藏时（`hideLaterItems = true` 且是稍后项），先把该列表 `hideLaterItems` 写回 false 再导航定位。

## 验收标准

- [x] 两处开关各自持久化，互不影响
- [x] 隐藏范围正确
- [x] 从 Quick Find 打开被隐藏条目，目标列表切回显示并定位到它

## Comments

- 2026-10-12：完成。偏好开关 `useHideLaterItemsPreference`（api，乐观更新 + 写回 + 失败回滚，不依赖 QueryClient，弹窗里随处可用）。Move：`MovePickerList` 新增 `footer`，`useHiddenLaterTargets` 供任务与 Heading 的移动选择器共用，隐藏时保留当前所在位置。Quick Find：`withoutLaterItems` / `isLaterQuickFindItem`（稍后项目、其 Heading、稍后任务、稍后项目内的任务）；打开在项目 / 区域页被隐藏的稍后任务时先 `updateProject` / `updateArea` 切回显示（只在 Quick Find 做，Reveal 本身不依赖 QueryClient）。网页版实测：搜「任务」6 个结果，隐藏后剩 1 条、按钮「显示 4 个稍后项」；项目设为隐藏后从 Quick Find 打开其 Someday 任务，项目页切回显示并展开该任务。
- 2026-10-12：按用户要求去掉 Quick Find 的显隐稍后项开关（按钮、过滤、`hideLaterItemsInQuickFind` 偏好、面板内 ⇧⌘E）。保留：从 Quick Find 打开在项目 / 区域页被隐藏的稍后任务时，先把该页切回显示。
