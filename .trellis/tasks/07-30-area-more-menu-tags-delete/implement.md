# Implement — 区域详情页更多菜单：删除与标签能力

## 执行清单（有序）

### Phase A: 后端 Area 标签能力

1. **Schema 改动** — `packages/backend/prisma/schema.prisma`
   - `model Area` 加 `tags AreaTag[]`
   - 新增 `model AreaTag`（见 design.md）
   - `model Tag` 加 `areas AreaTag[]`

2. **Migration** — `npx prisma migrate dev --name add_area_tags`（在 `packages/backend` 目录下执行）

3. **Shared DTO** — `packages/shared/src/dtos/area.dto.ts`
   - import `TagResponseDto`
   - `CreateAreaDto` / `UpdateAreaDto` 加 `tagIds?: string[]`
   - `AreaResponseDto` 加 `tags?: TagResponseDto[]`

4. **Backend DTO** — `packages/backend/src/areas/dto/areas.dto.ts`
   - `CreateAreaDto` / `UpdateAreaDto` 加 `tagIds`（`@IsOptional @IsArray @IsString({ each: true })`）

5. **Service** — `packages/backend/src/areas/areas.service.ts`
   - `create`: 加 tagIds 关联 + include + map
   - `findAll`: 加 include + map
   - `findOne`: 加 include + map
   - `update`: 加 tagIds 全量 set 逻辑（transaction: deleteMany + createMany?）+ include + map
   - `remove` / `reorder` 不变

6. **生成 shared 产物** — 根目录 `pnpm --filter @taskora/shared build`（让 backend/frontend 能 import 新类型）

7. **验证后端** — `cd packages/backend && npx prisma generate && pnpm test`（确认 areas.service.spec / areas.controller.e2e-spec 通过）

### Phase B: 前端 AreaMoreMenu

8. **新组件** — `packages/frontend/src/components/area/AreaMoreMenu.tsx`
   - 仿 `ProjectMoreMenu` 结构（popover + picker 二级）
   - 菜单：标签 + 删除（destructive）
   - props: `{ area: AreaResponseDto }`
   - `useUpdateArea` 处理标签
   - `useDeleteArea` + `useNavigate('/today')` 处理删除

9. **AreaDetail 集成** — `packages/frontend/src/pages/AreaDetail.tsx`
   - import `AreaMoreMenu`
   - 标题行右侧 `{area && <AreaMoreMenu area={area} />}`

### Phase C: 验证

10. **前端类型检查 + 构建** — `pnpm --filter @taskora/frontend typecheck`（或 build）
11. **全量测试** — `pnpm test`（backend + frontend）
12. **手动验证**（可选，交付时说明）：
    - 区域详情页看到更多按钮
    - 标签 picker 勾选/取消持久化
    - 删除后跳转 `/today`

## 回滚点

- Schema/migration：`prisma migrate resolve --rolled-back <name>` + 恢复 schema.prisma
- DTO/service：git revert 对应文件
- 前端：删除 `AreaMoreMenu.tsx` + 还原 `AreaDetail.tsx`

## 验证命令

```bash
# 后端
cd packages/backend && npx prisma generate && pnpm test

# shared
pnpm --filter @taskora/shared build

# 前端
pnpm --filter @taskora/frontend build
```
