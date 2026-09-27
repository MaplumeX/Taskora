import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDaySheet } from './CalendarDaySheet';
import { CalendarMonthGrid } from './CalendarMonthGrid';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTaskQuery: () => ({ data: null }),
  useProjectsQuery: () => ({ data: [] }),
  useAreasQuery: () => ({ data: [] }),
}));

function task(id: string, scheduledDate: string, status = TaskStatus.ACTIVE): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate,
    scheduledType: ScheduledType.DATE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function Harness({ tasksByDate }: { tasksByDate: Map<string, TaskResponseDto[]> }) {
  const [open, setOpen] = useState<Date | null>(null);
  const key = open
    ? `${open.getFullYear()}-${String(open.getMonth() + 1).padStart(2, '0')}-${String(open.getDate()).padStart(2, '0')}`
    : '';
  return (
    <>
      <CalendarMonthGrid
        anchor={new Date(2026, 8, 15)}
        tasksByDate={tasksByDate}
        weekStartsOn={1}
        locale="en"
        onOpenDay={setOpen}
      />
      <CalendarDaySheet
        date={open}
        tasks={tasksByDate.get(key) ?? []}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function renderGrid(tasksByDate: Map<string, TaskResponseDto[]>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness tasksByDate={tasksByDate} />
    </QueryClientProvider>,
  );
}

const cell = (date: string) =>
  document.querySelector<HTMLElement>(`[data-calendar-date="${date}"]`)!;

describe('CalendarMonthGrid', () => {
  it('shows task titles as chips inside the day cell', () => {
    renderGrid(new Map([['2026-09-10', [task('Pay rent', '2026-09-10')]]]));

    expect(within(cell('2026-09-10')).getByText('Pay rent')).toBeInTheDocument();
  });

  it('collapses tasks beyond the cell capacity into a +N chip', () => {
    // 测不到高度时默认容量 4：显示 3 条 + 「+3」
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task(id, '2026-09-10'));
    renderGrid(new Map([['2026-09-10', tasks]]));

    const day = cell('2026-09-10');
    expect(day.querySelectorAll('[data-calendar-chip]')).toHaveLength(3);
    expect(within(day).getByText('+3')).toBeInTheDocument();
  });

  it('marks days outside the anchor month', () => {
    renderGrid(new Map());

    expect(cell('2026-08-31')).toHaveAttribute('data-out-of-month', 'true');
    expect(cell('2026-09-01')).not.toHaveAttribute('data-out-of-month');
  });

  it('opens the day sheet with every task of that day', async () => {
    const user = userEvent.setup();
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task(id, '2026-09-10'));
    renderGrid(new Map([['2026-09-10', tasks]]));

    await user.click(cell('2026-09-10'));

    const sheet = await screen.findByRole('dialog', { name: /September 10/ });
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(within(sheet).getByText(id)).toBeInTheDocument();
    }

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
