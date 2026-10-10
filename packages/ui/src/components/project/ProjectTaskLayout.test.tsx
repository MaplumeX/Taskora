import * as React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DndHandlers {
  collisionDetection?: (args: {
    active: { id: string };
    pointerCoordinates: { x: number; y: number } | null;
    droppableContainers: Array<{ id: string }>;
    droppableRects: Map<string, { top: number; height: number }>;
  }) => Array<{ id: unknown }>;
  onDragStart?: (event: unknown) => void;
  onDragMove?: (event: unknown) => void;
  onDragOver?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  onDragCancel?: () => void;
}

const harness = vi.hoisted(() => ({
  dndProps: null as DndHandlers | null,
  saveMutate: vi.fn(),
  completeMutate: vi.fn(),
  uncompleteMutate: vi.fn(),
  blankClick: vi.fn(),
  blurTask: vi.fn(),
  toastError: vi.fn(),
  initialSelectedId: null as string | null,
  initialExpandedId: null as string | null,
  pointerCollisionIds: [] as string[],
  closestCollisionIds: [] as string[],
  keyboardCoordinateGetter: null as
    | null
    | ((event: KeyboardEvent, args: unknown) => unknown),
  sidebarDrop: vi.fn(),
  createTask: vi.fn(),
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
    useDroppable: () => ({ setNodeRef: () => undefined, isOver: true }),
    useSensor: (
      _sensor: unknown,
      options?: { coordinateGetter?: (event: KeyboardEvent, args: unknown) => unknown },
    ) => {
      if (options?.coordinateGetter) harness.keyboardCoordinateGetter = options.coordinateGetter;
      return {};
    },
    useSensors: (...sensors: unknown[]) => sensors,
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
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
      task: currentTask,
      selectionState = 'idle',
    }: {
      task: TaskResponseDto;
      selectionState?: string;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-task-item': '',
          'data-mock-task-id': currentTask.id,
          'data-selection-state': selectionState,
        },
        selectionState === 'expanded'
          ? ReactModule.createElement('input', {
              'data-testid': `task-editor-${currentTask.id}`,
              onBlur: () => harness.blurTask(currentTask.id),
            })
          : currentTask.title,
      ),
  };
});

vi.mock('./ProjectHeadingRow', async () => {
  const ReactModule = await import('react');
  return {
    ProjectHeadingRow: ({
      heading: currentHeading,
      selected,
    }: {
      heading: ProjectHeadingResponseDto;
      selected?: boolean;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-heading-row': currentHeading.id,
          'data-heading-selected': selected ? 'true' : 'false',
        },
        currentHeading.title,
      ),
  };
});



vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('sonner', () => ({ toast: { error: harness.toastError } }));

const createHeadingMutate = vi.fn();
vi.mock('@taskora/api', async (importOriginal) => {
  const ReactModule = await import('react');
  return {
    ...(await importOriginal()),
    useCompleteTask: () => ({ mutate: harness.completeMutate }),
    useUncompleteTask: () => ({ mutate: harness.uncompleteMutate }),
    useUncancelTask: () => ({ mutate: vi.fn() }),
    useReorderProjectHeadingLayout: () => ({ mutate: harness.saveMutate }),
    useCreateProjectHeading: () => ({ mutate: createHeadingMutate }),
    useCreateTask: () => ({ mutateAsync: harness.createTask }),
    useTaskRowSelection: () => {
      const [selectedId, setSelectedId] = ReactModule.useState(harness.initialSelectedId);
      const [expandedId, setExpandedId] = ReactModule.useState(harness.initialExpandedId);
      return {
        selectedId,
        selectedIds: selectedId ? [selectedId] : [],
        expandedId,
        handleRowClick: (id: string) => setSelectedId(id),
        handleBlankClick: () => {
          harness.blankClick();
          setSelectedId(null);
          setExpandedId(null);
        },
      };
    },
  };
});

import {
  ProjectTaskLayout,
  applyLayoutDrag,
  filterLayout,
  moveTaskToPlacement,
  normalizeLayout,
  resolveTaskPlacement,
  serializeLayout,
  type LayoutState,
  layoutFromRowOrder,
  layoutWithHeadingFromTasks,
  placeTask,
  splitAtTask,
} from './ProjectTaskLayout';
import { useSelectionStore } from '@taskora/api';
import { AppDndProvider } from '../../lib/appDnd';

function DndShell({ children }: { children: React.ReactNode }) {
  return <AppDndProvider onSidebarDrop={harness.sidebarDrop}>{children}</AppDndProvider>;
}

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  status: HeadingStatus.ACTIVE,
  completedAt: null,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const secondHeading: ProjectHeadingResponseDto = {
  ...heading,
  id: 'heading-2',
  title: 'Ship',
};

function task(id: string, headingId: string | null): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    projectId: 'project-1',
    headingId,
    areaId: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

describe('project task layout normalization', () => {
  it('keeps ungrouped tasks first and preserves empty headings', () => {
    const layout = normalizeLayout(
      [task('ungrouped', null), task('grouped', 'heading-1')],
      [heading],
    );

    expect(layout.headingIds).toEqual(['heading-1']);
    expect(layout.containers).toEqual({
      ungrouped: ['ungrouped'],
      'heading-1': ['grouped'],
    });
    expect(serializeLayout('project-1', layout)).toEqual({
      projectId: 'project-1',
      ungroupedTaskIds: ['ungrouped'],
      groups: [{ headingId: 'heading-1', taskIds: ['grouped'] }],
    });
  });

  it('falls back to ungrouped when a task references a missing heading', () => {
    expect(normalizeLayout([task('legacy', 'missing')], [heading]).containers.ungrouped).toEqual([
      'legacy',
    ]);
  });
});

describe('project task layout tag filter', () => {
  it('只留可见任务，没有可见任务的 Heading 隐藏', () => {
    const layout = normalizeLayout(
      [task('a', null), task('b', 'heading-1'), task('c', 'heading-2')],
      [heading, secondHeading],
    );
    expect(filterLayout(layout, new Set(['c']))).toEqual({
      headingIds: ['heading-2'],
      containers: { ungrouped: [], 'heading-1': [], 'heading-2': ['c'] },
    });
  });
});

describe('project task layout drag serialization', () => {
  const layout: LayoutState = {
    headingIds: ['heading-1', 'heading-2'],
    containers: {
      ungrouped: ['task-u1', 'task-u2'],
      'heading-1': ['task-a', 'task-b'],
      'heading-2': [],
    },
  };

  it('reorders tasks within the ungrouped container', () => {
    const next = applyLayoutDrag(layout, 'task:task-u2', 'task:task-u1');

    expect(next?.containers.ungrouped).toEqual(['task-u2', 'task-u1']);
    expect(layout.containers.ungrouped).toEqual(['task-u1', 'task-u2']);
  });

  it('moves a task across containers at the hovered task position', () => {
    const next = applyLayoutDrag(layout, 'task:task-u1', 'task:task-b');

    expect(next?.containers.ungrouped).toEqual(['task-u2']);
    expect(next?.containers['heading-1']).toEqual(['task-a', 'task-u1', 'task-b']);
  });

  it('moves a task into an empty heading drop zone', () => {
    const next = applyLayoutDrag(layout, 'task:task-a', 'container:heading-2');

    expect(next?.containers['heading-1']).toEqual(['task-b']);
    expect(next?.containers['heading-2']).toEqual(['task-a']);
    expect(serializeLayout('project-1', next!)).toEqual({
      projectId: 'project-1',
      ungroupedTaskIds: ['task-u1', 'task-u2'],
      groups: [
        { headingId: 'heading-1', taskIds: ['task-b'] },
        { headingId: 'heading-2', taskIds: ['task-a'] },
      ],
    });
  });

  it('reorders a whole heading block when dropped over one of its tasks', () => {
    const next = applyLayoutDrag(layout, 'heading:heading-2', 'task:task-a');

    expect(next?.headingIds).toEqual(['heading-2', 'heading-1']);
    expect(next?.containers).toEqual(layout.containers);
  });
});

describe('project task layout keyboard edits', () => {
  const base = {
    headingIds: ['h1', 'h2'],
    containers: { ungrouped: ['a', 'b'], h1: ['c'], h2: ['d', 'e'] },
  };

  it('layoutFromRowOrder 按新行序重新分配各容器', () => {
    expect(layoutFromRowOrder(base, ['b', 'a', 'h1', 'c', 'h2', 'e', 'd'])).toEqual({
      headingIds: ['h1', 'h2'],
      containers: { ungrouped: ['b', 'a'], h1: ['c'], h2: ['e', 'd'] },
    });
  });

  it('新 Heading 插在首个选中任务所在分组之后，选中任务归入', () => {
    expect(layoutWithHeadingFromTasks(base, 'new', ['d', 'e'])).toEqual({
      headingIds: ['h1', 'h2', 'new'],
      containers: { ungrouped: ['a', 'b'], h1: ['c'], h2: [], new: ['d', 'e'] },
    });
    expect(layoutWithHeadingFromTasks(base, 'new', ['b', 'c'])).toEqual({
      headingIds: ['new', 'h1', 'h2'],
      containers: { ungrouped: ['a'], h1: [], h2: ['d', 'e'], new: ['b', 'c'] },
    });
  });
});

describe('project task placement helpers', () => {
  const layout: LayoutState = {
    headingIds: ['heading-1', 'heading-2'],
    containers: {
      ungrouped: ['task-u1', 'task-u2'],
      'heading-1': ['task-a', 'task-b'],
      'heading-2': [],
    },
  };

  it('resolves before and after positions for a hovered task', () => {
    expect(resolveTaskPlacement(layout, 'task:task-b', 'before')).toEqual({
      containerId: 'heading-1',
      index: 1,
    });
    expect(resolveTaskPlacement(layout, 'task:task-b', 'after')).toEqual({
      containerId: 'heading-1',
      index: 2,
    });
  });

  it('resolves a heading to the first slot and containers to their final slot', () => {
    expect(resolveTaskPlacement(layout, 'heading:heading-1', 'after')).toEqual({
      containerId: 'heading-1',
      index: 0,
    });
    expect(resolveTaskPlacement(layout, 'container:heading-1', 'before')).toEqual({
      containerId: 'heading-1',
      index: 2,
    });
    expect(resolveTaskPlacement(layout, 'container:heading-2', 'before')).toEqual({
      containerId: 'heading-2',
      index: 0,
    });
    expect(resolveTaskPlacement(layout, 'container:ungrouped', 'before')).toEqual({
      containerId: 'ungrouped',
      index: 2,
    });
  });

  it('moves across groups before or after the hovered task', () => {
    const before = moveTaskToPlacement(layout, 'task-u1', {
      containerId: 'heading-1',
      index: 1,
    });
    const after = moveTaskToPlacement(layout, 'task-u1', {
      containerId: 'heading-1',
      index: 2,
    });

    expect(before?.containers.ungrouped).toEqual(['task-u2']);
    expect(before?.containers['heading-1']).toEqual(['task-a', 'task-u1', 'task-b']);
    expect(after?.containers['heading-1']).toEqual(['task-a', 'task-b', 'task-u1']);
  });

  it('moves to and from the ungrouped container', () => {
    const toUngrouped = moveTaskToPlacement(layout, 'task-a', {
      containerId: 'ungrouped',
      index: 2,
    });
    const backToHeading = moveTaskToPlacement(toUngrouped!, 'task-a', {
      containerId: 'heading-2',
      index: 0,
    });

    expect(toUngrouped?.containers.ungrouped).toEqual(['task-u1', 'task-u2', 'task-a']);
    expect(toUngrouped?.containers['heading-1']).toEqual(['task-b']);
    expect(backToHeading?.containers.ungrouped).toEqual(['task-u1', 'task-u2']);
    expect(backToHeading?.containers['heading-2']).toEqual(['task-a']);
  });

  it('corrects indexes for upward and downward movement in one container', () => {
    const sameGroup: LayoutState = {
      headingIds: ['heading-1'],
      containers: {
        ungrouped: [],
        'heading-1': ['task-a', 'task-b', 'task-c', 'task-d'],
      },
    };

    expect(
      moveTaskToPlacement(sameGroup, 'task-d', { containerId: 'heading-1', index: 1 })?.containers[
        'heading-1'
      ],
    ).toEqual(['task-a', 'task-d', 'task-b', 'task-c']);
    expect(
      moveTaskToPlacement(sameGroup, 'task-b', { containerId: 'heading-1', index: 4 })?.containers[
        'heading-1'
      ],
    ).toEqual(['task-a', 'task-c', 'task-d', 'task-b']);
  });

  it('returns null for unchanged placement without mutating the input', () => {
    const snapshot = structuredClone(layout);

    expect(
      moveTaskToPlacement(layout, 'task-a', { containerId: 'heading-1', index: 1 }),
    ).toBeNull();
    expect(layout).toEqual(snapshot);
  });

  it('placeTask inserts a task that is not in the layout yet (Magic Plus draft)', () => {
    expect(placeTask(layout, 'draft', { containerId: 'heading-1', index: 1 })?.containers).toEqual(
      { ...layout.containers, 'heading-1': [layout.containers['heading-1'][0], 'draft', ...layout.containers['heading-1'].slice(1)] },
    );
    expect(placeTask(layout, 'draft', { containerId: 'missing', index: 0 })).toBeNull();
  });

  it('splitAtTask cuts the group at the task and puts the rest under a new heading after it', () => {
    const base: LayoutState = {
      headingIds: ['h1', 'h2'],
      containers: { ungrouped: ['u1', 'draft', 'u2'], h1: ['a', 'draft2', 'b', 'c'], h2: [] },
    };
    expect(splitAtTask(base, 'new', 'draft')).toEqual({
      headingIds: ['new', 'h1', 'h2'],
      containers: { ungrouped: ['u1'], new: ['u2'], h1: ['a', 'draft2', 'b', 'c'], h2: [] },
    });
    expect(splitAtTask(base, 'new', 'draft2')).toEqual({
      headingIds: ['h1', 'new', 'h2'],
      containers: { ungrouped: ['u1', 'draft', 'u2'], h1: ['a'], new: ['b', 'c'], h2: [] },
    });
    expect(splitAtTask(base, 'new', 'missing')).toBeNull();
  });

  it('rejects unknown task and destination ids', () => {
    expect(resolveTaskPlacement(layout, 'container:missing', 'before')).toBeNull();
    expect(
      moveTaskToPlacement(layout, 'missing', { containerId: 'heading-1', index: 0 }),
    ).toBeNull();
  });
});

describe('ProjectTaskLayout drag sessions', () => {
  const tasks = [
    task('task-u1', null),
    task('task-u2', null),
    task('task-a', 'heading-1'),
    task('task-b', 'heading-1'),
  ];

  beforeEach(() => {
    harness.dndProps = null;
    harness.initialSelectedId = null;
    harness.initialExpandedId = null;
    harness.pointerCollisionIds = [];
    harness.closestCollisionIds = [];
    harness.keyboardCoordinateGetter = null;
    harness.sidebarDrop.mockReset();
    harness.saveMutate.mockReset();
    harness.completeMutate.mockReset();
    harness.uncompleteMutate.mockReset();
    harness.blankClick.mockReset();
    harness.blurTask.mockReset();
    harness.toastError.mockReset();
    useSelectionStore.getState().clearSelection();
  });

  function renderLayout(currentTasks = tasks) {
    return render(
      <ProjectTaskLayout
        projectId="project-1"
        tasks={currentTasks}
        headings={[heading, secondHeading]}
        emptyHint="Empty"
      />,
      // 列表登记在应用壳的共享拖拽上下文里（ADR 0018）。
      { wrapper: DndShell },
    );
  }

  function handlers() {
    if (!harness.dndProps) throw new Error('DndContext was not rendered');
    return harness.dndProps;
  }

  function startTaskDrag(id: string) {
    const taskNode = document.querySelector(`[data-mock-task-id="${id}"]`);
    if (!taskNode?.parentElement) throw new Error(`Task ${id} was not rendered`);
    act(() => {
      handlers().onDragStart?.({
        active: { id: `task:${id}`, node: { current: taskNode.parentElement } },
      });
    });
  }

  function dragOver(activeId: string, overId: string) {
    act(() => {
      handlers().onDragOver?.({
        active: { id: activeId },
        over: { id: overId },
      });
    });
  }

  function dragOutside(activeId: string) {
    let collisions: Array<{ id: unknown }> = [];
    act(() => {
      collisions =
        handlers().collisionDetection?.({
          active: { id: activeId },
          pointerCoordinates: { x: 200, y: 200 },
          droppableContainers: [{ id: 'container:heading-2' }],
          droppableRects: new Map(),
        }) ?? [];
      handlers().onDragOver?.({ active: { id: activeId }, over: null });
    });
    expect(collisions).toEqual([]);
  }

  it('多项拖拽：选中的任务收起，松手后整组随被拖任务进入目标 Heading', () => {
    renderLayout();
    useSelectionStore.getState().setSelection(['task-u1', 'task-u2']);
    startTaskDrag('task-u2');
    expect(document.querySelector('[data-mock-task-id="task-u1"]')).toBeNull();
    dragOver('task:task-u2', 'task:task-b');

    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u2' },
        over: { id: 'task:task-b' },
      });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: [],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-a', 'task-u1', 'task-u2', 'task-b'] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      },
      expect.any(Object),
    );
    // 多选保留，不走单项拖拽的清空。
    expect(harness.blankClick).not.toHaveBeenCalled();
  });

  it('多项拖拽取消后收起的任务复原', () => {
    renderLayout();
    useSelectionStore.getState().setSelection(['task-u1', 'task-u2']);
    startTaskDrag('task-u1');
    expect(document.querySelector('[data-mock-task-id="task-u2"]')).toBeNull();
    act(() => {
      handlers().onDragCancel?.();
    });
    expect(document.querySelector('[data-mock-task-id="task-u2"]')).not.toBeNull();
    expect(harness.saveMutate).not.toHaveBeenCalled();
  });

  it('多项拖拽：落回被拖任务自身时，整组聚到它的位置', () => {
    renderLayout();
    useSelectionStore.getState().setSelection(['task-u1', 'task-a']);
    startTaskDrag('task-a');
    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:task-a' }, over: { id: 'task:task-a' } });
    });
    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-u2'],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-u1', 'task-a', 'task-b'] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      },
      expect.any(Object),
    );
  });

  it('previews locally and persists one complete layout on a changed drop', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'task:task-b');

    expect(harness.saveMutate).not.toHaveBeenCalled();
    const target = document.querySelector('[data-task-container="heading-1"]');
    expect(target).not.toBeNull();
    expect(
      within(target as HTMLElement).getByTestId('task-placeholder-task-u1'),
    ).toBeInTheDocument();

    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'task:task-b' },
      });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-u2'],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-a', 'task-u1', 'task-b'] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      },
      expect.any(Object),
    );
  });

  it('prefers a nested task target and uses its lower half for after placement', () => {
    renderLayout();
    startTaskDrag('task-u1');
    harness.pointerCollisionIds = ['heading:heading-1', 'container:heading-1', 'task:task-b'];

    let collisions: Array<{ id: unknown }> = [];
    act(() => {
      collisions =
        handlers().collisionDetection?.({
          active: { id: 'task:task-u1' },
          pointerCoordinates: { x: 20, y: 31 },
          droppableContainers: harness.pointerCollisionIds.map((id) => ({ id })),
          droppableRects: new Map([['task:task-b', { top: 10, height: 40 }]]),
        }) ?? [];
    });
    expect(collisions.map(({ id }) => id)).toEqual(['task:task-b']);

    dragOver('task:task-u1', 'task:task-b');
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'task:task-b' },
      });
    });

    expect(harness.saveMutate.mock.calls[0][0].groups[0].taskIds).toEqual([
      'task-a',
      'task-b',
      'task-u1',
    ]);
  });

  it('moves the gap across a row midpoint on pointer move without a new over target', () => {
    renderLayout();
    startTaskDrag('task-u1');
    harness.pointerCollisionIds = ['container:ungrouped', 'task:task-u2'];
    const detect = (y: number) =>
      act(() => {
        handlers().collisionDetection?.({
          active: { id: 'task:task-u1' },
          pointerCoordinates: { x: 20, y },
          droppableContainers: harness.pointerCollisionIds.map((id) => ({ id })),
          droppableRects: new Map([['task:task-u2', { top: 40, height: 40 }]]),
        });
      });
    const ungroupedOrder = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-task-container="ungrouped"] [data-sortable-task-id]',
        ),
      ).map((node) => node.dataset.sortableTaskId);

    detect(50);
    dragOver('task:task-u1', 'task:task-u2');
    expect(ungroupedOrder()).toEqual(['task-u1', 'task-u2']);

    // 同一目标行内越过中线：只有 onDragMove，没有新的 onDragOver。
    detect(70);
    act(() => {
      handlers().onDragMove?.({ active: { id: 'task:task-u1' } });
    });
    expect(ungroupedOrder()).toEqual(['task-u2', 'task-u1']);
    expect(screen.getByTestId('task-placeholder-task-u1')).toBeInTheDocument();
  });

  it('keeps the active task as the nested collision target instead of appending to its container', () => {
    renderLayout();
    startTaskDrag('task-u1');
    harness.pointerCollisionIds = ['container:ungrouped', 'task:task-u1'];

    let collisions: Array<{ id: unknown }> = [];
    act(() => {
      collisions =
        handlers().collisionDetection?.({
          active: { id: 'task:task-u1' },
          pointerCoordinates: { x: 20, y: 31 },
          droppableContainers: harness.pointerCollisionIds.map((id) => ({ id })),
          droppableRects: new Map([['task:task-u1', { top: 10, height: 40 }]]),
        }) ?? [];
    });
    expect(collisions.map(({ id }) => id)).toEqual(['task:task-u1']);

    dragOver('task:task-u1', 'task:task-u1');
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'task:task-u1' },
      });
    });

    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getAllByText(
        /^task-u[12]$/,
      ),
    ).toHaveLength(2);
  });

  it('keeps keyboard after-placement stable across repeated preview collisions', () => {
    renderLayout();
    startTaskDrag('task-u1');
    expect(harness.keyboardCoordinateGetter).not.toBeNull();
    harness.keyboardCoordinateGetter?.(
      { code: 'ArrowDown' } as KeyboardEvent,
      {},
    );
    harness.closestCollisionIds = ['task:task-u2'];

    const detectKeyboardTarget = () =>
      handlers().collisionDetection?.({
        active: { id: 'task:task-u1' },
        pointerCoordinates: null,
        droppableContainers: [{ id: 'task:task-u1' }, { id: 'task:task-u2' }],
        droppableRects: new Map(),
      }) ?? [];

    act(() => {
      expect(detectKeyboardTarget().map(({ id }) => id)).toEqual(['task:task-u2']);
    });
    dragOver('task:task-u1', 'task:task-u2');
    act(() => {
      expect(detectKeyboardTarget().map(({ id }) => id)).toEqual(['task:task-u2']);
    });
    dragOver('task:task-u1', 'task:task-u2');
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'task:task-u2' },
      });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(harness.saveMutate.mock.calls[0][0].ungroupedTaskIds).toEqual([
      'task-u2',
      'task-u1',
    ]);
  });

  it('restores the snapshot without persistence on cancel', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');
    expect(
      within(
        document.querySelector('[data-task-container="heading-2"]') as HTMLElement,
      ).getByTestId('task-placeholder-task-u1'),
    ).toBeInTheDocument();

    act(() => handlers().onDragCancel?.());

    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getByText(
        'task-u1',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('task-placeholder-task-u1')).not.toBeInTheDocument();
  });

  it('defers prop synchronization during a drag and applies the latest server layout on cancel', () => {
    const view = renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');

    const remotelyUpdatedTasks = [
      task('task-u1', null),
      task('task-a', 'heading-1'),
      task('task-b', 'heading-1'),
      task('task-u2', 'heading-2'),
    ];
    view.rerender(
      <ProjectTaskLayout
        projectId="project-1"
        tasks={remotelyUpdatedTasks}
        headings={[heading, secondHeading]}
        emptyHint="Empty"
      />,
    );

    expect(
      within(
        document.querySelector('[data-task-container="heading-2"]') as HTMLElement,
      ).getByTestId('task-placeholder-task-u1'),
    ).toBeInTheDocument();

    act(() => handlers().onDragCancel?.());

    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getByText(
        'task-u1',
      ),
    ).toBeInTheDocument();
    expect(
      within(
        document.querySelector('[data-task-container="heading-2"]') as HTMLElement,
      ).getByText('task-u2'),
    ).toBeInTheDocument();
  });

  it('keeps the last valid preview and persists it when dropped outside', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');

    dragOutside('task:task-u1');
    expect(
      within(
        document.querySelector('[data-task-container="heading-2"]') as HTMLElement,
      ).getByTestId('task-placeholder-task-u1'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('drag-overlay')).getByText('task-u1')).toBeInTheDocument();

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:task-u1' }, over: null });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-u2'],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-a', 'task-b'] },
          { headingId: 'heading-2', taskIds: ['task-u1'] },
        ],
      },
      expect.any(Object),
    );
    expect(
      within(
        document.querySelector('[data-task-container="heading-2"]') as HTMLElement,
      ).getByText('task-u1'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('task-placeholder-task-u1')).not.toBeInTheDocument();
  });

  it('does not persist an outside drop without a new placement', () => {
    renderLayout();
    startTaskDrag('task-u1');

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:task-u1' }, over: null });
    });

    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getByText(
        'task-u1',
      ),
    ).toBeInTheDocument();
  });

  it('does not persist an outside drop when the last preview matches the snapshot', () => {
    renderLayout();
    startTaskDrag('task-a');
    dragOver('task:task-a', 'heading:heading-2');
    dragOver('task:task-a', 'heading:heading-1');

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:task-a' }, over: null });
    });

    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(
      within(
        document.querySelector('[data-task-container="heading-1"]') as HTMLElement,
      ).getByText('task-a'),
    ).toBeInTheDocument();
  });

  it('persists the updated preview after leaving and re-entering valid targets', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');

    dragOutside('task:task-u1');
    dragOver('task:task-u1', 'task:task-b');
    expect(
      within(
        document.querySelector('[data-task-container="heading-1"]') as HTMLElement,
      ).getByTestId('task-placeholder-task-u1'),
    ).toBeInTheDocument();
    dragOutside('task:task-u1');

    act(() => {
      handlers().onDragEnd?.({ active: { id: 'task:task-u1' }, over: null });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(harness.saveMutate.mock.calls[0][0].groups).toEqual([
      { headingId: 'heading-1', taskIds: ['task-a', 'task-u1', 'task-b'] },
      { headingId: 'heading-2', taskIds: [] },
    ]);
  });

  it('does not persist a no-op drop', () => {
    renderLayout();
    startTaskDrag('task-a');
    dragOver('task:task-a', 'heading:heading-1');

    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-a' },
        over: { id: 'heading:heading-1' },
      });
    });

    expect(harness.saveMutate).not.toHaveBeenCalled();
  });

  it('restores server layout and shows the shared toast when persistence fails', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'heading:heading-2' },
      });
    });

    act(() => harness.saveMutate.mock.calls[0][1].onError());

    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getByText(
        'task-u1',
      ),
    ).toBeInTheDocument();
    expect(harness.toastError).toHaveBeenCalledWith('common:saveFailed');
  });

  it('freezes the pre-mutation server layout for rollback before optimistic props arrive', () => {
    const view = renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'task:task-u1' },
        over: { id: 'heading:heading-2' },
      });
    });

    const optimisticTasks = [
      task('task-u2', null),
      task('task-a', 'heading-1'),
      task('task-b', 'heading-1'),
      task('task-u1', 'heading-2'),
    ];
    view.rerender(
      <ProjectTaskLayout
        projectId="project-1"
        tasks={optimisticTasks}
        headings={[heading, secondHeading]}
        emptyHint="Empty"
      />,
    );
    act(() => harness.saveMutate.mock.calls[0][1].onError());

    expect(
      within(document.querySelector('[data-task-container="ungrouped"]') as HTMLElement).getByText(
        'task-u1',
      ),
    ).toBeInTheDocument();
    expect(harness.toastError).toHaveBeenCalledWith('common:saveFailed');
  });

  it('blurs and collapses an expanded task before showing a compact overlay', () => {
    harness.initialSelectedId = 'task-u1';
    harness.initialExpandedId = 'task-u1';
    renderLayout();
    const editor = screen.getByTestId('task-editor-task-u1');
    editor.focus();

    startTaskDrag('task-u1');

    expect(harness.blurTask).toHaveBeenCalledWith('task-u1');
    expect(harness.blankClick).toHaveBeenCalledTimes(1);
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.firstElementChild).toHaveAttribute('inert');
    expect(within(overlay).getByText('task-u1')).toHaveAttribute('data-selection-state', 'idle');
    expect(within(overlay).queryByTestId('task-editor-task-u1')).not.toBeInTheDocument();

    act(() => handlers().onDragCancel?.());
    expect(screen.queryByTestId('task-editor-task-u1')).not.toBeInTheDocument();
  });

  it('keeps heading reordering on the existing single-persistence path', () => {
    renderLayout();

    harness.closestCollisionIds = [
      'task:task-a',
      'container:heading-1',
      'heading:heading-1',
    ];
    let collisions: Array<{ id: unknown }> = [];
    act(() => {
      collisions =
        handlers().collisionDetection?.({
          active: { id: 'heading:heading-2' },
          pointerCoordinates: { x: 20, y: 31 },
          droppableContainers: harness.closestCollisionIds.map((id) => ({ id })),
          droppableRects: new Map(),
        }) ?? [];
    });
    expect(collisions.map(({ id }) => id)).toEqual(['heading:heading-1']);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'heading:heading-2' } });
      handlers().onDragEnd?.({
        active: { id: 'heading:heading-2' },
        over: { id: 'heading:heading-1' },
      });
    });

    expect(harness.saveMutate).toHaveBeenCalledTimes(1);
    expect(
      harness.saveMutate.mock.calls[0][0].groups.map(
        (group: { headingId: string }) => group.headingId,
      ),
    ).toEqual(['heading-2', 'heading-1']);
  });

  it('does not render a destination group background tint', () => {
    renderLayout();

    const containers = document.querySelectorAll('[data-task-container]');
    expect(containers.length).toBeGreaterThan(0);
    containers.forEach((container) => {
      expect(container).not.toHaveClass('bg-muted/60');
    });
  });

  describe('Sidebar Drop', () => {
    function containerTaskIds(containerId: string) {
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-task-container="${containerId}"] [data-sortable-task-id]`,
        ),
      ).map((node) => node.dataset.sortableTaskId);
    }

    it('puts the placeholder back while over the sidebar and hands the task over on drop', () => {
      renderLayout();
      startTaskDrag('task-u1');
      dragOver('task:task-u1', 'task:task-b');
      expect(containerTaskIds('heading-1')).toEqual(['task-a', 'task-u1', 'task-b']);

      dragOver('task:task-u1', 'sidebar-drop:today');
      expect(containerTaskIds('ungrouped')).toEqual(['task-u1', 'task-u2']);
      expect(containerTaskIds('heading-1')).toEqual(['task-a', 'task-b']);

      act(() => {
        handlers().onDragEnd?.({
          active: { id: 'task:task-u1' },
          over: { id: 'sidebar-drop:today' },
        });
      });

      expect(harness.saveMutate).not.toHaveBeenCalled();
      expect(harness.sidebarDrop).toHaveBeenCalledWith(
        { kind: 'tasks', tasks: [expect.objectContaining({ id: 'task-u1' })] },
        { kind: 'today' },
        null,
      );
      expect(screen.queryByTestId('task-placeholder-task-u1')).not.toBeInTheDocument();
    });

    it('hands the whole selection over and restores the collapsed rows', () => {
      renderLayout();
      useSelectionStore.getState().setSelection(['task-u2', 'task-b']);
      startTaskDrag('task-b');
      expect(document.querySelector('[data-mock-task-id="task-u2"]')).toBeNull();

      act(() => {
        handlers().onDragEnd?.({
          active: { id: 'task:task-b' },
          over: { id: 'sidebar-drop:area:area-1' },
        });
      });

      const [payload, target] = harness.sidebarDrop.mock.calls[0];
      expect(target).toEqual({ kind: 'area', areaId: 'area-1' });
      expect(payload.tasks.map((t: { id: string }) => t.id)).toEqual(['task-u2', 'task-b']);
      expect(containerTaskIds('ungrouped')).toEqual(['task-u1', 'task-u2']);
      expect(harness.saveMutate).not.toHaveBeenCalled();
    });

    it('heading drags never reach the sidebar', () => {
      renderLayout();
      act(() => {
        handlers().onDragStart?.({ active: { id: 'heading:heading-1' } });
      });
      act(() => {
        handlers().onDragEnd?.({
          active: { id: 'heading:heading-1' },
          over: { id: 'sidebar-drop:trash' },
        });
      });
      expect(harness.sidebarDrop).not.toHaveBeenCalled();
      expect(harness.saveMutate).not.toHaveBeenCalled();
    });
  });
});

describe('ProjectTaskLayout — Magic Plus', () => {
  const tasks = [task('task-u1', null), task('task-a', 'heading-1'), task('task-b', 'heading-1')];

  beforeEach(() => {
    harness.dndProps = null;
    harness.initialSelectedId = null;
    harness.initialExpandedId = null;
    harness.pointerCollisionIds = [];
    harness.closestCollisionIds = [];
    harness.saveMutate.mockReset();
    harness.createTask.mockReset();
    harness.toastError.mockReset();
  });

  function handlers() {
    if (!harness.dndProps) throw new Error('DndContext was not rendered');
    return harness.dndProps;
  }

  function renderLayout(currentTasks = tasks) {
    return render(
      <ProjectTaskLayout
        projectId="project-1"
        tasks={currentTasks}
        headings={[heading, secondHeading]}
        emptyHint="Empty"
      />,
      { wrapper: DndShell },
    );
  }

  async function dropMagicPlus(overId: string, delta = { x: -30, y: -250 }) {
    act(() => {
      handlers().onDragStart?.({ active: { id: 'magic-plus' } });
    });
    harness.pointerCollisionIds = [overId];
    act(() => {
      handlers().collisionDetection?.({
        active: { id: 'magic-plus' },
        pointerCoordinates: { x: 20, y: 31 },
        droppableContainers: [{ id: overId }],
        droppableRects: new Map([[overId, { top: 10, height: 40 }]]),
      });
      handlers().onDragOver?.({ active: { id: 'magic-plus' }, over: { id: overId } });
    });
    harness.pointerCollisionIds = [];
    await act(async () => {
      handlers().onDragEnd?.({ active: { id: 'magic-plus' }, over: { id: overId }, delta });
    });
  }

  it('previews a gap and creates the task under the heading it is dropped in', async () => {
    harness.createTask.mockResolvedValue(task('new', null));
    renderLayout();

    await dropMagicPlus('task:task-a');

    expect(harness.createTask).toHaveBeenCalledWith({ title: '', projectId: 'project-1' });
    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-u1'],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-a', 'new', 'task-b'] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      },
      expect.any(Object),
    );
  });

  it('dropping into an empty project still has a target', async () => {
    harness.createTask.mockResolvedValue(task('new', null));
    render(
      <ProjectTaskLayout projectId="project-1" tasks={[]} headings={[]} emptyHint="Empty" />,
      { wrapper: DndShell },
    );
    expect(screen.getByText('Empty')).toBeInTheDocument();

    await dropMagicPlus('container:ungrouped');

    expect(harness.saveMutate).toHaveBeenCalledWith(
      { projectId: 'project-1', ungroupedTaskIds: ['new'], groups: [] },
      expect.any(Object),
    );
  });

  it('dragging back to the button cancels and removes the gap', async () => {
    renderLayout();

    await dropMagicPlus('task:task-a', { x: 0, y: -20 });

    expect(harness.createTask).not.toHaveBeenCalled();
    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('task-placeholder-magic-plus-draft')).toBeNull();
  });

  it('a failed create removes the gap and saves nothing', async () => {
    harness.createTask.mockRejectedValue(new Error('offline'));
    renderLayout();

    await dropMagicPlus('task:task-a');

    expect(harness.toastError).toHaveBeenCalled();
    expect(harness.saveMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('task-placeholder-magic-plus-draft')).toBeNull();
  });
});

describe('ProjectTaskLayout — Magic Plus 左边缘新建 Heading', () => {
  const tasks = [task('task-u1', null), task('task-a', 'heading-1'), task('task-b', 'heading-1')];

  beforeEach(() => {
    harness.dndProps = null;
    harness.initialSelectedId = null;
    harness.initialExpandedId = null;
    harness.pointerCollisionIds = [];
    harness.saveMutate.mockReset();
    harness.createTask.mockReset();
    harness.toastError.mockReset();
    createHeadingMutate.mockReset();
    useSelectionStore.getState().clearSelection();
  });

  function handlers() {
    if (!harness.dndProps) throw new Error('DndContext was not rendered');
    return harness.dndProps;
  }

  function view(headings = [heading, secondHeading]) {
    return (
      <ProjectTaskLayout projectId="project-1" tasks={tasks} headings={headings} emptyHint="Empty" />
    );
  }

  /** 开始拖动并停在 task-a 下半（落点 = task-a 之后），指针 x 为 pointerX。 */
  function dragTo(pointerX: number) {
    const activatorEvent = { clientX: 340, clientY: 700 };
    act(() => {
      handlers().onDragStart?.({ active: { id: 'magic-plus' }, activatorEvent });
    });
    harness.pointerCollisionIds = ['task:task-a'];
    act(() => {
      handlers().collisionDetection?.({
        active: { id: 'magic-plus' },
        pointerCoordinates: { x: pointerX, y: 31 },
        droppableContainers: [{ id: 'task:task-a' }],
        droppableRects: new Map([['task:task-a', { top: 10, height: 40 }]]),
      });
      handlers().onDragOver?.({ active: { id: 'magic-plus' }, over: { id: 'task:task-a' } });
    });
    harness.pointerCollisionIds = [];
    act(() => {
      handlers().onDragMove?.({
        active: { id: 'magic-plus' },
        activatorEvent,
        delta: { x: pointerX - 340, y: -600 },
      });
    });
  }

  function drop() {
    act(() => {
      handlers().onDragEnd?.({
        active: { id: 'magic-plus' },
        over: { id: 'task:task-a' },
        delta: { x: -300, y: -600 },
      });
    });
  }

  it('at the left edge previews a heading that cuts the group, then creates it there', () => {
    const { rerender } = render(view(), { wrapper: DndShell });
    dragTo(10);

    expect(screen.getByTestId('heading-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('task-placeholder-magic-plus-draft')).toBeNull();

    drop();
    expect(harness.createTask).not.toHaveBeenCalled();
    expect(createHeadingMutate).toHaveBeenCalledWith(
      { projectId: 'project-1', title: '' },
      expect.any(Object),
    );
    expect(harness.saveMutate).not.toHaveBeenCalled();

    const created = { ...heading, id: 'heading-new', title: '' };
    act(() => {
      createHeadingMutate.mock.calls[0][1].onSuccess(created);
    });
    rerender(view([heading, created, secondHeading]));

    expect(harness.saveMutate).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-u1'],
        groups: [
          { headingId: 'heading-1', taskIds: ['task-a'] },
          { headingId: 'heading-new', taskIds: ['task-b'] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      },
      expect.any(Object),
    );
    expect(useSelectionStore.getState().selectedIds).toEqual(['heading-new']);
    expect(screen.queryByTestId('heading-placeholder')).toBeNull();
  });

  it('leaving the edge switches back to a new task', async () => {
    harness.createTask.mockResolvedValue(task('new', null));
    render(view(), { wrapper: DndShell });
    dragTo(10);
    act(() => {
      handlers().onDragMove?.({
        active: { id: 'magic-plus' },
        activatorEvent: { clientX: 340, clientY: 700 },
        delta: { x: -140, y: -600 },
      });
    });

    expect(screen.queryByTestId('heading-placeholder')).toBeNull();
    expect(screen.getByTestId('task-placeholder-magic-plus-draft')).toBeInTheDocument();

    await act(async () => {
      handlers().onDragEnd?.({
        active: { id: 'magic-plus' },
        over: { id: 'task:task-a' },
        delta: { x: -140, y: -600 },
      });
    });
    expect(createHeadingMutate).not.toHaveBeenCalled();
    expect(harness.createTask).toHaveBeenCalled();
  });

  it('a failed heading create restores the layout', () => {
    render(view(), { wrapper: DndShell });
    dragTo(10);
    drop();
    act(() => {
      createHeadingMutate.mock.calls[0][1].onError(new Error('offline'));
    });
    expect(harness.toastError).toHaveBeenCalled();
    expect(screen.queryByTestId('heading-placeholder')).toBeNull();
    expect(harness.saveMutate).not.toHaveBeenCalled();
  });
});
