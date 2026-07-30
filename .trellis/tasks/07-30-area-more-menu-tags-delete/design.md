# Design — 区域详情页更多菜单：删除与标签能力

## 架构决策

Area 标签采用与 Project 完全对称的独立 join 表方案（`AreaTag`），不借用 ProjectTag，因为：
- 语义清晰：Area 和 Project 是独立实体，标签关联应独立。
- FK 级联正确：Tag 删除时各自级联清理，互不影响。
- 与现有代码模式一致，降低认知负担。

## 后端改动

### 1. Schema (`packages/backend/prisma/schema.prisma`)

```prisma
model Area {
  ...existing...
  tags AreaTag[]
}

model AreaTag {
  id        String   @id @default(uuid())
  areaId    String
  area      Area     @relation(fields: [areaId], references: [id], onDelete: Cascade)
  tagId     String
  tag       Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([areaId, tagId])
  @@index([areaId])
  @@index([tagId])
}

model Tag {
  ...existing...
  tasks      TaskTag[]
  projects   ProjectTag[]
  areas      AreaTag[]   // ← 新增
}
```

### 2. Service (`packages/backend/src/areas/areas.service.ts`)

仿 `projects.service.ts`:

- `create`: `data: { ..., tags: dto.tagIds?.length ? { create: dto.tagIds.map(id => ({ tagId: id })) } : {} }`, `include: { tags: { include: { tag: true } } }`, return `{ ...created, tags: created.tags.map(at => at.tag) }`。
- `findAll` / `findOne`: 加 `include: { tags: { include: { tag: true } } }`, map 同上。
- `update`: `tagIds !== undefined` 时 `$transaction([deleteMany, createMany?])` 全量 set；其他字段逻辑不变；最后 `update` 带 `include` 返回 map 后的 tags。
- `remove` / `reorder`: 不变（AreaTag 通过 `onDelete: Cascade` 自动随 Area 删除清理）。

### 3. DTO

**Shared** (`packages/shared/src/dtos/area.dto.ts`):
- `CreateAreaDto` 加 `tagIds?: string[]`
- `UpdateAreaDto` 加 `tagIds?: string[]`
- `AreaResponseDto` 加 `tags?: TagResponseDto[]`（需 import `TagResponseDto`）

**Backend** (`packages/backend/src/areas/dto/areas.dto.ts`):
- `CreateAreaDto` 加 `@IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[]`
- `UpdateAreaDto` 同上

## 前端改动

### 1. `AreaMoreMenu` 组件

位置：`packages/frontend/src/components/area/AreaMoreMenu.tsx`（新建 `area/` 目录）

结构仿 `ProjectMoreMenu`（`ProjectContextMenu.tsx` 中导出），但菜单只有两项：
- 标签 → 打开 `TagsField` picker
- 删除 → `text-destructive`

差异点：
- `AreaMoreMenu` 自包含删除逻辑（调 `useDeleteArea` + 成功后 `navigate('/today')`），不像 ProjectMoreMenu 需要外部 `project`/`current` props 区分。
- 属性：`area: AreaResponseDto`（single source of truth，updateArea mutate with tagIds）。
- 用 `useUpdateArea` 的 `mutate({ id, data: { tagIds } })` 更新标签。

### 2. `AreaDetail.tsx`

标题行 `<div className="flex items-center justify-between">` 的右侧（目前是空 `</div>`）插入：
```tsx
{area && <AreaMoreMenu area={area} />}
```

### 3. TagsField 兼容性

`TagsField` 当前 prop 类型是 `current: TaskResponseDto`，但实际只用 `current.tags`。Project 的 `PickerContent` 用了 `as unknown as` 强转。Area 同样需要强转（`area as unknown as ...`）。这是现有模式，保持一致。

## 数据流

```
AreaMoreMenu
 ├─ MoreHorizontal 按钮 → Popover (ProjectMenuPanel 样式)
 │   ├─ 标签按钮 → setActivePicker('tags') → Popover (TagsField)
 │   │    └─ TagsField onPatch → updateArea.mutate({ id, data: { tagIds } })
 │   └─ 删除按钮 → deleteArea.mutate(id) → navigate('/today')
```

## 风险与缓解

- **TagsField 类型强转**：现有代码已经这样处理 Project，Area 跟随，不改 TagsField 签名（避免波及 Task 使用方）。
- **migration 命名**：用 `AreaTag` 描述性名，避免日期前缀冲突。
- **删除后导航**：用 react-router `useNavigate`，目标 `/today`（安全默认页，非空态）。

## 不改动

- `SidebarAreaRow`（侧边栏区域条目）
- `AreaTag` 不暴露独立 CRUD 端点（只通过 Area 的 `tagIds` 操作，与 ProjectTag 一致）
- `feed.service.ts`（Area 标签不进 feed 逻辑）
