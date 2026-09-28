# 04: 区域页按活跃 / 计划 / Someday 分组项目

Status: done
Blocked by: 02, 03

## 内容

`packages/ui/src/pages/AreaDetail.tsx`：

- 「项目」列表只放该区域的活跃项目，保留拖拽排序；排序持久化改用 03 的全量序列化，避免与隐藏项目撞号。
- 页面最下方（活跃项目、任务之后）渲染 `LaterProjectSections`（该区域的稍后项目）。
- 「任务」段不改。

## 验收标准

- [x] 活跃项目 / 计划 / Someday 三段显示正确，空的稍后小节不显示
- [x] 活跃项目拖拽后，稍后项目的相对顺序不变
- [x] 键盘 Selection 可顺序遍历三段项目行

## Comments

- 2026-09-28：完成。区域页活跃项目拖拽也改用 `mergeVisibleProjectOrder`（原先只传本区域项目，会与其他区域撞号）。测试 `pages/AreaDetail.test.tsx`。
- 2026-09-28：网页版实测：区域页 项目（季度报告）→ 计划（10月20日 团队建设）→ 将来（新产品调研），↑/↓ 按此顺序遍历；侧边栏区域下只剩活跃项目。
- 2026-09-28：按用户要求把稍后项目移到任务之后（页面最下方）。原先键盘遍历顺序取决于各列表挂载时机（子组件 effect 先注册、异步列表后注册），为此 `useSelectionScope` / selection store 新增显式 rank：活跃项目 0 → 任务 1 → 稍后项目 2；`TaskListView` 新增 `selectionRank` prop。网页版实测 ↓ 依次为 季度报告 → 回复客户邮件 → 团队建设 → 新产品调研。
