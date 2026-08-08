# Design: Project Progress Ring Checkbox

## 边界与契约

### Shared DTO 变更 (`packages/shared/src/dtos/`)

**`project.dto.ts`** — `ProjectResponseDto` 追加：

```ts
taskTotalCount: number;
taskCompletedCount: number;
```

**`feed.dto.ts`** — `ProjectFeedItem` 追加同样两个字段（`FeedItemBase` 不动，因 task 不需要）。

### 后端数据流

统计口径：`projectId = X AND trashedAt = null` 的所有 task，其中 `status = COMPLETED` 计入 completed。

#### ProjectsService

`findAll(userId)` 与 `findOne(userId, id)` 都需携带统计。采用**批量 groupBy** 避免 N+1：

```ts
// findAll: 一次查所有项目 + 一次 groupBy 拿所有项目的 task 计数
const projects = await this.prisma.project.findMany({ ... });

const counts = await this.prisma.task.groupBy({
  by: ['projectId'],
  where: {
    userId,
    projectId: { in: projectIds },
    trashedAt: null,
  },
  _count: { _all: true },
  // 无法在单次 groupBy 同时区分 completed/total，需两次或用条件
});
```

实际上 Prisma `groupBy` 不能在单查询里同时输出"总数"和"completed 数"。两个可行方案：

- **方案 A（两次 groupBy）**：一次按 `projectId` 计总数，一次加 `status: COMPLETED` 条件计完成数。两次查询都按 `projectId` 分组，前端组装。简单、无 N+1。
- **方案 B（单次 raw SQL）**：用 `$queryRaw` 一次 `SELECT projectId, COUNT(*) FILTER (WHERE status='COMPLETED'), COUNT(*) FROM task ...`。性能最优但引入 raw SQL。

**选方案 A**：与现有代码风格一致（纯 Prisma），两次 groupBy 在 task 表有 `projectId` 索引，性能可接受。

`findOne` 对单个项目，用 `aggregate` 两次或 `groupBy` 单项目即可。

返回值映射：

```ts
return projects.map((p) => ({
  ...p,
  tags: p.tags.map((pt) => pt.tag),
  taskTotalCount: countMap.get(p.id)?.total ?? 0,
  taskCompletedCount: countMap.get(p.id)?.completed ?? 0,
}));
```

#### FeedService

`findAll` 中 project 查询已用 `findMany`，需对返回的 projects 做同样的批量统计注入。因 feed 中 project 数量通常不大，同样两次 groupBy。注意 feed 的 view where 可能已过滤部分项目，但统计口径是"项目下所有非 trashed task"，与 task 自身的 view 无关——**统计不应受 feed view 过滤影响**，只受 `trashedAt = null` 约束。

### 前端组件设计

#### `ProjectProgressRing` 组件

位置：`packages/frontend/src/components/project/ProjectProgressRing.tsx`

```tsx
interface Props {
  total: number;
  completed: number;
  projectStatus: ProjectStatus;
  onToggle: () => void;
  disabled?: boolean;
}
```

渲染：SVG 环形 + 可选中心勾。尺寸 18×18，环宽 2。

- `projectStatus === COMPLETED` 或 `completed === total && total > 0` → 满环 + 勾 + primary 实心
- `total === 0` → 空环（muted 描边）
- 否则 → 环按 `completed/total` 比例填充，剩余为 muted 描边

SVG 结构（stroke-dasharray 实现进度环）：

```tsx
<svg viewBox="0 0 18 18" className="h-[18px] w-[18px]">
  <circle cx=9 cy=9 r=7 fill=none stroke="muted track" strokeWidth=2 />
  <circle cx=9 cy=9 r=7 fill=none stroke="primary" strokeWidth=2
    strokeDasharray={2*π*7}
    strokeDashoffset={2*π*7 * (1 - ratio)}
    transform="rotate(-90 9 9)" strokeLinecap="round" />
  {isDone && <Check .../>}  // 中心勾，绝对定位或 SVG text
</svg>
```

点击行为：`button` 包裹，`onClick` stopPropagation 后调用 `onToggle`（完成/恢复）。与 `TaskCheckbox` 的 stopPropagation 模式一致，避免触发外层导航。

#### `ProjectItem.tsx` 改动

- 移除 `Folder` import
- 用 `ProjectProgressRing` 替换 `<Folder>` 元素
- `onToggle` 调用 `useCompleteProject` / `useUncompleteProject`（需在组件内引入 hook）
- 已完成态文字置灰删除线（当前 `ProjectItem` 未做，需补：`project.status === COMPLETED` 时加 line-through + muted-foreground）
- `taskCount` prop 保留（仍可显示总数于右侧），但现在环形已表达进度，可考虑移除右侧数字——**决定：保留**，因为它显示绝对数量，与环形互补

#### `ProjectFeedRow.tsx` 改动

- 移除 `Folder` import
- 用 `ProjectProgressRing` 替换 `<Folder>`
- `onToggle` 调用 `useCompleteProject` / `useUncompleteProject`
- 已完成态的置灰删除线逻辑已存在，保留
- `item` 是 `ProjectFeedItem`，含新字段；需 cast 回 `ProjectResponseDto` 给 contextMenu 的现有逻辑不动

#### Hook 乐观更新

`useCompleteProject` / `useUncompleteProject` 的 `onMutate` 已更新 `status` 和 `completedAt`。新字段 `taskTotalCount` / `taskCompletedCount` 不需在乐观更新里改动（完成项目不改变任务计数）。`onSettled` 会 invalidate `['projects']` 和 `['feed']`，保证最终一致。

### 兼容性

- DTO 新增字段为**非空 number**，前端旧代码若未读取则无影响。但前端所有渲染 `ProjectResponseDto` 的地方必须能接受新字段（TS 类型来自 shared，编译时统一）。
- 无数据库 schema 变更，无迁移。
- 无新 API 端点。

## 权衡

- 两次 groupBy vs raw SQL：选两次 groupBy 换取代码风格一致性；若后续 project 列表性能成瓶颈可改 raw。
- 环形用 SVG 而非 CSS conic-gradient：SVG 更易做圆角端点（`strokeLinecap: round`）和中心勾叠加。
- `ProjectItem` 已有的 `taskCount` 右侧数字保留：避免信息冗余移除可能影响既有用户认知。

## 回滚

- 纯前端：恢复 `Folder` import，移除 `ProjectProgressRing` 使用即可。
- 后端：DTO 字段可保留（多余字段无害），或移除统计注入逻辑。
- 无 schema/migration，回滚零数据库成本。