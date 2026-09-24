import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskStatus, type SubtaskResponseDto } from '@taskora/shared';

import { TaskSubtasksBadge } from './TaskSubtasksBadge';

function subtask(status: TaskStatus): SubtaskResponseDto {
  return {
    id: `sub-${status}`,
    title: '子任务',
    status,
    completedAt: null,
    sortOrder: 0,
    taskId: 'task-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('TaskSubtasksBadge', () => {
  it('有子任务时渲染清单徽标并显示未了结数量', () => {
    render(
      <TaskSubtasksBadge
        subtasks={[subtask(TaskStatus.ACTIVE), subtask(TaskStatus.ACTIVE), subtask(TaskStatus.COMPLETED)]}
      />,
    );
    const badge = screen.getByText('2', { selector: '[data-subtasks-badge]' });
    expect(badge).toBeInTheDocument();
  });

  it('全部了结时不显示数量，仅保留图标', () => {
    render(<TaskSubtasksBadge subtasks={[subtask(TaskStatus.COMPLETED), subtask(TaskStatus.CANCELLED)]} />);
    const badge = screen.getByText('', { selector: '[data-subtasks-badge]' });
    expect(badge).toBeInTheDocument();
  });

  it('subtasks 为空数组 / undefined 时不渲染', () => {
    const { container, rerender } = render(<TaskSubtasksBadge subtasks={[]} />);
    expect(container.querySelector('[data-subtasks-badge]')).toBeNull();
    rerender(<TaskSubtasksBadge subtasks={undefined} />);
    expect(container.querySelector('[data-subtasks-badge]')).toBeNull();
  });
});
