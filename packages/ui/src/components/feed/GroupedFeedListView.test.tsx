import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  onDragOver?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  onDragCancel?: () => void;
}

const harness = vi.hoisted(() => ({
  dndProps: null as DndHandlers | null,
  completeTaskMutate: vi.fn(),
  uncompleteTaskMutate: vi.fn(),
  reorderFeedMutate: vi.fn(),
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
      newInToday = false,
    }: {
      task: TaskFeedItem;
      projectTitle?: string;
      areaTitle?: string;
      selectionState?: string;
      onRowClick?: () => void;
      newInToday?: boolean;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-task-item': '',
          'data-selection-row': task.id,
          'data-mock-task-id': task.id,
          'data-selection-state': selectionState,
          'data-new-in-today': newInToday ? '' : undefined,
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
    useReorderFeed: () => ({ mutate: harness.reorderFeedMutate }),
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
  useSelectionStore,
  useUiInteractionStore,
} from '@taskora/api';

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
    repeatSourceId: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.ANYTIME,
    completedAt: null,
    trashedAt: null,
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
    repeatSourceId: null,
    dueDate: null,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
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
    tags: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function renderView(
  items: FeedItem[],
  view: 'today' | 'anytime' | 'someday' = 'today',
  freshKeys?: ReadonlySet<string>,
) {
  return render(
    <MemoryRouter initialEntries={[`/${view}`]}>
      <Routes>
        <Route
          path="/today"
          element={<GroupedFeedListView items={items} emptyHint="empty" freshKeys={freshKeys} />}
        />
        <Route
          path="/anytime"
          element={<GroupedFeedListView items={items} emptyHint="empty" />}
        />
        <Route
          path="/someday"
          element={<GroupedFeedListView items={items} emptyHint="empty" />}
        />
        <Route path="/projects/:id" element={<div data-testid="project-detail" />} />
        <Route path="/areas/:id" element={<div data-testid="area-detail" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 期望的 feed 重排参数：t:id 为任务，p:id 为独立项目行。 */
function feedOrder(...keys: string[]) {
  return keys.map((key) =>
    key.startsWith('p:') ? { type: 'project', id: key.slice(2) } : { type: 'task', id: key },
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

beforeEach(() => {
  harness.dndProps = null;
  harness.projects = [];
  harness.areas = [];
  harness.pointerCollisionIds = [];
  harness.closestCollisionIds = [];
  harness.completeTaskMutate.mockReset();
  harness.uncompleteTaskMutate.mockReset();
  harness.reorderFeedMutate.mockReset();
  harness.updateTaskMutate.mockReset();
  harness.completeProjectMutate.mockReset();
  harness.uncompleteProjectMutate.mockReset();
  harness.toastSuccess.mockReset();
  harness.toastError.mockReset();
  window.localStorage.clear();
  useSelectionStore.getState().clearSelection();
  useUiInteractionStore.setState({ expandedId: null });
});

describe('GroupedFeedListView — 组头渲染', () => {
  it('renders project headers with title and date badge; area headers with title', () => {
    // 未来日期：> 今天才走灰色日期 chip（≤ 今天按「今天」语义显示黄星）。
    harness.projects = [
      project('p1', {
        taskTotalCount: 3,
        taskCompletedCount: 1,
        scheduledDate: '2999-08-01T00:00:00.000Z',
      }),
    ];
    harness.areas = [area('a1')];
    renderView([
      taskItem('direct', { areaId: 'a1' }),
      taskItem('in-p1', { projectId: 'p1' }),
    ]);

    const projectHeader = headerOf('p1');
    expect(projectHeader).toHaveTextContent('p1');
    expect(projectHeader).toHaveTextContent(
      formatDateLabel(new Date('2999-08-01T00:00:00.000Z')),
    );

    const areaHeader = headerOf('a1');
    expect(areaHeader).toHaveTextContent('a1');
  });

  it('renders headers as underlined section titles without any collapse chevron or task count', () => {
    harness.projects = [project('p1', { taskTotalCount: 3, taskCompletedCount: 1 })];
    harness.areas = [area('a1')];
    renderView([
      taskItem('direct', { areaId: 'a1' }),
      taskItem('in-p1', { projectId: 'p1' }),
    ]);

    const projectHeader = headerOf('p1');
    expect(projectHeader.className).toContain('border-b');
    // 无 chevron（行内唯一按钮是进度环）；无任务计数文案。
    expect(projectHeader).not.toHaveTextContent('1/3');
    expect(
      screen.queryByRole('button', { name: /collapse|expand/i }),
    ).not.toBeInTheDocument();

    const areaHeader = headerOf('a1');
    expect(areaHeader.className).toContain('border-b');
    // 领域组头：仅图标 + 标题，无计数数字。
    expect(areaHeader.textContent?.trim()).toBe('a1');
  });

  it('groups in-area project tasks flatly under the project header (no area nesting)', () => {
    harness.projects = [project('p1', { areaId: 'a1' })];
    harness.areas = [area('a1')];
    renderView([taskItem('in-p1', { projectId: 'p1' })]);

    expect(document.querySelector('[data-group-header="p1"]')).not.toBeNull();
    // 无直属任务的 Area 不出现组头；区域内项目任务不嵌套进 Area 组。
    expect(document.querySelector('[data-group-header="a1"]')).toBeNull();
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

describe('GroupedFeedListView — 导航与行注册', () => {
  it('headers and tasks all register as visible selection rows (no collapse)', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    const rowIds = flattenSelectionRows(useSelectionStore.getState()).map((r) => r.id);
    expect(rowIds).toEqual(['p1', 'a1']);
  });

  it('navigates to the project detail on header body click', () => {
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
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 2 })];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    fireEvent.click(screen.getByRole('checkbox', { name: /mark complete/i }));
    expect(harness.completeProjectMutate).toHaveBeenCalledWith('p1', expect.anything());
    expect(harness.uncompleteProjectMutate).not.toHaveBeenCalled();
  });

  it('asks how to settle the remaining tasks before completing a project that still has open tasks', () => {
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 1 })];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    fireEvent.click(screen.getByRole('checkbox', { name: /mark complete/i }));
    expect(harness.completeProjectMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /mark all as canceled/i }));
    expect(harness.completeProjectMutate).toHaveBeenCalledWith(
      { id: 'p1', settleRemaining: 'cancelled' },
      expect.anything(),
    );
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
    expect(harness.reorderFeedMutate).toHaveBeenCalledTimes(1);
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('loose', 'a2', 'a1', 'b1'));
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
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('loose', 'a2', 'a1', 'b1'));
  });

  it('drop onto the ungrouped zone clears both parents', () => {
    setupTwoProjects();

    // a2 拖到未分组区 loose 之前：清除项目归属并写回新位次。
    dragEnd('task:a2', 'task:loose');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a2',
      data: { projectId: null, areaId: null },
    });
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('a2', 'loose', 'a1', 'b1'));
  });

  it('drop onto a group header lands at the end of that group', () => {
    setupTwoProjects();

    dragEnd('task:loose', 'header:p2');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'loose',
      data: { projectId: 'p2', areaId: null },
    });
    // 落在组末尾：b1 之后。
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('a1', 'a2', 'b1', 'loose'));
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
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
  });

  function containerOrder(containerId: string) {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-task-container="${containerId}"] [data-sortable-task-id]`,
      ),
    ).map((node) => node.dataset.sortableTaskId);
  }

  it('does not push the list down with an empty ungrouped drop zone when a drag starts', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' }), taskItem('a2', { projectId: 'p1' })]);
    expect(document.querySelector('[data-task-container="ungrouped"]')).toBeNull();

    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:a2' } });
    });
    // 投放面浮在列表上方，不占文档流。
    const zone = document.querySelector('[data-task-container="ungrouped"]') as HTMLElement;
    expect(zone).toHaveClass('absolute', 'bottom-full');
    expect(zone.children).toHaveLength(0);
    // 也不能排在首个组头之前：否则组头失去 :first-child，mt-6 生效整列下移。
    expect(screen.getByTestId('dnd-context').firstElementChild).toHaveAttribute(
      'data-group-header-dropzone',
      'p1',
    );

    // 拖入后任务进入顶部未分组区（文档流内），投放面不再浮动。
    act(() => {
      handlers().onDragOver?.({ active: { id: 'task:a2' }, over: { id: 'container:ungrouped' } });
    });
    const zones = document.querySelectorAll<HTMLElement>('[data-task-container="ungrouped"]');
    expect(zones).toHaveLength(1);
    expect(zones[0]).not.toHaveClass('absolute');
    expect(containerOrder('ungrouped')).toEqual(['a2']);
  });

  it('previews a cross-group move live, keeps the emptied source header, and persists the preview', () => {
    setupTwoProjects();
    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:b1' } });
    });
    act(() => {
      handlers().onDragOver?.({ active: { id: 'task:b1' }, over: { id: 'task:a1' } });
    });

    expect(containerOrder('p1')).toEqual(['b1', 'a1', 'a2']);
    expect(screen.getByTestId('task-placeholder-b1')).toBeInTheDocument();
    // 原组最后一个任务被拖走，组头仍保留在原位。
    expect(headerOf('p2')).toBeInTheDocument();
    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();

    // 拖出列表外：落在最后一次有效预览处。
    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:b1' }, over: null });
    });
    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'b1',
      data: { projectId: 'p1', areaId: null },
    });
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('loose', 'b1', 'a1', 'a2'));
  });

  it('keeps rendering the dropped order until the props catch up', () => {
    setupTwoProjects();
    dragEnd('task:a1', 'task:a2', 'task:a2');

    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('loose', 'a2', 'a1', 'b1'));
    expect(containerOrder('p1')).toEqual(['a2', 'a1']);
    expect(screen.queryByTestId('task-placeholder-a1')).not.toBeInTheDocument();
  });

  it('flat mode (grouping off) keeps the same drag reorder without reassignment', () => {
    harness.projects = [project('p1')];
    render(
      <MemoryRouter>
        <GroupedFeedListView
          items={[taskItem('loose'), taskItem('a1', { projectId: 'p1' }), taskItem('a2', { projectId: 'p1' })]}
          grouping={false}
        />
      </MemoryRouter>,
    );
    // 平铺：无组头，任务都在未分组区并保留项目标签。
    expect(document.querySelector('[data-group-header-dropzone]')).toBeNull();
    expect(containerOrder('ungrouped')).toEqual(['loose', 'a1', 'a2']);
    expect(screen.getByTestId('tag-project-a1')).toBeInTheDocument();

    // 浮层与列表行同参渲染：同样带项目标签。
    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:a1' } });
    });
    expect(
      within(screen.getByTestId('drag-overlay')).getByTestId('tag-project-a1'),
    ).toBeInTheDocument();
    act(() => {
      handlers().onDragCancel?.();
    });

    dragEnd('task:a2', 'task:loose');

    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('a2', 'loose', 'a1'));
    expect(containerOrder('ungrouped')).toEqual(['a2', 'loose', 'a1']);
  });

  function topOrder() {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-task-container="ungrouped"] [data-sortable-task-id], [data-task-container="ungrouped"] [data-sortable-project-id]',
      ),
    ).map((node) => node.dataset.sortableTaskId ?? `p:${node.dataset.sortableProjectId}`);
  }

  it('drags a standalone project row among top-zone tasks and writes the feed order', () => {
    harness.projects = [project('p1'), project('pr')];
    renderView([
      taskItem('loose'),
      projectItem('pr'),
      taskItem('tail'),
      taskItem('a1', { projectId: 'p1' }),
    ]);
    expect(topOrder()).toEqual(['loose', 'p:pr', 'tail']);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'project:pr' } });
    });
    act(() => {
      handlers().onDragOver?.({ active: { id: 'project:pr' }, over: { id: 'task:loose' } });
    });
    expect(topOrder()).toEqual(['p:pr', 'loose', 'tail']);
    expect(screen.getByTestId('project-placeholder-pr')).toBeInTheDocument();

    // 独立项目行不能进组：越界目标不改变预览。
    act(() => {
      handlers().onDragOver?.({ active: { id: 'project:pr' }, over: { id: 'task:a1' } });
    });
    expect(topOrder()).toEqual(['p:pr', 'loose', 'tail']);

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'project:pr' }, over: { id: 'task:a1' } });
    });
    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(
      feedOrder('p:pr', 'loose', 'tail', 'a1'),
    );
  });

  it('places a task next to a standalone project row', () => {
    harness.projects = [project('p1'), project('pr')];
    renderView([taskItem('loose'), projectItem('pr'), taskItem('a1', { projectId: 'p1' })]);

    dragEnd('task:a1', 'project:pr', 'project:pr');

    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a1',
      data: { projectId: null, areaId: null },
    });
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('loose', 'p:pr', 'a1'));
    expect(topOrder()).toEqual(['loose', 'p:pr', 'a1']);
  });

  it('dropping outside fires no mutations', () => {
    setupTwoProjects();

    dragEnd('task:a1', null);

    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
  });
});

describe('GroupedFeedListView — New in Today', () => {
  it('renders fresh tasks first with the dot and their project tag, outside the group', () => {
    harness.projects = [project('p1')];
    renderView(
      [taskItem('old', { projectId: 'p1' }), taskItem('new', { projectId: 'p1' })],
      'today',
      new Set(['task:new']),
    );

    const rows = [...document.querySelectorAll<HTMLElement>('[data-mock-task-id]')];
    expect(rows.map((row) => row.dataset.mockTaskId)).toEqual(['new', 'old']);
    expect(rows[0]).toHaveAttribute('data-new-in-today');
    expect(rows[1]).not.toHaveAttribute('data-new-in-today');
    expect(screen.getByTestId('tag-project-new')).toHaveTextContent('p1');
    expect(document.querySelector('[data-task-container="fresh"]')).not.toBeNull();
  });

  it('reorders within the fresh zone without reassigning', () => {
    harness.projects = [project('p1')];
    renderView(
      [taskItem('a', { projectId: 'p1' }), taskItem('b', { projectId: 'p1' })],
      'today',
      new Set(['task:a', 'task:b']),
    );

    dragEnd('task:a', 'task:b', 'task:b');
    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('b', 'a'));
  });

  it('does not move rows across the fresh zone boundary', () => {
    harness.projects = [project('p1')];
    renderView(
      [taskItem('old', { projectId: 'p1' }), taskItem('new')],
      'today',
      new Set(['task:new']),
    );

    dragEnd('task:old', 'task:new', 'task:new');
    dragEnd('task:new', 'task:old', 'task:old');
    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
  });
});
