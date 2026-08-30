import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDayCell } from './CalendarDayCell';

/* ------------- mocks ------------- */

vi.mock('@/lib/hooks/useTasks', () => ({
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

/* ------------- fixtures ------------- */

function task(id: string, dueDate: string | null, status = TaskStatus.ACTIVE): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate,
    bucket: TaskBucket.INBOX,
    status,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}

const onToggleComplete = vi.fn();

/* ------------- tests ------------- */

describe('CalendarDayCell', () => {
  it('renders tasks on the cell matching their dueDate key', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[task('alpha', '2026-08-30T12:00:00.000Z'), task('beta', '2026-08-30T12:00:00.000Z')]}
        onToggleComplete={onToggleComplete}
      />,
    );

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('does not render tasks from other dates', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[]}
        onToggleComplete={onToggleComplete}
      />,
    );
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
  });

  it('renders completed tasks struck-through', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[task('done', '2026-08-30T12:00:00.000Z', TaskStatus.COMPLETED)]}
        onToggleComplete={onToggleComplete}
      />,
    );

    const title = screen.getByText('done');
    expect(title.className).toContain('line-through');
  });

  it('shows +N overflow indicator when tasks exceed maxRows', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[
          task('t1', '2026-08-30T12:00:00.000Z'),
          task('t2', '2026-08-30T12:00:00.000Z'),
          task('t3', '2026-08-30T12:00:00.000Z'),
          task('t4', '2026-08-30T12:00:00.000Z'),
        ]}
        maxRows={3}
        onToggleComplete={onToggleComplete}
      />,
    );

    // 4th task hidden in the cell body
    expect(screen.queryByText('t4')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument();
  });

  it('opens a popover with the full task list when "+N more" is clicked', async () => {
    const user = userEvent.setup();
    const tasks = [
      task('t1', '2026-08-30T12:00:00.000Z'),
      task('t2', '2026-08-30T12:00:00.000Z'),
      task('t3', '2026-08-30T12:00:00.000Z'),
      task('t4', '2026-08-30T12:00:00.000Z'),
    ];
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={tasks}
        maxRows={3}
        onToggleComplete={onToggleComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: '+1 more' }));

    // Popover (rendered via portal) shows the date header and ALL tasks
    expect(await screen.findByText('Sunday, Aug 30')).toBeInTheDocument();
    for (const taskName of ['t1', 't2', 't3', 't4']) {
      expect(screen.getAllByText(taskName).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('popover checkbox toggles complete callback and clicking outside closes it', async () => {
    const user = userEvent.setup();
    const tasks = [
      task('t1', '2026-08-30T12:00:00.000Z'),
      task('t2', '2026-08-30T12:00:00.000Z'),
      task('t3', '2026-08-30T12:00:00.000Z'),
      task('t4', '2026-08-30T12:00:00.000Z'),
    ];
    const { container } = render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={tasks}
        maxRows={3}
        onToggleComplete={onToggleComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: '+1 more' }));

    // The overflowed task (t4) only exists inside the popover
    const popoverRow = screen.getAllByText('t4')[0].closest('div')!;
    expect(popoverRow?.className).toContain('group/taskrow');
    const checkbox = popoverRow.querySelector('button[role="checkbox"]') as HTMLElement;
    await user.click(checkbox);

    expect(onToggleComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't4' }),
    );

    // Click outside (on document body) closes the popover
    await user.click(document.body);
    expect(screen.queryByText('Sunday, Aug 30')).not.toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('single click on blank area does not open a quick-add input', async () => {
    const user = userEvent.setup();
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[]}
        onToggleComplete={onToggleComplete}
      />,
    );

    const cell = screen.getByText('30').closest('div[data-calendar-date]')!;
    expect(cell).toBeTruthy();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(cell);

    // Regression: calendar is a read-only overview surface — no quick-add
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/添加任务|Add task/)).not.toBeInTheDocument();
  });
});
