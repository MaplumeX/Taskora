# 02 接口层：REST、DTO、hooks、助手工具、Quick Add 跟上 parentId

Status: implemented
Blocked by: 01

## Problem

`tag-groups` 模块、`TagGroupResponseDto`、`useTagGroups` 等仍然以 Group 为模型，01 之后都要随之改掉。

## Design

见 spec「其他接触面」。

- backend：删除 `tag-groups` 模块；`tags` 的 DTO 加 `parentId`，在 service 里拒绝成环（400）；`POST /tags/reorder` 支持改 `parentId`；`feed.service.ts`、`users.service.ts` 的导出跟上。
- shared：删除 Group 相关 DTO；`TagResponseDto.parentId`；`event.dto.ts` 去掉 tag-group。
- api：删除 Group 相关的 api / backend / hook；`useReorderTags` 支持改父；`event-applier` 和 `cache-patches` 跟上。
- 助手工具：`agent-tools.ts` 的列出 / 创建 / 更新 Tag 改为 `parentId`。
- Quick Add：桌面 relay 协议和 Android 快照去掉 `tagGroups`，Tag 按树序排列并带层级。
- 这一步 UI 只做到能编译、能运行：原来按 Group 渲染的地方临时按顶层 Tag 渲染，正式的树形 UI 在 03 / 04 做。

## Acceptance

- 全仓 `tagGroup` / `TagGroup` / `tag-group` 只剩迁移文件和迁移测试还在引用。
- 助手能创建子 Tag，也能把 Tag 移到另一个 Tag 下。

## Comments

### 2026-10-06 — 实现

- 与 01 同一批完成（删掉实体后各端必须一起改才能编译）。
- backend：删除 `tag-groups` 模块；`TagsService.assertParent` 拒绝不存在的父 Tag（404）和成环（400）；`users` 导出去掉 `tagGroups`；`feed` 的 Tag DTO 带 `parentId`。
- shared：删除 `tag-group.dto.ts`，`TagResponseDto.parentId`，事件实体去掉 `tag-group`。
- api：删除 Group 的 api / backend / hook；Engine 的 Tag 后端同样校验父 Tag 与成环；缓存失效表、事件应用器、`useAgent` 跟上；导出 `buildTagTree`。
- 助手工具：`list_tags` 带 `parentId`；`create_tag` 接受 `parentId`；新增 `update_tag`（改名、改色、改父，非破坏性）。
- Quick Add：桌面 relay 快照去掉 `tagGroups`；Android 快照的 Tag 行带 `depth`，不再产出 header 行，原生按层级缩进（旧快照里的 header 行解析时跳过，快照版本不变）。**Kotlin 未编译验证。**
- 与 spec 的差异：`POST /tags/reorder` 没有加 `parentId`，改层级走 `updateTag` + reorder（见 spec）。
