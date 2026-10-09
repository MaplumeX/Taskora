import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';

import { useSelectionStore } from '@taskora/api';

import { TaskItem } from './TaskItem';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  taskKeys: { detail: (id: string) => ['task', id] },
  useTaskQuery: () => ({ data: null }),
  useUpdateTask: () => ({ mutate: updateMock, isPending: false }),
  useCompleteTask: () => ({ mutate: completeMock, isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: deleteMock, isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useSkipTask: () => ({ mutate: skipMock, isPending: false }),
  useDuplicateTask: () => ({ mutateAsync: duplicateMock }),
  useDuplicateProject: () => ({ mutateAsync: vi.fn() }),
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
const completeMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const duplicateMock = vi.hoisted(() => vi.fn(async (id: string) => ({ id: `${id}-copy` })));

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

describe('TaskContextMenu — 多选整组', () => {
  const task2: TaskResponseDto = { ...baseTask, id: 'task-2', title: 'Other task' };
  const task3: TaskResponseDto = { ...baseTask, id: 'task-3', title: 'Third task' };

  beforeEach(() => {
    vi.clearAllMocks();
    useSelectionStore.setState({ scopes: {}, scopeOrder: [], scopeRank: {}, selectedIds: [] });
    useSelectionStore.getState().registerScope('list', [
      { id: 'task-1', kind: 'task', completed: false },
      { id: 'task-2', kind: 'task', completed: true },
      { id: 'task-3', kind: 'task', completed: false },
    ]);
    useSelectionStore.getState().setSelection(['task-1', 'task-2']);
    withQueryClient(
      <>
        {[baseTask, task2, task3].map((task) => (
          <TaskItem key={task.id} task={task} onToggleComplete={() => {}} onRowClick={() => {}} />
        ))}
      </>,
    );
  });

  it('右键选中行：菜单显示件数，完成只作用于组内未完成项', async () => {
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText('Other task'));
    expect(await screen.findByText(/2 selected|已选择 2 项/)).toBeInTheDocument();
    // 只作用于单个任务的动作不出现
    expect(screen.queryByRole('button', { name: /^(Convert to Project|转换为项目)/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^(Mark Complete|标记完成)$/ }));
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(completeMock).toHaveBeenCalledWith('task-1', expect.anything());
  });

  it('整组移动与删除', async () => {
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Move|移动)/ }));
    await user.click(screen.getByRole('option', { name: /Project Alpha/ }));
    for (const id of ['task-1', 'task-2']) {
      expect(updateMock).toHaveBeenCalledWith(
        { id, data: { projectId: 'project-1', areaId: null } },
        expect.anything(),
      );
    }

    fireEvent.contextMenu(screen.getByText('My task'));
    await user.click(await screen.findByRole('button', { name: /^(Delete|删除)/ }));
    expect(deleteMock.mock.calls.map(([id]) => id)).toEqual(['task-1', 'task-2']);
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('整组复制：按列表顺序逐个复制，选中副本', async () => {
    const user = userEvent.setup();
    useSelectionStore.getState().setSelection(['task-3', 'task-1']);
    fireEvent.contextMenu(screen.getByText('Third task'));
    await user.click(await screen.findByRole('button', { name: /^(Duplicate|复制)$/ }));
    await waitFor(() =>
      expect(useSelectionStore.getState().selectedIds).toEqual(['task-1-copy', 'task-3-copy']),
    );
    expect(duplicateMock.mock.calls.map(([id]) => id)).toEqual(['task-1', 'task-3']);
  });

  it('右键多选之外的行：只作用于它，多选改为只选中它', async () => {
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText('Third task'));
    await user.click(await screen.findByRole('button', { name: /^(Delete|删除)/ }));
    expect(deleteMock.mock.calls.map(([id]) => id)).toEqual(['task-3']);
    expect(useSelectionStore.getState().selectedIds).toEqual(['task-3']);
  });
});
