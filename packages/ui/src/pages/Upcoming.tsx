import {
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
  useProjectsQuery,
  useAreasQuery,
  useTaskRowSelection,
  useRepeatPreviews,
  fromInputDateValue,
  i18n,
  toDateKey,
  useUpdateTask,
  useReorderFeed,
  useMultiSelectStore,
  useSelectionStore,
} from '@taskora/api';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DragOverlay,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { ScheduledType, type FeedItem, type TaskFeedItem } from '@taskora/shared';
import type { RepeatPreview } from '@taskora/api';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { UpcomingDropZone, UpcomingGroupHeader } from '@/components/feed/UpcomingDragTargets';
import {
  feedKey,
  moveUpcomingTask,
  upcomingGroups,
  type UpcomingDragTarget,
} from '@/components/feed/upcomingDragLayout';
import { SortableFeedRow } from '@/components/feed/SortableFeedRow';
import { RepeatPreviewRow } from '@/components/task/RepeatPreviewRow';
import { DragCountBadge } from '@/components/common/DragCountBadge';
import {
  selectionStateOf,
  useCompleteTask,
  useSelectionScope,
  useUncompleteTask,
} from '@taskora/api';
import { buildUpcomingLayout, type UpcomingDay } from '@taskora/api';
import { toast } from 'sonner';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';
import { useDndSurface } from '../lib/appDnd';
import type { SidebarDropPayload } from '@/components/layout/sidebarDrop';
import {
  dndListProps,
  dragGroupOf,
  dragOverlayClass,
  dragOverlayWrapperClass,
  expandDragGroup,
  useCollapseAfterDragStart,
  useFlipList,
  useHeldValue,
} from '../lib/dnd';

interface ScheduleDrag {
  origin: TaskFeedItem;
  originGroup: string;
  items: FeedItem[];
  startItems: FeedItem[];
  /** 多项拖拽：整组任务的原所在组（按显示顺序，含被拖任务）；单项拖拽为 null。 */
  group: Array<{ item: TaskFeedItem; groupId: string }> | null;
  /** 组内其余行是否已收起（拖拽开始那次提交之后才收起）。 */
  collapsed: boolean;
}

/** 本页的拖拽源与落点（共享拖拽上下文里按 id 前缀认领，ADR 0018）。 */
function isUpcomingKey(key: string) {
  return key.startsWith('task:') || key.startsWith('header:') || key.startsWith('container:');
}

function scheduleSignature(items: FeedItem[]) {
  return items.map((item) => `${feedKey(item)}@${item.scheduledDate}`).join('|');
}

export default function Upcoming() {
  const calendarDay = useCalendarDay();
  const { t } = useTranslation();
  const { data: allItems = [], isLoading, isError } = useFeedQuery('upcoming');
  const effectiveTags = useEffectiveTags();
  const {
    visible: filteredItems,
    filtering,
    bar,
  } = useTagFilter(allItems, effectiveTags.ofFeedItem);
  // 松手立即移到目标分组，等更新 hook 的乐观数据追上，避免闪回原日期。
  const [shownItems, holdItems] = useHeldValue(filteredItems, scheduleSignature);
  const [drag, setDrag] = useState<ScheduleDrag | null>(null);
  const dragRef = useRef<ScheduleDrag | null>(null);
  const lastTargetRef = useRef<UpcomingDragTarget | null>(null);
  const dragMotionRef = useRef<{
    id: string;
    top: number;
    direction: 'up' | 'down' | null;
  } | null>(null);
  const items = drag?.items ?? shownItems;
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const previews = useRepeatPreviews();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const updateTask = useUpdateTask();
  const reorderFeed = useReorderFeed();
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const multiSelectActive = useMultiSelectStore((s) => s.active);

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.title])), [areas]);

  // 过滤时不显示下次预告（预告不是条目，没有 Tag）
  const layout = useMemo(
    () => buildUpcomingLayout(items, new Date(), filtering ? [] : previews),
    [items, previews, filtering, calendarDay],
  );
  const groups = useMemo(() => upcomingGroups(layout, items), [layout, items]);
  const flip = useFlipList<HTMLDivElement>(groups);

  // 多项拖拽：拖拽开始那次提交之后再收起组内其余行，浮层才贴着手。
  useCollapseAfterDragStart(!!drag && !drag.collapsed, () => {
    const current = dragRef.current;
    if (!current || current.collapsed) return;
    const companions = new Set(
      (current.group ?? []).flatMap(({ item }) => (item.id === current.origin.id ? [] : [item.id])),
    );
    flip.capture();
    updateDrag({
      ...current,
      collapsed: true,
      items: current.items.filter((entry) => entry.type !== 'task' || !companions.has(entry.id)),
    });
  });

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      if (!String(args.active.id).startsWith('task:') || !args.pointerCoordinates) return [];
      const activeKey = String(args.active.id);
      let placementY = args.pointerCoordinates.y;
      if (args.collisionRect) {
        const previous = dragMotionRef.current?.id === activeKey ? dragMotionRef.current : null;
        const initialTop = args.active.rect.current.initial?.top ?? args.collisionRect.top;
        const change = args.collisionRect.top - (previous?.top ?? initialTop);
        const direction =
          change < -0.5 ? 'up' : change > 0.5 ? 'down' : (previous?.direction ?? null);
        dragMotionRef.current = { id: activeKey, top: args.collisionRect.top, direction };
        // 跟随任务朝移动方向的边缘，让位不受抓取位置影响；布局重测时
        // 保留方向，避免静止的指针在上沿、中心之间切换导致占位跳动。
        placementY =
          direction === 'up'
            ? args.collisionRect.top
            : direction === 'down'
              ? args.collisionRect.bottom
              : args.collisionRect.top + args.collisionRect.height / 2;
      }
      const validIds = new Set(
        groups.flatMap((group) => [
          `header:${group.id}`,
          `container:${group.id}`,
          ...group.items.filter((item) => item.type === 'task').map(feedKey),
        ]),
      );
      const containers = args.droppableContainers.filter((container) =>
        validIds.has(String(container.id)),
      );
      // 默认测量会消除 transform；FLIP 动画中的标题/任务要按屏幕上
      // 当前可见的位置命中，不能用动画结束后的布局位置。
      const visibleRects = new Map(args.droppableRects);
      for (const container of containers) {
        const rect = container.node?.current?.getBoundingClientRect();
        if (rect && rect.height > 0 && rect.width > 0) visibleRects.set(container.id, rect);
      }
      const collisions = pointerWithin({
        ...args,
        pointerCoordinates: { ...args.pointerCoordinates, y: placementY },
        droppableContainers: containers,
        droppableRects: visibleRects,
      });
      // 和侧边栏一致：行 > 分组头 > 容器空白；行的中线决定前后插入。
      const collision =
        collisions.find(({ id }) => String(id).startsWith('task:')) ??
        collisions.find(({ id }) => String(id).startsWith('header:')) ??
        collisions.find(({ id }) => String(id).startsWith('container:'));
      if (!collision) return [];
      let overKey = String(collision.id);
      // 容器也含标题/行之间的小空隙：按相邻行的中线落位，不能一碰到
      // 组内空白就跳到末尾。只有所有行下方的空白才对应组尾。
      if (overKey.startsWith('container:')) {
        const group = groups.find((group) => `container:${group.id}` === overKey);
        const rowRects = (group?.items ?? []).flatMap((item) => {
          const id = feedKey(item);
          const rect = visibleRects.get(id);
          return item.type === 'task' && id !== String(args.active.id) && rect
            ? [{ id, rect }]
            : [];
        });
        const nextRow = rowRects.find(({ rect }) => placementY < rect.top + rect.height / 2);
        const anchor = nextRow ?? rowRects[rowRects.length - 1];
        if (anchor) overKey = anchor.id;
      }
      const rect = visibleRects.get(overKey);
      const edge =
        overKey.startsWith('task:') && rect && placementY >= rect.top + rect.height / 2
          ? 'after'
          : 'before';
      lastTargetRef.current = { overKey, edge };
      return [{ ...collision, id: overKey }];
    },
    [groups],
  );

  const updateDrag = (next: ScheduleDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const item = items.find(
      (item): item is TaskFeedItem => item.type === 'task' && `task:${item.id}` === active.id,
    );
    if (!item || expandedId === item.id || multiSelectActive) return;
    const originGroup = groups.find((group) =>
      group.items.some((entry) => feedKey(entry) === feedKey(item)),
    )?.id;
    if (!originGroup) return;
    const focused = document.activeElement as HTMLElement | null;
    if (
      focused?.closest('[data-sortable-task-id]')?.getAttribute('data-sortable-task-id') === item.id
    )
      focused.blur();
    // 显示顺序的任务及其所在组。
    const shownTasks = groups.flatMap((group) =>
      group.items.flatMap((entry) =>
        entry.type === 'task' ? [{ item: entry, groupId: group.id }] : [],
      ),
    );
    const groupIds = dragGroupOf(
      item.id,
      shownTasks.map((entry) => entry.item.id),
      useSelectionStore.getState().selectedIds,
    );
    // 多项拖拽保留多选（松手后整组仍选中）；单项拖拽照旧清掉选中。
    if (!groupIds) handleBlankClick();
    const group = groupIds ? shownTasks.filter((entry) => groupIds.includes(entry.item.id)) : null;
    lastTargetRef.current = null;
    dragMotionRef.current = null;
    updateDrag({
      origin: item,
      originGroup,
      items,
      startItems: items,
      group,
      collapsed: !group,
    });
  };

  const applyTarget = (current: ScheduleDrag, target: UpcomingDragTarget | null): FeedItem[] => {
    if (!target) return current.items;
    const currentGroups = upcomingGroups(
      buildUpcomingLayout(current.items, new Date()),
      current.items,
    );
    return (
      moveUpcomingTask(
        current.items,
        currentGroups,
        { item: current.origin, groupId: current.originGroup },
        target,
      ) ?? current.items
    );
  };

  const previewTarget = (activeKey: string) => {
    const current = dragRef.current;
    if (!current || activeKey !== feedKey(current.origin)) return;
    const next = applyTarget(current, lastTargetRef.current);
    if (next === current.items) return;
    flip.capture();
    updateDrag({ ...current, items: next });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const overKey = String(over.id);
    if (!isUpcomingKey(overKey)) {
      // 指针在列表外的落点上（侧边栏）：空位回到原处，不暗示改期。
      lastTargetRef.current = null;
      const current = dragRef.current;
      if (!current) return;
      const companions = new Set(
        current.collapsed
          ? (current.group ?? []).flatMap(({ item }) =>
              item.id === current.origin.id ? [] : [item.id],
            )
          : [],
      );
      const origin = current.startItems.filter(
        (entry) => entry.type !== 'task' || !companions.has(entry.id),
      );
      if (origin.map(feedKey).join('|') === current.items.map(feedKey).join('|')) return;
      flip.capture();
      updateDrag({ ...current, items: origin });
      return;
    }
    if (lastTargetRef.current?.overKey !== overKey) {
      lastTargetRef.current = { overKey, edge: 'before' };
    }
    previewTarget(String(active.id));
  };

  // over.id 不变时也读取中线，和侧边栏一样按每次指针移动实时让位。
  const handleDragMove = ({ active }: DragMoveEvent) => previewTarget(String(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragRef.current;
    const target: UpcomingDragTarget | null = over
      ? {
          overKey: String(over.id),
          edge:
            lastTargetRef.current?.overKey === String(over.id)
              ? lastTargetRef.current.edge
              : 'before',
        }
      : null;
    const droppedItems = current ? applyTarget(current, target) : null;
    lastTargetRef.current = null;
    dragMotionRef.current = null;
    flip.capture();
    updateDrag(null);
    if (!current || !droppedItems || active.id !== feedKey(current.origin)) return;
    const item = droppedItems.find((item) => feedKey(item) === feedKey(current.origin));
    if (!item?.scheduledDate || !current.origin.scheduledDate) return;
    const finalItems = current.group
      ? withScheduleDragGroup(droppedItems, item as TaskFeedItem, current.group)
      : droppedItems;
    // 改了日期的任务（多项拖拽时组内每一项各自比较）。
    const startDates = new Map(
      current.startItems.map((entry) => [feedKey(entry), entry.scheduledDate]),
    );
    const dated = (current.group?.map(({ item }) => item) ?? [current.origin]).flatMap((task) => {
      const placed = finalItems.find((entry) => feedKey(entry) === feedKey(task));
      const startDate = startDates.get(feedKey(task));
      return placed?.scheduledDate &&
        startDate &&
        toDateKey(placed.scheduledDate) !== toDateKey(startDate)
        ? [{ id: task.id, scheduledDate: toDateKey(placed.scheduledDate) }]
        : [];
    });
    const orderChanged =
      finalItems.map(feedKey).join('|') !== current.startItems.map(feedKey).join('|');
    if (dated.length === 0 && !orderChanged) return;
    holdItems(finalItems);
    let failed = false;
    const onError = () => {
      if (failed) return;
      failed = true;
      holdItems(filteredItems);
      toast.error(t('common:operationFailed'));
    };
    const reorder = () => {
      if (orderChanged)
        reorderFeed.mutate(
          finalItems.map(({ type, id }) => ({ type, id })),
          { onError },
        );
    };
    // 日期都写完再写顺序（Position 按新日期所在的组排）。
    let pending = dated.length;
    for (const { id, scheduledDate } of dated) {
      updateTask.mutate(
        { id, data: { scheduledType: ScheduledType.DATE, scheduledDate } },
        {
          onError,
          onSuccess: () => {
            pending -= 1;
            if (pending === 0 && !failed) reorder();
          },
        },
      );
    }
    if (dated.length === 0) reorder();
  };

  const handleDragCancel = () => {
    lastTargetRef.current = null;
    dragMotionRef.current = null;
    flip.capture();
    updateDrag(null);
  };

  /** 拖到侧边栏的载荷：被拖任务，多选时为整组（按显示顺序，拖拽开始时的原样）。 */
  const sidebarPayload = (activeKey: string): SidebarDropPayload | null => {
    const current = dragRef.current;
    if (!current || activeKey !== feedKey(current.origin)) return null;
    return { kind: 'tasks', tasks: current.group?.map(({ item }) => item) ?? [current.origin] };
  };

  // 共享拖拽上下文里的一个 surface（ADR 0018）。
  const surface = useDndSurface({
    owns: isUpcomingKey,
    collisionDetection,
    sidebarPayload,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  // 注册可遍历行（按渲染顺序：本周每天，之后各月）。⌘↑/⌘↓ 只在同一天内重排。
  const rows = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .map((item) => ({
          id: item.id,
          kind: item.type === 'task' ? ('task' as const) : ('project' as const),
          completed: item.type === 'task' ? item.status === 'COMPLETED' : false,
          cancelled: item.type === 'task' ? item.status === 'CANCELLED' : false,
          tagIds: item.tags.map((tag) => tag.id),
          item,
          sortGroup: item.scheduledDate ? toDateKey(item.scheduledDate) : undefined,
        })),
    [groups],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const reorderFeedMutate = reorderFeed.mutate;
  const scopeActions = useMemo(
    () => ({
      reorder: (ids: string[]) => {
        const kindById = new Map(rowsRef.current.map((row) => [row.id, row.kind]));
        reorderFeedMutate(ids.map((id) => ({ type: kindById.get(id) ?? 'task', id })), {
          onError: () => toast.error(t('common:operationFailed')),
        });
      },
    }),
    [reorderFeedMutate, t],
  );
  useSelectionScope(rows, 0, scopeActions);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  // 本周按天分组时日期已在标题里，行上不再显示；月份分组只到月，行上补计划日期 chip。
  const renderItem = (item: FeedItem, showScheduledBadge = false, overlay = false) => {
    const isTask = item.type === 'task';
    const taskItem = item as { projectId: string | null; areaId: string | null };
    const selectionState =
      isTask && !overlay ? selectionStateOf(selectedIds, expandedId, item.id) : 'idle';
    return (
      <FeedItemRow
        key={item.id}
        item={item}
        projectTitle={isTask && taskItem.projectId ? projectMap[taskItem.projectId] : undefined}
        areaTitle={isTask && taskItem.areaId ? areaMap[taskItem.areaId] : undefined}
        selectionState={selectionState}
        onToggleComplete={() => toggleComplete(item)}
        onRowClick={isTask ? () => handleRowClick(item.id) : undefined}
        showScheduledBadge={showScheduledBadge}
      />
    );
  };

  const renderDraggableItem = (item: FeedItem, showScheduledBadge = false) =>
    item.type === 'task' ? (
      <SortableFeedRow
        key={item.id}
        dndId={`task:${item.id}`}
        item={drag?.origin.id === item.id ? drag.origin : item}
        placeholder={drag?.origin.id === item.id}
        dragDisabled={multiSelectActive}
        projectTitle={item.projectId ? projectMap[item.projectId] : undefined}
        areaTitle={item.areaId ? areaMap[item.areaId] : undefined}
        selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
        onToggleComplete={() => toggleComplete(item)}
        onRowClick={() => handleRowClick(item.id)}
        showScheduledBadge={
          drag?.origin.id === item.id ? drag.originGroup.startsWith('month:') : showScheduledBadge
        }
      />
    ) : (
      renderItem(item, showScheduledBadge)
    );

  // 下次预告：只读、不进 Selection（rows 只注册真实条目）
  const renderPreview = (preview: RepeatPreview, showDate = false) => (
    <RepeatPreviewRow
      key={`preview:${preview.sourceTaskId}`}
      preview={preview}
      showDate={showDate}
      projectTitle={preview.projectId ? projectMap[preview.projectId] : undefined}
      areaTitle={preview.areaId ? areaMap[preview.areaId] : undefined}
    />
  );

  const renderDay = (day: UpcomingDay) => {
    const label = day.isTomorrow
      ? t('common:tomorrow')
      : new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(
          fromInputDateValue(day.dateKey),
        );

    return (
      <UpcomingDropZone
        key={day.dateKey}
        id={`date:${day.dateKey}`}
        taskIds={day.items.filter((item) => item.type === 'task').map((item) => item.id)}
      >
        <UpcomingGroupHeader id={`date:${day.dateKey}`}>
          <div className="flex items-center gap-3">
            <span className="text-title-1 tabular-nums leading-none">{day.numberLabel}</span>
            <span className="text-body tabular-nums text-muted-foreground">{label}</span>
            <div className="min-w-4 flex-1 border-t border-border" aria-hidden="true" />
          </div>
        </UpcomingGroupHeader>
        {/* 空日期只留一行高度（仍是放置目标），避免一周空档把列表拉得过长。 */}
        <div className="flex min-h-6 flex-col">
          {day.items.map((item) => renderDraggableItem(item))}
          {day.previews.map((preview) => renderPreview(preview))}
        </div>
      </UpcomingDropZone>
    );
  };

  // 浮层和占位保持拖起时的日期与徽标，跨组预览只改变落点，松手后才显示新日期。
  const activeTask = drag?.origin;
  const overlayShowsDate = drag?.originGroup.startsWith('month:') ?? false;

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <PageHeading nav="/upcoming">{t('nav:upcoming')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <>
          <div ref={flip.rootRef} {...dndListProps} className="flex flex-col gap-5">
            {layout.week.map(renderDay)}
            {layout.later.map((month, index) => {
              const group = groups[layout.week.length + index];
              return (
                <UpcomingDropZone
                  key={`${month.year}-${month.month}`}
                  id={group.id}
                  taskIds={group.items
                    .filter((item) => item.type === 'task')
                    .map((item) => item.id)}
                >
                  <UpcomingGroupHeader id={group.id}>
                    <h2 className="pt-4 text-title-2">
                      {month.headingKind === 'range'
                        ? `${month.month}/${month.rangeStartDay}-${month.month}/${month.rangeEndDay}`
                        : new Intl.DateTimeFormat(
                            i18n.language,
                            month.showYear ? { month: 'long', year: 'numeric' } : { month: 'long' },
                          ).format(new Date(month.year, month.month - 1, 1))}
                    </h2>
                  </UpcomingGroupHeader>
                  {/* 与日分组保留相同的空白高度，任务或占位移入后仍能撑高分组。 */}
                  <div className="flex min-h-6 flex-col gap-1">
                    {group.items.map((item) => renderDraggableItem(item, true))}
                    {group.previews.map((preview) => renderPreview(preview, true))}
                  </div>
                </UpcomingDropZone>
              );
            })}
          </div>
          {surface.overlayActive && (
          <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
            {activeTask && (
              <div
                className={`${dragOverlayClass} relative bg-card`}
                aria-hidden="true"
                {...{ inert: '' }}
              >
                {renderItem(activeTask, overlayShowsDate, true)}
                <DragCountBadge count={drag?.group?.length ?? 0} />
              </div>
            )}
          </DragOverlay>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 多项拖拽松手：整组按原显示顺序落在被拖任务的位置，随它进入落点的分组。
 * 原本就在该组的任务保留自己的日期（月份分组内日期各不相同），其余改为
 * 被拖任务落定的日期。
 */
function withScheduleDragGroup(
  items: FeedItem[],
  moved: TaskFeedItem,
  group: Array<{ item: TaskFeedItem; groupId: string }>,
): FeedItem[] {
  const groups = upcomingGroups(buildUpcomingLayout(items, new Date()), items);
  const finalGroupId = groups.find((entry) =>
    entry.items.some((item) => feedKey(item) === feedKey(moved)),
  )?.id;
  const placed = group.map(({ item, groupId }): FeedItem => {
    if (item.id === moved.id) return moved;
    if (groupId === finalGroupId || item.scheduledDate === moved.scheduledDate) return item;
    return { ...item, scheduledType: ScheduledType.DATE, scheduledDate: moved.scheduledDate };
  });
  return expandDragGroup(items, feedKey(moved), placed, feedKey);
}
