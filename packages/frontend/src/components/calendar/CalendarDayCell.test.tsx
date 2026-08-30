import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDayCell } from './CalendarDayCell';

/* ------------- mocks ------------- */

const createTaskMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/hooks/useTasks', () => ({
  useCreateTask: () => ({
    mutate: createTaskMock,
    isPending: false,
  }),
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

    // 4th task hidden
    expect(screen.queryByText('t4')).not.toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('single click on blank area opens quick-add', async () => {
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

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('click on a task row does not open quick-add', async () => {
    const user = userEvent.setup();
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[task('alpha', '2026-08-30T12:00:00.000Z')]}
        onToggleComplete={onToggleComplete}
      />,
    );

    const row = screen.getByText('alpha');
    await user.click(row);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('quick-add fires create with correct ISO dueDate on Enter', async () => {
    const user = userEvent.setup();
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[]}
        onToggleComplete={onToggleComplete}
      />,
    );

    // open quick-add via the plus button
    const addButtons = screen.getAllByRole('button');
    const plusButton = addButtons.find((b) => b.querySelector('svg.lucide-plus'));
    expect(plusButton).toBeTruthy();
    await user.click(plusButton!);

    const input = screen.getByLabelText(/task|添加任务|Add task/);
    await user.type(input, 'New calendar task');
    await user.keyboard('{Enter}');

    expect(createTaskMock).toHaveBeenCalledWith(
      {
        title: 'New calendar task',
        dueDate: new Date(2026, 7, 30).toISOString(),
        scheduledType: ScheduledType.NONE,
      },
      expect.anything(),
    );
  });

  it('ignores empty quick-add title on Enter', async () => {
    createTaskMock.mockClear();
    const user = userEvent.setup();
    render(
      <CalendarDayCell
        date={new Date(2026, 7, 30)}
        tasks={[]}
        onToggleComplete={onToggleComplete}
      />,
    );

    const addButtons = screen.getAllByRole('button');
    const plusButton = addButtons.find((b) => b.querySelector('svg.lucide-plus'));
    await user.click(plusButton!);

    const input = screen.getByLabelText(/task|添加任务|Add task/);
    await user.type(input, '   ');
    await user.keyboard('{Enter}');

    expect(createTaskMock).not.toHaveBeenCalled();
  });
});
