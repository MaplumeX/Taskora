import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  sidebarDrop: vi.fn(),
  markNewInTodaySeen: vi.fn(),
}));

vi.mock('@dnd-kit/core', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: DndHandlers & { children: React.ReactNode }) => {
      // React 生成组件栈（如 act 警告）时会无参调用祖先组件，忽略那次调用。
      if (props) harness.dndProps = props;
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
      hidePlacement = false,
      selectionState = 'idle',
      onRowClick,
      newInToday = false,
    }: {
      task: TaskFeedItem;
      projectTitle?: string;
      areaTitle?: string;
      hidePlacement?: boolean;
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
          'data-hide-placement': String(hidePlacement),
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
    useUncancelTask: () => ({ mutate: vi.fn() }),
    useReorderFeed: () => ({ mutate: harness.reorderFeedMutate }),
    useUpdateTask: () => ({ mutate: harness.updateTaskMutate }),
    useCompleteProject: () => ({ mutate: harness.completeProjectMutate }),
    useUncompleteProject: () => ({ mutate: harness.uncompleteProjectMutate }),
    useProjectsQuery: () => ({ data: harness.projects }),
    useAreasQuery: () => ({ data: harness.areas }),
    useTaskQuery: () => ({ data: undefined, isError: false }),
    useUpdateArea: () => ({ mutate: vi.fn() }),
    useDeleteArea: () => ({ mutate: vi.fn() }),
    markNewInTodaySeen: harness.markNewInTodaySeen,
    // useTaskRowSelection / useSelectionScope 依赖真实 store，保持真实实现。
    useTaskRowSelection: actual.useTaskRowSelection,
  };
});

import { GroupedFeedListView } from './GroupedFeedListView';
import { AppDndProvider } from '../../lib/appDnd';
import {
  flattenSelectionRows,
  formatDeadlineCountdown,
  parseCalendarDate,
  todayDateKey,
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

/** 列表登记在应用壳的共享拖拽上下文里（ADR 0018）。 */
function DndShell({ children }: { children: React.ReactNode }) {
  return <AppDndProvider onSidebarDrop={harness.sidebarDrop}>{children}</AppDndProvider>;
}

function renderDnd(ui: React.ReactElement) {
  return render(ui, { wrapper: DndShell });
}

function renderView(
  items: FeedItem[],
  view: 'today' | 'anytime' | 'someday' = 'today',
  freshKeys?: ReadonlySet<string>,
) {
  return renderDnd(
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
  harness.sidebarDrop.mockReset();
  harness.completeTaskMutate.mockReset();
  harness.uncompleteTaskMutate.mockReset();
  harness.reorderFeedMutate.mockReset();
  harness.updateTaskMutate.mockReset();
  harness.completeProjectMutate.mockReset();
  harness.uncompleteProjectMutate.mockReset();
  harness.markNewInTodaySeen.mockReset();
  harness.toastSuccess.mockReset();
  harness.toastError.mockReset();
  window.localStorage.clear();
  useSelectionStore.getState().clearSelection();
  useUiInteractionStore.setState({ expandedId: null });
});

describe('GroupedFeedListView — 组头渲染', () => {
  it.each(['today', 'anytime', 'someday'] as const)(
    '%s renders Project and Area headings with icons and neutral navigation titles',
    (view) => {
      harness.projects = [{
        ...project('p1', {
          taskTotalCount: 3,
          taskCompletedCount: 1,
          scheduledDate: '2999-08-01T00:00:00.000Z',
        }),
        scheduledType: ScheduledType.DATE,
        dueDate: '2999-08-10T00:00:00.000Z',
        repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
      }];
      harness.areas = [area('a1')];
      renderView([
        taskItem('direct', { areaId: 'a1' }),
        taskItem('in-p1', { projectId: 'p1' }),
      ], view);

      for (const [id, to] of [['p1', '/projects/p1'], ['a1', '/areas/a1']]) {
        const heading = screen.getByRole('heading', { level: 2, name: id });
        expect(heading).toBe(headerOf(id));
        expect(within(heading).getByRole('link', { name: id }).textContent).toBe(id);
        expect(heading).toHaveClass('border-b');
        expect(heading).not.toHaveAttribute('role', 'button');
        expect(heading.className).not.toMatch(/hover:bg-|rounded-/);
        // 图标 / 进度环保留；截止徽标独立于标题链接，箭头不参与标题名称。
        expect(heading.querySelector('svg')).not.toBeNull();
        if (id === 'p1') {
          expect(within(heading).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
        } else {
          expect(within(heading).queryByRole('checkbox')).not.toBeInTheDocument();
          expect(heading.querySelector('.lucide-layers')).not.toBeNull();
        }
        const link = within(heading).getByRole('link', { name: id });
        expect(link).toHaveAttribute('href', to);
        expect(link).toHaveClass('text-body', 'font-semibold', 'text-foreground', 'hover:text-primary', 'no-underline');
        expect(link).not.toHaveClass('hover:underline', 'text-primary');
        expect(link.className).not.toMatch(/hover:bg-/);
        const arrow = link.querySelector('.lucide-chevron-right');
        expect(arrow).toHaveAttribute('aria-hidden', 'true');
        expect(arrow).toHaveClass('opacity-0', 'group-hover/header-link:opacity-100');
      }
    },
  );

  it.each([
    ['future', '2999-08-10', 'text-muted-foreground'],
    ['today', null, 'text-deadline'],
    ['overdue', '2000-01-01', 'text-deadline'],
  ])('keeps the %s Project deadline flag and countdown outside the hover link', (_state, date, color) => {
    const dueDate = date ?? todayDateKey();
    harness.projects = [{ ...project('p1'), dueDate }];
    renderView([taskItem('in-project', { projectId: 'p1' })]);
    const heading = headerOf('p1');
    const badge = within(heading).getByText(formatDeadlineCountdown(parseCalendarDate(dueDate)));
    const link = within(heading).getByRole('link', { name: 'p1' });

    expect(badge).toBeVisible();
    expect(badge).toHaveClass(color);
    expect(badge.querySelector('.lucide-flag')).not.toBeNull();
    expect(link).not.toContainElement(badge);
    expect(badge.parentElement).toHaveClass('ml-auto', 'shrink-0', 'whitespace-nowrap');
  });

  it('does not show a deadline badge for a Project without a deadline or for an Area', () => {
    harness.projects = [project('p1')];
    harness.areas = [area('a1')];
    renderView([
      taskItem('in-project', { projectId: 'p1' }),
      taskItem('in-area', { areaId: 'a1' }),
    ]);
    for (const id of ['p1', 'a1']) {
      expect(headerOf(id).querySelector('.lucide-flag')).toBeNull();
    }
  });

  it('uses localized placeholders for unnamed parents without hiding their headings', () => {
    harness.projects = [{ ...project('p1'), title: '' }];
    harness.areas = [{ ...area('a1'), title: '' }];
    renderView([
      taskItem('in-project', { projectId: 'p1' }),
      taskItem('in-area', { areaId: 'a1' }),
    ]);

    for (const id of ['p1', 'a1']) {
      const heading = headerOf(id);
      const link = within(heading).getByRole('link');
      expect(link.textContent?.trim()).not.toBe('');
      expect(link).toHaveClass('text-muted-foreground');
    }
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

describe('GroupedFeedListView — 展开归属入口', () => {
  it.each(['today', 'anytime', 'someday'] as const)(
    '%s 分组视图向项目和区域任务传递隐藏入口标记',
    (view) => {
      harness.projects = [project('p1')];
      harness.areas = [area('a1')];
      renderView(
        [taskItem('in-project', { projectId: 'p1' }), taskItem('in-area', { areaId: 'a1' })],
        view,
      );
      for (const id of ['in-project', 'in-area']) {
        expect(document.querySelector(`[data-mock-task-id="${id}"]`)).toHaveAttribute(
          'data-hide-placement',
          'true',
        );
      }
    },
  );

  it('分组开关切换时更新入口标记，新到条目同样遵循当前视图设置', () => {
    harness.projects = [project('p1')];
    const items = [taskItem('fresh-task', { projectId: 'p1' })];
    const content = (grouping: boolean) => (
      <MemoryRouter>
        <GroupedFeedListView
          items={items}
          grouping={grouping}
          freshKeys={new Set(['task:fresh-task'])}
        />
      </MemoryRouter>
    );
    const { rerender } = render(content(true));
    expect(document.querySelector('[data-mock-task-id="fresh-task"]')).toHaveAttribute(
      'data-hide-placement',
      'true',
    );
    rerender(content(false));
    expect(document.querySelector('[data-mock-task-id="fresh-task"]')).toHaveAttribute(
      'data-hide-placement',
      'false',
    );
  });
});

describe('GroupedFeedListView — 导航与行注册', () => {
  it('headers and tasks all register as visible selection rows (no collapse)', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    const rowIds = flattenSelectionRows(useSelectionStore.getState()).map((r) => r.id);
    expect(rowIds).toEqual(['p1', 'a1']);
  });

  it('navigates to the project detail on title click', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a1', { projectId: 'p1' })]);

    fireEvent.click(within(headerOf('p1')).getByRole('link'));
    expect(screen.getByTestId('project-detail')).toBeInTheDocument();
  });

  it('navigates to the area detail on title click', () => {
    harness.areas = [area('a1')];
    renderView([taskItem('direct', { areaId: 'a1' })]);

    fireEvent.click(within(headerOf('a1')).getByRole('link'));
    expect(screen.getByTestId('area-detail')).toBeInTheDocument();
  });

  it.each(['project', 'area'] as const)(
    'navigates to the %s detail on Enter from the focused title link',
    async (kind) => {
      const user = userEvent.setup();
      harness.projects = [project('p1')];
      harness.areas = [area('a1')];
      renderView([
        taskItem('in-project', { projectId: 'p1' }),
        taskItem('in-area', { areaId: 'a1' }),
      ]);

      const id = kind === 'project' ? 'p1' : 'a1';
      const link = within(headerOf(id)).getByRole('link');
      link.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByTestId(`${kind}-detail`)).toBeInTheDocument();
    },
  );

  it('keeps Selection and creation context on title links, without selecting the whole heading', () => {
    harness.projects = [project('p1')];
    harness.areas = [area('a1')];
    renderView([
      taskItem('in-project', { projectId: 'p1' }),
      taskItem('in-area', { areaId: 'a1' }),
    ]);

    const rows = flattenSelectionRows(useSelectionStore.getState());
    expect(rows.find((row) => row.id === 'p1')?.groupHeader).toEqual({
      createContext: { projectId: 'p1' },
    });
    expect(rows.find((row) => row.id === 'a1')?.groupHeader).toEqual({
      createContext: { areaId: 'a1' },
    });
    for (const id of ['p1', 'a1']) {
      const heading = headerOf(id);
      const link = within(heading).getByRole('link');
      expect(link).toHaveAttribute('data-selection-row', id);
      expect(link).toHaveAttribute('tabindex', '-1');

      act(() => useSelectionStore.getState().setSelection([id]));
      expect(link).toHaveAttribute('tabindex', '0');
      expect(link).toHaveClass('bg-selection');
      expect(heading).not.toHaveClass('bg-selection');

      act(() => useSelectionStore.getState().clearSelection());
      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link).not.toHaveClass('bg-selection');
    }
  });

  it('leaves Space available for the global new-task-below action instead of opening the parent', async () => {
    const user = userEvent.setup();
    harness.projects = [project('p1')];
    renderView([taskItem('in-project', { projectId: 'p1' })]);
    const link = within(headerOf('p1')).getByRole('link');
    link.focus();
    await user.keyboard(' ');

    expect(link).toHaveFocus();
    expect(screen.queryByTestId('project-detail')).not.toBeInTheDocument();
    expect(harness.completeProjectMutate).not.toHaveBeenCalled();
  });

  it('completes a project through its progress ring without opening its detail', () => {
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 2 })];
    renderView([taskItem('in-project', { projectId: 'p1' })]);
    fireEvent.click(within(headerOf('p1')).getByRole('checkbox'));

    expect(harness.completeProjectMutate).toHaveBeenCalledWith('p1', expect.anything());
    expect(screen.queryByTestId('project-detail')).not.toBeInTheDocument();
  });

  it('confirms how to settle remaining tasks when completing from the header progress ring', () => {
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 1 })];
    renderView([taskItem('in-project', { projectId: 'p1' })]);
    fireEvent.click(within(headerOf('p1')).getByRole('checkbox'));
    expect(harness.completeProjectMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /mark all as canceled/i }));
    expect(harness.completeProjectMutate).toHaveBeenCalledWith(
      { id: 'p1', settleRemaining: 'cancelled' },
      expect.anything(),
    );
  });

  it('opens the Area context menu from its title without navigating', async () => {
    harness.areas = [area('a1')];
    renderView([taskItem('in-area', { areaId: 'a1' })]);
    fireEvent.contextMenu(within(headerOf('a1')).getByRole('link'));
    expect(await screen.findByRole('button', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByTestId('area-detail')).not.toBeInTheDocument();
  });

  it('does not make the blank heading space a navigation or completion button', () => {
    harness.projects = [project('p1', { taskTotalCount: 2, taskCompletedCount: 1 })];
    renderView([taskItem('in-project', { projectId: 'p1' })]);
    fireEvent.click(headerOf('p1'));

    expect(screen.queryByTestId('project-detail')).not.toBeInTheDocument();
    expect(harness.completeProjectMutate).not.toHaveBeenCalled();
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

  it('多项拖拽：选中的任务一起落到被拖任务处，跨组的各自改归属', () => {
    setupTwoProjects();
    useSelectionStore.getState().setSelection(['loose', 'a2']);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:a2' } });
    });
    // 组内其余行收起（拖拽开始那次提交之后，见 useCollapseAfterDragStart）；多选保留。
    expect(document.querySelector('[data-sortable-task-id="loose"]')).toBeNull();
    expect(useSelectionStore.getState().selectedIds).toEqual(['loose', 'a2']);
    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:a2' }, over: { id: 'task:b1' } });
    });

    expect(harness.updateTaskMutate).toHaveBeenCalledTimes(2);
    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'loose',
      data: { projectId: 'p2', areaId: null },
    });
    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a2',
      data: { projectId: 'p2', areaId: null },
    });
    // 整组按原显示顺序（loose 在前）插到 b1 之前。
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('a1', 'loose', 'a2', 'b1'));
    expect(useSelectionStore.getState().selectedIds).toEqual(['loose', 'a2']);
  });

  it('多项拖拽：整组按显示顺序落位，而非 feed 数组顺序', () => {
    harness.projects = [project('p1')];
    // feed 数组里 a1 在前，但显示时未分组的 loose 排在 p1 组之前。
    renderView([taskItem('a1', { projectId: 'p1' }), taskItem('loose'), taskItem('a2', { projectId: 'p1' })]);
    useSelectionStore.getState().setSelection(['loose', 'a1']);

    dragEnd('task:a1', 'task:a2', 'task:a2');

    expect(harness.reorderFeedMutate).toHaveBeenCalledWith(feedOrder('a2', 'loose', 'a1'));
  });

  it('拖动未选中的行只拖它自己，并清掉多选', () => {
    setupTwoProjects();
    useSelectionStore.getState().setSelection(['loose', 'a2']);

    dragEnd('task:a1', 'task:b1');

    expect(harness.updateTaskMutate).toHaveBeenCalledTimes(1);
    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'a1',
      data: { projectId: 'p2', areaId: null },
    });
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('多项拖拽取消时收起的行复原', () => {
    setupTwoProjects();
    useSelectionStore.getState().setSelection(['a1', 'a2']);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:a1' } });
    });
    expect(document.querySelector('[data-sortable-task-id="a2"]')).toBeNull();
    act(() => {
      handlers().onDragCancel?.();
    });
    expect(document.querySelector('[data-sortable-task-id="a2"]')).not.toBeNull();
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
  });

  it('多项拖拽从第 3 个选中行拖起：上方选中行收起，原地松手不改动', () => {
    harness.projects = [project('p1')];
    renderView(['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => taskItem(id, { projectId: 'p1' })));
    useSelectionStore.getState().setSelection(['a1', 'a2', 'a3']);
    const order = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-task-container="p1"] [data-sortable-task-id]'),
      ).map((node) => node.dataset.sortableTaskId);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'task:a3' } });
    });
    expect(order()).toEqual(['a3', 'a4', 'a5']);

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:a3' }, over: null });
    });
    expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
    expect(harness.updateTaskMutate).not.toHaveBeenCalled();
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
    expect(document.querySelector('[data-dnd-list]')?.firstElementChild).toHaveAttribute(
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
    renderDnd(
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
  describe('Sidebar Drop', () => {
    it('hands the dragged task to the sidebar target and does not reorder the list', () => {
      setupTwoProjects();

      act(() => {
        handlers().onDragStart?.({ active: { id: 'task:a1' } });
      });
      // 先在列表里预览一次跨组移动，再移到侧边栏：空位回到原处。
      act(() => {
        handlers().onDragOver?.({ active: { id: 'task:a1' }, over: { id: 'task:b1' } });
      });
      expect(containerOrder('p2')).toEqual(['a1', 'b1']);
      act(() => {
        handlers().onDragOver?.({
          active: { id: 'task:a1' },
          over: { id: 'sidebar-drop:project:p9' },
        });
      });
      expect(containerOrder('p1')).toEqual(['a1', 'a2']);
      expect(containerOrder('p2')).toEqual(['b1']);

      act(() => {
        handlers().onDragEnd?.({
          active: { id: 'task:a1' },
          over: { id: 'sidebar-drop:project:p9' },
        });
      });

      expect(harness.sidebarDrop).toHaveBeenCalledTimes(1);
      const [payload, target] = harness.sidebarDrop.mock.calls[0];
      expect(target).toEqual({ kind: 'project', projectId: 'p9' });
      expect(payload.kind).toBe('tasks');
      expect(payload.tasks.map((task: { id: string }) => task.id)).toEqual(['a1']);
      expect(payload.tasks[0].projectId).toBe('p1');
      expect(harness.updateTaskMutate).not.toHaveBeenCalled();
      expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
      expect(screen.queryByTestId('task-placeholder-a1')).not.toBeInTheDocument();
    });

    it('hands the whole selection over in display order', () => {
      setupTwoProjects();
      useSelectionStore.getState().setSelection(['b1', 'loose', 'a2']);

      act(() => {
        handlers().onDragStart?.({ active: { id: 'task:a2' } });
      });
      act(() => {
        handlers().onDragEnd?.({ active: { id: 'task:a2' }, over: { id: 'sidebar-drop:logbook' } });
      });

      const [payload, target] = harness.sidebarDrop.mock.calls[0];
      expect(target).toEqual({ kind: 'logbook' });
      expect(payload.tasks.map((task: { id: string }) => task.id)).toEqual(['loose', 'a2', 'b1']);
      // 收起的组员复原，列表未被改动。
      expect(containerOrder('ungrouped')).toEqual(['loose']);
      expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
    });

    it('hands a standalone project row over as a project', () => {
      harness.projects = [project('pr')];
      renderView([taskItem('loose'), projectItem('pr')]);

      act(() => {
        handlers().onDragStart?.({ active: { id: 'project:pr' } });
      });
      act(() => {
        handlers().onDragEnd?.({ active: { id: 'project:pr' }, over: { id: 'sidebar-drop:today' } });
      });

      const [payload, target] = harness.sidebarDrop.mock.calls[0];
      expect(target).toEqual({ kind: 'today' });
      expect(payload).toMatchObject({ kind: 'project', project: { id: 'pr' } });
    });

    it('releasing over the sidebar but not on a target does nothing', () => {
      setupTwoProjects();

      act(() => {
        handlers().onDragStart?.({ active: { id: 'task:a1' } });
      });
      act(() => {
        handlers().onDragEnd?.({ active: { id: 'task:a1' }, over: { id: 'sidebar-drop:region' } });
      });

      expect(harness.sidebarDrop).not.toHaveBeenCalled();
      expect(harness.updateTaskMutate).not.toHaveBeenCalled();
      expect(harness.reorderFeedMutate).not.toHaveBeenCalled();
    });
  });
});

describe('GroupedFeedListView — New in Today', () => {
  it('keeps fresh rows in place with the dot, inside their group', () => {
    harness.projects = [project('p1')];
    renderView(
      [taskItem('old', { projectId: 'p1' }), taskItem('new', { projectId: 'p1' })],
      'today',
      new Set(['task:new']),
    );

    const rows = [...document.querySelectorAll<HTMLElement>('[data-mock-task-id]')];
    expect(rows.map((row) => row.dataset.mockTaskId)).toEqual(['old', 'new']);
    expect(rows[0]).not.toHaveAttribute('data-new-in-today');
    expect(rows[1]).toHaveAttribute('data-new-in-today');
    expect(rows[1].closest('[data-task-container]')).toHaveAttribute('data-task-container', 'p1');
    expect(document.querySelector('[data-task-container="fresh"]')).toBeNull();
  });

  it('moves fresh rows freely and marks the dragged row as seen', () => {
    harness.projects = [project('p1')];
    renderView(
      [taskItem('old', { projectId: 'p1' }), taskItem('new')],
      'today',
      new Set(['task:new']),
    );

    dragEnd('task:new', 'task:old', 'task:old');
    expect(harness.updateTaskMutate).toHaveBeenCalledWith({
      id: 'new',
      data: { projectId: 'p1', areaId: null },
    });
    expect(harness.markNewInTodaySeen).toHaveBeenCalledWith('task', 'new');
  });

  it('does not mark anything seen when the drop changes nothing', () => {
    harness.projects = [project('p1')];
    renderView([taskItem('a'), taskItem('b')], 'today', new Set(['task:a']));

    dragEnd('task:a', 'task:a', 'task:a');
    expect(harness.markNewInTodaySeen).not.toHaveBeenCalled();
  });
});


describe('GroupedFeedListView — 展开暂留', () => {
  function rowOrder() {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-task-container="ungrouped"] [data-sortable-task-id]',
      ),
    ).map((node) => node.dataset.sortableTaskId);
  }

  function inbox(items: FeedItem[]) {
    return (
      <MemoryRouter>
        <GroupedFeedListView items={items} grouping={false} />
      </MemoryRouter>
    );
  }

  it('展开中的任务被设为今天离开 Inbox 后留在原位，收起后才离开', () => {
    const [a, b, c] = [taskItem('a'), taskItem('b'), taskItem('c')];
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { rerender } = renderDnd(inbox([a, b, c]));

    rerender(inbox([a, c]));
    expect(rowOrder()).toEqual(['a', 'b', 'c']);

    act(() => useUiInteractionStore.setState({ expandedId: null }));
    expect(rowOrder()).toEqual(['a', 'c']);
  });
});
