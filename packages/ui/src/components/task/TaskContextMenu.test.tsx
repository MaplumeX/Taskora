import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';

import { TaskItem } from './TaskItem';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  taskKeys: { detail: (id: string) => ['task', id] },
  useTaskQuery: () => ({ data: null }),
  useUpdateTask: () => ({ mutate: updateMock, isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useSkipTask: () => ({ mutate: skipMock, isPending: false }),
  useProjectsQuery: () => ({
    data: [
      { id: 'project-1', title: 'Project Alpha', areaId: null, status: 'ACTIVE', trashedAt: null },
    ],
  }),
  useAreasQuery: () => ({ data: [{ id: 'area-1', title: 'Work Area' }] }),
  useTagsQuery: () => ({ data: [] }),
}));

const updateMock = vi.hoisted(() => vi.fn());
const skipMock = vi.hoisted(() => vi.fn());

const baseTask: TaskResponseDto = {
  id: 'task-1',
  title: 'My task',
  notes: null,
  scheduledDate: null,
  scheduledType: ScheduledType.NONE,
  reminderTime: null,
  repeatRule: null,
  repeatSourceId: null,
  dueDate: null,
  bucket: TaskBucket.INBOX,
  status: TaskStatus.ACTIVE,
  completedAt: null,
  trashedAt: null,
  sortOrder: 0,
  projectId: null,
  headingId: null,
  areaId: null,
  tags: [],
  subtasks: [],
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
};

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TaskContextMenu — move picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves task to a project via the Move menu entry, then closes', async () => {
    const user = userEvent.setup();
    withQueryClient(<TaskItem task={baseTask} onToggleComplete={() => {}} onRowClick={() => {}} />);

    // 右键打开菜单
    fireEvent.contextMenu(screen.getByText('My task'));
    const moveItem = await screen.findByRole('button', { name: /^(Move|移动)/ });
    await user.click(moveItem);

    // 移动选择器：Inbox 在首位（当前位置打勾），其后与侧边栏同序
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringMatching(/Inbox|收件箱/),
      'Project Alpha',
      'Work Area',
    ]);
    expect(screen.getByRole('option', { name: /Inbox|收件箱/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(screen.getByRole('option', { name: /Project Alpha/ }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        { id: 'task-1', data: { projectId: 'project-1', areaId: null } },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('moves task to an area by typing', async () => {
    const user = userEvent.setup();
    withQueryClient(<TaskItem task={baseTask} onToggleComplete={() => {}} onRowClick={() => {}} />);

    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Move|移动)/ }));
    await user.type(screen.getByRole('combobox'), 'work{Enter}');
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        { id: 'task-1', data: { projectId: null, areaId: 'area-1' } },
        expect.anything(),
      ),
    );
  });

  it('moving a scheduled project task to Inbox clears ownership and schedule', async () => {
    const user = userEvent.setup();
    const scheduled: TaskResponseDto = {
      ...baseTask,
      projectId: 'project-1',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-05',
      bucket: TaskBucket.SCHEDULED,
    };
    withQueryClient(
      <TaskItem task={scheduled} onToggleComplete={() => {}} onRowClick={() => {}} />,
    );

    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Move|移动)/ }));
    expect(screen.getByRole('option', { name: /Project Alpha/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.type(screen.getByRole('combobox'), 'inbox{Enter}');
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        {
          id: 'task-1',
          data: {
            projectId: null,
            areaId: null,
            bucket: TaskBucket.INBOX,
            scheduledType: ScheduledType.NONE,
          },
        },
        expect.anything(),
      ),
    );
  });
});

describe('TaskContextMenu — 跳过本次', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const repeating: TaskResponseDto = {
    ...baseTask,
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2026-02-05',
    bucket: TaskBucket.SCHEDULED,
    repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
  };
  const openMenu = (task: TaskResponseDto) => {
    withQueryClient(<TaskItem task={task} onToggleComplete={() => {}} onRowClick={() => {}} />);
    fireEvent.contextMenu(screen.getByText('My task'));
  };
  const skipName = /^(Skip Occurrence|跳过本次)$/;

  it('重复任务显示入口，点击调用 skip', async () => {
    const user = userEvent.setup();
    openMenu(repeating);
    await user.click(await screen.findByRole('button', { name: skipName }));
    expect(skipMock).toHaveBeenCalledWith('task-1', expect.anything());
  });

  it('无规则的任务不显示入口', async () => {
    openMenu({ ...repeating, repeatRule: null });
    await screen.findByRole('button', { name: /^(Move|移动)/ });
    expect(screen.queryByRole('button', { name: skipName })).toBeNull();
  });

  it('已完成的重复任务不显示入口', async () => {
    openMenu({ ...repeating, status: TaskStatus.COMPLETED });
    await screen.findByRole('button', { name: /^(Move|移动)/ });
    expect(screen.queryByRole('button', { name: skipName })).toBeNull();
  });

  it('链已到头（until 已过）：入口禁用，点击无效', async () => {
    const user = userEvent.setup();
    openMenu({ ...repeating, repeatRule: { ...repeating.repeatRule!, until: '2026-02-06' } });
    const item = await screen.findByRole('button', { name: skipName });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(skipMock).not.toHaveBeenCalled();
  });
});
