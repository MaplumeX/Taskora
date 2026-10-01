import { Layers } from 'lucide-react';
import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { useAreasQuery, useSelectionScope, useTaskRowSelection, useUpdateArea } from '@taskora/api';
import {
  selectionStateOf,
  useLaterProjectKind,
  useProjectsQuery,
  useReorderProjects,
  type SelectionState,
} from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { useTasksQuery } from '@taskora/api';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { LaterProjectSections } from '@/components/project/LaterProjectSections';
import { mergeVisibleProjectOrder } from '@/components/layout/sidebarProjectLayout';
import { TaskListView } from '@/components/task/TaskListView';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { AreaMoreMenu } from '@/components/area/AreaMoreMenu';
import { toast } from 'sonner';
import { dndListProps, useHeldOrder } from '../lib/dnd';

function SortableProjectRow({
  project,
  selectionState,
}: {
  project: ProjectResponseDto;
  selectionState: SelectionState;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <ProjectFeedRow item={project} selectionState={selectionState} />
    </div>
  );
}

export default function AreaDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const pendingAutoEditId = useUiInteractionStore((s) => s.pendingAutoEditId);
  const clearPendingAutoEditId = useUiInteractionStore((s) => s.clearPendingAutoEditId);
  const autoEdit = pendingAutoEditId === id;
  useEffect(() => {
    if (autoEdit) clearPendingAutoEditId();
  }, [autoEdit, clearPendingAutoEditId]);
  const { data: areas = [] } = useAreasQuery();
  const area = areas.find((a) => a.id === id);
  const { data: allProjects = [] } = useProjectsQuery();
  const kindOf = useLaterProjectKind();
  const areaProjects = useMemo(
    () => allProjects.filter((p) => p.areaId === id),
    [allProjects, id],
  );
  // 活跃项目可拖拽排序；稍后项目放在下方「计划」/「Someday」小节，已完成项目不显示。
  const projects = useMemo(
    () => areaProjects.filter((p) => p.status !== ProjectStatus.COMPLETED && kindOf(p) === null),
    [areaProjects, kindOf],
  );
  // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
  const [orderedProjects, holdProjectOrder] = useHeldOrder(projects, projectKey);
  const reorderProjects = useReorderProjects();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ areaId: id });
  const updateArea = useUpdateArea();
  const { selectedIds, expandedId } = useTaskRowSelection();

  // 鼠标：移动 5px 激活；触摸：按住 300ms 再移动才激活，避免与列表滚动冲突。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const handleProjectDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = orderedProjects.map((p) => p.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    holdProjectOrder(reordered);
    // 以全量顺序为底写回，避免与其他区域 / 隐藏项目的 sortOrder 撞号。
    reorderProjects.mutate(mergeVisibleProjectOrder(allProjects, reordered));
  };

  // 注册项目段可遍历行（Project 行仅作遍历停留点，⌘K/⌫ 对其无效）。
  // 键盘遍历顺序与页面一致：活跃项目（0）→ 任务（1）→ 稍后项目（2）。
  const projectRows = useMemo(
    () => orderedProjects.map((p) => ({ id: p.id, kind: 'project' as const, completed: false })),
    [orderedProjects],
  );
  useSelectionScope(projectRows, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Layers aria-hidden className="h-7 w-7 shrink-0 text-muted-foreground" />
          {area ? (
            <InlineTitleEdit
              value={area.title}
              placeholder={t('area:newItemPlaceholder')}
              autoFocusAndSelect={autoEdit}
              onSubmit={(next) => {
                if (!area) return;
                updateArea.mutate(
                  { id: area.id, data: { title: next } },
                  {
                    onError: () => toast.error(t('common:saveFailed')),
                  },
                );
              }}
            />
          ) : (
            <h1 className="text-title-1">{t('area:defaultTitle')}</h1>
          )}
        </div>
        {area && <AreaMoreMenu area={area} />}
        </div>

      {orderedProjects.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
          <SortableContext items={orderedProjects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div {...dndListProps} className="flex flex-col">
              {orderedProjects.map((p) => (
                <SortableProjectRow
                  key={p.id}
                  project={p}
                  selectionState={selectionStateOf(selectedIds, expandedId, p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // 页头已表达区域归属，行上不再重复归属小字。
        <TaskListView tasks={tasks} hideEmptyState hideOwnership selectionRank={1} />
      )}

      {/* 稍后项目放在页面最下方（活跃项目与任务之后）。 */}
      <LaterProjectSections projects={areaProjects} selectionRank={2} />

      </div>
  );
}

function projectKey(project: ProjectResponseDto) {
  return project.id;
}
