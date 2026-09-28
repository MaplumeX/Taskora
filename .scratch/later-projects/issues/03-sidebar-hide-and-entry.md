# 03: 侧边栏隐藏稍后项目 +「N 个稍后项目」入口

Status: done
Blocked by: 01, 02

## 内容

改 `Sidebar.tsx` / `SidebarProjectSection.tsx` / `sidebarProjectLayout.ts`（`Home.tsx` 复用同一组件，窄屏首页同步生效）：

- 渲染层过滤掉所有稍后项目（有区域的也不显示）。
- 无区域稍后项目数 N ≥ 1 时，在 standalone 容器的 `SortableContext` **之外**、紧接其后渲染一行「N 个稍后项目」：不可拖、不进 containers、拖拽落点到不了它后面；muted 次要样式；点击导航到 `/later-projects`，该路由下显示选中态。
- **全量排序序列化**：`ProjectsService.reorder` 按传入下标重写 sortOrder，只传可见项目会撞号。`serializeProjectOrder` 改为：以拖拽前全量顺序为底，可见项目按新顺序填回可见槽位，隐藏项目（稍后项目、已过滤的已完成项目）原槽位不动。
- 跨容器拖到 Area 只改 `areaId`（现状如此，加测试锁住）。

## 验收标准

- [x] `sidebarProjectLayout.test.ts`：过滤稍后项目；全量序列化保持隐藏项槽位；N 只计无区域稍后项目
- [x] `SidebarProjectSection.test.tsx`：入口 N ≥ 1 才出现、位于无区域列表末尾、不可拖、点击导航；拖到 Area 只发 `areaId`
- [ ] 未来日期项目在账号时区跨过其日期后回到侧边栏（依赖判定函数的时区单测 + `useLaterProjectKind` 随 `useCalendarDay` 跨天换引用；无组件级跨天测试）

## Comments

- 2026-09-28：完成。`SidebarProjectSection` 改为接收全部项目、内部过滤已完成与稍后项目；入口 `LaterProjectsEntry` 渲染在 standalone 容器之外。新增 `mergeVisibleProjectOrder` 全量序列化（顺带修复已完成项目被过滤后与可见项目撞号）。
