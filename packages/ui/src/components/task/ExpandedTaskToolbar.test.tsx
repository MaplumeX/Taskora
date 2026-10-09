import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';
import {
  i18n,
  useSelectionStore,
  useTaskRowSelection,
  useUiInteractionStore,
} from '@taskora/api';

import { ExpandedTaskToolbar } from './ExpandedTaskToolbar';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  del: vi.fn(),
  restore: vi.fn(),
  duplicate: vi.fn(async (id: string) => ({ id: `${id}-copy` })),
  task: null as TaskResponseDto | null,
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTaskQuery: () => ({ data: mocks.task }),
  useSkipTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDuplicateTask: () => ({ mutateAsync: mocks.duplicate }),
  useDuplicateProject: () => ({ mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteTask: () => ({ mutate: mocks.del, isPending: false }),
  useRestoreTask: () => ({ mutate: mocks.restore, isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectsQuery: () => ({
    data: [
      { id: 'project-1', title: 'Project Alpha', areaId: null, status: 'ACTIVE', trashedAt: null },
    ],
  }),
  useAreasQuery: () => ({ data: [] }),
}));

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
  projectId: null,
  headingId: null,
  areaId: null,
  tags: [],
  subtasks: [],
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
};

/** 列表侧的点外收起逻辑（useTaskRowSelection）与工具栏同时挂载。 */
function ListSelection() {
  useTaskRowSelection();
  return null;
}

function renderToolbar(variant: 'bar' | 'floating' = 'bar') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/today']}>
        <ListSelection />
        <ExpandedTaskToolbar variant={variant} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const user = userEvent.setup();

describe('ExpandedTaskToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.task = { ...baseTask };
    useUiInteractionStore.setState({ expandedId: 'task-1' });
    useSelectionStore.getState().setSelection(['task-1']);
    void i18n.changeLanguage('en');
  });

  it('没有展开的任务时不渲染', () => {
    useUiInteractionStore.setState({ expandedId: null });
    renderToolbar();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('展开任务时显示移动 / 删除 / 更多', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('按下工具栏不算点到行外：展开态保持；点别处才收起', () => {
    renderToolbar();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move' }));
    expect(useUiInteractionStore.getState().expandedId).toBe('task-1');
    fireEvent.pointerDown(document.body);
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });

  it('收起后保留原按钮淡出，但不再可交互（aria-hidden + inert）', () => {
    const { container } = renderToolbar('floating');
    act(() => useUiInteractionStore.setState({ expandedId: null }));
    const toolbar = container.querySelector('[data-expanded-task-toolbar]');
    expect(toolbar).toHaveAttribute('aria-hidden', 'true');
    expect(toolbar).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
  });

  it('删除：删掉展开的任务并收起', async () => {
    renderToolbar();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.del).toHaveBeenCalledWith('task-1', expect.anything());
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('Trash 中的任务：「删除」换成「放回」', async () => {
    mocks.task = { ...baseTask, trashedAt: '2025-08-01T00:00:00.000Z' };
    renderToolbar('floating');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Put Back' }));
    expect(mocks.restore).toHaveBeenCalledWith('task-1', expect.anything());
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('移动：选择项目后改写归属并收起', async () => {
    renderToolbar();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('option', { name: /Project Alpha/ }));
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'task-1', data: { projectId: 'project-1', areaId: null } },
      expect.anything(),
    );
    await waitFor(() => expect(useUiInteractionStore.getState().expandedId).toBeNull());
  });

  it('更多：复制展开的任务', async () => {
    renderToolbar('floating');
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledWith('task-1'));
  });
});
