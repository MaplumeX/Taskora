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
    ProjectHeadingRow: ({ heading: currentHeading }: { heading: ProjectHeadingResponseDto }) =>
      ReactModule.createElement(
        'div',
        { 'data-heading-row': currentHeading.id },
        currentHeading.title,
      ),
  };
});

vi.mock('@/lib/hooks/useTasks', () => ({
  useCompleteTask: () => ({ mutate: harness.completeMutate }),
  useUncompleteTask: () => ({ mutate: harness.uncompleteMutate }),
}));

vi.mock('@/lib/hooks/useProjectHeadings', () => ({
  useReorderProjectHeadingLayout: () => ({ mutate: harness.saveMutate }),
}));

vi.mock('@/lib/hooks/useTaskRowSelection', async () => {
  const ReactModule = await import('react');
  return {
    useTaskRowSelection: () => {
      const [selectedId, setSelectedId] = ReactModule.useState(harness.initialSelectedId);
      const [expandedId, setExpandedId] = ReactModule.useState(harness.initialExpandedId);
      return {
        selectedId,
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

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { error: harness.toastError } }));

import {
  ProjectTaskLayout,
  applyLayoutDrag,
  moveTaskToPlacement,
  normalizeLayout,
  resolveTaskPlacement,
  serializeLayout,
  type LayoutState,
} from './ProjectTaskLayout';

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  sortOrder: 0,
  status: HeadingStatus.ACTIVE,
  completedAt: null,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const secondHeading: ProjectHeadingResponseDto = {
  ...heading,
  id: 'heading-2',
  title: 'Ship',
  sortOrder: 1,
};

function task(id: string, headingId: string | null): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
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
    harness.saveMutate.mockReset();
    harness.completeMutate.mockReset();
    harness.uncompleteMutate.mockReset();
    harness.blankClick.mockReset();
    harness.blurTask.mockReset();
    harness.toastError.mockReset();
  });

  function renderLayout(currentTasks = tasks) {
    return render(
      <ProjectTaskLayout
        projectId="project-1"
        tasks={currentTasks}
        headings={[heading, secondHeading]}
        emptyHint="Empty"
      />,
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

  it('restores the snapshot without persistence when dropped outside', () => {
    renderLayout();
    startTaskDrag('task-u1');
    dragOver('task:task-u1', 'heading:heading-2');

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
});
