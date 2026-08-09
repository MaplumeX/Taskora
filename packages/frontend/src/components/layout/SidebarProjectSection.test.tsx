import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
} from '@taskora/shared';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DndHandlers {
  collisionDetection?: (args: {
    active: { id: string };
    pointerCoordinates: { x: number; y: number } | null;
    droppableContainers: Array<{ id: string }>;
    droppableRects: Map<string, { top: number; height: number }>;
  }) => Array<{ id: unknown }>;
  measuring?: unknown;
  onDragStart?: (event: unknown) => void;
  onDragMove?: (event: unknown) => void;
  onDragOver?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  onDragCancel?: () => void;
}

const harness = vi.hoisted(() => ({
  dndProps: null as DndHandlers | null,
  pointerCollisionIds: [] as string[],
  closestCollisionIds: [] as string[],
  sensorOptions: null as { activationConstraint?: { distance?: number } } | null,
  reorderProjectsMutate: vi.fn(),
  updateProjectMutate: vi.fn(),
  reorderAreasMutate: vi.fn(),
  toastError: vi.fn(),
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
      return harness.closestCollisionIds
        .filter((id) => candidates.has(id))
        .map((id) => ({ id }));
    },
    pointerWithin: ({ droppableContainers }: { droppableContainers: Array<{ id: string }> }) => {
      const candidates = new Set(droppableContainers.map(({ id }) => id));
      return harness.pointerCollisionIds
        .filter((id) => candidates.has(id))
        .map((id) => ({ id }));
    },
    useDroppable: () => ({ setNodeRef: () => undefined }),
    useSensor: (_sensor: unknown, options?: typeof harness.sensorOptions) => {
      harness.sensorOptions = options ?? null;
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

vi.mock('@/components/project/ProjectItem', async () => {
  const ReactModule = await import('react');
  return {
    ProjectItem: ({ project: current }: { project: ProjectResponseDto }) =>
      ReactModule.createElement(
        'button',
        { type: 'button', 'data-project-item': current.id },
        current.title,
      ),
  };
});

vi.mock('@/lib/hooks/useProjects', () => ({
  useReorderProjects: () => ({ mutate: harness.reorderProjectsMutate }),
  useUpdateProject: () => ({ mutate: harness.updateProjectMutate }),
}));

vi.mock('@/lib/hooks/useAreas', () => ({
  useReorderAreas: () => ({ mutate: harness.reorderAreasMutate }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { error: harness.toastError } }));

import { SidebarProjectSection } from './SidebarProjectSection';

function area(id: string): AreaResponseDto {
  return {
    id,
    title: `Area ${id}`,
    notes: null,
    sortOrder: 0,
    tags: [],
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

function project(id: string, areaId: string | null): ProjectResponseDto {
  return {
    id,
    title: `Project ${id}`,
    notes: null,
    areaId,
    sortOrder: 0,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

const areas = [area('a'), area('b')];
const projects = [
  project('s', null),
  project('a1', 'a'),
  project('a2', 'a'),
  project('b1', 'b'),
];

function renderSection(
  currentProjects: ProjectResponseDto[] = projects,
  currentAreas: AreaResponseDto[] = areas,
) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SidebarProjectSection projects={currentProjects} areas={currentAreas} />
    </MemoryRouter>,
  );
}

function handlers() {
  if (!harness.dndProps) throw new Error('DndContext was not rendered');
  return harness.dndProps;
}

function startProjectDrag(id: string) {
  act(() => handlers().onDragStart?.({ active: { id: `proj:${id}` } }));
}

function dragOver(activeId: string, overId: string) {
  act(() => {
    handlers().onDragOver?.({
      active: { id: `proj:${activeId}` },
      over: { id: overId },
    });
  });
}

function detectProjectTarget(
  activeId: string,
  collisionIds: string[],
  pointerY = 20,
  rects: Array<[string, { top: number; height: number }]> = [],
) {
  harness.pointerCollisionIds = collisionIds;
  let collisions: Array<{ id: unknown }> = [];
  act(() => {
    collisions =
      handlers().collisionDetection?.({
        active: { id: `proj:${activeId}` },
        pointerCoordinates: { x: 10, y: pointerY },
        droppableContainers: collisionIds.map((id) => ({ id })),
        droppableRects: new Map(rects),
      }) ?? [];
  });
  return collisions.map(({ id }) => id);
}

function endProjectDrag(activeId: string, overId: string | null) {
  act(() => {
    handlers().onDragEnd?.({
      active: { id: `proj:${activeId}` },
      over: overId ? { id: overId } : null,
    });
  });
}

beforeEach(() => {
  harness.dndProps = null;
  harness.pointerCollisionIds = [];
  harness.closestCollisionIds = [];
  harness.sensorOptions = null;
  harness.reorderProjectsMutate.mockReset();
  harness.updateProjectMutate.mockReset();
  harness.reorderAreasMutate.mockReset();
  harness.toastError.mockReset();
});

describe('SidebarProjectSection project drag preview', () => {
  it('shows a compact overlay and a local placeholder without mutating on hover', () => {
    renderSection();
    startProjectDrag('s');
    dragOver('s', 'proj:a2');

    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
    expect(harness.updateProjectMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-placeholder-s')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('drag-overlay')).getByText('Project s'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('drag-overlay').firstElementChild).toHaveAttribute('inert');
    const target = document.querySelector(
      '[data-project-container="a"]',
    ) as HTMLElement;
    expect(within(target).getByTestId('project-placeholder-s')).toBeInTheDocument();
    expect(
      Array.from(target.children).map(
        (child) => (child as HTMLElement).dataset.sortableProjectId,
      ),
    ).toEqual(['a1', 's', 'a2']);
  });

  it('prioritizes project rows and updates before/after within the same target', () => {
    renderSection();
    startProjectDrag('s');

    expect(
      detectProjectTarget(
        's',
        ['area:a', 'project-container:a', 'proj:a2'],
        20,
        [['proj:a2', { top: 10, height: 40 }]],
      ),
    ).toEqual(['proj:a2']);
    dragOver('s', 'proj:a2');

    const target = document.querySelector(
      '[data-project-container="a"]',
    ) as HTMLElement;
    expect(
      Array.from(target.children).map(
        (child) => (child as HTMLElement).dataset.sortableProjectId,
      ),
    ).toEqual(['a1', 's', 'a2']);

    detectProjectTarget(
      's',
      ['area:a', 'project-container:a', 'proj:a2'],
      31,
      [['proj:a2', { top: 10, height: 40 }]],
    );
    act(() => handlers().onDragMove?.({ active: { id: 'proj:s' } }));
    expect(
      Array.from(target.children).map(
        (child) => (child as HTMLElement).dataset.sortableProjectId,
      ),
    ).toEqual(['a1', 'a2', 's']);

    endProjectDrag('s', 'proj:a2');
    expect(harness.updateProjectMutate).toHaveBeenCalledTimes(1);
    act(() => harness.updateProjectMutate.mock.calls[0][1].onSuccess());
    expect(harness.reorderProjectsMutate).toHaveBeenCalledWith(
      ['a1', 'a2', 's', 'b1'],
      expect.any(Object),
    );
  });

  it('keeps same-container persistence to one reorder and skips a no-op', () => {
    renderSection();
    startProjectDrag('a1');
    detectProjectTarget(
      'a1',
      ['proj:a2'],
      31,
      [['proj:a2', { top: 10, height: 40 }]],
    );
    dragOver('a1', 'proj:a2');
    endProjectDrag('a1', 'proj:a2');

    expect(harness.updateProjectMutate).not.toHaveBeenCalled();
    expect(harness.reorderProjectsMutate).toHaveBeenCalledTimes(1);
    expect(harness.reorderProjectsMutate).toHaveBeenCalledWith(
      ['s', 'a2', 'a1', 'b1'],
      expect.any(Object),
    );

    harness.reorderProjectsMutate.mockClear();
    startProjectDrag('a1');
    dragOver('a1', 'proj:a1');
    endProjectDrag('a1', 'proj:a1');
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });

  it('accepts an area project in an empty standalone container', () => {
    renderSection([project('a1', 'a')]);
    startProjectDrag('a1');
    dragOver('a1', 'project-container:standalone');

    const standalone = document.querySelector(
      '[data-project-container="standalone"]',
    ) as HTMLElement;
    expect(within(standalone).getByTestId('project-placeholder-a1')).toBeInTheDocument();

    endProjectDrag('a1', 'project-container:standalone');
    expect(harness.updateProjectMutate).toHaveBeenCalledWith(
      { id: 'a1', data: { areaId: null } },
      expect.any(Object),
    );
  });

  it('accepts the final slot of an empty expanded area container', () => {
    renderSection([project('s', null)]);
    startProjectDrag('s');
    dragOver('s', 'project-container:b');

    expect(
      within(document.querySelector('[data-project-container="b"]') as HTMLElement)
        .getByTestId('project-placeholder-s'),
    ).toBeInTheDocument();
  });

  it('uses an area heading as its first slot, including an empty collapsed area', () => {
    renderSection([project('s', null)]);
    const collapseButtons = screen.getAllByRole('button', { name: 'nav:collapse' });
    fireEvent.click(collapseButtons[1]);

    startProjectDrag('s');
    dragOver('s', 'area:b');

    expect(document.querySelector('[data-project-container="b"]')).toBeNull();
    expect(screen.getByTestId('project-placeholder-s')).toBeInTheDocument();
    endProjectDrag('s', 'area:b');
    expect(harness.updateProjectMutate).toHaveBeenCalledWith(
      { id: 's', data: { areaId: 'b' } },
      expect.any(Object),
    );
  });

  it('keeps the last valid preview outside, then replaces it after re-entry', () => {
    renderSection();
    startProjectDrag('s');
    dragOver('s', 'area:b');

    detectProjectTarget('s', []);
    act(() => handlers().onDragOver?.({ active: { id: 'proj:s' }, over: null }));
    expect(
      within(document.querySelector('[data-project-container="b"]') as HTMLElement)
        .getByTestId('project-placeholder-s'),
    ).toBeInTheDocument();

    dragOver('s', 'area:a');
    detectProjectTarget('s', []);
    endProjectDrag('s', null);

    expect(harness.updateProjectMutate).toHaveBeenCalledWith(
      { id: 's', data: { areaId: 'a' } },
      expect.any(Object),
    );
  });

  it('does not persist an outside drop before any changed placement', () => {
    renderSection();
    startProjectDrag('s');
    detectProjectTarget('s', []);
    endProjectDrag('s', null);

    expect(harness.updateProjectMutate).not.toHaveBeenCalled();
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
    expect(
      within(document.querySelector('[data-project-container="standalone"]') as HTMLElement)
        .getByText('Project s'),
    ).toBeInTheDocument();
  });

  it('restores the latest server props on cancel without persistence', () => {
    const view = renderSection();
    startProjectDrag('s');
    dragOver('s', 'area:b');

    const remoteProjects = [
      project('s', null),
      project('a1', 'a'),
      project('a2', 'b'),
      project('b1', 'b'),
    ];
    view.rerender(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SidebarProjectSection projects={remoteProjects} areas={areas} />
      </MemoryRouter>,
    );
    expect(
      within(document.querySelector('[data-project-container="b"]') as HTMLElement)
        .getByTestId('project-placeholder-s'),
    ).toBeInTheDocument();

    act(() => handlers().onDragCancel?.());
    expect(harness.updateProjectMutate).not.toHaveBeenCalled();
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
    expect(
      within(document.querySelector('[data-project-container="standalone"]') as HTMLElement)
        .getByText('Project s'),
    ).toBeInTheDocument();
    expect(
      within(document.querySelector('[data-project-container="b"]') as HTMLElement)
        .getByText('Project a2'),
    ).toBeInTheDocument();
  });
});

describe('SidebarProjectSection persistence and area isolation', () => {
  it('does not reorder after a cross-container ownership update fails', () => {
    renderSection();
    startProjectDrag('s');
    dragOver('s', 'area:b');
    endProjectDrag('s', 'area:b');

    act(() => harness.updateProjectMutate.mock.calls[0][1].onError());
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith('common:saveFailed');
    expect(
      within(document.querySelector('[data-project-container="standalone"]') as HTMLElement)
        .getByText('Project s'),
    ).toBeInTheDocument();
  });

  it('restores the frozen pre-mutation layout if cross-container reorder fails', () => {
    const view = renderSection();
    startProjectDrag('s');
    dragOver('s', 'area:b');
    endProjectDrag('s', 'area:b');
    act(() => harness.updateProjectMutate.mock.calls[0][1].onSuccess());

    view.rerender(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SidebarProjectSection
          projects={[
            project('s', 'b'),
            project('a1', 'a'),
            project('a2', 'a'),
            project('b1', 'b'),
          ]}
          areas={areas}
        />
      </MemoryRouter>,
    );
    act(() => harness.reorderProjectsMutate.mock.calls[0][1].onError());

    expect(
      within(document.querySelector('[data-project-container="standalone"]') as HTMLElement)
        .getByText('Project s'),
    ).toBeInTheDocument();
    expect(harness.toastError).toHaveBeenCalledWith('common:saveFailed');
  });

  it('restores the server layout and toasts when reorder fails', () => {
    renderSection();
    startProjectDrag('a1');
    detectProjectTarget(
      'a1',
      ['proj:a2'],
      31,
      [['proj:a2', { top: 10, height: 40 }]],
    );
    dragOver('a1', 'proj:a2');
    endProjectDrag('a1', 'proj:a2');

    act(() => harness.reorderProjectsMutate.mock.calls[0][1].onError());
    const areaContainer = document.querySelector(
      '[data-project-container="a"]',
    ) as HTMLElement;
    expect(
      within(areaContainer).getAllByText(/^Project a[12]$/).map((node) => node.textContent),
    ).toEqual(['Project a1', 'Project a2']);
    expect(harness.toastError).toHaveBeenCalledWith('common:saveFailed');
  });

  it('filters area dragging to area targets and preserves one area reorder mutation', () => {
    renderSection();
    harness.closestCollisionIds = ['proj:a1', 'project-container:a', 'area:a'];

    let collisions: Array<{ id: unknown }> = [];
    act(() => {
      collisions =
        handlers().collisionDetection?.({
          active: { id: 'area:b' },
          pointerCoordinates: { x: 10, y: 20 },
          droppableContainers: harness.closestCollisionIds.map((id) => ({ id })),
          droppableRects: new Map(),
        }) ?? [];
    });
    expect(collisions.map(({ id }) => id)).toEqual(['area:a']);

    act(() => {
      handlers().onDragStart?.({ active: { id: 'area:b' } });
      handlers().onDragEnd?.({ active: { id: 'area:b' }, over: { id: 'area:a' } });
    });
    expect(harness.reorderAreasMutate).toHaveBeenCalledTimes(1);
    expect(harness.reorderAreasMutate).toHaveBeenCalledWith(['b', 'a']);
    expect(harness.updateProjectMutate).not.toHaveBeenCalled();
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });

  it('keeps the 5px activation threshold, explicit measuring, and untinted containers', () => {
    renderSection();

    expect(harness.sensorOptions?.activationConstraint?.distance).toBe(5);
    expect(handlers().measuring).toBeDefined();
    document.querySelectorAll('[data-project-container]').forEach((container) => {
      expect(container).not.toHaveClass('bg-muted/60');
    });
    expect(screen.getByRole('link', { name: /Area a/ })).toHaveAttribute(
      'href',
      '/areas/a',
    );
  });
});
