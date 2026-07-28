import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SortableProjectItem } from '@/components/layout/SortableProjectItem';
import { SortableAreaRow } from '@/components/layout/SortableAreaRow';
import { useReorderProjects, useUpdateProject } from '@/lib/hooks/useProjects';
import { useReorderAreas } from '@/lib/hooks/useAreas';

interface Props {
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
}

const PROJ_PREFIX = 'proj:';
const AREA_PREFIX = 'area:';

/**
 * 计算拖拽后的全量项目 orderedIds。
 *
 * - 移除被拖项目后，将其插入到 `overProjectId` 当前所在位置（同列表排序）；
 * - 若 over 是区域标题（overProjectId 为 null），则插入到目标区域分组的末尾。
 *
 * `useReorderProjects` 接收全局 orderedIds，后端按 index 写入 sortOrder。
 */
function computeReorderedGlobalIds(
  projects: ProjectResponseDto[],
  activeProjectId: string,
  overProjectId: string | null,
  targetAreaId: string | null,
): string[] {
  const dragged = projects.find((p) => p.id === activeProjectId);
  if (!dragged) return projects.map((p) => p.id);

  const remaining = projects.filter((p) => p.id !== activeProjectId);

  let insertIndex: number;
  if (overProjectId) {
    const idx = remaining.findIndex((p) => p.id === overProjectId);
    insertIndex = idx === -1 ? remaining.length : idx;
  } else {
    // 落到区域标题：插入到该区域项目分组的末尾
    let lastIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if ((remaining[i].areaId ?? null) === targetAreaId) lastIdx = i;
    }
    insertIndex = lastIdx + 1;
  }

  const result = [...remaining];
  result.splice(insertIndex, 0, dragged);
  return result.map((p) => p.id);
}

/**
 * 侧边栏合并后的统一「项目」section：标题为纯文本（无折叠按钮、无导航链接）。
 * 内容顺序：顶部列出无区域归属的项目，下方每个区域作为可折叠条目（含该区域项目列表）。
 *
 * 外层 DndContext 统一处理拖拽：独立项目排序、区域内项目排序、跨区域移动、区域间排序。
 */
export function SidebarProjectSection({ projects, areas }: Props) {
  const { t } = useTranslation();
  const standaloneProjects = projects.filter((p) => !p.areaId);
  const reorderProjects = useReorderProjects();
  const reorderAreas = useReorderAreas();
  const updateProject = useUpdateProject();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const isActiveArea = activeId.startsWith(AREA_PREFIX);
    const isOverArea = overId.startsWith(AREA_PREFIX);

    // 1. 区域间排序
    if (isActiveArea && isOverArea) {
      const areaIds = areas.map((a) => `${AREA_PREFIX}${a.id}`);
      const reordered = arrayMove(
        areaIds,
        areaIds.indexOf(activeId),
        areaIds.indexOf(overId),
      );
      reorderAreas.mutate(reordered.map((id) => id.slice(AREA_PREFIX.length)));
      return;
    }

    // 仅项目 active 时继续
    if (!activeId.startsWith(PROJ_PREFIX)) return;

    const projectId = activeId.slice(PROJ_PREFIX.length);
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // 计算目标 areaId 与（可选）over 项目
    let targetAreaId: string | null;
    let overProjectId: string | null = null;

    if (isOverArea) {
      targetAreaId = overId.slice(AREA_PREFIX.length);
    } else if (overId.startsWith(PROJ_PREFIX)) {
      overProjectId = overId.slice(PROJ_PREFIX.length);
      const overProject = projects.find((p) => p.id === overProjectId);
      if (!overProject) return;
      targetAreaId = overProject.areaId ?? null;
    } else {
      return;
    }

    const currentAreaId = project.areaId ?? null;

    // 2a. 跨区域移动：先改 areaId，再持久化新顺序
    if (targetAreaId !== currentAreaId) {
      const newOrderedIds = computeReorderedGlobalIds(
        projects,
        projectId,
        overProjectId,
        targetAreaId,
      );
      updateProject.mutate(
        { id: projectId, data: { areaId: targetAreaId } },
        {
          onSettled: () => reorderProjects.mutate(newOrderedIds),
          onError: () => toast.error(t('common:saveFailed')),
        },
      );
      return;
    }

    // 2b. 同列表排序
    const newOrderedIds = computeReorderedGlobalIds(
      projects,
      projectId,
      overProjectId,
      currentAreaId,
    );
    reorderProjects.mutate(newOrderedIds);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">
        {t('nav:projects')}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="ml-2 flex flex-col gap-0.5">
          <SortableContext
            items={standaloneProjects.map((p) => `${PROJ_PREFIX}${p.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {standaloneProjects.map((p) => (
              <SortableProjectItem key={p.id} project={p} />
            ))}
          </SortableContext>
          <SortableContext
            items={areas.map((a) => `${AREA_PREFIX}${a.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {areas.map((area) => (
              <SortableAreaRow
                key={area.id}
                area={area}
                projects={projects.filter((p) => p.areaId === area.id)}
              />
            ))}
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}
