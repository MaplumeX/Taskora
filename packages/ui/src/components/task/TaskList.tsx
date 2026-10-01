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

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';
import { selectionStateOf, type SelectionState } from '@taskora/api';
import { EmptyState } from '@/components/common/EmptyState';
import { dndListProps, useHeldOrder } from '../../lib/dnd';

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
    useSortable({ id: task.id });

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
}: Props) {
  const { t } = useTranslation();
  // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
  const [topTasks, holdOrder] = useHeldOrder(tasks, taskKey);

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
        projectTitle: task.projectId ? projects[task.projectId] : undefined,
        areaTitle: task.areaId ? areas[task.areaId] : undefined,
        selectionState,
        onToggleComplete: () => onToggleComplete(task),
        onRowClick: onRowClick ? () => onRowClick(task.id) : undefined,
      };

      if (sortable && onReorder) {
        return <SortableTaskItem key={task.id} {...itemProps} />;
      }
      return <TaskItem key={task.id} {...itemProps} />;
    });

  if (!sortable || !onReorder) {
    return <div className="flex flex-col">{renderItems()}</div>;
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = topTasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    const reordered = arrayMove(ids, oldIndex, newIndex);
    holdOrder(reordered);
    onReorder(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
