import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';
import { useMultiSelectStore, useSelectionStore } from '@taskora/api';

import { TaskItem } from './TaskItem';
import { MultiSelectToolbar } from './MultiSelectToolbar';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  del: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  taskKeys: { detail: (id: string) => ['task', id] },
  useTaskQuery: () => ({ data: null }),
  useUpdateTask: () => ({ mutate: mocks.update, isPending: false }),
  useCompleteTask: () => ({ mutate: mocks.complete, isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncancelTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: mocks.del, isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectsQuery: () => ({
    data: [
      { id: 'project-1', title: 'Project Alpha', areaId: null, status: 'ACTIVE', trashedAt: null },
    ],
  }),
  useAreasQuery: () => ({ data: [] }),
  useTagsQuery: () => ({
    data: [
      { id: 'urgent', title: 'Urgent', color: '#EF4444', sortOrder: 0, tagGroupId: null },
      { id: 'home', title: 'Home', color: '#3B82F6', sortOrder: 1, tagGroupId: null },
    ],
  }),
  useTagGroupsQuery: () => ({ data: [] }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
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
  sortOrder: 0,
  projectId: null,
  headingId: null,
  areaId: null,
  tags: [],
  subtasks: [],
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
};

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/today']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function touch(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number) {
  fireEvent(
    target,
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: 10,
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    }),
  );
}

function swipeLeft(target: Element) {
  touch(target, 'pointerdown', 300);
  touch(target, 'pointermove', 250);
  touch(target, 'pointermove', 200);
  touch(target, 'pointerup', 200);
  // 左滑后浏览器补发的 click 应被吞掉。
  fireEvent.click(target);
}

beforeEach(() => {
  vi.clearAllMocks();
  useMultiSelectStore.setState({ active: false, ids: [] });
  useSelectionStore.setState({ scopes: {}, scopeOrder: [] });
});

describe('TaskItem — 左滑多选', () => {
  it('左滑进入多选模式并勾选本行，不触发行展开', () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <TaskItem task={baseTask} onToggleComplete={() => {}} onRowClick={onRowClick} />,
    );

    swipeLeft(screen.getByText('My task'));

    expect(useMultiSelectStore.getState()).toMatchObject({ active: true, ids: ['task-1'] });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('多选模式中点击行（含复选框）只切换勾选', () => {
    const onRowClick = vi.fn();
    const onToggleComplete = vi.fn();
    useMultiSelectStore.setState({ active: true, ids: [] });
    renderWithProviders(
      <TaskItem task={baseTask} onToggleComplete={onToggleComplete} onRowClick={onRowClick} />,
    );

    fireEvent.click(screen.getByText('My task'));
    expect(useMultiSelectStore.getState().ids).toEqual(['task-1']);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(useMultiSelectStore.getState().ids).toEqual([]);

    expect(onRowClick).not.toHaveBeenCalled();
    expect(onToggleComplete).not.toHaveBeenCalled();
  });

  it('触屏长按派发的 contextmenu 不打开菜单（长按只负责拖动）', () => {
    renderWithProviders(<TaskItem task={baseTask} onToggleComplete={() => {}} />);

    const event = new PointerEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
    });
    fireEvent(screen.getByText('My task'), event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('button', { name: /^(Move|移动)/ })).not.toBeInTheDocument();
  });
});

describe('MultiSelectToolbar', () => {
  it('不在多选模式时不渲染', () => {
    renderWithProviders(<MultiSelectToolbar />);
    expect(screen.queryByRole('button', { name: /^(Done|完成)$/ })).not.toBeInTheDocument();
  });

  it('删除作用于全部勾选项并退出模式', async () => {
    const user = userEvent.setup();
    useMultiSelectStore.setState({ active: true, ids: ['a', 'b'] });
    renderWithProviders(<MultiSelectToolbar />);

    expect(screen.getByText(/2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^(Delete|删除)$/ }));

    expect(mocks.del).toHaveBeenCalledWith('a', expect.anything());
    expect(mocks.del).toHaveBeenCalledWith('b', expect.anything());
    expect(useMultiSelectStore.getState().active).toBe(false);
  });

  it('移动：选择项目后批量改写并退出模式', async () => {
    const user = userEvent.setup();
    useMultiSelectStore.setState({ active: true, ids: ['a', 'b'] });
    renderWithProviders(<MultiSelectToolbar />);

    await user.click(screen.getByRole('button', { name: /^(Move|移动)$/ }));
    await user.click(await screen.findByRole('option', { name: /Project Alpha/ }));

    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'a', data: { projectId: 'project-1', areaId: null } },
      expect.anything(),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'b', data: { projectId: 'project-1', areaId: null } },
      expect.anything(),
    );
    await waitFor(() => expect(useMultiSelectStore.getState().active).toBe(false));
  });

  it('标签：多选三态，各任务在自己原有的标签上增减', async () => {
    const user = userEvent.setup();
    useSelectionStore.setState({
      scopes: {
        list: [
          { id: 'a', kind: 'task', tagIds: ['urgent', 'home'] },
          { id: 'b', kind: 'task', tagIds: [] },
        ],
      },
      scopeOrder: ['list'],
    });
    useMultiSelectStore.setState({ active: true, ids: ['a', 'b'] });
    renderWithProviders(<MultiSelectToolbar />);

    await user.click(screen.getByRole('button', { name: /^(More|更多)$/ }));
    await user.click(await screen.findByRole('menuitem', { name: /^(Tags|标签)$/ }));

    const urgent = await screen.findByRole('option', { name: 'Urgent' });
    expect(urgent).toHaveAttribute('aria-checked', 'mixed');
    await user.click(urgent);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'b', data: { tagIds: ['urgent'] } },
      expect.anything(),
    );
  });

  it('未勾选任何项时动作禁用；点「完成」退出模式', async () => {
    const user = userEvent.setup();
    useMultiSelectStore.setState({ active: true, ids: [] });
    renderWithProviders(<MultiSelectToolbar />);

    expect(screen.getByRole('button', { name: /^(Delete|删除)$/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^(Done|完成)$/ }));
    expect(useMultiSelectStore.getState().active).toBe(false);
  });

  it('切换页面即退出多选模式', () => {
    let navigate: ReturnType<typeof useNavigate> = () => {};
    function Nav() {
      navigate = useNavigate();
      return null;
    }
    renderWithProviders(
      <>
        <Nav />
        <MultiSelectToolbar />
      </>,
    );
    act(() => useMultiSelectStore.getState().enter('a'));

    act(() => navigate('/inbox'));
    expect(useMultiSelectStore.getState().active).toBe(false);
  });
});
