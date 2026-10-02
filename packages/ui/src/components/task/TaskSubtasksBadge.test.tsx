import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskStatus, type SubtaskResponseDto } from '@taskora/shared';

import { TaskSubtasksBadge } from './TaskSubtasksBadge';

function subtask(status: TaskStatus): SubtaskResponseDto {
  return {
    id: `sub-${status}`,
    title: '子任务',
    status,
    completedAt: null,
    taskId: 'task-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('TaskSubtasksBadge', () => {
  it('有子任务时渲染清单徽标', () => {
    const { container } = render(
      <TaskSubtasksBadge
        subtasks={[subtask(TaskStatus.ACTIVE), subtask(TaskStatus.ACTIVE), subtask(TaskStatus.COMPLETED)]}
      />,
    );
    expect(container.querySelector('[data-subtasks-badge]')).toBeInTheDocument();
  });

  it('全部了结时仍渲染图标', () => {
    const { container } = render(
      <TaskSubtasksBadge subtasks={[subtask(TaskStatus.COMPLETED), subtask(TaskStatus.CANCELLED)]} />,
    );
    expect(container.querySelector('[data-subtasks-badge]')).toBeInTheDocument();
  });

  it('subtasks 为空数组 / undefined 时不渲染', () => {
    const { container, rerender } = render(<TaskSubtasksBadge subtasks={[]} />);
    expect(container.querySelector('[data-subtasks-badge]')).toBeNull();
    rerender(<TaskSubtasksBadge subtasks={undefined} />);
    expect(container.querySelector('[data-subtasks-badge]')).toBeNull();
  });
});
