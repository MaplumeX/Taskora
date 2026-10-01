# 07 Tags 管理页：拖拽排序、直接改名、撤销删除

Status: implemented — awaiting visual acceptance

## Problem

`Tags.tsx` 新建和编辑都要走对话框，删除用 `window.confirm`，不能排序（schema 有 `position`，但 `UpdateTagDto` 和 UI 都没有用上），改 Group 要在下拉框里选，非空 Group 不能删除。

## Design

见 spec 第 6 节。

- 数据：`UpdateTagDto` / `UpdateTagGroupDto` 支持 `position`，参照 Project / Area 的 fractional indexing 重排写法（ADR 0007），两个后端（REST、engine）都要支持。确认 TagGroup 是否需要补 `position` 字段（目前只有 `sortOrder`）；需要的话加 migration。
- 页面改为大纲：Group 是小节，Tag 是行；同组拖拽改顺序，跨组拖拽改 `tagGroupId` 和 `position`；Group 本身可拖拽。拖拽实现复用项目里现有的拖拽方案（参照 #131 的 feed 行拖拽）。
- 双击（触控端长按）直接改名，`Enter` 保存，`Esc` 放弃；点色点弹出色板（保留 `PRESET_COLORS` 和自定义 hex 输入）。
- 新建：Group 小节末尾的「＋」直接插入一行可编辑的 Tag；页头保留「新建 Group」。
- 删除：toast 加撤销（撤销时重建 Tag 并恢复它在各对象上的关联，或者延迟提交删除，二选一，实现时决定并在 Comments 中记录）。允许删除非空 Group，其下的 Tag 变为无分组。

## Acceptance

- 拖拽后刷新页面顺序保持，Tag Picker 和过滤栏的顺序随之变化。
- 跨组拖拽后 Tag 的 Group 改变。
- 直接改名、改色不弹对话框。
- 删除后点撤销，Tag 及其在 Task / Project / Area 上的关联恢复。

## Comments

### 2026-10-01 — 实现

- 数据：新增 `reorderTags` / `reorderTagGroups`，两个后端都已支持（REST `POST /tags/reorder`、`POST /tag-groups/reorder`）。
  - Tag：Engine 用 `repositionMinimal` 写 `position`（Tag 在副本里按 position 排序），hub 写 `orderFields`（sortOrder + 合成 Position），与 Project 一致。hub 的 `GET /tags` 改为按有效 Position 排序，和副本同一口径。
  - TagGroup：只写 `sortOrder`，与 Area 一致。副本里 TagGroup 本来就按 sortOrder 排，**不需要加 position 字段，也没有 migration**。
  - Hooks：`useReorderTags`、`useReorderTagGroups`（乐观排序缓存）。
- 页面改为大纲：纯函数 `components/tags/tagsLayout.ts` 生成扁平行（Group 小标题 + 成员，最后是固定的「未分组」），`resolveTagsDrop` 把落点换算成「改 Group + 全量 Tag 顺序」或「Group 顺序」。拖拽用行首把手（触控长按 300ms）。
- 点名称直接改名（单击，比双击在触控端更顺手），点色点弹出色板加 hex 输入；Group 小标题上的「＋」在该组末尾插入可编辑的新行，页头的两个按钮分别新建未分组 Tag 和 Group。原来的对话框全部去掉。
- 删除：**延迟提交**。先在页面上隐藏，toast 带「撤销」；toast 自动或手动关闭时才真正删除。这样撤销不需要重建 Tag 和恢复关联。代价是删除在 toast 关闭前（约 4 秒）不会同步到其它页面和设备。非空 Group 也可以删除，其中的 Tag 在等待期间就显示到「未分组」。
- 每个 Tag 行末尾加了指向 Tag 详情页的链接（之前管理页没有入口）。
- 测试：drop 纯函数 7 个、页面 4 个、Engine 重排 1 个、hub e2e 1 个（真实 Postgres）。
