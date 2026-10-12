# 04: 区域页稍后任务并入计划 / 某天小节 + 隐藏按钮

Status: done
Blocked by: 01, 03

## 内容

- `AreaDetail.tsx`：「任务」段只放直属非稍后任务。
- `LaterProjectSections` 扩展为 `LaterItemSections`，项目与任务混排（Later Projects 页继续只传项目）：
  - 计划：按计划日期升序，同日按 Position / Feed Position（同 Upcoming）；不可节内排序。
  - 某天：排序与拖拽同 Someday 视图（任务 Position 与项目 Feed Position 混排）。
- 小节之后放 `LaterItemsToggle`；`hideLaterItems` 为 true 时两个小节整块不渲染，N = 稍后项目 + 直属稍后任务。
- 键盘遍历：活跃项目 → 任务 → 计划 → 某天。

## 验收标准

- [x] 直属 Someday / 未来任务出现在对应小节、不在「任务」段
- [x] 计划按日期混排、某天顺序同 Someday 视图且可拖拽
- [x] 隐藏后两节消失，按钮计数正确
- [x] Later Projects 页行为不变

## Comments

- 2026-10-12：完成。新组件 `LaterItemSections`（区域页专用；Later Projects 页仍用 `LaterProjectSections`，某天节继续按侧边栏 Position 排）：计划节按日期、同日按 feed 键，行只能拖到侧边栏；某天节复用 `GroupedFeedListView`（平铺，新增 `selectionRank` / `magicPlus` / `hideOwnership` 选项），拖拽写 feed 顺序（`useReorderFeed`），与 Someday 视图一致——区域页某天项目的拖拽不再改侧边栏顺序（测试随之更新）。`feedItems.ts` 抽出 DTO → FeedItem（TagDetail 共用）。测试 `pages/AreaDetail.test.tsx`。网页版实测：Work 区域「任务」段只剩可做任务；计划节为 11/5 任务；某天节为某天项目 + 某天任务；隐藏后两节消失、按钮「显示 3 个稍后项」，再点恢复，无页面错误。
