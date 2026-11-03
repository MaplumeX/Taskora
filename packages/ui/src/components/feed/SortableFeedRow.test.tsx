import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { fireEvent, render, screen } from '@testing-library/react';
import { Start, TaskStatus, type TaskFeedItem } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SortableFeedRow } from './SortableFeedRow';

const taskItemRender = vi.hoisted(() => vi.fn());

vi.mock('@/components/task/TaskItem', () => ({
  TaskItem: (props: { onRowClick?: () => void; onToggleComplete: () => void }) => {
    taskItemRender();
    return (
      <>
        <button onClick={props.onRowClick}>row</button>
        <button onClick={props.onToggleComplete}>toggle</button>
      </>
    );
  },
}));

const item: TaskFeedItem = {
  id: 'a',
  type: 'task',
  title: 'a',
  notes: null,
  scheduledDate: null,
  start: Start.ANYTIME,
  reminderTime: null,
  repeatRule: null,
  repeatSourceId: null,
  dueDate: null,
  status: TaskStatus.ACTIVE,
  completedAt: null,
  trashedAt: null,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
  tags: [],
  projectId: null,
  headingId: null,
  areaId: null,
};

function Row({
  items,
  onRowClick,
  onToggleComplete,
}: {
  items: string[];
  onRowClick: () => void;
  onToggleComplete: () => void;
}) {
  return (
    <DndContext>
      <SortableContext items={items}>
        <SortableFeedRow
          dndId="a"
          item={item}
          placeholder={false}
          selectionState="idle"
          onRowClick={onRowClick}
          onToggleComplete={onToggleComplete}
        />
      </SortableContext>
    </DndContext>
  );
}

describe('SortableFeedRow', () => {
  beforeEach(() => taskItemRender.mockClear());

  it('列表重排（新闭包、新 items）不重渲染行内容，回调仍是最新的', () => {
    const staleClick = vi.fn();
    const staleToggle = vi.fn();
    const { rerender } = render(
      <Row items={['a', 'b']} onRowClick={staleClick} onToggleComplete={staleToggle} />,
    );
    expect(taskItemRender).toHaveBeenCalledTimes(1);

    const click = vi.fn();
    const toggle = vi.fn();
    rerender(<Row items={['b', 'a']} onRowClick={click} onToggleComplete={toggle} />);
    expect(taskItemRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('row'));
    fireEvent.click(screen.getByText('toggle'));
    expect(click).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledOnce();
    expect(staleClick).not.toHaveBeenCalled();
    expect(staleToggle).not.toHaveBeenCalled();
  });
});
