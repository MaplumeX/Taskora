import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragOverlay, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

import type { ProjectResponseDto } from '@taskora/shared';

import {
  currentLegacyDateTimeZone,
  selectionStateOf,
  useLaterProjectKind,
  useProjectsQuery,
  useReorderProjects,
  useSelectionScope,
  useTaskRowSelection,
} from '@taskora/api';
import { mainNav, type NavItem } from '@/components/layout/navItems';
import { mergeVisibleProjectOrder } from '@/components/layout/sidebarProjectLayout';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import {
  DraggableProjectRow,
  SortableProjectRow,
} from '@/components/project/DraggableProjectRow';
import { groupLaterProjects } from '@/components/project/laterProjectLayout';
import { dndListProps, dragOverlayClass, dragOverlayWrapperClass, useHeldOrder } from '@/lib/dnd';
import { useDndSurface } from '@/lib/appDnd';
import { cn } from '@/lib/utils';

// 小节标题沿用侧边栏对应 Bucket 的名称、图标与颜色（计划 = Upcoming，将来 = Someday）。
const navItem = (to: string) => mainNav.find((item) => item.to === to) as NavItem;
const SCHEDULED_NAV = navItem('/upcoming');
const SOMEDAY_NAV = navItem('/someday');

interface Props {
  /** 候选项目；非稍后项目会被忽略。 */
  projects: ProjectResponseDto[];
  /** 同页多个列表时，本组件在键盘遍历中的先后（见 useSelectionScope）。 */
  selectionRank?: number;
}

/**
 * 稍后项目的「计划」/「Someday」两个小节（Later Projects 页与区域页共用）。
 * 空小节不显示。两节的行都可拖到侧边栏；Someday 沿用手动顺序、可拖拽排序，
 * 计划按日期排、不可在节内排序。
 */
export function LaterProjectSections({ projects, selectionRank }: Props) {
  const { t } = useTranslation();
  const kindOf = useLaterProjectKind();
  const { selectedIds, expandedId } = useTaskRowSelection();
  const groups = useMemo(
    () => groupLaterProjects(projects, kindOf, currentLegacyDateTimeZone()),
    [projects, kindOf],
  );
  // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
  const [someday, holdSomedayOrder] = useHeldOrder(groups.someday, projectKey);
  const { data: allProjects = [] } = useProjectsQuery();
  const reorderProjects = useReorderProjects();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scheduledIds = useMemo(() => new Set(groups.scheduled.map((p) => p.id)), [groups]);
  const somedayIds = useMemo(() => new Set(someday.map((p) => p.id)), [someday]);
  const findProject = (id: string) =>
    groups.scheduled.find((p) => p.id === id) ?? someday.find((p) => p.id === id);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const ids = someday.map((p) => p.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    holdSomedayOrder(reordered);
    // 以全量顺序为底写回，其他项目原位不动。
    reorderProjects.mutate(mergeVisibleProjectOrder(allProjects, reordered));
  };

  // 共享拖拽上下文里的一个 surface（ADR 0018），两节的行都可拖到侧边栏。
  const surface = useDndSurface({
    owns: (dndId) => scheduledIds.has(dndId) || somedayIds.has(dndId),
    // 计划行只能拖到侧边栏，列表内不给落点。
    collisionDetection: (args) =>
      somedayIds.has(String(args.active.id)) ? closestCenter(args) : [],
    sidebarPayload: (dndId) => {
      const project = findProject(dndId);
      return project ? { kind: 'project', project } : null;
    },
    onDragStart: ({ active }) => setActiveId(String(active.id)),
    onDragEnd: handleDragEnd,
    onDragCancel: () => setActiveId(null),
  });
  const activeProject = activeId ? findProject(activeId) : undefined;

  const rows = useMemo(
    () =>
      [...groups.scheduled, ...someday].map((p) => ({
        id: p.id,
        kind: 'project' as const,
        completed: false,
        tagIds: (p.tags ?? []).map((tag) => tag.id),
      })),
    [groups, someday],
  );
  useSelectionScope(rows, selectionRank);

  const sections = [
    { key: 'scheduled', nav: SCHEDULED_NAV, items: groups.scheduled },
    { key: 'someday', nav: SOMEDAY_NAV, items: someday },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      {sections.map((section) => {
        const Icon = section.nav.icon;
        const title = t(section.nav.labelKey);
        return (
          <section key={section.key} aria-label={title} className="flex flex-col">
            <h2 className="flex items-center gap-1.5 border-b border-border pb-1 text-section font-bold text-foreground">
              <Icon aria-hidden className={cn('h-4 w-4 shrink-0', section.nav.colorClass)} />
              {title}
            </h2>
            {section.key === 'scheduled' ? (
              <div className="flex flex-col pt-1">
                {section.items.map((p) => (
                  <DraggableProjectRow
                    key={p.id}
                    project={p}
                    selectionState={selectionStateOf(selectedIds, expandedId, p.id)}
                    showScheduledBadge
                  />
                ))}
              </div>
            ) : (
              <SortableContext
                items={section.items.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div {...dndListProps} className="flex flex-col pt-1">
                  {section.items.map((p) => (
                    <SortableProjectRow
                      key={p.id}
                      project={p}
                      selectionState={selectionStateOf(selectedIds, expandedId, p.id)}
                      showScheduledBadge={false}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </section>
        );
      })}
      {surface.overlayActive && (
        <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
          {activeProject ? (
            <div className={cn(dragOverlayClass, 'bg-card')} aria-hidden="true" {...{ inert: '' }}>
              <ProjectFeedRow
                item={activeProject}
                selectionState="idle"
                showScheduledBadge={scheduledIds.has(activeProject.id)}
              />
            </div>
          ) : null}
        </DragOverlay>
      )}
    </>
  );
}

function projectKey(project: ProjectResponseDto) {
  return project.id;
}
