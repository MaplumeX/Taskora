import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { useProjectUiPrefsStore } from '@/lib/stores/projectUiPrefs.store';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { ProjectCompletedTasks } from './ProjectCompletedTasks';

/* ------------- fixtures (hoisted so vi.mock can reference them) ------------- */

const queryMocks = vi.hoisted(() => ({
  useTasksQuery: vi.fn(),
  useUncompleteTask: vi.fn(),
  useProjectHeadingsQuery: vi.fn(),
  useUpdateProjectHeading: vi.fn(),
  useDeleteProjectHeading: vi.fn(),
  useConvertProjectHeadingToProject: vi.fn(),
  useArchiveProjectHeading: vi.fn(),
  useUnarchiveProjectHeading: vi.fn(),
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

vi.mock('@/lib/hooks/useProjectHeadings', () => ({
  useProjectHeadingsQuery: (...args: unknown[]) => queryMocks.useProjectHeadingsQuery(...args),
  useUpdateProjectHeading: () => queryMocks.useUpdateProjectHeading(),
  useDeleteProjectHeading: () => queryMocks.useDeleteProjectHeading(),
  useConvertProjectHeadingToProject: () => queryMocks.useConvertProjectHeadingToProject(),
  useArchiveProjectHeading: () => queryMocks.useArchiveProjectHeading(),
  useUnarchiveProjectHeading: () => queryMocks.useUnarchiveProjectHeading(),
}));

vi.mock('@/lib/hooks/useProjects', () => ({
  useProjectsQuery: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/useAreas', () => ({
  useAreasQuery: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/useTags', () => ({
  useTagsQuery: () => ({ data: [] }),
}));

// useTaskRowSelection delegates to the Zustand uiInteractionStore. We let it
// run for real so that expanded-state selection logic is exercised — just
// reset the store between tests.

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

function mockHeadings(headings: ProjectHeadingResponseDto[]) {
  queryMocks.useProjectHeadingsQuery.mockReturnValue({
    data: headings,
    isLoading: false,
    isError: false,
  });
}

function mockHeadingMutations() {
  queryMocks.useUpdateProjectHeading.mockReturnValue({ mutate: vi.fn(), isPending: false });
  queryMocks.useDeleteProjectHeading.mockReturnValue({ mutate: vi.fn(), isPending: false });
  queryMocks.useConvertProjectHeadingToProject.mockReturnValue({ mutate: vi.fn(), isPending: false });
  queryMocks.useArchiveProjectHeading.mockReturnValue({ mutate: vi.fn(), isPending: false });
  const unarchiveMutate = vi.fn();
  queryMocks.useUnarchiveProjectHeading.mockReturnValue({
    mutate: unarchiveMutate,
    isPending: false,
  });
  return { unarchiveMutate };
}

function makeHeading(overrides: Partial<ProjectHeadingResponseDto> = {}): ProjectHeadingResponseDto {
  return {
    id: 'heading-1',
    projectId: 'project-1',
    title: 'Archived group',
    sortOrder: 0,
    status: HeadingStatus.COMPLETED,
    completedAt: '2025-08-08T00:00:00.000Z',
    createdAt: '2025-08-08T00:00:00.000Z',
    updatedAt: '2025-08-08T00:00:00.000Z',
    ...overrides,
  };
}

/* ------------- tests ------------- */

describe('ProjectCompletedTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset persisted prefs store + uiInteraction store
    useProjectUiPrefsStore.setState({ completedPanelExpanded: {} });
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
    // default: no archived headings, heading mutations ready
    mockHeadings([]);
    mockHeadingMutations();
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

  it('preserves server sortOrder instead of re-sorting by completedAt', async () => {
    const user = userEvent.setup();
    // sortOrder dictates display order: t-first (sortOrder 0) then t-second (1).
    // completedAt desc would put t-second first — assert that does NOT happen.
    mockQuery([
      makeTask({
        id: 't-first',
        title: 'First',
        sortOrder: 0,
        completedAt: '2025-08-01T00:00:00.000Z',
      }),
      makeTask({
        id: 't-second',
        title: 'Second',
        sortOrder: 1,
        completedAt: '2025-08-10T00:00:00.000Z',
      }),
    ]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    const allItems = screen.getAllByText(/First|Second/);
    expect(allItems[0]).toHaveTextContent('First');
    expect(allItems[1]).toHaveTextContent('Second');
  });

  /* --------------------------- archived heading grouping --------------------------- */

  it('renders ungrouped tasks first, then archived heading blocks in sortOrder', async () => {
    const user = userEvent.setup();
    const h1 = makeHeading({ id: 'h-1', title: 'Sprint 1', sortOrder: 0 });
    const h2 = makeHeading({ id: 'h-2', title: 'Sprint 2', sortOrder: 1 });
    mockHeadings([h1, h2]);
    mockQuery([
      // ungrouped tasks (headingId null) come first
      makeTask({ id: 't-flat-1', title: 'Flat 1', headingId: null, sortOrder: 0 }),
      makeTask({ id: 't-flat-2', title: 'Flat 2', headingId: null, sortOrder: 1 }),
      // grouped under h-1
      makeTask({ id: 't-g1', title: 'Grouped 1', headingId: 'h-1', sortOrder: 0 }),
      // grouped under h-2 (empty of tasks, heading still shows)
    ]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    // count = 3 tasks + 2 archived headings = 5
    expect(screen.getByText('5')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    // Archived heading titles appear as group labels
    expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2')).toBeInTheDocument();
    // All tasks visible
    expect(screen.getByText('Flat 1')).toBeInTheDocument();
    expect(screen.getByText('Flat 2')).toBeInTheDocument();
    expect(screen.getByText('Grouped 1')).toBeInTheDocument();

    // Verify DOM order: flat tasks before heading blocks
    const flat1 = screen.getByText('Flat 1');
    const flat2 = screen.getByText('Flat 2');
    const sprint1 = screen.getByText('Sprint 1');
    const grouped1 = screen.getByText('Grouped 1');
    const sprint2 = screen.getByText('Sprint 2');
    expect(flat1.compareDocumentPosition(flat2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(flat2.compareDocumentPosition(sprint1)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sprint1.compareDocumentPosition(grouped1)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(grouped1.compareDocumentPosition(sprint2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('displays archived heading even when it has no completed tasks', async () => {
    const user = userEvent.setup();
    const archivedHeading = makeHeading({ id: 'h-empty', title: 'Empty archive' });
    mockHeadings([archivedHeading]);
    mockQuery([]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    // count = 0 tasks + 1 archived heading = 1
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Empty archive')).toBeInTheDocument();
  });

  it('calls unarchive mutation when unarchive menu item is clicked', async () => {
    const user = userEvent.setup();
    const archivedHeading = makeHeading({ id: 'h-1', title: 'Sprint 1' });
    mockHeadings([archivedHeading]);
    mockQuery([makeTask({ id: 't-1', title: 'Task', headingId: 'h-1' })]);
    const { unarchiveMutate } = mockHeadingMutations();
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // open the archived heading's dropdown menu (now via ProjectHeadingRow)
    await user.click(
      screen.getByRole('button', { name: /Heading actions|标题操作/ }),
    );

    // click unarchive menu item
    await user.click(
      await screen.findByRole('menuitem', { name: /Unarchive|取消归档/ }),
    );

    expect(unarchiveMutate).toHaveBeenCalledWith(
      'h-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('renders nothing when there are no completed tasks and no archived headings', () => {
    mockQuery([]);
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectCompletedTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  /* --------------------------- in-place editing --------------------------- */

  it('expands a completed task row for editing when clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Editable task' })]);
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // Click the task row (the span with the title) to select
    await user.click(screen.getByText('Editable task'));

    // Click again to expand — the title Input should become visible
    await user.click(screen.getByText('Editable task'));

    // expanded state shows a title input with the task title as value
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Editable task');
  });

  it('enters inline edit mode when an archived heading title is clicked', async () => {
    const user = userEvent.setup();
    const archivedHeading = makeHeading({ id: 'h-1', title: 'Sprint 1' });
    mockHeadings([archivedHeading]);
    mockQuery([makeTask({ id: 't-1', title: 'Task', headingId: 'h-1' })]);
    mockHeadingMutations();
    mockUncomplete();
    withQueryClient(<ProjectCompletedTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // Click the heading title button to enter inline edit
    await user.click(screen.getByRole('button', { name: 'Sprint 1' }));

    // An input with the heading title should be visible
    const input = await screen.findByDisplayValue('Sprint 1');
    expect(input).toBeInTheDocument();
  });
});