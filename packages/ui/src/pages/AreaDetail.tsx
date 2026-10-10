import { Layers } from 'lucide-react';
import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import {
  useAreasQuery,
  useEffectiveTags,
  useSelectionScope,
  useTaskRowSelection,
  useUpdateArea,
} from '@taskora/api';
import {
  selectionStateOf,
  useIsLogged,
  useLaterProjectKind,
  useProjectsQuery,
  useReorderProjects,
} from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { useTasksQuery } from '@taskora/api';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { SortableProjectRow } from '@/components/project/DraggableProjectRow';
import { LaterProjectSections } from '@/components/project/LaterProjectSections';
import { mergeVisibleProjectOrder } from '@/components/layout/sidebarProjectLayout';
import { TaskListView } from '@/components/task/TaskListView';
import { EmptyState } from '@/components/common/EmptyState';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { AreaMoreMenu } from '@/components/area/AreaMoreMenu';
import { AreaMetaRow } from '@/components/area/AreaMetaRow';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';
import { toast } from 'sonner';
import {
  dndListProps,
  dragOverlayClass,
  dragOverlayWrapperClass,
  useHeldOrder,
} from '../lib/dnd';
import { useDndSurface } from '../lib/appDnd';
import { cn } from '@/lib/utils';

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
  const isLogged = useIsLogged();
  // 已移入 Logbook 的已完成项目不显示；尚未移入的留在原位（Logging Mode）
  const shownProject = React.useCallback(
    (p: { status: ProjectStatus; completedAt: string | null }) =>
      p.status !== ProjectStatus.COMPLETED || !isLogged(p),
    [isLogged],
  );
  const areaProjects = useMemo(
    () => allProjects.filter((p) => p.areaId === id),
    [allProjects, id],
  );
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ areaId: id });
  // Tag 过滤（tags-things3 issue 05）：项目与任务各按有效 Tag 判定，过滤栏合并两者的选项。
  const effectiveTags = useEffectiveTags();
  const filterItems = useMemo(
    () => [
      ...areaProjects.filter(shownProject).map((project) => ({ project, task: null })),
      ...tasks.map((task) => ({ project: null, task })),
    ],
    [areaProjects, tasks, shownProject],
  );
  const effectiveOfItem = React.useCallback(
    (item: (typeof filterItems)[number]) =>
      item.project ? effectiveTags.ofProject(item.project) : effectiveTags.ofTask(item.task!),
    [effectiveTags],
  );
  const { visible, filtering, bar } = useTagFilter(filterItems, effectiveOfItem);
  const visibleProjects = useMemo(
    () => visible.flatMap((item) => (item.project ? [item.project] : [])),
    [visible],
  );
  const visibleTasks = useMemo(
    () => visible.flatMap((item) => (item.task ? [item.task] : [])),
    [visible],
  );
  const shownAreaProjects = filtering ? visibleProjects : areaProjects;
  // 活跃项目可拖拽排序；稍后项目放在下方「计划」/「Someday」小节，已移入 Logbook 的
  // 已完成项目不显示。
  const projects = useMemo(
    () => shownAreaProjects.filter((p) => shownProject(p) && kindOf(p) === null),
    [shownAreaProjects, kindOf, shownProject],
  );
  // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
  const [orderedProjects, holdProjectOrder] = useHeldOrder(projects, projectKey);
  const reorderProjects = useReorderProjects();
  const updateArea = useUpdateArea();
  const { selectedIds, expandedId } = useTaskRowSelection();

  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);
  const projectIds = useMemo(() => new Set(orderedProjects.map((p) => p.id)), [orderedProjects]);

  const handleProjectDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveProjectId(null);
    if (!over || active.id === over.id) return;
    const ids = orderedProjects.map((p) => p.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    holdProjectOrder(reordered);
    // 以全量顺序为底写回，其他区域 / 隐藏项目原位不动。
    reorderProjects.mutate(mergeVisibleProjectOrder(allProjects, reordered));
  };

  // 活跃项目行的排序是共享拖拽上下文里的一个 surface（ADR 0018），可拖到侧边栏。
  const projectSurface = useDndSurface({
    owns: (dndId) => projectIds.has(dndId),
    sidebarPayload: (dndId) => {
      const project = orderedProjects.find((p) => p.id === dndId);
      return project ? { kind: 'project', project } : null;
    },
    onDragStart: ({ active }: DragStartEvent) => setActiveProjectId(String(active.id)),
    onDragEnd: handleProjectDragEnd,
    onDragCancel: () => setActiveProjectId(null),
  });
  const activeProject = orderedProjects.find((p) => p.id === activeProjectId);

  // 注册项目段可遍历行（Project 行仅作遍历停留点，⌘K/⌫ 对其无效）。
  // 键盘遍历顺序与页面一致：活跃项目（0）→ 任务（1）→ 稍后项目（2）。
  const projectRows = useMemo(
    () =>
      orderedProjects.map((p) => ({
        id: p.id,
        kind: 'project' as const,
        completed: false,
        tagIds: (p.tags ?? []).map((tag) => tag.id),
        item: p,
      })),
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

      {area ? <AreaMetaRow area={area} /> : null}

      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {filtering && visible.length === 0 && <EmptyState hint={t('tag:filterEmpty')} />}

      {orderedProjects.length > 0 && (
        <>
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
          {projectSurface.overlayActive && (
            <DragOverlay className={dragOverlayWrapperClass} dropAnimation={projectSurface.dropAnimation}>
              {activeProject ? (
                <div className={cn(dragOverlayClass, 'bg-card')} aria-hidden="true" {...{ inert: '' }}>
                  <ProjectFeedRow item={activeProject} selectionState="idle" />
                </div>
              ) : null}
            </DragOverlay>
          )}
        </>
      )}

      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // 页头已表达区域归属，行上不再重复归属小字。
        <TaskListView tasks={visibleTasks} hideEmptyState hideOwnership selectionRank={1} />
      )}

      {/* 稍后项目放在页面最下方（活跃项目与任务之后）。 */}
      <LaterProjectSections projects={shownAreaProjects} selectionRank={2} />

      </div>
  );
}

function projectKey(project: ProjectResponseDto) {
  return project.id;
}
