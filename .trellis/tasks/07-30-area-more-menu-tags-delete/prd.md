# 区域详情页更多菜单：删除与标签能力

## Goal

在区域详情页（`/areas/:id`）标题行右侧添加「更多」菜单按钮（`MoreHorizontal` 图标），弹出菜单提供「标签」和「删除」两个操作，与项目详情页的 `ProjectMoreMenu` 体验一致。同时为 Area 后端模型新增标签能力（新增 `AreaTag` join 表 + DTO 字段 + service 同步）。

## Background

- 项目已支持标签：`ProjectTag` join 表 + `tagIds` 全量 set 语义（create 时关联，update 时先删后建）。
- 区域当前无标签能力：`AreaResponseDto` / `CreateAreaDto` / `UpdateAreaDto` 均无 `tags`/`tagIds` 字段，schema 无 `AreaTag` 表。
- 区域删除已可用（`Task.areaId`/`Project.areaId` 都是 `onDelete: SetNull`），`useDeleteArea` hook 已存在，但详情页标题行无删除入口。
- spec frontend/component-guidelines.md 明确：「区域详情页暂无此按钮」（指更多菜单）。

## Requirements

### 后端
- 新增 `model AreaTag` join 表：`id`、`areaId`、`tagId`、`createdAt`，`@@unique([areaId, tagId])`，索引 `@@index([areaId])` / `@@index([tagId])`。
- `Area` 模型加 `tags AreaTag[]`；`Tag` 模型加 `areas AreaTag[]`。
- 生成并应用 Prisma migration。
- `areas.service.ts`：`create`/`findAll`/`findOne`/`update` 同步 `tags` 关联（include + map，返回 `TagResponseDto[]`）；`update` 用全量 set 语义（`tagIds` 传 undefined 不动；传数组则先删旧再建新）。
- `areas.dto.ts`（后端 + shared）：`CreateAreaDto`/`UpdateAreaDto` 加 `tagIds?: string[]`；`AreaResponseDto` 加 `tags?: TagResponseDto[]`。
- `Tag` 删除时联动清理 `AreaTag`（`onDelete: Cascade`，与 `ProjectTag` 一致）。

### 前端
- `AreaDetail.tsx` 标题行右侧添加 `AreaMoreMenu` 组件（`MoreHorizontal` 图标按钮）。
- 菜单内容：标签（打开 `TagsField` picker）+ 删除（`text-destructive`）。
- 标签 picker 复用 `TagsField` 组件（与 `ProjectMoreMenu` 相同的 popover 二级面板机制）。
- 删除调用 `useDeleteArea`，成功后导航到 `/today`（区域已不存在，不能停留在详情页）。
- `AreaTag` 类型由 Prisma 生成，前端通过 shared DTO 消费 `tags`。

### i18n
- 复用现有 `common:more`、`common:delete`、`common:deleteFailed`、`task:tags`、`task:noTagsHint` key（均已在 ProjectMoreMenu 中使用，无需新增）。

## Constraints

- 删除区域后必须离开当前详情页路由（区域已删除，详情页会 404/空态）。
- 标签关联的 `tagIds` 必须是当前用户拥有的 tag（Prisma FK 约束会拦截无效 tagId，service 不做额外校验，与 Project 一致）。
- 不改动区域的其他字段（title/notes/sortOrder 行为不变）。
- 不改动侧边栏区域条目（`SidebarAreaRow`）—— 本次只改详情页。

## Acceptance Criteria

- [ ] 访问任意区域详情页（`/areas/:id`），标题行右侧可见「更多」按钮（MoreHorizontal 图标）。
- [ ] 点击「更多」→ 弹出菜单含「标签」和「删除」两项，删除项为红色 destructive 文案。
- [ ] 点击「标签」→ 弹出标签选择面板，可勾选/取消标签，勾选状态与区域当前标签一致；操作后区域标签持久化（刷新仍保留）。
- [ ] 点击「删除」→ 区域被删除，页面跳转到 `/today`。
- [ ] 标签删除（在标签管理处删除一个 tag）后，关联该 tag 的区域的 `AreaTag` 记录联动清除。
- [ ] 后端：`POST /areas` 支持 `tagIds`；`PATCH /areas/:id` 支持 `tagIds` 全量 set 语义；`GET /areas` / `GET /areas/:id` 返回 `tags` 数组。
- [ ] Prisma migration 可正常 `prisma migrate dev` 并通过现有测试（`areas.service.spec.ts` / `areas.controller.e2e-spec.ts`）。
- [ ] 不影响项目标签功能、侧边栏区域拖拽、区域标题内联编辑等已有行为。
