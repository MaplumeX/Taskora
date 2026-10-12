# 03: LaterItemsToggle 按钮 + 项目页

Status: done
Blocked by: 01, 02

## 内容

- 共享组件 `LaterItemsToggle`：muted 次要行，「隐藏稍后项」/「显示 N 个稍后项」（i18n zh / en）；N = 0 不渲染；不是 Selection 停留点、不可拖、不是落点。
- `ProjectDetail.tsx`：任务列表最后放按钮；`hideLaterItems` 为 true 时滤掉稍后任务（Tag 过滤之后计数），Heading 一律保留。
- 隐藏状态下拖拽排序：落点换算到全量顺序，隐藏任务 Position 不变。
- Expanded Linger：展开中的任务改成稍后任务后暂留，收起后才隐藏。
- 桌面 / Web / 手机三端一致。

## 验收标准

- [x] 有稍后任务才出现按钮，点按切换并持久化
- [x] 隐藏后稍后任务不渲染、Heading 保留、N 正确（含 Tag 过滤）
- [x] 隐藏状态下拖拽，隐藏任务 Position 不变
- [x] 展开中改为 Someday 暂留

## Comments

- 2026-10-12：完成。`components/common/LaterItemsToggle.tsx`；`ProjectTaskLayout` 新增 `hiddenTaskIds`：只把可见任务交给布局，写回时 `mergeHiddenTasks` 把隐藏任务按原槽位合并（布局写回必须包含全部任务，见 `planHeadingLayout`），Heading 照常显示、拖拽照常可用。展开暂留沿用 `useLingeringExpanded`（隐藏过滤在它之前）。测试 `ProjectTaskLayout.test.tsx`。网页版实测（独立 Postgres + 后端 3106 + vite 5179）：项目里一条 Someday、一条 10/20 任务，点「隐藏稍后项」后两条消失、按钮为「显示 2 个稍后项」，刷新后保留，再点恢复，无页面错误。
