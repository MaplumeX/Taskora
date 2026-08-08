import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskResponseDto } from '@taskora/shared';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { useProjectUiPrefsStore } from '@/lib/stores/projectUiPrefs.store';
import { ProjectCompletedTasks } from './ProjectCompletedTasks';

/* ------------- fixtures (hoisted so vi.mock can reference them) ------------- */

const queryMocks = vi.hoisted(() => ({
  useTasksQuery: vi.fn(),
  useUncompleteTask: vi.fn(),
}));

/* ------------- mocks ------------- */

vi.mock('@/lib/hooks/useTasks', () => ({
  useTasksQuery: (...args: unknown[]) => queryMocks.useTasksQuery(...args),
  useUncompleteTask: () => queryMocks.useUncompleteTask(),
  useTaskQuery: () => ({ data: null }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderTasks: () => ({ mutate: vi.fn(), isPending: false }),
  taskKeys: { all: ['tasks'], detail: (id: string) => ['task', id] },
}));

/* ------------- helpers ------------- */

function makeTask(overrides: Partial<TaskResponseDto> = {}): TaskResponseDto {
  return {
    id: 'task-1',
    title: 'Completed task',
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.COMPLETED,
    completedAt: '2025-08-08T00:00:00.000Z',
    trashedAt: null,
    sortOrder: 0,
    projectId: 'project-1',
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2025-08-08T00:00:00.000Z',
    updatedAt: '2025-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function mockQuery(data: TaskResponseDto[], overrides: Partial<ReturnType<typeof queryMocks.useTasksQuery>> = {}) {
  queryMocks.useTasksQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...overrides,
  });
}

function mockUncomplete() {
  const mutate = vi.fn();
  queryMocks.useUncompleteTask.mockReturnValue({ mutate, isPending: false });
  return { mutate };
}

/* ------------- tests ------------- */

describe('ProjectCompletedTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset persisted prefs store
    useProjectUiPrefsStore.setState({ completedPanelExpanded: {} });
  });

  it('renders nothing when there are no completed tasks', () => {
    mockQuery([]);
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectCompletedTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders toggle bar with count when there are completed tasks', () => {
    mockQuery([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    expect(screen.getByText(/Completed|已完成/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('expands and collapses the list when toggle is clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    // collapsed by default — task not visible
    expect(screen.queryByText('Task A')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { expanded: false });
    await user.click(toggle);

    // expanded — task visible
    expect(screen.getByText('Task A')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // click again to collapse
    await user.click(toggle);
    expect(screen.queryByText('Task A')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls uncomplete mutation when checkbox is clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    const { mutate } = mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    // expand
    await user.click(screen.getByRole('button', { expanded: false }));

    // click checkbox
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(mutate).toHaveBeenCalledWith('t1', expect.anything());
  });

  it('persists expand preference to the store', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(useProjectUiPrefsStore.getState().completedPanelExpanded).toEqual({
      'project-1': true,
    });
  });

  it('renders nothing while loading', () => {
    mockQuery([], { isLoading: true });
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectCompletedTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    mockQuery([], { isError: true });
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectCompletedTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('filters out non-COMPLETED and trashed tasks', () => {
    mockQuery([
      makeTask({ id: 't1', title: 'Completed' }),
      makeTask({ id: 't2', title: 'Active', status: TaskStatus.ACTIVE }),
      makeTask({ id: 't3', title: 'Trashed', trashedAt: '2025-08-09T00:00:00.000Z' }),
    ]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    // count should be 1 (only the COMPLETED, non-trashed task)
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Trashed')).not.toBeInTheDocument();
  });

  it('sorts completed tasks by completedAt descending', async () => {
    const user = userEvent.setup();
    mockQuery([
      makeTask({ id: 't-old', title: 'Old', completedAt: '2025-08-01T00:00:00.000Z' }),
      makeTask({ id: 't-new', title: 'New', completedAt: '2025-08-10T00:00:00.000Z' }),
    ]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // "New" should appear before "Old" in the DOM
    const allItems = screen.getAllByText(/New|Old/);
    expect(allItems[0]).toHaveTextContent('New');
    expect(allItems[1]).toHaveTextContent('Old');
  });
});