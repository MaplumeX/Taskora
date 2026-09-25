import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  AreaResponseDto,
  FeedItem,
  ProjectFeedItem,
  ProjectResponseDto,
  TaskFeedItem,
} from '@taskora/shared';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DndHandlers {
  collisionDetection?: (args: {
    active: { id: string };
    pointerCoordinates: { x: number; y: number } | null;
    droppableContainers: Array<{ id: string }>;
    droppableRects: Map<string, { top: number; height: number }>;
  }) => Array<{ id: unknown }>;
  onDragStart?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  onDragCancel?: () => void;
}

const harness = vi.hoisted(() => ({
  dndProps: null as DndHandlers | null,
  completeTaskMutate: vi.fn(),
  uncompleteTaskMutate: vi.fn(),
  reorderTasksMutate: vi.fn(),
  updateTaskMutate: vi.fn(),
  completeProjectMutate: vi.fn(),
  uncompleteProjectMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  projects: [] as ProjectResponseDto[],
  areas: [] as AreaResponseDto[],
  pointerCollisionIds: [] as string[],
  closestCollisionIds: [] as string[],
}));

vi.mock('@dnd-kit/core', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: DndHandlers & { children: React.ReactNode }) => {
      harness.dndProps = props;
      return ReactModule.createElement('div', { 'data-testid': 'dnd-context' }, props.children);
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('div', { 'data-testid': 'drag-overlay' }, children),
    closestCenter: ({ droppableContainers }: { droppableContainers: Array<{ id: string }> }) => {
      const candidates = new Set(droppableContainers.map(({ id }) => id));
      return harness.closestCollisionIds.filter((id) => candidates.has(id)).map((id) => ({ id }));
    },
    pointerWithin: ({ droppableContainers }: { droppableContainers: Array<{ id: string }> }) => {
      const candidates = new Set(droppableContainers.map(({ id }) => id));
      return harness.pointerCollisionIds.filter((id) => candidates.has(id)).map((id) => ({ id }));
    },
    useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
    useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors,
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

vi.mock('@/components/task/TaskItem', async () => {
  const ReactModule = await import('react');
  return {
    TaskItem: ({
      task,
      projectTitle,
      areaTitle,
      selectionState = 'idle',
      onRowClick,
    }: {
      task: TaskFeedItem;
      projectTitle?: string;
      areaTitle?: string;
      selectionState?: string;
      onRowClick?: () => void;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-task-item': '',
          'data-selection-row': task.id,
          'data-mock-task-id': task.id,
          'data-selection-state': selectionState,
          role: 'button',
          tabIndex: 0,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onRowClick?.();
          },
        },
        task.title,
        projectTitle
          ? ReactModule.createElement(
              'span',
              { 'data-testid': `tag-project-${task.id}` },
              projectTitle,
            )
          : null,
        areaTitle
          ? ReactModule.createElement('span', { 'data-testid': `tag-area-${task.id}` }, areaTitle)
          : null,
      ),
  };
});

vi.mock('@/components/feed/ProjectFeedRow', async () => {
  const ReactModule = await import('react');
  return {
    ProjectFeedRow: ({ item }: { item: ProjectFeedItem }) =>
      ReactModule.createElement(
        'div',
        { 'data-project-row': item.id, 'data-selection-row': item.id },
        item.title,
      ),
  };
});

vi.mock('@/components/project/ProjectContextMenu', async () => {
  const ReactModule = await import('react');
  return {
    ProjectContextMenu: ({
      project,
      children,
    }: {
      project: { id: string };
      children: React.ReactNode;
    }) =>
      ReactModule.createElement(
        'div',
        { 'data-project-context-menu': project.id },
        children,
      ),
  };
});

vi.mock('sonner', () => ({
  toast: { success: harness.toastSuccess, error: harness.toastError },
}));

vi.mock('@taskora/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@taskora/api')>();
  return {
    ...actual,
    useCompleteTask: () => ({ mutate: harness.completeTaskMutate }),
    useUncompleteTask: () => ({ mutate: harness.uncompleteTaskMutate }),
    useReorderTasks: () => ({ mutate: harness.reorderTasksMutate }),
    useUpdateTask: () => ({ mutate: harness.updateTaskMutate }),
    useCompleteProject: () => ({ mutate: harness.completeProjectMutate }),
    useUncompleteProject: () => ({ mutate: harness.uncompleteProjectMutate }),
    useProjectsQuery: () => ({ data: harness.projects }),
    useAreasQuery: () => ({ data: harness.areas }),
    // useTaskRowSelection / useSelectionScope 依赖真实 store，保持真实实现。
    useTaskRowSelection: actual.useTaskRowSelection,
  };
});

import { GroupedFeedListView } from './GroupedFeedListView';
import {
  flattenSelectionRows,
  formatDateLabel,
  useGroupedViewCollapseStore,
  useSelectionStore,
  useUiInteractionStore,
} from '@taskora/api';

let feedPosition = 0;

function taskItem(
  id: string,
  opts: { projectId?: string | null; areaId?: string | null } = {},
): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.ANYTIME,
    completedAt: null,
    trashedAt: null,
    sortOrder: feedPosition++,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    tags: [],
    projectId: opts.projectId ?? null,
    headingId: null,
    areaId: opts.areaId ?? null,
  };
}

function projectItem(id: string): ProjectFeedItem {
  return {
    id,
    type: 'project',
    title: id,
    notes: null,
    scheduledDate: '2026-08-01T00:00:00.000Z',
    scheduledType: ScheduledType.DATE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
    sortOrder: feedPosition++,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    tags: [],
    areaId: null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
  };
}

function project(
  id: string,
  opts: {
    areaId?: string | null;
    status?: ProjectStatus;
    taskTotalCount?: number;
    taskCompletedCount?: number;
    scheduledDate?: string | null;
  } = {},
): ProjectResponseDto {
  return {
    id,
    title: id,
    notes: null,
    areaId: opts.areaId ?? null,
    sortOrder: 0,
    status: opts.status ?? ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: opts.scheduledDate ?? null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: opts.taskTotalCount ?? 0,
    taskCompletedCount: opts.taskCompletedCount ?? 0,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function area(id: string): AreaResponseDto {
  return {
    id,
    title: id,
    notes: null,
    sortOrder: 0,
    tags: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function renderView(items: FeedItem[], view: 'today' | 'anytime' | 'someday' = 'today') {
  return render(
    <MemoryRouter initialEntries={[`/${view}`]}>
      <Routes>
        <Route
          path="/today"
          element={<GroupedFeedListView view="today" items={items} emptyHint="empty" />}
        />
        <Route
          path="/anytime"
          element={<GroupedFeedListView view="anytime" items={items} emptyHint="empty" />}
        />
        <Route
          path="/someday"
          element={<GroupedFeedListView view="someday" items={items} emptyHint="empty" />}
        />
        <Route path="/projects/:id" element={<div data-testid="project-detail" />} />
        <Route path="/areas/:id" element={<div data-testid="area-detail" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function handlers() {
  if (!harness.dndProps) throw new Error('DndContext was not rendered');
  return harness.dndProps;
}

function dragEnd(activeId: string, overId: string | null, edgeAfterOnRect?: string) {
  act(() => {
    handlers().onDragStart?.({ active: { id: activeId } });
  });
  if (overId && edgeAfterOnRect) {
    harness.pointerCollisionIds = [overId];
    act(() => {
      handlers().collisionDetection?.({
        active: { id: activeId },
        pointerCoordinates: { x: 20, y: 31 },
        droppableContainers: [{ id: overId }],
        droppableRects: new Map([[overId, { top: 10, height: 40 }]]),
      });
    });
    harness.pointerCollisionIds = [];
  }
  act(() => {
    handlers().onDragEnd?.({ active: { id: activeId }, over: overId ? { id: overId } : null });
  });
}

function headerOf(parentId: string): HTMLElement {
  const header = document.querySelector<HTMLElement>(`[data-group-header="${parentId}"]`);
  if (!header) throw new Error(`Group header ${parentId} was not rendered`);
  return header;
}

function chevronOf(parentId: string, expanded = true): HTMLElement {
  return screen.getByRole('button', {
    name: new RegExp(expanded ? `collapse ${parentId}` : `expand ${parentId}`, 'i'),
  });
}

beforeEach(() => {
  feedPosition = 0;
  harness.dndProps = null;
  harness.projects = [];
  harness.areas = [];
  harness.pointerCollisionIds = [];
  harness.closestCollisionIds = [];
  harness.completeTaskMutate.mockReset();
  harness.uncompleteTaskMutate.mockReset();
  harness.reorderTasksMutate.mockReset();
  harness.updateTaskMutate.mockReset();
  harness.completeProjectMutate.mockReset();
  harness.uncompleteProjectMutate.mockReset();
  harness.toastSuccess.mockReset();
  harness.toastError.mockReset();
  window.localStorage.clear();
  useGroupedViewCollapseStore.setState({ collapsed: {} });
  useSelectionStore.getState().clearSelection();
  useUiInteractionStore.setState({ expandedId: null });
});

describe('GroupedFeedListView — 组头渲染', () => {
  it('renders project headers with title, count and date badge; area headers with direct count', () => {
    harness.projects = [
      project('p1', { taskTotalCount: 3, taskCompletedCount: 1, scheduledDate: '2026-08-01T00:00:00.000Z' }),
    ];
    harness.areas = [area('a1')];
    renderView([
      taskItem('direct', { areaId: 'a1' }),
      taskItem('in-p1', { projectId: 'p1' }),
    ]);

    const projectHeader = headerOf('p1');
    expect(projectHeader).toHaveTextContent('p1');
    expect(projectHeader).toHaveTextContent('1/3');
    expect(projectHeader).toHaveTextContent(
      formatDateLabel(new Date('2026-08-01T00:00:00.000Z')),
    );

    const areaHeader = headerOf('a1');
    expect(areaHeader).toHaveTextContent('a1');
    expect(areaHeader).toHaveTextContent('1');
  });

  it('wraps the project header in the existing project context menu', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('in-p1', { projectId: 'p1' })]);

    const menu = document.querySelector('[data-project-context-menu="p1"]');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[data-group-header="p1"]')).not.toBeNull();
  });

  it('keeps an orphan task (settled parent) ungrouped with its project tag', () => {
    harness.projects = [project('p-done', { status: ProjectStatus.COMPLETED })];
    renderView([taskItem('orphan', { projectId: 'p-done' })]);

    expect(screen.getByTestId('tag-project-orphan')).toHaveTextContent('p-done');
    expect(document.querySelector('[data-group-header="p-done"]')).toBeNull();
  });

  it('keeps a date-matching project with no visible tasks as a standalone row', () => {
    harness.projects = [project('p-due')];
    renderView([taskItem('loose'), projectItem('p-due')]);

    expect(document.querySelector('[data-project-row="p-due"]')).not.toBeNull();
    expect(document.querySelector('[data-group-header="p-due"]')).toBeNull();
  });
});

describe('GroupedFeedListView — 折叠与导航', () => {
  it('chevron toggles task visibility and persists collapse per view', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' }), taskItem('a2', { projectId: 'p1' })]);

    expect(screen.getByText('a1')).toBeInTheDocument();
    fireEvent.click(chevronOf('p1'));

    expect(screen.queryByText('a1')).not.toBeInTheDocument();
    expect(screen.queryByText('a2')).not.toBeInTheDocument();
    expect(
      useGroupedViewCollapseStore.getState().collapsed['today:p1'],
    ).toBe(true);

    fireEvent.click(chevronOf('p1', false));
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(useGroupedViewCollapseStore.getState().collapsed['today:p1']).toBeUndefined();
  });

  it('collapses per view independently (today collapse does not leak into anytime)', () => {
    harness.projects = [project('p1')];
    useGroupedViewCollapseStore.getState().setCollapsed('anytime', 'p1', true);
    renderView([taskItem('a1', { projectId: 'p1' })], 'today');

    // anytime 的折叠不影响 today：任务仍然可见。
    expect(screen.getByText('a1')).toBeInTheDocument();
  });

  it('collapsed group contributes only its header to the selection scope', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    let rowIds = flattenSelectionRows(useSelectionStore.getState()).map((r) => r.id);
    expect(rowIds).toEqual(['p1', 'a1']);

    fireEvent.click(chevronOf('p1'));

    rowIds = flattenSelectionRows(useSelectionStore.getState()).map((r) => r.id);
    expect(rowIds).toEqual(['p1']);
  });

  it('moves the selection to the group header when the selected task\'s group collapses', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);
    act(() => {
      useSelectionStore.getState().setSelection(['a1']);
    });

    fireEvent.click(chevronOf('p1'));

    expect(useSelectionStore.getState().selectedIds).toEqual(['p1']);
  });

  it('navigates to the project detail on header body click and on Enter', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    fireEvent.click(headerOf('p1'));
    expect(screen.getByTestId('project-detail')).toBeInTheDocument();
  });

  it('navigates to the area detail on area header click', () => {
    harness.areas = [area('a1')];
    renderView([taskItem('direct', { areaId: 'a1' })]);

    fireEvent.click(headerOf('a1'));
    expect(screen.getByTestId('area-detail')).toBeInTheDocument();
  });

  it('navigates to the project detail on Enter from the focused header row', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    const header = headerOf('p1');
    header.focus();
    fireEvent.keyDown(header, { key: 'Enter' });

    expect(screen.getByTestId('project-detail')).toBeInTheDocument();
  });

  it('navigates to the area detail on Enter from the focused area header row', () => {
    harness.areas = [area('a1')];
    renderView([taskItem('direct', { areaId: 'a1' })]);

    const header = headerOf('a1');
    header.focus();
    fireEvent.keyDown(header, { key: 'Enter' });

    expect(screen.getByTestId('area-detail')).toBeInTheDocument();
  });

  it('toggles the project complete state from the header progress ring', () => {
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 1 })];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    fireEvent.click(screen.getByRole('checkbox', { name: /mark complete/i }));
    expect(harness.completeProjectMutate).toHaveBeenCalledWith('p1', expect.anything());
    expect(harness.uncompleteProjectMutate).not.toHaveBeenCalled();
  });
});

describe('GroupedFeedListView — 拖拽语义', () => {
  function setupTwoProjects() {
    harness.projects = [project('p1'), project('p2')];
    renderView([
      taskItem('loose'),
      taskItem('a1', { projectId: 'p1' }),
      taskItem('a2', { projectId: 'p1' }),
      taskItem('b1', { projectId: 'p2' }),
    ]);
  }

  it('within-group drop fires the reorder mutation with the full view order', () => {
    setupTwoProjects();

    // a1 放到 a2 之后（下半部分）→ 组内重排。
    dragEnd('task:a1', 'task:a2', 'task:a2');

    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderTasksMutate).toHaveBeenCalledTimes(1);
    expect(harness.reorderTasksMutate).toHaveBeenCalledWith(['loose', 'a2', 'a1', 'b1']);
  });

  it('cross-group drop fires the reassignment mutation (project re-file)', () => {
    setupTwoProjects();

    // a1 放到 p2 组的 b1 之前（默认 before）。
    dragEnd('task:a1', 'task:b1');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a1',
      data: { projectId: 'p2', areaId: null },
    });
    // 落点写回全局位次：a1 插到 b1 之前。
    expect(harness.reorderTasksMutate).toHaveBeenCalledWith(['loose', 'a2', 'a1', 'b1']);
  });

  it('drop onto the ungrouped zone clears both parents', () => {
    setupTwoProjects();

    // a2 拖到未分组区 loose 之前：清除项目归属并写回新位次。
    dragEnd('task:a2', 'task:loose');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a2',
      data: { projectId: null, areaId: null },
    });
    expect(harness.reorderTasksMutate).toHaveBeenCalledWith(['a2', 'loose', 'a1', 'b1']);
  });

  it('drop onto a collapsed group lands at its end with a confirming toast', () => {
    setupTwoProjects();
    act(() => {
      useGroupedViewCollapseStore.getState().setCollapsed('today', 'p2', true);
    });

    dragEnd('task:loose', 'header:p2');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'loose',
      data: { projectId: 'p2', areaId: null },
    });
    // 落在折叠组末尾：b1（隐藏成员）之后。
    expect(harness.reorderTasksMutate).toHaveBeenCalledWith(['a1', 'a2', 'b1', 'loose']);
    expect(harness.toastSuccess).toHaveBeenCalledWith(expect.stringContaining('p2'));
  });

  it('drop onto an area group reassigns the area and clears the project', () => {
    harness.projects = [project('p1', { areaId: 'a1' })];
    harness.areas = [area('a1')];
    renderView([taskItem('loose'), taskItem('direct', { areaId: 'a1' })]);

    dragEnd('task:loose', 'task:direct');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'loose',
      data: { projectId: null, areaId: 'a1' },
    });
  });

  it('a no-op drop fires no mutations', () => {
    setupTwoProjects();

    // a1 放回自己的位置（before a1 = 原位）。
    dragEnd('task:a1', 'task:a1');

    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderTasksMutate).not.toHaveBeenCalled();
  });

  it('dropping outside fires no mutations', () => {
    setupTwoProjects();

    dragEnd('task:a1', null);

    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderTasksMutate).not.toHaveBeenCalled();
  });
});
