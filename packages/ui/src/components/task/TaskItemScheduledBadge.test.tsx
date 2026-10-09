import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatShortDate, parseCalendarDate } from '@taskora/api';
import { ScheduledType, TaskBucket, TaskStatus, type TaskResponseDto } from '@taskora/shared';
import { mockDesktop } from '@/test/media';
import type { ScheduledBadgeMode } from './TaskDateBadge';
import { TaskItem } from './TaskItem';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTaskQuery: () => ({ data: undefined }),
  useProjectsQuery: () => ({ data: [] }),
  useAreasQuery: () => ({ data: [] }),
  useTagsQuery: () => ({ data: [] }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useLaterProjectKind: () => () => null,
}));

const NOW = '2026-09-25T04:00:00.000Z';

function task(scheduledDate: string): TaskResponseDto {
  return {
    id: 'task-1',
    title: 'Pay rent',
    notes: null,
    scheduledDate,
    scheduledType: ScheduledType.DATE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: '2026-09-25',
    bucket: TaskBucket.SCHEDULED,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function renderRow(value: TaskResponseDto, mode: ScheduledBadgeMode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TaskItem
          task={value}
          selectionState="idle"
          showScheduledBadge={mode}
          onToggleComplete={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let restoreMedia: () => void;
beforeEach(() => {
  restoreMedia = mockDesktop(true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
  restoreMedia();
});

describe("TaskItem 行首计划日期标记的 'future' 模式（Today：截止日期带进来的条目）", () => {
  it('计划日期在以后：显示灰色日期 chip', () => {
    const { getByText } = renderRow(task('2026-09-30'), 'future');
    expect(getByText(formatShortDate(parseCalendarDate('2026-09-30')))).toBeInTheDocument();
  });

  it('计划日期 ≤ 今天：不显示黄星（Today 语境）', () => {
    const { container } = renderRow(task('2026-09-25'), 'future');
    expect(container.querySelector('svg.text-today')).toBeNull();
  });

  it('true 模式仍显示黄星', () => {
    const { container } = renderRow(task('2026-09-25'), true);
    expect(container.querySelector('svg.text-today')).not.toBeNull();
  });
});
