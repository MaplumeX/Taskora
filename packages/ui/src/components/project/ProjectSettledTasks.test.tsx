import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { mockDesktop } from '@/test/media';

import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { useProjectUiPrefsStore } from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { ProjectSettledTasks } from './ProjectSettledTasks';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
    useTasksQuery: (...args: unknown[]) => queryMocks.useTasksQuery(...args),
  useUncompleteTask: () => queryMocks.useUncompleteTask(),
  useTaskQuery: () => ({ data: null }),
  useProjectQuery: () => ({ data: undefined }),
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
    useProjectHeadingsQuery: (...args: unknown[]) => queryMocks.useProjectHeadingsQuery(...args),
  useUpdateProjectHeading: () => queryMocks.useUpdateProjectHeading(),
  useDeleteProjectHeading: () => queryMocks.useDeleteProjectHeading(),
  useConvertProjectHeadingToProject: () => queryMocks.useConvertProjectHeadingToProject(),
  useArchiveProjectHeading: () => queryMocks.useArchiveProjectHeading(),
  useUnarchiveProjectHeading: () => queryMocks.useUnarchiveProjectHeading(),
    useProjectsQuery: () => ({ data: [] }),
    useAreasQuery: () => ({ data: [] }),
    useTagsQuery: () => ({ data: [] }),
}));

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
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.COMPLETED,
    completedAt: '2025-08-08T00:00:00.000Z',
    trashedAt: null,
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
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
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
    status: HeadingStatus.COMPLETED,
    completedAt: '2025-08-08T00:00:00.000Z',
    createdAt: '2025-08-08T00:00:00.000Z',
    updatedAt: '2025-08-08T00:00:00.000Z',
    ...overrides,
  };
}

/* ------------- tests ------------- */

describe('ProjectSettledTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset persisted prefs store + uiInteraction store
    useProjectUiPrefsStore.setState({ completedPanelExpanded: {} });
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
    // default: no archived headings, heading mutations ready
    mockHeadings([]);
    mockHeadingMutations();
  });

  it('renders nothing when there are no settled tasks', () => {
    mockQuery([]);
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectSettledTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders toggle bar with count when there are settled tasks', () => {
    mockQuery([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    expect(screen.getByText(/Settled|已了结/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('expands and collapses the list when toggle is clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

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

  it('shows the settled date badge at the row start (like Logbook)', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // 只断言日期标签存在；具体值随 locale / 时区变化（Aug 8 / août 8 / 8月8日）。
    const row = screen.getByText('Task A').closest('[data-selection-row]')!;
    expect(row.querySelector('span.text-meta.text-primary')).toBeInTheDocument();
  });

  it('calls uncomplete mutation when checkbox is clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Task A' })]);
    const { mutate } = mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

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
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(useProjectUiPrefsStore.getState().completedPanelExpanded).toEqual({
      'project-1': true,
    });
  });

  it('renders nothing while loading', () => {
    mockQuery([], { isLoading: true });
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectSettledTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    mockQuery([], { isError: true });
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectSettledTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('includes completed and cancelled tasks under Settled, excluding active and trashed tasks', async () => {
    mockQuery([
      makeTask({ id: 't1', title: 'Completed' }),
      makeTask({ id: 't2', title: 'Active', status: TaskStatus.ACTIVE }),
      makeTask({ id: 't3', title: 'Trashed', trashedAt: '2025-08-09T00:00:00.000Z' }),
      makeTask({ id: 't4', title: 'Cancelled', status: TaskStatus.CANCELLED }),
    ]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    expect(screen.getByText(/Settled|已了结/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Trashed')).not.toBeInTheDocument();
  });

  it('sorts settled tasks by settled time, most recent first', async () => {
    const user = userEvent.setup();
    mockQuery([
      makeTask({ id: 't-old', title: 'Older', completedAt: '2025-08-01T00:00:00.000Z' }),
      makeTask({ id: 't-new', title: 'Newer', completedAt: '2025-08-10T00:00:00.000Z' }),
    ]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    const allItems = screen.getAllByText(/Older|Newer/);
    expect(allItems[0]).toHaveTextContent('Newer');
    expect(allItems[1]).toHaveTextContent('Older');
  });

  /* --------------------------- archived heading grouping --------------------------- */

  it('interleaves archived headings with tasks by settled time, most recent first', async () => {
    const user = userEvent.setup();
    const h1 = makeHeading({
      id: 'h-1',
      title: 'Sprint 1',
      position: 'a0',
      completedAt: '2025-08-05T00:00:00.000Z',
    });
    const h2 = makeHeading({
      id: 'h-2',
      title: 'Sprint 2',
      position: 'a1',
      completedAt: '2025-08-20T00:00:00.000Z',
    });
    mockHeadings([h1, h2]);
    mockQuery([
      makeTask({
        id: 't-flat-old',
        title: 'Flat old',
        position: 'a0',
        completedAt: '2025-08-01T00:00:00.000Z',
      }),
      makeTask({
        id: 't-flat-mid',
        title: 'Flat mid',
        position: 'a1',
        completedAt: '2025-08-10T00:00:00.000Z',
      }),
      makeTask({
        id: 't-g-old',
        title: 'Grouped old',
        headingId: 'h-1',
        position: 'a2',
        completedAt: '2025-08-02T00:00:00.000Z',
      }),
      makeTask({
        id: 't-g-new',
        title: 'Grouped new',
        headingId: 'h-1',
        position: 'a3',
        completedAt: '2025-08-05T00:00:00.000Z',
      }),
      // h-2 has no tasks; heading still shows
    ]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    // count = 4 tasks + 2 archived headings = 6
    expect(screen.getByText('6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    const order = [
      'Sprint 2',
      'Flat mid',
      'Sprint 1',
      'Grouped new',
      'Grouped old',
      'Flat old',
    ].map((text) => screen.getByText(text));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('displays archived heading even when it has no settled tasks', async () => {
    const user = userEvent.setup();
    const archivedHeading = makeHeading({ id: 'h-empty', title: 'Empty archive' });
    mockHeadings([archivedHeading]);
    mockQuery([]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    // count = 0 tasks + 1 archived heading = 1
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Empty archive')).toBeInTheDocument();
  });

  it('calls unarchive mutation when unarchive menu item is clicked', async () => {
    const restoreMedia = mockDesktop(true);
    onTestFinished(restoreMedia);
    const user = userEvent.setup();
    const archivedHeading = makeHeading({ id: 'h-1', title: 'Sprint 1' });
    mockHeadings([archivedHeading]);
    mockQuery([makeTask({ id: 't-1', title: 'Task', headingId: 'h-1' })]);
    const { unarchiveMutate } = mockHeadingMutations();
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // open the archived heading's dropdown menu (now via ProjectHeadingRow)
    await user.click(
      screen.getByRole('button', { name: /Heading actions|项目分组标题操作/ }),
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

  it('renders nothing when there are no settled tasks and no archived headings', () => {
    mockQuery([]);
    mockUncomplete();
    const { container } = withQueryClient(
      <ProjectSettledTasks projectId="project-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  /* --------------------------- in-place editing --------------------------- */

  it('expands a completed task row for editing when clicked', async () => {
    const user = userEvent.setup();
    mockQuery([makeTask({ id: 't1', title: 'Editable task' })]);
    mockUncomplete();
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

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
    withQueryClient(<ProjectSettledTasks projectId="project-1" />);

    await user.click(screen.getByRole('button', { expanded: false }));

    // Click the heading title button to enter inline edit
    await user.click(screen.getByRole('button', { name: 'Sprint 1' }));

    // An input with the heading title should be visible
    const input = await screen.findByDisplayValue('Sprint 1');
    expect(input).toBeInTheDocument();
  });
});
