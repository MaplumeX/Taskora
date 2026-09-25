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
  useProjectsQuery: () => ({
    data: [{ id: 'project-1', title: 'Project Alpha', areaId: null }],
  }),
  useAreasQuery: () => ({ data: [{ id: 'area-1', title: 'Work Area' }] }),
  useTagsQuery: () => ({ data: [] }),
}));

const updateMock = vi.hoisted(() => vi.fn());

const baseTask: TaskResponseDto = {
  id: 'task-1',
  title: 'My task',
  notes: null,
  scheduledDate: null,
  scheduledType: ScheduledType.NONE,
  reminderTime: null,
  repeatRule: null,
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

  it('moves task to a project via the Move menu entry', async () => {
    const user = userEvent.setup();
    withQueryClient(<TaskItem task={baseTask} onToggleComplete={() => {}} onRowClick={() => {}} />);

    // 右键打开菜单
    fireEvent.contextMenu(screen.getByText('My task'));
    const moveItem = await screen.findByRole('button', { name: /^(Move|移动)/ });
    await user.click(moveItem);

    // 移动面板同时列出区域与项目条目
    expect(screen.getByRole('heading', { name: /^(Area|区域)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^(Project|项目)/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Project Alpha/ }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        { id: 'task-1', data: { projectId: 'project-1' } },
        expect.anything(),
      ),
    );
  });

  it('moves task to an area and can clear it with none', async () => {
    const user = userEvent.setup();
    withQueryClient(<TaskItem task={baseTask} onToggleComplete={() => {}} onRowClick={() => {}} />);

    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Move|移动)/ }));

    await user.click(screen.getByRole('button', { name: /Work Area/ }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        { id: 'task-1', data: { areaId: 'area-1' } },
        expect.anything(),
      ),
    );

    // 「无」条目用于清除归属（区域分区在项目分区之前，取第一个）
    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Move|移动)/ }));
    await user.click(screen.getAllByRole('button', { name: /^(None|无)$/ })[0]);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        { id: 'task-1', data: { areaId: null } },
        expect.anything(),
      ),
    );
  });
});
