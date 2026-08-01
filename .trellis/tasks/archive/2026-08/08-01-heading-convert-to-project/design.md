# Heading 转换为项目 — 技术设计

## 1. 边界与契约

| 项 | 决策 |
|---|---|
| 后端端点 | `POST /project-headings/:id/convert-to-project`（对齐 `POST /tasks/:id/convert-to-project`） |
| Service | `ProjectHeadingsService.convertToProject(userId, id)` |
| 返回 | `ProjectResponseDto`（`{ ...newProject, tags: [] }`，对齐任务转换的返回形状） |
| 前端入口 | `ProjectHeadingRow` 的"⋯"菜单，位于"删除"项之前 |
| 前端 hook | `useProjectHeadings.ts` 新增 `useConvertProjectHeadingToProject(projectId)` |
| i18n | `project.json`（zh/en）新增 `convertToProject` / `convertSuccess` / `convertFailed` |

## 2. 后端实现

### 2.1 路由

`project-headings.controller.ts` 新增：

```ts
@Post(':id/convert-to-project')
convertToProject(@Request() req: { user: { id: string } }, @Param('id') id: string) {
  return this.headingsService.convertToProject(req.user.id, id);
}
```

注意 `@Post('reorder')` 已存在，`:id` 动态段不会与静态段冲突（Nest 静态优先）。

### 2.2 Service 事务

```ts
async convertToProject(userId: string, id: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. 校验 Heading 归属，取原项目 areaId
    const heading = await tx.projectHeading.findFirst({
      where: { id, userId },
      include: { project: { select: { areaId: true } } },
    });
    if (!heading) throw new NotFoundException('Heading not found');

    // 2. 校验所属项目（未软删除）—— 复用现有 assertProjectOwnership
    await this.assertProjectOwnership(userId, heading.projectId, tx);

    // 3. 新项目 sortOrder = 用户全部项目末尾
    const maxSort = await tx.project.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    // 4. 创建新项目：title = Heading 标题，areaId 继承，tags 为空，其余默认
    const newProject = await tx.project.create({
      data: {
        title: heading.title,
        areaId: heading.project.areaId ?? null,
        sortOrder: nextSortOrder,
        userId,
      },
    });

    // 5. 迁移 Heading 下全部任务（含已软删除的）；保留 bucket/sortOrder/status/日期等字段
    await tx.task.updateMany({
      where: { userId, headingId: id },
      data: { projectId: newProject.id, headingId: null },
    });

    // 6. 删除原 Heading
    const deleted = await tx.projectHeading.deleteMany({
      where: { id, userId, projectId: heading.projectId },
    });
    if (deleted.count !== 1) {
      throw new BadRequestException('Heading changed; refresh and retry');
    }

    return { ...newProject, tags: [] };
  });
}
```

### 2.3 设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 任务迁移范围 | `headingId = id` 的全部任务（含 trashed） | 转换语义是"整个分组变成项目"，避免残留悬空引用；与删除 Heading 处理全部直接任务一致 |
| 任务字段 | 仅改 `projectId` + `headingId`，其余不动 | 是"搬家"而非"提升"；Subtask 靠 `taskId` 关联父任务，层级/顺序自动保留 |
| 新项目 tags | 空数组 | Heading 无标签来源；任务转换的"继承标签"语义在此无对象 |
| 新项目 bucket/status | 默认 `INBOX` / `ACTIVE` | 与任务转换一致（转换产生的是全新项目） |
| 空 Heading | 允许转换 → 创建空项目 | 空 Heading 本就允许存在 |
| 失败语义 | 事务整体回滚 | 无部分迁移 |
| 并发防护 | `deleteMany` 返回 `count !== 1` → BadRequest | 对齐现有 update/remove 的乐观校验模式 |

## 3. 前端实现

### 3.1 API 函数（`lib/api/project-headings.api.ts`）

```ts
export function convertProjectHeadingToProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/project-headings/${id}/convert-to-project`)
    .then((response) => response.data);
}
```

### 3.2 Hook（`lib/hooks/useProjectHeadings.ts`）

```ts
export function useConvertProjectHeadingToProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => convertProjectHeadingToProject(id),
    onSuccess: () => {
      invalidateProjectData(queryClient, projectId); // heading 列表 + taskKeys.all + feed
      void queryClient.invalidateQueries({ queryKey: ['projects'] }); // 侧边栏出现新项目
    },
  });
}
```

### 3.3 菜单项（`ProjectHeadingRow.tsx`）

在删除项之前插入：

```tsx
<DropdownMenuItem
  disabled={convertHeading.isPending}
  onSelect={() =>
    convertHeading.mutate(heading.id, {
      onSuccess: () => toast.success(t('project:convertSuccess')),
      onError: () => toast.error(t('project:convertFailed')),
    })
  }
>
  <FolderInput className="mr-2 h-4 w-4" />
  {t('project:convertToProject')}
</DropdownMenuItem>
```

无二次确认（对齐任务转换）；不自动跳转新项目。

### 3.4 i18n（`project.json` zh/en）

```
convertToProject: 转换为项目 / Convert to Project
convertSuccess:   已转换为项目 / Converted to project
convertFailed:    转换为项目失败 / Failed to convert to project
```

## 4. 测试

### 后端（`packages/backend/test/project-headings.service.convert-to-project.spec.ts`）

mock 风格对齐 `tasks.service.convert-to-project.spec.ts`（`$transaction` 透传 mockPrisma）：

- Heading 不存在 → `NotFoundException`
- 所属项目不存在/已软删除 → `NotFoundException`
- 正常转换：`project.aggregate` 取 max+1；`project.create` 断言 `title=heading.title`、`areaId=原项目.areaId`、`sortOrder`、`userId`
- `task.updateMany` 断言 `where { userId, headingId }` 与 `data { projectId, headingId: null }`
- `projectHeading.deleteMany` 断言并按 count≠1 抛 `BadRequestException`
- 空 Heading（无任务）转换成功，创建空项目
- 返回结构含 `tags: []`

### 前端

- `ProjectHeadingRow.test.tsx`：mock `useConvertProjectHeadingToProject`，断言 ⋯ 菜单出现"转换为项目"项；点击后调用 mutate。
- 中英文 `project.json` key 集合一致性（跟随现有 i18n 校验方式）。

## 5. 兼容性与回滚

- 纯增量端点 + 菜单项，不影响既有 Heading 生命周期、拖拽、删除语义。
- 无数据库迁移（不新增字段/表）。
- 回滚：删除端点与前端菜单项即可，无数据形态变化。
