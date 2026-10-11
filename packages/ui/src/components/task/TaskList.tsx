import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';
import { selectionStateOf, type SelectionState } from '@taskora/api';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';
import { DragCountBadge } from '@/components/common/DragCountBadge';
import {
  dndListProps,
  dragGroupOf,
  dragSelectionIds,
  dragOverlayClass,
  dragOverlayWrapperClass,
  expandDragGroup,
  useCollapseAfterDragStart,
  useHeldOrder,
} from '../../lib/dnd';
import { useDndSurface } from '../../lib/appDnd';
import type { SidebarDropPayload } from '@/components/layout/sidebarDrop';

interface ProjectLookup {
  [projectId: string]: string;
}
interface AreaLookup {
  [areaId: string]: string;
}

interface Props {
  tasks: TaskResponseDto[];
  projects?: ProjectLookup;
  areas?: AreaLookup;
  /** 键盘 Selection（含 ⌘A 批量）选中的行 id；单选时也包含在内。 */
  selectedIds?: string[];
  expandedId?: string | null;
  onRowClick?: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
  onReorder?: (orderedIds: string[]) => void;
  sortable?: boolean;
  emptyHint?: string;
  /** 为空时不渲染任何空状态（用于区域详情等自身不展示空态的页面）。 */
  hideEmptyState?: boolean;
  /** 页头已表达归属的页面（区域详情）不在行上重复归属小字。 */
  hideOwnership?: boolean;
}

interface SortableTaskItemProps {
  task: TaskResponseDto;
  projectTitle?: string;
  areaTitle?: string;
  selectionState: SelectionState;
  onToggleComplete: () => void;
  onRowClick?: () => void;
}

function SortableTaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState,
  onToggleComplete,
  onRowClick,
}: SortableTaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    // 展开态下行内是可编辑卡片，整行 listeners 会把框选文字的鼠标移动识别为拖拽，
    // 因此展开时不可拖（仍作为放置目标）。
    useSortable({
      id: task.id,
      disabled: { draggable: selectionState === 'expanded', droppable: false },
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn('relative', isDragging && 'invisible')}
      {...attributes}
      {...listeners}
    >
      <TaskItem
        task={task}
        projectTitle={projectTitle}
        areaTitle={areaTitle}
        selectionState={selectionState}
        onToggleComplete={onToggleComplete}
        onRowClick={onRowClick}
      />
    </div>
  );
}

export function TaskList({
  tasks,
  projects = {},
  areas = {},
  selectedIds = [],
  expandedId,
  onRowClick,
  onToggleComplete,
onReorder,
  sortable = true,
  emptyHint,
  hideEmptyState,
  hideOwnership = false,
}: Props) {
  const { t } = useTranslation();
  // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
  const [heldTasks, holdOrder] = useHeldOrder(tasks, taskKey);
  // 多项拖拽：整组任务 id；拖拽开始那次提交之后（collapsed）组内其余行收起，
  // 被拖行才贴着手（见 useCollapseAfterDragStart）。
  const [drag, setDrag] = React.useState<{
    activeId: string;
    group: string[];
    collapsed: boolean;
  } | null>(null);
  const topTasks = React.useMemo(() => {
    if (!drag?.collapsed) return heldTasks;
    const companions = new Set(drag.group.filter((id) => id !== drag.activeId));
    return heldTasks.filter((task) => !companions.has(task.id));
  }, [heldTasks, drag]);
  useCollapseAfterDragStart(!!drag && !drag.collapsed, () =>
    setDrag((current) => (current ? { ...current, collapsed: true } : current)),
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const draggable = sortable && !!onReorder;
  const ownIds = React.useMemo(() => new Set(heldTasks.map((t) => t.id)), [heldTasks]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    const group = dragGroupOf(
      id,
      heldTasks.map((t) => t.id),
      dragSelectionIds(),
    );
    if (group) setDrag({ activeId: id, group, collapsed: false });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setDrag(null);
    setActiveId(null);
    if (!over || !onReorder) return;
    const ids = topTasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    let reordered = arrayMove(ids, oldIndex, newIndex);
    // 多项拖拽：整组按原显示顺序落在被拖任务的位置。
    if (drag) reordered = expandDragGroup(reordered, drag.activeId, drag.group, taskIdOf);
    if (reordered.join('|') === heldTasks.map((t) => t.id).join('|')) return;
    holdOrder(reordered);
    onReorder(reordered);
  };

  const handleDragCancel = () => {
    setDrag(null);
    setActiveId(null);
  };

  /** 拖到侧边栏的载荷：被拖任务，多选时为整组（按显示顺序）。 */
  const sidebarPayload = (id: string): SidebarDropPayload | null => {
    const ids = heldTasks.map((t) => t.id);
    const group = dragGroupOf(id, ids, dragSelectionIds()) ?? [id];
    const tasks = heldTasks.filter((t) => group.includes(t.id));
    return tasks.length > 0 ? { kind: 'tasks', tasks } : null;
  };

  // 共享拖拽上下文里的一个 surface（ADR 0018）；不可排序时不认领任何拖拽。
  const surface = useDndSurface({
    owns: (id) => draggable && ownIds.has(id),
    sidebarPayload,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  if (topTasks.length === 0) {
    return hideEmptyState ? null : <EmptyState hint={emptyHint ?? t('task:empty')} />;
  }

  const titlesOf = (task: TaskResponseDto) => ({
    projectTitle: !hideOwnership && task.projectId ? projects[task.projectId] : undefined,
    areaTitle: !hideOwnership && task.areaId ? areas[task.areaId] : undefined,
  });

  const renderItems = () =>
    topTasks.map((task) => {
      const selectionState: SelectionState = selectionStateOf(
        selectedIds,
        expandedId ?? null,
        task.id,
      );
      const itemProps = {
        task,
        ...titlesOf(task),
        selectionState,
        onToggleComplete: () => onToggleComplete(task),
        onRowClick: onRowClick ? () => onRowClick(task.id) : undefined,
      };

      if (draggable) return <SortableTaskItem key={task.id} {...itemProps} />;
      return <TaskItem key={task.id} {...itemProps} />;
    });

  if (!draggable) {
    return <div className="flex flex-col">{renderItems()}</div>;
  }

  // 被拖行由 DragOverlay 跟手（才能越过内容区拖到侧边栏），原行留作不可见的空位。
  const activeTask = activeId ? heldTasks.find((t) => t.id === activeId) : undefined;
  return (
    <>
      <SortableContext items={topTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div {...dndListProps} className="flex flex-col">
          {renderItems()}
        </div>
      </SortableContext>
      {surface.overlayActive && (
        <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
          {activeTask ? (
            <div
              className={cn(dragOverlayClass, 'relative bg-card')}
              aria-hidden="true"
              {...{ inert: '' }}
            >
              <TaskItem
                task={activeTask}
                {...titlesOf(activeTask)}
                selectionState="idle"
                onToggleComplete={() => undefined}
              />
              <DragCountBadge count={drag?.group.length ?? 0} />
            </div>
          ) : null}
        </DragOverlay>
      )}
    </>
  );
}

function taskKey(task: TaskResponseDto) {
  return task.id;
}

function taskIdOf(id: string) {
  return id;
}
