import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragOverlay, useDraggable } from '@dnd-kit/core';
import { toast } from 'sonner';

import type { FeedItem, LaterItemKind } from '@taskora/shared';

import {
  currentLegacyDateTimeZone,
  selectionStateOf,
  useCompleteTask,
  useSelectionScope,
  useTaskRowSelection,
  useUncompleteTask,
  type SelectionState,
} from '@taskora/api';
import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';
import { groupLaterItems } from '@/components/project/laterProjectLayout';
import { LaterSectionHeading } from '@/components/project/LaterProjectSections';
import { dragOverlayClass, dragOverlayWrapperClass } from '../../lib/dnd';
import { useDndSurface } from '../../lib/appDnd';
import { cn } from '@/lib/utils';

interface Props {
  /** 候选条目（项目与任务）；非稍后项会被忽略。 */
  items: FeedItem[];
  kindOf: (item: FeedItem) => LaterItemKind | null;
  /** 「计划」小节在键盘遍历中的先后；「某天」紧随其后（见 useSelectionScope）。 */
  selectionRank: number;
}

/**
 * 区域页的稍后项（Later Item）：稍后项目与区域直属的稍后任务混排进「计划」/
 * 「某天」两节，空小节不显示。计划按日期排、不可节内排序（行可拖到侧边栏）；
 * 某天与 Someday 视图同一套平铺 feed 列表，可拖拽混排。
 */
export function LaterItemSections({ items, kindOf, selectionRank }: Props) {
  const { t } = useTranslation();
  const groups = useMemo(
    () => groupLaterItems(items, kindOf, currentLegacyDateTimeZone()),
    [items, kindOf],
  );
  return (
    <>
      {groups.scheduled.length > 0 && (
        <section aria-label={t('nav:upcoming')} className="flex flex-col">
          <LaterSectionHeading kind="scheduled" />
          <ScheduledRows items={groups.scheduled} selectionRank={selectionRank} />
        </section>
      )}
      {groups.someday.length > 0 && (
        <section aria-label={t('nav:someday')} className="flex flex-col">
          <LaterSectionHeading kind="someday" />
          <div className="pt-1">
            <GroupedFeedListView
              items={groups.someday}
              grouping={false}
              selectionRank={selectionRank + 1}
              magicPlus={false}
              hideOwnership
              showScheduledBadge={false}
            />
          </div>
        </section>
      )}
    </>
  );
}

function ScheduledRows({ items, selectionRank }: { items: FeedItem[]; selectionRank: number }) {
  const { t } = useTranslation();
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // 共享拖拽上下文里的一个 surface（ADR 0018）：行只能拖到侧边栏，列表内不给落点。
  const surface = useDndSurface({
    owns: (dndId) => byId.has(dndId),
    collisionDetection: () => [],
    sidebarPayload: (dndId) => {
      const item = byId.get(dndId);
      if (!item) return null;
      return item.type === 'project'
        ? { kind: 'project', project: item }
        : { kind: 'tasks', tasks: [item] };
    },
    onDragStart: ({ active }) => setActiveId(String(active.id)),
    onDragEnd: () => setActiveId(null),
    onDragCancel: () => setActiveId(null),
  });
  const activeItem = activeId ? byId.get(activeId) : undefined;

  const rows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        kind: item.type,
        completed: item.status === 'COMPLETED',
        tagIds: item.tags.map((tag) => tag.id),
        item,
      })),
    [items],
  );
  useSelectionScope(rows, selectionRank);

  const toggleComplete = (item: FeedItem) => {
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  return (
    <div className="flex flex-col pt-1" onClick={handleBlankClick}>
      {items.map((item) => (
        <DraggableFeedRow
          key={`${item.type}:${item.id}`}
          item={item}
          selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
          onToggleComplete={() => toggleComplete(item)}
          onRowClick={() => handleRowClick(item.id)}
        />
      ))}
      {surface.overlayActive && (
        <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
          {activeItem ? (
            <div className={cn(dragOverlayClass, 'bg-card')} aria-hidden="true" {...{ inert: '' }}>
              <FeedItemRow item={activeItem} selectionState="idle" />
            </div>
          ) : null}
        </DragOverlay>
      )}
    </div>
  );
}

function DraggableFeedRow({
  item,
  selectionState,
  onToggleComplete,
  onRowClick,
}: {
  item: FeedItem;
  selectionState: SelectionState;
  onToggleComplete: () => void;
  onRowClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div ref={setNodeRef} className={cn(isDragging && 'invisible')} {...attributes} {...listeners}>
      <FeedItemRow
        item={item}
        selectionState={selectionState}
        {...(item.type === 'task' ? { onToggleComplete, onRowClick } : {})}
      />
    </div>
  );
}
