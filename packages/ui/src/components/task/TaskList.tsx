import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';
import { selectionStateOf, useSelectionStore, type SelectionState } from '@taskora/api';
import { EmptyState } from '@/components/common/EmptyState';
import { DragCountBadge } from '@/components/common/DragCountBadge';
import {
  dndListProps,
  dragGroupOf,
  expandDragGroup,
  useCollapseAfterDragStart,
  useHeldOrder,
} from '../../lib/dnd';

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
  /** 多项拖拽时一起拖动的任务数（被拖行上显示件数徽标）。 */
  dragCount?: number;
}

function SortableTaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState,
  onToggleComplete,
  onRowClick,
  dragCount = 0,
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
      className="relative"
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
      {isDragging && <DragCountBadge count={dragCount} />}
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

  // 鼠标：移动 5px 激活；触摸：按住 300ms 再移动才激活，避免与列表滚动
  // 冲突（PointerSensor 会在触摸滑动 5px 时误触拖拽）。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  if (topTasks.length === 0) {
    return hideEmptyState ? null : <EmptyState hint={emptyHint ?? t('task:empty')} />;
  }

  const renderItems = () =>
    topTasks.map((task) => {
      const selectionState: SelectionState = selectionStateOf(
        selectedIds,
        expandedId ?? null,
        task.id,
      );
      const itemProps = {
        task,
        projectTitle: !hideOwnership && task.projectId ? projects[task.projectId] : undefined,
        areaTitle: !hideOwnership && task.areaId ? areas[task.areaId] : undefined,
        selectionState,
        onToggleComplete: () => onToggleComplete(task),
        onRowClick: onRowClick ? () => onRowClick(task.id) : undefined,
      };

      if (sortable && onReorder) {
        return (
          <SortableTaskItem
            key={task.id}
            {...itemProps}
            dragCount={drag?.activeId === task.id ? drag.group.length : 0}
          />
        );
      }
      return <TaskItem key={task.id} {...itemProps} />;
    });

  if (!sortable || !onReorder) {
    return <div className="flex flex-col">{renderItems()}</div>;
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeId = String(active.id);
    const group = dragGroupOf(
      activeId,
      heldTasks.map((t) => t.id),
      useSelectionStore.getState().selectedIds,
    );
    if (group) setDrag({ activeId, group, collapsed: false });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setDrag(null);
    if (!over) return;
    const ids = topTasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    let reordered = arrayMove(ids, oldIndex, newIndex);
    // 多项拖拽：整组按原显示顺序落在被拖任务的位置。
    if (drag) reordered = expandDragGroup(reordered, drag.activeId, drag.group, taskIdOf);
    if (reordered.join('|') === heldTasks.map((t) => t.id).join('|')) return;
    holdOrder(reordered);
    onReorder(reordered);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext items={topTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div {...dndListProps} className="flex flex-col">
          {renderItems()}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function taskKey(task: TaskResponseDto) {
  return task.id;
}

function taskIdOf(id: string) {
  return id;
}
