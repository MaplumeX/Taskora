import { useSortable } from '@dnd-kit/sortable';
import type { FeedItem } from '@taskora/shared';
import type { SelectionState } from '@taskora/api';

import { flipId, noLayoutAnimation } from '../../lib/dnd';
import { FeedItemRow } from './FeedItemRow';

interface SortableFeedRowProps {
  dndId: string;
  dragDisabled?: boolean;
  item: FeedItem;
  placeholder: boolean;
  projectTitle?: string;
  areaTitle?: string;
  hidePlacement?: boolean;
  selectionState: SelectionState;
  onToggleComplete?: () => void;
  onRowClick?: () => void;
  showScheduledBadge?: boolean;
  /** New in Today 新到条目：行首左侧黄点。 */
  newInToday?: boolean;
}

/** 可拖拽的 feed 行：任务行，或顶部未分组区的独立项目行。 */
export function SortableFeedRow({
  dndId,
  dragDisabled = false,
  item,
  placeholder,
  projectTitle,
  areaTitle,
  hidePlacement,
  selectionState,
  onToggleComplete,
  onRowClick,
  showScheduledBadge,
  newInToday,
}: SortableFeedRowProps) {
  // 实时预览：布局随指针重排、位移由 FLIP 动画承担（见 lib/dnd.ts）。
  const { attributes, listeners, setNodeRef } = useSortable({
    id: dndId,
    animateLayoutChanges: noLayoutAnimation,
    // 展开态下行内是可编辑卡片，整行 listeners 会把框选文字的鼠标移动识别为拖拽，
    // 因此展开时不可拖（仍作为放置目标）。
    disabled: { draggable: dragDisabled || selectionState === 'expanded', droppable: false },
  });

  return (
    <div
      ref={setNodeRef}
      {...(item.type === 'task'
        ? { 'data-sortable-task-id': item.id }
        : { 'data-sortable-project-id': item.id })}
      {...flipId(dndId)}
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      {placeholder ? (
        // 空位：保留真实行（不可见），高度与被拖行完全一致。
        <div
          data-testid={`${item.type}-placeholder-${item.id}`}
          className="invisible"
          aria-hidden="true"
        >
          <FeedItemRow
            item={item}
            projectTitle={projectTitle}
            areaTitle={areaTitle}
            hidePlacement={hidePlacement}
            selectionState="idle"
            showScheduledBadge={showScheduledBadge}
            newInToday={newInToday}
          />
        </div>
      ) : (
        <FeedItemRow
          item={item}
          projectTitle={projectTitle}
          areaTitle={areaTitle}
          hidePlacement={hidePlacement}
          selectionState={selectionState}
          onToggleComplete={onToggleComplete}
          onRowClick={onRowClick}
          showScheduledBadge={showScheduledBadge}
          newInToday={newInToday}
        />
      )}
    </div>
  );
}
